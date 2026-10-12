// ===== js/main_loop.js – 主循环 / FPS / render / 远端插值 / 小地图 =====
// 从 main.js 拆出，不改变任何对外接口
// 依赖：
//   · main.js       的 renderer / isTouchDevice / getShadowUpdateInterval / _shadowFrameCounter / LAMP_CULL_DIST_SQ
//   · main_pip.js   的 updateScopePip

// ============================================================
// 小地图可见性
// ============================================================
const minimapEl = document.getElementById('minimap');
let minimapVisible = false;

function syncMinimapVisibility() {
    if (!minimapEl) return;
    const shouldShow = running && !isOver();
    if (shouldShow !== minimapVisible) {
        minimapVisible = shouldShow;
        minimapEl.style.display = shouldShow ? 'block' : 'none';
    }
}
window.syncMinimapVisibility = syncMinimapVisibility;
window.isMinimapVisible = () => minimapVisible;

// ============================================================
// 主时钟
// ============================================================
const clock = new THREE.Clock();

// ============================================================
// 实时帧率计数器
// ============================================================
const _fpsEl = document.getElementById('fpsCounter');
const _fpsState = {
    frames: 0,
    lastUpdate: performance.now(),
    lastText: ''
};
const FPS_UPDATE_INTERVAL = 500;

function updateFpsCounter(now) {
    if (!_fpsEl) return;

    _fpsState.frames++;

    const elapsed = now - _fpsState.lastUpdate;
    if (elapsed < FPS_UPDATE_INTERVAL) return;

    const fps     = Math.round(_fpsState.frames * 1000 / elapsed);
    const frameMs = (elapsed / _fpsState.frames).toFixed(2);
    const calls   = (renderer.info && renderer.info.render)
                  ? renderer.info.render.calls : 0;

    _fpsState.frames = 0;
    _fpsState.lastUpdate = now;

    let cls = '';
    if (fps < 30) cls = 'bad';
    else if (fps < 55) cls = 'warn';

    const html =
        `<span class="fps-value ${cls}">${fps} FPS</span><br>` +
        `<span class="fps-sub">${frameMs} ms · ${calls} calls</span>`;

    if (html !== _fpsState.lastText) {
        _fpsEl.innerHTML = html;
        _fpsState.lastText = html;
    }
}

// ============================================================
// P2 阴影状态（联机时禁用 P2 阴影，节省性能）
// ============================================================
function updateP2ShadowState() {
    if (typeof p2 === 'undefined' || !p2 || !p2.mesh) return;

    const shouldDisable = (typeof gameMode !== 'undefined' && gameMode === 'online');
    if (!!p2._shadowDisabled === shouldDisable) return;

    p2._shadowDisabled = shouldDisable;
    const cast = !shouldDisable;
    p2.mesh.traverse(o => { if (o.isMesh) o.castShadow = cast; });
}

// ============================================================
// ★ 远端玩家插值（固定时间常数 · 帧率无关 · 抗抖动）
// ============================================================
function interpolateRemotePlayer(p, dt) {
    if (!p || !p._netTargetPos) return;

    const k    = 1 - Math.exp(-18 * dt);
    const kYaw = 1 - Math.exp(-22 * dt);

    p.pos.x += (p._netTargetPos.x - p.pos.x) * k;
    p.pos.y += (p._netTargetPos.y - p.pos.y) * k;
    p.pos.z += (p._netTargetPos.z - p.pos.z) * k;

    let dyaw = p._netTargetYaw - p.yaw;
    while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * kYaw;

    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;
}

// ============================================================
// 渲染一帧
// ============================================================
function render() {
    updateP2ShadowState();

    p1.mesh.visible = false;
    p2.mesh.visible = p2.baseVisible;
    p1.vm.visible = p1.baseVisible && !(p1.aiming && p1.weapon.scope);
    if (p2.vm) p2.vm.visible = false;

    _shadowFrameCounter++;
    if (_shadowFrameCounter >= getShadowUpdateInterval()) {
        _shadowFrameCounter = 0;
        renderer.shadowMap.needsUpdate = true;
    }

    updateScopePip();

    renderer.render(scene, p1.cam);
}

// ============================================================
// 收集本地输入
// ============================================================
function collectLocalInput(p) {
    if (!p) return;
    let f = 0, s = 0;
    if (keys['KeyW']) f += 1;
    if (keys['KeyS']) f -= 1;
    if (keys['KeyD']) s += 1;
    if (keys['KeyA']) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 0) { f /= len; s /= len; }
    p.input.forward = f;
    p.input.right = s;
    p.input.jump = !!keys['Space'];
    p.input.crouch = !!keys['ShiftLeft'];
    p.input.fire = !!mouse.leftDown;
}

// ============================================================
// 客户端上报节流
// ============================================================
let _lastClientReportTime = 0;
// ★ 33 → 16（60Hz 上报；变化检测在 NET_sendClientInput 里，空包不发）
const CLIENT_REPORT_INTERVAL = 16;

// ============================================================
// 主循环
// ============================================================
function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    // ★ 每帧同步音频监听器到相机位置（HRTF 听声辨位）
    if (typeof updateAudioListener === 'function') updateAudioListener();

    if (typeof desertGrassTime !== 'undefined') desertGrassTime.value = now / 1000;

    const isHost      = (gameMode !== 'online') || (typeof NET !== 'undefined' && NET.isHost);
    const isClient    = NET.isClientPlayer();
    const isSpectator = NET.isSpectator();

    if (running) {
        if (isHost) {
            collectLocalInput(p1);
            updatePlayer(p1, dt, now);

            if (gameMode === 'online' && NET.isHost) {
                updatePlayer(p2, dt, now);
            }

            if (gameState === 'prep' && now >= stateEndTime) endPrep(now);
            else if (gameState === 'roundEnd' && now >= stateEndTime) startRound(now);
        } else if (isClient) {
            collectLocalInput(p1);
            updatePlayer(p1, dt, now);

            if (typeof p2 !== 'undefined' && p2) {
                interpolateRemotePlayer(p2, dt);
                updateFootsteps(p2, dt, now, true);
            }

            if (typeof updateThirdPersonWeapon === 'function'
                && typeof p2 !== 'undefined' && p2) {
                updateThirdPersonWeapon(p2, dt, now);
            }

            if (now - _lastClientReportTime >= CLIENT_REPORT_INTERVAL) {
                _lastClientReportTime = now;
                if (typeof NET_sendClientInput === 'function') NET_sendClientInput();
            }
        } else if (isSpectator) {
            if (typeof NET_updateSpectatorView === 'function') NET_updateSpectatorView(dt);
        }

        // ★ 只处理 AI 模式
        if (gameMode === 'ai' && typeof aiUpdate === 'function') {
            aiUpdate(dt, now);
        }

        // 物理步进 + 同步
        if (window.PHYSICS && window.PHYSICS.isReady()) {
            window.PHYSICS.stepPhysics(dt);

            if (typeof p1 !== 'undefined' && p1) {
                window.PHYSICS.syncPlayerToBody(p1, dt);
            }

            if (typeof p2 !== 'undefined' && p2) {
                if (isClient || isSpectator) {
                    window.PHYSICS.syncPlayerToBody(p2, dt);
                }
            }
        }

        if (!isSpectator) {
            if (isHost) {
                updateFootsteps(p1, dt, now);
                if (gameMode === 'ai' || (gameMode === 'online' && NET.isHost)) updateFootsteps(p2, dt, now);
            } else if (isClient) {
                updateFootsteps(p1, dt, now);
            }
            if (typeof updateXrayVisibility === 'function') updateXrayVisibility();
        }

        if (window.lampLights && window.lampLights.length > 0) {
            const camPos = p1.cam.position;
            const lights = window.lampLights;
            for (let i = 0; i < lights.length; i++) {
                const L = lights[i];
                const dx = L.position.x - camPos.x;
                const dz = L.position.z - camPos.z;
                L.visible = (dx * dx + dz * dz) < LAMP_CULL_DIST_SQ;
            }
        }
    }

    // ★ 滑索塔警示灯呼吸效果
    if (typeof updateZiplineTowerLights === 'function') {
        updateZiplineTowerLights(now);
    }

    updateEffects(dt, now);
    updateHUD(now);
    syncMinimapVisibility();
    if (minimapVisible && typeof updateMinimap === 'function') updateMinimap();

    render();

    updateFpsCounter(performance.now());
}
loop();

// ============================================================
// ★ 网络诊断接口（控制台调用 dumpNetStats()）
// ============================================================
window.dumpNetStats = function () {
    const s = {
        ping: NET.ping,
        connType: NET.connType || 'unknown',
        role: NET.role || '-',
        isHost: NET.isHost,
        reportInterval: (typeof CLIENT_REPORT_INTERVAL !== 'undefined') ? CLIENT_REPORT_INTERVAL : '-',
        broadcastInterval: (typeof HOST_BROADCAST_INTERVAL !== 'undefined') ? HOST_BROADCAST_INTERVAL : '-',
        clientDrift: NET._lastDrift ? NET._lastDrift.toFixed(3) + 'm' : '-',
        connCount: NET.connections.size
    };
    console.table(s);
    if (s.connType === 'relay') {
        console.warn('%c⚠️ 当前使用 TURN 中继，延迟高的主要原因是走了中转服务器', 'color:#ffd24a;font-weight:bold;');
    } else if (s.connType === 'p2p') {
        console.log('%c✅ P2P 直连，网络条件良好', 'color:#6ee7b7;font-weight:bold;');
    }
    return s;
};