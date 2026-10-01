// ===== js/main.js – 主循环与启动（服务器权威版 + 瞄准镜画中画 · 优化版） =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setScissorTest(false);

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

function getDesiredPixelRatio() {
    if (isTouchDevice) return 1;
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    return Math.min(window.devicePixelRatio || 1, isOnline ? 1.5 : 2);
}
renderer.setPixelRatio(getDesiredPixelRatio());

if (isTouchDevice) {
    renderer.shadowMap.type = THREE.PCFShadowMap;
} else {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.appendChild(renderer.domElement);

// ============================================================
// ★ B3：阴影节流更新
// ============================================================
function getShadowUpdateInterval() {
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    return isOnline ? 6 : 3;
}
let _shadowFrameCounter = 0;

renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

window.requestShadowUpdate = function () {
    renderer.shadowMap.needsUpdate = true;
};

const LAMP_CULL_DIST_SQ = 22 * 22;

async function lockLandscape() {
    if (!isTouchDevice) return;
    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
        }
    } catch (err) {}
}
let _lastLockAttempt = 0;
async function tryLockOnInteract() {
    if (!isTouchDevice) return;
    const now = Date.now();
    if (now - _lastLockAttempt < 1000) return;
    _lastLockAttempt = now;
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            const p = el.requestFullscreen
                ? el.requestFullscreen()
                : (el.webkitRequestFullscreen ? Promise.resolve(el.webkitRequestFullscreen()) : Promise.resolve());
            await Promise.resolve(p).catch(() => {});
        }
    } catch (e) {}
    await lockLandscape();
}
document.addEventListener('touchstart', tryLockOnInteract, { passive: true });
document.addEventListener('click', tryLockOnInteract);
document.addEventListener('visibilitychange', () => { if (!document.hidden && isTouchDevice) lockLandscape(); });
window.addEventListener('orientationchange', () => { if (isTouchDevice) lockLandscape(); });

renderer.domElement.addEventListener('click', () => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (NET.isSpectator()) return;
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement && running && !isOver()) {
        if (NET.isSpectator()) return;
        const sens = 0.0022 * (p1.cam.fov / BASE_FOV);
        p1.yaw -= e.movementX * sens;
        p1.pitch -= e.movementY * sens;
        p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
    }
});

function enterFullscreenAndLock() {
    if (isTouchDevice) {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            const fsPromise = el.requestFullscreen
                ? el.requestFullscreen()
                : (el.webkitRequestFullscreen ? Promise.resolve(el.webkitRequestFullscreen()) : Promise.resolve());
            Promise.resolve(fsPromise).then(() => lockLandscape()).catch(() => {});
        } else {
            lockLandscape();
        }
        return;
    }
    if (NET.isSpectator()) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    function tryLock() {
        if (!running) return;
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (NET.isSpectator()) return;
        if (document.pointerLockElement !== renderer.domElement) {
            renderer.domElement.requestPointerLock();
            setTimeout(() => {
                if (document.pointerLockElement !== renderer.domElement) tryLock();
            }, 500);
        }
    }
    setTimeout(tryLock, 300);
}

document.addEventListener('fullscreenchange', () => {
    if (isTouchDevice) lockLandscape();
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (NET.isSpectator()) return;
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (isTouchDevice) lockLandscape();
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (NET.isSpectator()) return;
        renderer.domElement.requestPointerLock();
    }
});

document.getElementById('weaponPanel').addEventListener('click', function(e) {
    const btn = e.target.closest('.weapon-btn');
    if (!btn) return;
    if (!(running && gameState === 'prep')) return;
    if (NET.isSpectator()) return;
    const key = btn.dataset.weapon;
    if (key && WEAPONS[key]) {
        setWeapon(p1, key);
        sPickup(1);
        if (typeof gameMode !== 'undefined' && gameMode === 'online'
            && NET.role === 'player' && !NET.isHost) {
            NET.pendingWeaponSwitch = key;
        }
        document.getElementById('weaponPanel').style.display = 'none';
        if (document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            renderer.domElement.requestPointerLock();
        }
    }
});

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
// 瞄准镜画中画渲染（PiP）
// ============================================================
let _scopeCam = null;
let _scopeRT  = null;
let _scopeMat = null;

let _pipCachedLensF = null;
let _pipCachedLensB = null;
let _pipOrigMatF = null;
let _pipOrigMatB = null;
let _pipActive = false;
let _pipFrameCounter = 0;

const PIP_UPDATE_EVERY_N_FRAMES = 2;
const PIP_RT_SIZE_DESKTOP = 192;
const PIP_RT_SIZE_MOBILE  = 160;

function ensureScopeResources() {
    if (_scopeCam) return;

    const scopeFov = isTouchDevice ? 14 : 10;
    _scopeCam = new THREE.PerspectiveCamera(scopeFov, 1, 0.02, 250);
    _scopeCam.rotation.order = 'YXZ';
    _scopeCam.updateProjectionMatrix();

    const rtSize = isTouchDevice ? PIP_RT_SIZE_MOBILE : PIP_RT_SIZE_DESKTOP;
    _scopeRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false
    });

    _scopeMat = new THREE.MeshBasicMaterial({
        map: _scopeRT.texture,
        toneMapped: false,
        depthWrite: true,
        depthTest: true
    });
}

function updateScopePip() {
    if (typeof p1 === 'undefined' || !p1 || !p1.vm || p1.vm.children.length === 0) return;
    const vmGun = p1.vm.children[0];
    if (!vmGun || !vmGun.userData) return;
    const lensF = vmGun.userData.lensMeshF;
    const lensB = vmGun.userData.lensMeshB;
    if (!lensF) return;

    if (lensF !== _pipCachedLensF) {
        _pipCachedLensF = lensF;
        _pipCachedLensB = lensB || null;
        _pipOrigMatF = lensF.material;
        _pipOrigMatB = lensB ? lensB.material : null;
        _pipActive = false;
    }

    const now = performance.now();
    const isADS = running && gameState === 'combat'
        && p1.aiming
        && p1.weapon && (p1.weapon.key === 'rifle' || p1.weapon.key === 'odin')
        && !p1.isMelee && !p1.isSmoke && !p1.isFlash
        && p1.hp > 0 && now >= p1.deadUntil;

    if (isADS !== _pipActive) {
        _pipActive = isADS;
        if (isADS) {
            ensureScopeResources();
            _pipCachedLensF.material = _scopeMat;
            if (_pipCachedLensB) _pipCachedLensB.material = _scopeMat;
            _pipFrameCounter = PIP_UPDATE_EVERY_N_FRAMES;
        } else {
            _pipCachedLensF.material = _pipOrigMatF;
            if (_pipCachedLensB) _pipCachedLensB.material = _pipOrigMatB;
            return;
        }
    }

    if (!_pipActive) return;

    _pipFrameCounter++;
    if (_pipFrameCounter < PIP_UPDATE_EVERY_N_FRAMES) return;
    _pipFrameCounter = 0;

    _scopeCam.position.copy(p1.cam.position);
    _scopeCam.quaternion.copy(p1.cam.quaternion);

    const vmWasVisible = p1.vm.visible;
    p1.vm.visible = false;

    const shadowPrevAuto = renderer.shadowMap.autoUpdate;
    const shadowPrevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(_scopeRT);
    renderer.clear();
    renderer.render(scene, _scopeCam);
    renderer.setRenderTarget(prevRT);

    renderer.shadowMap.autoUpdate = shadowPrevAuto;
    renderer.shadowMap.needsUpdate = shadowPrevNeeds;

    p1.vm.visible = vmWasVisible;
}

// ============================================================
// ★ 预热 PiP 瞄准镜资源（供 loading.js 调用）
//   · 提前创建 scopeCam + scopeRT + scopeMat
//   · 用 scopeCam 渲染一帧到 RT，确保 GPU 资源真的分配过
// ============================================================
window.warmupScopePip = function () {
    ensureScopeResources();
    if (!_scopeCam || !_scopeRT) return;

    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;

    if (typeof p1 !== 'undefined' && p1 && p1.cam) {
        _scopeCam.position.copy(p1.cam.position);
        _scopeCam.quaternion.copy(p1.cam.quaternion);
    } else {
        _scopeCam.position.set(0, 5, 10);
        _scopeCam.lookAt(0, 0, 0);
    }
    _scopeCam.updateMatrixWorld(true);

    try {
        renderer.setRenderTarget(_scopeRT);
        renderer.clear();
        renderer.render(scene, _scopeCam);
        renderer.setRenderTarget(prevRT);
    } catch (e) {
        try { renderer.setRenderTarget(prevRT); } catch (e2) {}
    }

    renderer.shadowMap.autoUpdate = prevAuto;
    renderer.shadowMap.needsUpdate = prevNeeds;

    console.log('[loading] PiP 瞄准镜资源已预热');
};

function updateP2ShadowState() {
    if (typeof p2 === 'undefined' || !p2 || !p2.mesh) return;

    const shouldDisable = (typeof gameMode !== 'undefined' && gameMode === 'online');
    if (!!p2._shadowDisabled === shouldDisable) return;

    p2._shadowDisabled = shouldDisable;
    const cast = !shouldDisable;
    p2.mesh.traverse(o => { if (o.isMesh) o.castShadow = cast; });
}

function interpolateRemotePlayer(p, dt) {
    if (!p || !p._netTargetPos) return;

    const k = Math.min(1, dt * 22);

    p.pos.x += (p._netTargetPos.x - p.pos.x) * k;
    p.pos.y += (p._netTargetPos.y - p.pos.y) * k;
    p.pos.z += (p._netTargetPos.z - p.pos.z) * k;

    let dyaw = p._netTargetYaw - p.yaw;
    while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * k;

    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;
}

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

let _lastClientReportTime = 0;
const CLIENT_REPORT_INTERVAL = 33;

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

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

        if (gameMode === 'ai' && typeof aiUpdate === 'function') {
            aiUpdate(dt, now);
        } else if (gameMode === 'range') {
            updateTarget(p2, dt, now);
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

    updateEffects(dt, now);
    updateHUD(now);
    syncMinimapVisibility();
    if (minimapVisible && typeof updateMinimap === 'function') updateMinimap();

    render();

    updateFpsCounter(performance.now());
}
loop();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    p1.cam.aspect = window.innerWidth / window.innerHeight;
    p1.cam.updateProjectionMatrix();
});

// ============================================================
// 退出到大厅（仅单机模式）
// ============================================================
function exitToLobby() {
    audio();

    running = false;
    gameState = 'idle';
    if (typeof setOver === 'function') setOver(true);

    if (document.pointerLockElement) document.exitPointerLock();

    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'none';

    document.body.classList.remove('in-game');

    document.getElementById('lobbyOverlay').style.display = 'flex';

    console.log('[game] 已退出到大厅');
}
window.exitToLobby = exitToLobby;

// ============================================================
// 返回联机房间
// ============================================================
function returnToOnlineRoom(isRemote) {
    audio();

    running = false;
    gameState = 'idle';
    if (typeof setOver === 'function') setOver(true);

    if (document.pointerLockElement) document.exitPointerLock();

    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'none';

    document.body.classList.remove('in-game');
    document.body.classList.remove('online-mode');

    if (typeof NET !== 'undefined') {
        NET.started = false;
        NET.role = null;
        NET.pendingWeaponSwitch = null;
        NET.pendingReload = false;
        NET.pendingFuseStart = null;
        NET.pendingFuseRelease = false;
        NET.pendingMelee = false;
        NET.pendingMeleeHeavy = false;

        if (NET.isHost && !isRemote && typeof NET_broadcast === 'function') {
            NET_broadcast({ type: 'returnToRoom' });
        }
    }

    document.getElementById('onlineLobbyOverlay').style.display = 'flex';
    if (typeof renderOnlineRoomUI === 'function') renderOnlineRoomUI();

    console.log('[game] 已返回联机房间', isRemote ? '(远端触发)' : '');
}
window.returnToOnlineRoom = returnToOnlineRoom;

document.getElementById('exitBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    exitToLobby();
});

// ============================================================
// 开始游戏入口
// ============================================================
function enterGame(mode) {
    audio();
    if (!window.getCurrentMapId() && window.loadMap) {
        window.loadMap('battlefield');
    }
    window.GAME_setMode(mode);
    p2.gunHolder.visible = (mode === 'ai' || mode === 'online');
    document.getElementById('lobbyOverlay').style.display = 'none';

    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) exitBtn.style.display = (mode !== 'online') ? 'block' : 'none';

    resetMatch();
    enterFullscreenAndLock();
}
window.enterGame = enterGame;

document.getElementById('lobbyRangeBtn').addEventListener('click', () => enterGame('range'));
document.getElementById('lobbyAiBtn').addEventListener('click', () => enterGame('ai'));

document.getElementById('lobbyOnlineBtn').addEventListener('click', () => {
    audio();
    document.getElementById('lobbyOverlay').style.display = 'none';
    document.getElementById('onlineLobbyOverlay').style.display = 'flex';
    if (typeof NET !== 'undefined' && NET.roomId) {
        if (typeof renderOnlineRoomUI === 'function') renderOnlineRoomUI();
    } else {
        const entry = document.getElementById('onlineEntrySection');
        const room = document.getElementById('onlineRoomSection');
        const codeWrap = document.getElementById('onlineRoomCode');
        const badge = document.getElementById('onlineMyRole');
        if (entry) entry.style.display = 'block';
        if (room) room.style.display = 'none';
        if (codeWrap) codeWrap.style.display = 'none';
        if (badge) badge.style.display = 'none';
    }
});

document.getElementById('againBtn').addEventListener('click', () => {
    audio();
    if (gameMode === 'online') {
        returnToOnlineRoom(false);
    } else {
        resetMatch();
        enterFullscreenAndLock();
    }
});

window.GAME_setMode = function (mode) {
    const wasOnline = (gameMode === 'online');
    gameMode = mode;
    const isOnline = (mode === 'online');
    if (wasOnline !== isOnline && typeof renderer !== 'undefined' && renderer) {
        renderer.setPixelRatio(getDesiredPixelRatio());
        console.log('[perf] pixelRatio →', renderer.getPixelRatio(), '(mode:', mode + ')');
    }
};

function buildMapSelect() {
    const row = document.getElementById('mapSelectRow');
    if (!row) return;

    const maps = (window.getAvailableMaps && window.getAvailableMaps()) || [];
    row.innerHTML = '';

    const container = row.closest('.lobby-map-select');
    if (maps.length <= 1) {
        if (container) container.style.display = 'none';
        const only = maps[0];
        if (only && window.loadMap) {
            const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
            if (cur !== only.id) window.loadMap(only.id);
        }
        return;
    }
    if (container) container.style.display = '';

    maps.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        btn.dataset.mapId = m.id;
        btn.textContent = m.name;
        btn.addEventListener('click', () => {
            if (typeof running !== 'undefined' && running) return;
            audio();
            if (window.loadMap && window.loadMap(m.id)) {
                row.querySelectorAll('.map-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.mapId === m.id);
                });
            }
        });
        row.appendChild(btn);
    });

    const cur = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
    row.querySelectorAll('.map-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mapId === cur);
    });
}

(function init() {
    if (window.loadMap) window.loadMap('battlefield');
    buildMapSelect();
})();