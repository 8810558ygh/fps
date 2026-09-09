// ===== js/main.js – 主循环与启动（含武器面板点击锁定 + 移动端适配） =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setScissorTest(false);

// ---- 手机端性能优化 ----
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (isTouchDevice) {
    renderer.setPixelRatio(1);               // 降低像素比，省电
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 若手机发热严重，可取消下面注释关闭阴影
    // renderer.shadowMap.enabled = false;
}
document.body.appendChild(renderer.domElement);

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

// ---------- 全屏与锁鼠标（移动端适配） ----------
function enterFullscreenAndLock() {
    // 触摸设备：只全屏，不锁定指针
    if (isTouchDevice) {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                el.requestFullscreen().catch(() => {});
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            }
        }
        return;
    }

    // 电脑端：全屏 + 指针锁定
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
});
document.addEventListener('webkitfullscreenchange', () => {
    if (running && document.pointerLockElement !== renderer.domElement && !isTouchDevice) {
        renderer.domElement.requestPointerLock();
    }
});

// ---------- 武器面板按钮事件 ----------
document.getElementById('weaponPanel').addEventListener('click', function(e) {
    const btn = e.target.closest('.weapon-btn');
    if (btn) {
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
    }
});

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
        updatePlayer(p1, dt, now);
        updateTarget(p2, dt, now);
        updatePickups(now);
    }
    updateEffects(dt, now);
    updateHUD(now);
    render();
}
loop();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    p1.cam.aspect = window.innerWidth / window.innerHeight;
    p1.cam.updateProjectionMatrix();
});

document.getElementById('startBtn').addEventListener('click', () => {
    audio();
    resetMatch();
    enterFullscreenAndLock();
});
document.getElementById('againBtn').addEventListener('click', () => {
    audio();
    resetMatch();
    enterFullscreenAndLock();
});