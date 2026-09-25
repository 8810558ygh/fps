// ===== js/main.js – 主循环与启动（服务器权威版 + 瞄准镜画中画 · 优化版） =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setScissorTest(false);

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
if (isTouchDevice) {
    renderer.setPixelRatio(1);
    renderer.shadowMap.type = THREE.PCFShadowMap;
} else {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.appendChild(renderer.domElement);

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
    if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement && running && !isOver()) {
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
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
    if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    function tryLock() {
        if (!running) return;
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
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
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (isTouchDevice) lockLandscape();
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        renderer.domElement.requestPointerLock();
    }
});

document.getElementById('weaponPanel').addEventListener('click', function(e) {
    const btn = e.target.closest('.weapon-btn');
    if (!btn) return;
    if (!(running && gameState === 'prep')) return;
    if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
    const key = btn.dataset.weapon;
    if (key && WEAPONS[key]) {
        setWeapon(p1, key);
        sPickup(1);
        if (typeof gameMode !== 'undefined' && gameMode === 'online'
            && typeof NET !== 'undefined' && NET.role === 'player' && !NET.isHost) {
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
// ★ 瞄准镜画中画渲染（PiP）— 优化版 + 换枪修复
//
// 关键优化：
//   1. 节流：镜内画面每 2 帧更新一次
//   2. 关阴影：PiP 渲染期间临时关闭 shadowMap.autoUpdate
//   3. 状态切换：只在进入/退出 ADS 时切材质
//   4. FOV：只在初始化时设一次
//   5. RT：降到 256（桌面）/ 192（移动）
//
// ★ 修复：换枪后 lensF 引用变化 → 直接对比引用，不用 .parent 判断
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
const PIP_RT_SIZE_DESKTOP = 256;
const PIP_RT_SIZE_MOBILE  = 192;

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

    // ★★★ 修复：换枪后 lensF 是全新对象，直接对比引用
    //  换枪时 setWeapon() 会 remove 旧 vm 并 add 新 vm
    //  新 vm 的 userData.lensMeshF 是新的 mesh
    //  只要引用不同就刷新缓存，并强制重新应用 ADS 状态
    if (lensF !== _pipCachedLensF) {
        _pipCachedLensF = lensF;
        _pipCachedLensB = lensB || null;
        _pipOrigMatF = lensF.material;
        _pipOrigMatB = lensB ? lensB.material : null;
        _pipActive = false; // 强制下一帧重新应用状态
    }

    const now = performance.now();
        const isADS = running && gameState === 'combat'
        && p1.aiming
        && p1.weapon && (p1.weapon.key === 'rifle' || p1.weapon.key === 'odin')
        && !p1.isMelee && !p1.isSmoke && !p1.isFlash
        && p1.hp > 0 && now >= p1.deadUntil;

    // ---- 状态切换：只在进入/退出 ADS 时换材质 ----
    if (isADS !== _pipActive) {
        _pipActive = isADS;
        if (isADS) {
            ensureScopeResources();
            _pipCachedLensF.material = _scopeMat;
            if (_pipCachedLensB) _pipCachedLensB.material = _scopeMat;
            // 进入 ADS 立即渲染一次，避免第一帧显示旧内容
            _pipFrameCounter = PIP_UPDATE_EVERY_N_FRAMES;
        } else {
            _pipCachedLensF.material = _pipOrigMatF;
            if (_pipCachedLensB) _pipCachedLensB.material = _pipOrigMatB;
            return;
        }
    }

    if (!_pipActive) return;

    // ---- 节流：每 N 帧才渲染一次 PiP ----
    _pipFrameCounter++;
    if (_pipFrameCounter < PIP_UPDATE_EVERY_N_FRAMES) return;
    _pipFrameCounter = 0;

    // ---- 复制主相机位置/朝向（FOV 已在初始化时设好）----
    _scopeCam.position.copy(p1.cam.position);
    _scopeCam.quaternion.copy(p1.cam.quaternion);

    // ---- 隐藏 vm + 临时关阴影自动更新 ----
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

function render() {
    p1.mesh.visible = false;
    p2.mesh.visible = p2.baseVisible;
    p1.vm.visible = p1.baseVisible && !(p1.aiming && p1.weapon.scope);
    if (p2.vm) p2.vm.visible = false;

    // ★ PiP 渲染（内部会临时隐藏 vm 再恢复；节流在函数内部）
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

function updateLocalClientCamera(dt, now) {
    if (p1.input.fire && !p1.isMelee && !p1.isSmoke && !p1.isFlash && gameState === 'combat' && now >= p1.deadUntil) {
        tryFire(p1, now);
    }

    let targetFov = BASE_FOV;
    const canAim = !p1.isMelee && !p1.isSmoke && !p1.isFlash && p1.reloadEnd <= now && now >= p1.boltEnd;
    p1.aiming = !!p1.input.aim && canAim;
    if (p1.aiming) {
        if (p1.weapon.key === 'sniper' && p1.aimStage === 2 && p1.weapon.zoomFov2) targetFov = p1.weapon.zoomFov2;
        else targetFov = p1.weapon.zoomFov;
    }
    if (Math.abs(p1.cam.fov - targetFov) > 0.05) {
        p1.cam.fov += (targetFov - p1.cam.fov) * Math.min(1, dt * 11);
        p1.cam.updateProjectionMatrix();
    }
    p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
    p1.cam.rotation.y = p1.yaw;
    p1.cam.rotation.x = p1.pitch;
    p1.mesh.position.copy(p1.pos);
    p1.mesh.rotation.y = p1.yaw;
    p1.mesh.scale.y = p1.height / HEIGHT_STAND;
    updateSniperViewmodel(p1, dt, now);

    if (typeof updateThirdPersonWeapon === 'function') {
        updateThirdPersonWeapon(p1, dt, now);
        if (typeof p2 !== 'undefined' && p2) {
            updateThirdPersonWeapon(p2, dt, now);
        }
    }
}

let _lastClientReportTime = 0;
const CLIENT_REPORT_INTERVAL = 20;

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    const isHost      = (gameMode !== 'online') || (typeof NET !== 'undefined' && NET.isHost);
    const isClient    = (gameMode === 'online' && typeof NET !== 'undefined'
                         && NET.role === 'player' && !NET.isHost);
    const isSpectator = (gameMode === 'online' && typeof NET !== 'undefined'
                         && NET.role === 'spectator');

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

            if (now - _lastClientReportTime >= CLIENT_REPORT_INTERVAL) {
                _lastClientReportTime = now;
                if (typeof NET_sendClientInput === 'function') NET_sendClientInput();
            }

            updateLocalClientCamera(dt, now);
        } else if (isSpectator) {
            if (typeof NET_updateSpectatorView === 'function') NET_updateSpectatorView(dt);
        }

        if (gameMode === 'ai' && typeof aiUpdate === 'function') {
            aiUpdate(dt, now);
        } else if (gameMode === 'range') {
            updateTarget(p2, dt, now);
        }

        if (!isSpectator) {
            if (isHost) {
                updateFootsteps(p1, dt, now);
                if (gameMode === 'ai' || (gameMode === 'online' && NET.isHost)) updateFootsteps(p2, dt, now);
            } else if (isClient) {
                updateFootsteps(p1, dt, now);
                updateFootsteps(p2, dt, now);
            }
            if (typeof updateXrayVisibility === 'function') updateXrayVisibility();
        }
    }

    updateEffects(dt, now);
    updateHUD(now);
    syncMinimapVisibility();
    if (minimapVisible && typeof updateMinimap === 'function') updateMinimap();

    render();
}
loop();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    p1.cam.aspect = window.innerWidth / window.innerHeight;
    p1.cam.updateProjectionMatrix();
});

function enterGame(mode) {
    audio();
    if (!window.getCurrentMapId() && window.loadMap) {
        window.loadMap('battlefield');
    }
    gameMode = mode;
    p2.gunHolder.visible = (mode === 'ai' || mode === 'online');
    document.getElementById('lobbyOverlay').style.display = 'none';
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
    resetMatch();
    enterFullscreenAndLock();
});

window.GAME_setMode = function (mode) { gameMode = mode; };
window.GAME_setSpectator = false;

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