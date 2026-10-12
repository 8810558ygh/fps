// ===== js/survival/survival_state.js – 生存模式状态机 =====
// 单人生存模式：打僵尸、多地图推进、传送门通关
//
// 地图流程：
//   战场图 → 5 波 → 传送门 → 按 F → [加载页] → 沙漠图 → 5 波 → 传送门 → 按 F → 通关

const SurvivalState = {
    active: false,
    // 'idle' | 'prep' | 'wave' | 'portal' | 'loading' | 'victory' | 'defeat'
    phase: 'idle',
    wave: 0,
    maxWaves: 5,
    mapIndex: 0,
    maps: ['battlefield', 'desert'],
    prepEndTime: 0,
    PREP_MS: 15000,
    SUMMARY_MS: 3000,
    PORTAL_TRIGGER_RADIUS: 2.5,
};
window.SurvivalState = SurvivalState;

let _defeatHandled  = false;
let _victoryHandled = false;
let _summaryTimer = null;
let _portalPromptEl = null;

// ============================================================
// 玩家列表
// ============================================================
function getSurvivalPlayers() {
    const arr = [];
    if (typeof p1 !== 'undefined' && p1) arr.push(p1);
    return arr;
}
window.getSurvivalPlayers = getSurvivalPlayers;

function _areAllPlayersDown() {
    const players = getSurvivalPlayers();
    if (players.length === 0) return false;
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p && p.hp > 0) return false;
    }
    return true;
}

function checkSurvivalDefeat() {
    if (!SurvivalState.active) return;
    if (_defeatHandled) return;
    if (_victoryHandled) return;
    if (!_areAllPlayersDown()) return;

    SurvivalState.phase = 'defeat';
    _handleDefeat();
}
window.checkSurvivalDefeat = checkSurvivalDefeat;

// ============================================================
// 把玩家挪到当前地图正中心
// ============================================================
function _teleportPlayerToMapCenter() {
    if (typeof p1 === 'undefined' || !p1) return;

    const mapId = (typeof window.getCurrentMapId === 'function')
        ? window.getCurrentMapId() : null;

    let spawnY;
    if (mapId === 'battlefield') {
        spawnY = 2.5;
    } else {
        spawnY = (typeof terrainGroundAt === 'function')
            ? terrainGroundAt(0, 0) : 0;
    }

    p1.pos.set(0, spawnY, 0);
    p1.vy = 0;
    p1.prevY = spawnY;
    p1.onGround = true;
    p1.yaw = 0;
    p1.pitch = 0;
    p1.mesh.position.copy(p1.pos);
    p1.mesh.rotation.y = 0;
    p1.cam.position.set(0, spawnY + p1.eyeH, 0);
    p1.cam.rotation.y = 0;
    p1.cam.rotation.x = 0;
    if (p1._netTargetPos) p1._netTargetPos.set(0, spawnY, 0);
    if (p1._netTargetYaw !== undefined) p1._netTargetYaw = 0;

    if (window.PHYSICS && window.PHYSICS.isReady()) {
        try { window.PHYSICS.teleportPlayerBody(p1); } catch (e) {}
    }
}

// ============================================================
// 启动 / 停止
// ============================================================
function startSurvivalMode() {
    SurvivalState.active = true;
    SurvivalState.phase = 'prep';
    SurvivalState.wave = 0;
    SurvivalState.mapIndex = 0;      // 从战场图开始
    SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;

    _defeatHandled  = false;
    _victoryHandled = false;

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) endOv.style.display = 'none';
    _hideWaveSummary(true);
    _hidePortalPrompt();

    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();

    if (typeof p2 !== 'undefined' && p2) {
        p2.mesh.visible = false;
        p2.gunHolder.visible = false;
        p2.baseVisible = false;
    }

    if (typeof p1 !== 'undefined' && p1) p1.survivalKills = 0;
    if (typeof p2 !== 'undefined' && p2) p2.survivalKills = 0;

    _teleportPlayerToMapCenter();

    console.log('[survival] 模式已启动，地图:', SurvivalState.maps[SurvivalState.mapIndex],
                '，准备阶段', SurvivalState.PREP_MS / 1000, '秒');
}
window.startSurvivalMode = startSurvivalMode;

function stopSurvivalMode() {
    SurvivalState.active = false;
    SurvivalState.phase = 'idle';
    _defeatHandled  = false;
    _victoryHandled = false;

    if (typeof clearAllZombies === 'function') clearAllZombies();

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) endOv.style.display = 'none';
    _hideWaveSummary(true);
    _hidePortalPrompt();

    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();

    console.log('[survival] 模式已停止');
}
window.stopSurvivalMode = stopSurvivalMode;

// ============================================================
// 每帧 tick
// ============================================================
function survivalTick(dt, now) {
    if (!SurvivalState.active) return;

    if (SurvivalState.phase === 'prep') {
        if (now >= SurvivalState.prepEndTime) {
            SurvivalState.wave++;
            startSurvivalWave(SurvivalState.wave);
        }
    } else if (SurvivalState.phase === 'wave') {
        if (typeof updateAllZombies === 'function') {
            updateAllZombies(dt, now);
        }
        if (typeof getZombiesAliveCount === 'function'
            && getZombiesAliveCount() === 0) {
            onSurvivalWaveCleared(now);
        }
    }
    // portal / loading / victory / defeat 阶段不做波次逻辑
}
window.survivalTick = survivalTick;

// ============================================================
// 传送门交互
// ============================================================
function isPlayerNearPortal() {
    if (typeof p1 === 'undefined' || !p1) return false;
    if (p1.hp <= 0) return false;
    if (p1.deadUntil > performance.now()) return false;

    const dx = p1.pos.x;
    const dz = p1.pos.z;
    const d2 = dx * dx + dz * dz;
    const r = SurvivalState.PORTAL_TRIGGER_RADIUS;
    return d2 < r * r;
}
window.isPlayerNearPortal = isPlayerNearPortal;

function tryEnterPortal() {
    if (!SurvivalState.active) return false;
    if (SurvivalState.phase !== 'portal') return false;
    if (!isPlayerNearPortal()) return false;

    _enterNextMap();
    return true;
}
window.tryEnterPortal = tryEnterPortal;

// ============================================================
// ★ 进入下一张地图（走加载页）
// ============================================================
function _enterNextMap() {
    const nextIndex = SurvivalState.mapIndex + 1;

    // ---- 最后一关 → 通关 ----
    if (nextIndex >= SurvivalState.maps.length) {
        SurvivalState.phase = 'victory';
        if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
        _hidePortalPrompt();
        console.log('[survival] 全部地图完成，通关！');
        return;
    }

    const nextMapId = SurvivalState.maps[nextIndex];

    // ---- 清理当前状态 ----
    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
    _hidePortalPrompt();
    if (typeof clearAllZombies === 'function') clearAllZombies();

    // ---- 进入 loading 阶段：冻结游戏逻辑 ----
    SurvivalState.phase = 'loading';

    // 暂停主循环 + 释放鼠标锁
    const wasRunning = running;
    running = false;
    if (document.pointerLockElement) document.exitPointerLock();

    // ---- 走加载流程 ----
    if (typeof window.beginMapSwitchLoading === 'function') {
        window.beginMapSwitchLoading(nextMapId, () => {
            // 加载完成
            SurvivalState.mapIndex = nextIndex;
            SurvivalState.wave = 0;
            SurvivalState.phase = 'prep';
            SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;

            // 玩家挪到新地图中心
            _teleportPlayerToMapCenter();

            // 恢复主循环
            running = true;

            // 重新锁鼠标
            if (typeof enterFullscreenAndLock === 'function') {
                enterFullscreenAndLock();
            }

            console.log('[survival] 进入下一张地图:', nextMapId);
        });
    } else {
        // 兜底（不应发生）：直接切
        console.warn('[survival] beginMapSwitchLoading 未定义，直接切图');
        if (typeof window.loadMap === 'function') window.loadMap(nextMapId);
        SurvivalState.mapIndex = nextIndex;
        SurvivalState.wave = 0;
        SurvivalState.phase = 'prep';
        SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;
        _teleportPlayerToMapCenter();
        running = wasRunning;
    }
}
window._enterNextMap = _enterNextMap;

// ============================================================
// 本波清空
// ============================================================
function onSurvivalWaveCleared(now) {
    _showWaveSummary();

    if (SurvivalState.wave >= SurvivalState.maxWaves) {
        SurvivalState.phase = 'portal';

        if (typeof spawnSurvivalPortal === 'function') {
            spawnSurvivalPortal();
        }
        console.log('[survival] 第', SurvivalState.maxWaves, '波清空，传送门已出现');
        return;
    }

    SurvivalState.phase = 'prep';
    SurvivalState.prepEndTime = now + SurvivalState.PREP_MS;
    console.log('[survival] 第', SurvivalState.wave, '波清空，准备下一波');
}
window.onSurvivalWaveCleared = onSurvivalWaveCleared;

// ============================================================
// 传送门提示
// ============================================================
function _ensurePortalPrompt() {
    if (_portalPromptEl) return _portalPromptEl;
    if (typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'survivalPortalPrompt';
    el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:160px',
        'transform:translateX(-50%)',
        'z-index:16', 'padding:10px 28px',
        'background:rgba(102,255,238,0.92)',
        'color:#08131f', 'border-radius:8px',
        'font-size:17px', 'font-weight:700',
        'letter-spacing:3px', 'pointer-events:none',
        'display:none',
        'box-shadow:0 6px 24px rgba(0,0,0,0.6), 0 0 20px rgba(102,255,238,0.6)',
        'font-family:"Microsoft YaHei",Arial,sans-serif',
        'animation:survivalPromptPulse 1.4s ease-in-out infinite',
    ].join(';');
    document.body.appendChild(el);

    if (!document.getElementById('survivalPromptStyle')) {
        const style = document.createElement('style');
        style.id = 'survivalPromptStyle';
        style.textContent = `
            @keyframes survivalPromptPulse {
                0%, 100% { transform: translateX(-50%) scale(1);    box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 20px rgba(102,255,238,0.5); }
                50%      { transform: translateX(-50%) scale(1.05); box-shadow: 0 6px 24px rgba(0,0,0,0.6), 0 0 32px rgba(102,255,238,0.9); }
            }
        `;
        document.head.appendChild(style);
    }

    _portalPromptEl = el;
    return el;
}

function _hidePortalPrompt() {
    if (_portalPromptEl && _portalPromptEl.style.display !== 'none') {
        _portalPromptEl.style.display = 'none';
    }
}

function updateSurvivalPortalPrompt() {
    if (!SurvivalState.active) { _hidePortalPrompt(); return; }
    if (SurvivalState.phase !== 'portal') { _hidePortalPrompt(); return; }
    if (!isPlayerNearPortal()) { _hidePortalPrompt(); return; }

    const el = _ensurePortalPrompt();
    if (!el) return;

    if (el.style.display !== 'block') el.style.display = 'block';
    el.textContent = '按 F 进入下一关';
}
window.updateSurvivalPortalPrompt = updateSurvivalPortalPrompt;

// ============================================================
// 战绩面板
// ============================================================
function _showWaveSummary() {
    const panel  = document.getElementById('survivalWaveSummary');
    const waveEl = document.getElementById('svSummaryWave');
    const listEl = document.getElementById('svSummaryList');
    if (!panel || !listEl) return;

    if (waveEl) waveEl.textContent = SurvivalState.wave;

    const players = getSurvivalPlayers();
    const items = [];
    for (const p of players) {
        if (!p) continue;
        const name = (p.id === 1) ? '你' : `玩家${p.id}`;
        const kills = p.survivalKills || 0;
        items.push({ name, kills });
    }
    items.sort((a, b) => b.kills - a.kills);

    if (items.length === 0) {
        listEl.innerHTML = `<div class="sv-summary-row">
            <span class="sv-summary-rank">-</span>
            <span class="sv-summary-name">无数据</span>
            <span class="sv-summary-kills">0</span>
        </div>`;
    } else {
        listEl.innerHTML = items.map((it, i) => `
            <div class="sv-summary-row">
                <span class="sv-summary-rank">#${i + 1}</span>
                <span class="sv-summary-name">${it.name}</span>
                <span class="sv-summary-kills">${it.kills} 杀</span>
            </div>
        `).join('');
    }

    if (_summaryTimer) clearTimeout(_summaryTimer);
    panel.style.display = 'block';
    void panel.offsetWidth;
    panel.classList.add('show');

    _summaryTimer = setTimeout(() => {
        _hideWaveSummary(false);
    }, SurvivalState.SUMMARY_MS);
}

function _hideWaveSummary(immediate) {
    const panel = document.getElementById('survivalWaveSummary');
    if (!panel) return;
    if (_summaryTimer) {
        clearTimeout(_summaryTimer);
        _summaryTimer = null;
    }
    panel.classList.remove('show');
    if (immediate) panel.style.display = 'none';
    else setTimeout(() => { panel.style.display = 'none'; }, 400);
}

// ============================================================
// 胜利 / 失败
// ============================================================
function _handleVictory() {
    if (_victoryHandled) return;
    _victoryHandled = true;
    _hidePortalPrompt();
    console.log('[survival] 通关');

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) {
        const iconEl  = endOv.querySelector('.sv-end-icon');
        const titleEl = endOv.querySelector('.sv-end-title');
        const hintEl  = endOv.querySelector('.sv-end-hint');
        if (iconEl)  iconEl.textContent  = '🏆';
        if (titleEl) {
            titleEl.textContent = '通 关';
            titleEl.style.color = '#ffd24a';
            titleEl.style.textShadow = '0 0 30px rgba(255, 210, 74, 0.85), 0 4px 20px rgba(0, 0, 0, 0.85)';
        }
        if (hintEl)  hintEl.textContent  = '即将返回大厅...';
        endOv.style.display = 'flex';
    }

    setTimeout(() => {
        if (typeof exitToLobby === 'function') exitToLobby();
    }, 3500);
}

function _handleDefeat() {
    if (_defeatHandled) return;
    _defeatHandled = true;
    _hidePortalPrompt();
    console.log('[survival] 失败');

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) {
        const iconEl  = endOv.querySelector('.sv-end-icon');
        const titleEl = endOv.querySelector('.sv-end-title');
        const hintEl  = endOv.querySelector('.sv-end-hint');
        if (iconEl)  iconEl.textContent  = '💀';
        if (titleEl) {
            titleEl.textContent = '失 败';
            titleEl.style.color = '#ff4a4a';
            titleEl.style.textShadow = '0 0 30px rgba(255, 60, 60, 0.85), 0 4px 20px rgba(0, 0, 0, 0.85)';
        }
        if (hintEl)  hintEl.textContent  = '即将返回大厅...';
        endOv.style.display = 'flex';
    }

    setTimeout(() => {
        if (typeof exitToLobby === 'function') exitToLobby();
    }, 3500);
}

// ============================================================
// 波次生成
// ============================================================
function startSurvivalWave(wave) {
    SurvivalState.phase = 'wave';

    const count = 3 + wave * 2;
    const player = (typeof p1 !== 'undefined' && p1) ? p1 : null;
    if (!player) return;

    const half = (typeof window.currentArenaHalf === 'number')
        ? window.currentArenaHalf : ARENA;
    const lim = half - 3;

    for (let i = 0; i < count; i++) {
        const baseAngle = (i / count) * Math.PI * 2;
        const angle = baseAngle + (Math.random() - 0.5) * 0.6;
        const dist = 20 + Math.random() * 15;

        let x = player.pos.x + Math.cos(angle) * dist;
        let z = player.pos.z + Math.sin(angle) * dist;

        x = Math.max(-lim, Math.min(lim, x));
        z = Math.max(-lim, Math.min(lim, z));

        spawnZombie(x, z, wave);
    }

    console.log('[survival] 第', wave, '波已启动，生成', count, '只僵尸');
}
window.startSurvivalWave = startSurvivalWave;