// ===== js/input.js – 键盘/鼠标/触摸输入 =====
const keys = {};
const mouse = { aim: false, leftDown: false };

// ---------- 键盘事件 ----------
window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W' || e.key === 't' || e.key === 'T')) {
        e.preventDefault(); e.stopPropagation();
    }
    if ((e.ctrlKey || e.metaKey) && ['f','F','s','S','p','P'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
    }

    if (!e.repeat) {
        if (e.code === 'KeyR') startReload(p1, performance.now());
        if (e.code === 'KeyB') {
            if (running && !isOver()) {
                const panel = document.getElementById('weaponPanel');
                if (panel) {
                    const isOpen = panel.style.display !== 'none';
                    if (isOpen) {
                        panel.style.display = 'none';
                        // PC 端重新锁定鼠标
                        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
                            if (document.pointerLockElement !== renderer.domElement) {
                                renderer.domElement.requestPointerLock();
                            }
                        }
                    } else {
                        panel.style.display = 'flex';
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                }
            }
        }
    }
    keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- 鼠标事件（唯一处理鼠标的地方） ----------
document.addEventListener('mousedown', e => {
    if (e.button === 0) {
        // 左键：开火
        mouse.leftDown = true;
    } else if (e.button === 2) {
        // 右键：切换开镜（仅一次）
        e.preventDefault();
        e.stopPropagation();
        if (running && !isOver()) {
            mouse.aim = !mouse.aim;
        }
    } else {
        e.preventDefault();
        e.stopPropagation();
    }
});

document.addEventListener('mouseup', e => {
    if (e.button === 0) {
        mouse.leftDown = false;
    } else if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
    }
});

// ---------- 触摸事件：手机控制映射 ----------

// 左侧摇杆 – 模拟 WASD
let leftTouchId = null;
const leftEl = document.getElementById('touch-left');
if (leftEl) {
    leftEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        leftTouchId = t.identifier;
    }, { passive: false });
    leftEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = Array.from(e.changedTouches).find(t => t.identifier === leftTouchId);
        if (!t) return;
        const rect = e.target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = (t.clientX - cx) / (rect.width / 2);
        let dy = (t.clientY - cy) / (rect.height / 2);
        if (Math.abs(dx) < 0.15) dx = 0;
        if (Math.abs(dy) < 0.15) dy = 0;
        keys['KeyW'] = dy < -0.1;
        keys['KeyS'] = dy > 0.1;
        keys['KeyA'] = dx < -0.1;
        keys['KeyD'] = dx > 0.1;
    }, { passive: false });
    leftEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys['KeyW'] = false;
        keys['KeyS'] = false;
        keys['KeyA'] = false;
        keys['KeyD'] = false;
        leftTouchId = null;
    }, { passive: false });
    leftEl.addEventListener('touchcancel', () => {
        keys['KeyW'] = false; keys['KeyS'] = false;
        keys['KeyA'] = false; keys['KeyD'] = false;
        leftTouchId = null;
    });
}

// 右侧滑动 – 模拟鼠标移动（视角）
let rightTouchId = null;
let lastRightX = 0, lastRightY = 0;
const rightEl = document.getElementById('touch-right');
if (rightEl) {
    rightEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        rightTouchId = t.identifier;
        lastRightX = t.clientX;
        lastRightY = t.clientY;
    }, { passive: false });
    rightEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = Array.from(e.changedTouches).find(t => t.identifier === rightTouchId);
        if (!t) return;
        const deltaX = t.clientX - lastRightX;
        const deltaY = t.clientY - lastRightY;
        lastRightX = t.clientX;
        lastRightY = t.clientY;
        const sens = 0.006;
        if (running && !isOver()) {
            p1.yaw -= deltaX * sens;
            p1.pitch -= deltaY * sens;
            p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
        }
    }, { passive: false });
    rightEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        rightTouchId = null;
    }, { passive: false });
    rightEl.addEventListener('touchcancel', () => { rightTouchId = null; });
}

// 开火按钮
const fireBtn = document.getElementById('btn-fire');
if (fireBtn) {
    fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mouse.leftDown = true;
    }, { passive: false });
    fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        mouse.leftDown = false;
    }, { passive: false });
    fireBtn.addEventListener('touchcancel', () => { mouse.leftDown = false; });
}

// 跳跃按钮
const jumpBtn = document.getElementById('btn-jump');
if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys['Space'] = true;
    }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys['Space'] = false;
    }, { passive: false });
    jumpBtn.addEventListener('touchcancel', () => { keys['Space'] = false; });
}

// 开镜按钮（点击切换）
const aimBtn = document.getElementById('btn-aim');
if (aimBtn) {
    aimBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (running && !isOver()) mouse.aim = !mouse.aim;
    }, { passive: false });
}

// 换弹按钮
const reloadBtn = document.getElementById('btn-reload');
if (reloadBtn) {
    reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (running && !isOver()) startReload(p1, performance.now());
    }, { passive: false });
}

// 全局阻止默认触摸行为（防止滚动/缩放），但覆盖层和按钮允许交互
document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.overlay') || e.target.closest('#mobile-controls')) return;
    e.preventDefault();
}, { passive: false });
document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.overlay') || e.target.closest('#mobile-controls')) return;
    e.preventDefault();
}, { passive: false });

// 阻止右键菜单、滚轮、手势等
document.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); }, false);
document.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
window.addEventListener('gesturestart', e => { e.preventDefault(); e.stopPropagation(); }, false);
window.addEventListener('gesturechange', e => { e.preventDefault(); e.stopPropagation(); }, false);
window.addEventListener('gestureend', e => { e.preventDefault(); e.stopPropagation(); }, false);