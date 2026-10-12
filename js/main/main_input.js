// ===== js/main_input.js – 全屏 / 锁定 / 鼠标 / weaponPanel / resize 响应 =====
// 从 main.js 拆出，不改变任何对外接口
// 依赖：main.js 的 renderer / isTouchDevice

// ============================================================
// 横屏锁定（仅触屏设备）
// ============================================================
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

// ============================================================
// 点击 canvas 重新锁定鼠标
// ============================================================
renderer.domElement.addEventListener('click', () => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (NET.isSpectator()) return;
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
});

// ============================================================
// ★ 鼠标移动：灵敏度读取 SETTINGS
// ============================================================
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement && running && !isOver()) {
        if (NET.isSpectator()) return;

        const S  = (window.SETTINGS && window.SETTINGS.sensitivity) ? window.SETTINGS.sensitivity : null;
        const RT = window.SETTINGS_RT || {};

        const baseSens = (RT.mouseSens !== undefined) ? RT.mouseSens : 0.0022;
        const adsMul   = (S && p1.aiming) ? S.adsMul   : 1.0;
        const vertMul  = (S && S.vertMul) ? S.vertMul  : 1.0;
        const invertY  = !!(S && S.invertY);

        const sens = baseSens * (p1.cam.fov / BASE_FOV) * adsMul;
        p1.yaw -= e.movementX * sens;

        const ySign = invertY ? 1 : -1;
        p1.pitch += ySign * e.movementY * sens * vertMul;
        p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
    }
});

// ============================================================
// 进入全屏并锁定鼠标
// ============================================================
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
window.enterFullscreenAndLock = enterFullscreenAndLock;

// ============================================================
// 全屏状态变化 → 重新锁定
// ============================================================
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

// ============================================================
// 武器面板选择（准备阶段）
// ============================================================
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

// ============================================================
// 窗口尺寸变化 → 更新渲染器和相机
// ============================================================
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (typeof p1 !== 'undefined' && p1 && p1.cam) {
        p1.cam.aspect = window.innerWidth / window.innerHeight;
        p1.cam.updateProjectionMatrix();
    }
});