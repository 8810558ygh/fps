// ===== js/main.js – 主循环与启动（大厅 + 回合制 + 小地图） =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setScissorTest(false);

// ---- 手机端性能优化 ----
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
if (isTouchDevice) {
    renderer.setPixelRatio(1);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // renderer.shadowMap.enabled = false; // 发热严重时开启
}
document.body.appendChild(renderer.domElement);

// ===== 手机横屏锁定与检测 =====
async function lockLandscape() {
    if (!isTouchDevice) return;
    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
            console.log('✅ 已锁定横屏');
        }
    } catch (err) {
        console.warn('⚠️ 横屏锁定失败（浏览器不支持或用户拒绝）:', err);
    }
}

function checkOrientation() {
    if (!isTouchDevice) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    const overlay = document.getElementById('rotateOverlay');
    const shouldShow = isPortrait && running;
    if (overlay) {
        overlay.style.display = shouldShow ? 'flex' : 'none';
    }
    if (!isPortrait) {
        lockLandscape();
    }
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 200);
});

// ---------- 鼠标控制 ----------
renderer.domElement.addEventListener('click', () => {
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
});
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement && running && !isOver()) {
        const sens = 0.0022 * (p1.cam.fov / BASE_FOV);
        p1.yaw -= e.movementX * sens;
        p1.pitch -= e.movementY * sens;
        p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
    }
});

// ---------- 全屏与锁鼠标 ----------
function enterFullscreenAndLock() {
    if (isTouchDevice) {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            const fsPromise = el.requestFullscreen
                ? el.requestFullscreen()
                : (el.webkitRequestFullscreen ? Promise.resolve(el.webkitRequestFullscreen()) : Promise.resolve());

            Promise.resolve(fsPromise)
                .then(() => { lockLandscape(); })
                .catch(() => {});
        } else {
            lockLandscape();
        }
        setTimeout(checkOrientation, 300);
        return;
    }

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        }
    }
    function tryLock() {
        if (!running) return;
        if (document.pointerLockElement !== renderer.domElement) {
            renderer.domElement.requestPointerLock();
            setTimeout(() => {
                if (document.pointerLockElement !== renderer.domElement) {
                    tryLock();
                }
            }, 500);
        }
    }
    setTimeout(tryLock, 300);
}

document.addEventListener('fullscreenchange', () => {
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
    if (isTouchDevice) lockLandscape();
});
document.addEventListener('webkitfullscreenchange', () => {
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
    if (isTouchDevice) lockLandscape();
});

// ---------- 武器面板按钮事件 ----------
document.getElementById('weaponPanel').addEventListener('click', function(e) {
    const btn = e.target.closest('.weapon-btn');
    if (!btn) return;
    if (!(running && gameState === 'prep')) return;

    const key = btn.dataset.weapon;
    if (key && WEAPONS[key]) {
        setWeapon(p1, key);
        sPickup(1);
        const panel = document.getElementById('weaponPanel');
        panel.style.display = 'none';
        if (document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
            renderer.domElement.requestPointerLock();
        }
    }
});

// ---------- 小地图显隐跟随游戏状态 ----------
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

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    if (running) {
        if (gameState === 'prep' && now >= stateEndTime) {
            endPrep(now);
        } else if (gameState === 'roundEnd' && now >= stateEndTime) {
            startRound(now);
        }
        updatePlayer(p1, dt, now);
        updateTarget(p2, dt, now);
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

// ---------- 大厅「开始游戏」→ 直接进入游戏 ----------
document.getElementById('lobbyStartBtn').addEventListener('click', () => {
    audio();
    document.getElementById('lobbyOverlay').style.display = 'none';
    resetMatch();
    enterFullscreenAndLock();
});

// ---------- 结束页 → 再来一局 ----------
document.getElementById('againBtn').addEventListener('click', () => {
    audio();
    resetMatch();
    enterFullscreenAndLock();
});