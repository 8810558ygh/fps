// ===== js/survival/survival_state.js – 生存模式状态机 =====

const SurvivalState = {
    active: false,
    phase: 'idle',
    wave: 0,
    maxWaves: 5,
    mapIndex: 0,
    maps: ['battlefield', 'desert'],
    prepEndTime: 0,
    PREP_MS: 15000,
    SUMMARY_MS: 3000,
    PORTAL_TRIGGER_RADIUS: 2.5,

    MAX_ALIVE_ZOMBIES: 10,
    REFILL_DELAY_MS: 1500,
    waveQueue: [],
    nextSpawnAt: 0,

    // ★ 已解锁的武器（每局重置为只有狂徒）
    unlockedWeapons: ['rifle'],

    // ★ 金币（每局重置为 0）
    coins: 0,
};
window.SurvivalState = SurvivalState;

let _defeatHandled  = false;
let _victoryHandled = false;
let _summaryTimer = null;
let _portalPromptEl = null;

// ============================================================
// 武器中文名 / 描述
// ============================================================
const WEAPON_NAMES_ZH = {
    rifle: '狂徒',
    sniper: '冥驹',
    shotgun: '判官',
    odin: '奥丁',
};
const WEAPON_DESCS_ZH = {
    rifle: '25发 · 高伤',
    sniper: '5发 · 一枪致命',
    shotgun: '5发 · 散射',
    odin: '100发 · 越打越快',
};

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
// ★ 切地图补弹（对所有已解锁武器）
//
//   ★ 生存模式不提供烟/闪，这里强制清零
// ============================================================
function _refillPlayerOnNextMap(p) {
    if (!p) return;

    if (!p.weaponAmmo) p.weaponAmmo = {};

    const unlocked = (SurvivalState.unlockedWeapons && SurvivalState.unlockedWeapons.length)
        ? SurvivalState.unlockedWeapons
        : ['rifle'];

    for (const key of unlocked) {
        const wk = (typeof WEAPONS !== 'undefined') ? WEAPONS[key] : null;
        if (!wk || wk.mag === undefined) continue;

        if (!p.weaponAmmo[key]) {
            p.weaponAmmo[key] = { ammo: wk.mag, reserve: wk.startReserve };
        } else {
            p.weaponAmmo[key].ammo = wk.mag;
            p.weaponAmmo[key].reserve = Math.max(p.weaponAmmo[key].reserve, wk.startReserve);
        }
    }

    if (p.weapon && p.weapon.mag !== undefined && !p.isMelee && !p.isSmoke && !p.isFlash) {
        const cur = p.weaponAmmo[p.weaponKey];
        if (cur) {
            p.ammo = cur.ammo;
            p.reserve = cur.reserve;
        }
    }

    if (typeof ARMOR_MAX !== 'undefined') p.armor = ARMOR_MAX;

    // ★ 生存模式不提供烟/闪
    p.smokeCharges = 0;
    p.flashCharges = 0;

    p.reloadEnd = 0;
    p.nextShot = 0;
    p.boltEnd = 0;
    p.aiming = false;
    p.aimStage = 0;
}

function _clearInputState() {
    if (typeof keys !== 'undefined' && keys) {
        for (const k in keys) keys[k] = false;
    }
    if (typeof mouse !== 'undefined' && mouse) {
        mouse.leftDown = false;
        mouse.aim = false;
    }
    if (typeof p1 !== 'undefined' && p1 && p1.input) {
        p1.input.aim = false;
        p1.input.fire = false;
        p1.input.jump = false;
        p1.input.crouch = false;
        p1.input.forward = 0;
        p1.input.right = 0;
    }
}

function _teleportPlayerToMapCenter() {
    if (typeof p1 === 'undefined' || !p1) return;

    const mapId = (typeof window.getCurrentMapId === 'function')
        ? window.getCurrentMapId() : null;

    let spawnY;
    if (mapId === 'battlefield') spawnY = 2.5;
    else spawnY = (typeof terrainGroundAt === 'function')
        ? terrainGroundAt(0, 0) : 0;

    p1.pos.set(0, spawnY, 0);
    p1.vy = 0; p1.prevY = spawnY; p1.onGround = true;
    p1.yaw = 0; p1.pitch = 0;
    p1.mesh.position.copy(p1.pos);
    p1.mesh.rotation.y = 0;
    p1.cam.position.set(0, spawnY + p1.eyeH, 0);
    p1.cam.rotation.y = 0; p1.cam.rotation.x = 0;
    if (p1._netTargetPos) p1._netTargetPos.set(0, spawnY, 0);
    if (p1._netTargetYaw !== undefined) p1._netTargetYaw = 0;

    if (window.PHYSICS && window.PHYSICS.isReady()) {
        try { window.PHYSICS.teleportPlayerBody(p1); } catch (e) {}
    }
}

function _spawnZombieAroundPlayer(type) {
    const player = (typeof p1 !== 'undefined' && p1) ? p1 : null;
    if (!player) return;

    const half = (typeof window.currentArenaHalf === 'number')
        ? window.currentArenaHalf : ARENA;
    const lim = half - 3;

    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 15;

    let x = player.pos.x + Math.cos(angle) * dist;
    let z = player.pos.z + Math.sin(angle) * dist;

    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));

    spawnZombie(x, z, SurvivalState.wave, type);
}

// ============================================================
// ★ 刷新武器面板的锁定状态（按 B 打开前调用，非生存模式）
// ============================================================
function updateWeaponPanelLocks() {
    const panel = document.getElementById('weaponPanel');
    if (!panel) return;

    const isSurvival = (typeof gameMode !== 'undefined' && gameMode === 'survival');
    const unlocked = (isSurvival && SurvivalState.unlockedWeapons)
        ? SurvivalState.unlockedWeapons : null;

    panel.querySelectorAll('.weapon-btn').forEach(btn => {
        const key = btn.dataset.weapon;
        if (!key) return;
        if (unlocked && !unlocked.includes(key)) {
            btn.classList.add('locked');
            btn.disabled = true;
        } else {
            btn.classList.remove('locked');
            btn.disabled = false;
        }
    });
}
window.updateWeaponPanelLocks = updateWeaponPanelLocks;

// ============================================================
// 启动 / 停止
// ============================================================
function startSurvivalMode() {
    SurvivalState.active = true;
    SurvivalState.phase = 'prep';
    SurvivalState.wave = 0;
    SurvivalState.mapIndex = 0;
    SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;

    SurvivalState.waveQueue = [];
    SurvivalState.nextSpawnAt = 0;

    SurvivalState.unlockedWeapons = ['rifle'];
    SurvivalState.coins = 0;

    _defeatHandled  = false;
    _victoryHandled = false;

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) endOv.style.display = 'none';
    _hideWaveSummary(true);
    _hidePortalPrompt();
    if (window.Shop && window.Shop.isOpen && window.Shop.isOpen()) {
        window.Shop.close();
    }

    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
    if (typeof despawnAmmoDrop === 'function') despawnAmmoDrop();

    if (typeof p2 !== 'undefined' && p2) {
        p2.mesh.visible = false;
        p2.gunHolder.visible = false;
        p2.baseVisible = false;
    }

    if (typeof p1 !== 'undefined' && p1) p1.survivalKills = 0;
    if (typeof p2 !== 'undefined' && p2) p2.survivalKills = 0;

    _teleportPlayerToMapCenter();

    if (typeof p1 !== 'undefined' && p1) {
        p1.primaryWeaponKey = 'rifle';
        if (typeof setWeapon === 'function') {
            setWeapon(p1, 'rifle');
        }

        // ★ 生存模式不提供烟/闪
        p1.smokeCharges = 0;
        p1.flashCharges = 0;
        p1.throwFuseActive = false;
        p1.throwFuseType = null;
        p1.throwFuseInHand = false;
        p1.throwFuseStart = 0;
        p1.throwFuseEnd = 0;

        // ★ 生存模式开局不带血包
        p1.medkits = 0;
        p1.healing = false;
        p1.healEnd = 0;
    }

    console.log('[survival] 模式已启动，地图:', SurvivalState.maps[SurvivalState.mapIndex],
                '，准备阶段', SurvivalState.PREP_MS / 1000, '秒');
}
window.startSurvivalMode = startSurvivalMode;

function stopSurvivalMode() {
    SurvivalState.active = false;
    SurvivalState.phase = 'idle';
    _defeatHandled  = false;
    _victoryHandled = false;

    SurvivalState.waveQueue = [];
    SurvivalState.nextSpawnAt = 0;

    if (typeof clearAllZombies === 'function') clearAllZombies();

    const endOv = document.getElementById('survivalEndOverlay');
    if (endOv) endOv.style.display = 'none';
    _hideWaveSummary(true);
    _hidePortalPrompt();

    if (window.Shop && window.Shop.isOpen && window.Shop.isOpen()) {
        window.Shop.close();
    }

    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
    if (typeof despawnAmmoDrop === 'function') despawnAmmoDrop();

    console.log('[survival] 模式已停止');
}
window.stopSurvivalMode = stopSurvivalMode;

// ============================================================
// 每帧 tick
// ============================================================
function survivalTick(dt, now) {
    if (!SurvivalState.active) return;

    if (typeof updateAmmoDrop === 'function') {
        updateAmmoDrop(dt, now);
    }

    if (SurvivalState.phase === 'prep') {
        if (now >= SurvivalState.prepEndTime) {
            SurvivalState.wave++;
            startSurvivalWave(SurvivalState.wave);
        }
    } else if (SurvivalState.phase === 'wave') {
        if (typeof updateAllZombies === 'function') {
            updateAllZombies(dt, now);
        }

        const alive = (typeof getZombiesAliveCount === 'function')
            ? getZombiesAliveCount() : 0;
        const queueLen = SurvivalState.waveQueue.length;

        if (queueLen > 0
            && alive < SurvivalState.MAX_ALIVE_ZOMBIES
            && now >= SurvivalState.nextSpawnAt) {
            const type = SurvivalState.waveQueue.shift();
            _spawnZombieAroundPlayer(type);
            SurvivalState.nextSpawnAt = now + SurvivalState.REFILL_DELAY_MS;
        }

        if (alive === 0 && queueLen === 0) {
            onSurvivalWaveCleared(now);
        }
    } else if (SurvivalState.phase === 'victory') {
        _handleVictory();
    } else if (SurvivalState.phase === 'defeat') {
        _handleDefeat();
    }
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
// 进入下一张地图
// ============================================================
function _enterNextMap() {
    const nextIndex = SurvivalState.mapIndex + 1;

    if (nextIndex >= SurvivalState.maps.length) {
        SurvivalState.phase = 'victory';

        if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
        if (typeof despawnAmmoDrop === 'function') despawnAmmoDrop();
        _hidePortalPrompt();

        running = false;
        if (document.pointerLockElement) document.exitPointerLock();

        console.log('[survival] 全部地图完成，通关！');
        _handleVictory();
        return;
    }

    const nextMapId = SurvivalState.maps[nextIndex];

    if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
    if (typeof despawnAmmoDrop === 'function') despawnAmmoDrop();
    _hidePortalPrompt();
    if (typeof clearAllZombies === 'function') clearAllZombies();

    SurvivalState.waveQueue = [];
    SurvivalState.nextSpawnAt = 0;

    SurvivalState.phase = 'loading';

    const wasRunning = running;
    running = false;
    if (document.pointerLockElement) document.exitPointerLock();

    if (typeof window.beginMapSwitchLoading === 'function') {
        window.beginMapSwitchLoading(nextMapId, () => {
            SurvivalState.mapIndex = nextIndex;
            SurvivalState.wave = 0;
            SurvivalState.phase = 'prep';
            SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;

            if (typeof p1 !== 'undefined' && p1) {
                _refillPlayerOnNextMap(p1);
            }

            _teleportPlayerToMapCenter();
            _clearInputState();

            running = true;

            if (typeof enterFullscreenAndLock === 'function') {
                enterFullscreenAndLock();
            }

            console.log('[survival] 进入下一张地图:', nextMapId);
        });
    } else {
        console.warn('[survival] beginMapSwitchLoading 未定义，直接切图');
        if (typeof window.loadMap === 'function') window.loadMap(nextMapId);
        SurvivalState.mapIndex = nextIndex;
        SurvivalState.wave = 0;
        SurvivalState.phase = 'prep';
        SurvivalState.prepEndTime = performance.now() + SurvivalState.PREP_MS;

        if (typeof p1 !== 'undefined' && p1) _refillPlayerOnNextMap(p1);
        _teleportPlayerToMapCenter();
        _clearInputState();

        running = wasRunning;

        if (typeof enterFullscreenAndLock === 'function') {
            enterFullscreenAndLock();
        }
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
    if (window.Shop && window.Shop.isOpen && window.Shop.isOpen()) {
        window.Shop.close();
    }
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
    if (window.Shop && window.Shop.isOpen && window.Shop.isOpen()) {
        window.Shop.close();
    }
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
// 波次开始
// ============================================================
function startSurvivalWave(wave) {
    SurvivalState.phase = 'wave';

    if (typeof despawnAmmoDrop === 'function') {
        despawnAmmoDrop();
    }

    const players = getSurvivalPlayers();
    for (const p of players) {
        if (p) p.survivalKills = 0;
    }

    const globalWave = SurvivalState.mapIndex * SurvivalState.maxWaves + wave;

    let typeList;
    if (typeof buildWaveComposition === 'function') {
        typeList = buildWaveComposition(globalWave);
    } else {
        const total = 3 + globalWave * 2;
        typeList = [];
        for (let i = 0; i < total; i++) typeList.push('normal');
    }

    for (let i = typeList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = typeList[i];
        typeList[i] = typeList[j];
        typeList[j] = tmp;
    }

    const total = typeList.length;
    const player = (typeof p1 !== 'undefined' && p1) ? p1 : null;
    if (!player) return;

    const initialCount = Math.min(total, SurvivalState.MAX_ALIVE_ZOMBIES);
    const remaining    = typeList.slice(initialCount);

    SurvivalState.waveQueue = remaining;
    SurvivalState.nextSpawnAt = performance.now() + SurvivalState.REFILL_DELAY_MS;

    for (let i = 0; i < initialCount; i++) {
        _spawnZombieAroundPlayer(typeList[i]);
    }

    const stat = {};
    for (const t of typeList) stat[t] = (stat[t] || 0) + 1;

    console.log('[survival] 地图', SurvivalState.mapIndex, '内第', wave,
                '波（全局', globalWave, '波）已启动',
                '总数', total, '，首刷', initialCount,
                '，队列剩余', remaining.length,
                '，构成:', stat);
}
window.startSurvivalWave = startSurvivalWave;