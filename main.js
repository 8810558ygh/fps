// ===== js/main.js – 主循环与启动（单机 + 人机 + 联机房主权威） =====
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

// ============================================================
// ★ 移动端全程横屏锁定
// ============================================================
async function lockLandscape() {
    if (!isTouchDevice) return;
    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
            console.log('✅ 已锁定横屏');
        }
    } catch (err) {
        // 部分浏览器（如 iOS Safari）不支持，静默失败
    }
}

function checkOrientation() {
    if (!isTouchDevice) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    const overlay = document.getElementById('rotateOverlay');
    if (overlay) {
        overlay.style.display = isPortrait ? 'flex' : 'none';
    }
    // 横屏时尝试锁定
    if (!isPortrait) {
        lockLandscape();
    }
}

// ★ 首次任意触摸/点击时尝试进入全屏 + 锁定横屏（浏览器要求用户手势）
let _lastLockAttempt = 0;
async function tryLockOnInteract() {
    if (!isTouchDevice) return;
    const now = Date.now();
    if (now - _lastLockAttempt < 1000) return;
    _lastLockAttempt = now;

    // 1) 尝试全屏
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            const p = el.requestFullscreen
                ? el.requestFullscreen()
                : (el.webkitRequestFullscreen ? Promise.resolve(el.webkitRequestFullscreen()) : Promise.resolve());
            await Promise.resolve(p).catch(() => {});
        }
    } catch (e) {}

    // 2) 尝试锁定横屏
    await lockLandscape();

    // 3) 更新朝向遮罩
    checkOrientation();
}
document.addEventListener('touchstart', tryLockOnInteract, { passive: true });
document.addEventListener('click', tryLockOnInteract);

// 页面加载时立刻检查一次朝向
checkOrientation();

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 200);
});

// 每次从后台切回时也尝试重锁横屏
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isTouchDevice) {
        checkOrientation();
    }
});

// ---------- 鼠标 ----------
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

// ---------- 全屏 + 指针锁定（进入游戏时调用） ----------
function enterFullscreenAndLock() {
    // 移动端：全屏 + 横屏（不论什么角色都做）
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
        setTimeout(checkOrientation, 300);
        return;
    }

    // 桌面端：全屏 + 指针锁定（观战者跳过指针锁定）
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
    if (isTouchDevice) {
        lockLandscape();
        checkOrientation();
    }
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (isTouchDevice) {
        lockLandscape();
        checkOrientation();
    }
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        if (typeof isChatOpen === 'function' && isChatOpen()) return;
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        renderer.domElement.requestPointerLock();
    }
});

// ---------- 武器面板 ----------
document.getElementById('weaponPanel').addEventListener('click', function(e) {
    const btn = e.target.closest('.weapon-btn');
    if (!btn) return;
    if (!(running && gameState === 'prep')) return;
    if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
    const key = btn.dataset.weapon;
    if (key && WEAPONS[key]) {
        setWeapon(p1, key);
        sPickup(1);
        document.getElementById('weaponPanel').style.display = 'none';
        if (document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            renderer.domElement.requestPointerLock();
        }
    }
});

// ---------- 小地图 ----------
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

// ---------- 主循环 ----------
const clock = new THREE.Clock();

function render() {
    p1.mesh.visible = false;
    p2.mesh.visible = p2.baseVisible;
    p1.vm.visible = p1.baseVisible && !(p1.aiming && p1.weapon.scope);
    renderer.render(scene, p1.cam);
}

let _lastClientReportTime = 0;
const CLIENT_REPORT_INTERVAL = 40;

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    const isAuthority = (gameMode !== 'online') || (typeof NET !== 'undefined' && NET.isHost);
    const isSpectator = (gameMode === 'online' && typeof NET !== 'undefined' && NET.role === 'spectator');

    if (running) {
        if (isAuthority) {
            if (gameState === 'prep' && now >= stateEndTime) endPrep(now);
            else if (gameState === 'roundEnd' && now >= stateEndTime) startRound(now);
        }

        if (isSpectator) {
            if (typeof NET_updateSpectatorView === 'function') NET_updateSpectatorView(dt);
        } else {
            updatePlayer(p1, dt, now);
        }

        if (gameMode === 'ai' && typeof aiUpdate === 'function') {
            aiUpdate(dt, now);
        } else if (gameMode === 'range') {
            updateTarget(p2, dt, now);
        }

        if (!isSpectator) {
            if (gameMode !== 'online') {
                updateFootsteps(p1, dt, now);
                if (gameMode === 'ai') updateFootsteps(p2, dt, now);
            } else if (typeof NET !== 'undefined' && NET.isHost) {
                updateFootsteps(p1, dt, now);
                updateFootsteps(p2, dt, now);
            } else if (typeof NET !== 'undefined' && NET.role === 'player') {
                updateFootsteps(p1, dt, now);
                updateFootsteps(p2, dt, now);
            }

            if (typeof updateXrayVisibility === 'function') updateXrayVisibility();
        }

        if (gameMode === 'online' && typeof NET !== 'undefined' && NET.role === 'player') {
            if (now - _lastClientReportTime >= CLIENT_REPORT_INTERVAL) {
                _lastClientReportTime = now;
                if (typeof NET_sendClientInput === 'function') NET_sendClientInput();
            }
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

// ---------- 大厅按钮 ----------
function enterGame(mode) {
    audio();
    gameMode = mode;
    p2.gunHolder.visible = (mode === 'ai' || mode === 'online');
    document.getElementById('lobbyOverlay').style.display = 'none';
    resetMatch();
    enterFullscreenAndLock();
}
window.enterGame = enterGame;

document.getElementById('lobbyRangeBtn').addEventListener('click', () => enterGame('range'));
document.getElementById('lobbyAiBtn').addEventListener('click', () => enterGame('ai'));

// 联机按钮
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

// ---------- 结束页 ----------
document.getElementById('againBtn').addEventListener('click', () => {
    audio();
    resetMatch();
    enterFullscreenAndLock();
});

// ---------- 全局 ----------
window.GAME_setMode = function (mode) { gameMode = mode; };
window.GAME_setSpectator = false;