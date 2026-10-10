// ===== js/input_touch.js – 触摸控制（移动端 · 跟手摇杆版） =====

// ============================================================
// ★ 左侧浮动摇杆（跟手）
// ============================================================
let leftTouchId = null;
let leftBaseX = 0, leftBaseY = 0;   // 触摸起始点（摇杆中心）
const LEFT_RADIUS = 65;             // 摇杆最大偏移半径（跟底座半径一致）
const LEFT_DEAD_ZONE = 0.15;        // 死区比例

const leftZoneEl = document.getElementById('touch-left-zone');
const leftBaseEl = document.getElementById('touch-left-base');
const leftKnobEl = document.getElementById('touch-left-knob');
const leftHintEl = document.getElementById('touch-left-hint');

function _resetMoveKeys() {
    const K = window.SETTINGS_keys || {
        forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD'
    };
    keys[K.forward]  = false;
    keys[K.backward] = false;
    keys[K.left]     = false;
    keys[K.right]    = false;
}

if (leftZoneEl) {
    leftZoneEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) {
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
            return;
        }
        if (leftTouchId !== null) return;   // 已经有一根手指控制

        const t = e.changedTouches[0];
        leftTouchId = t.identifier;
        leftBaseX = t.clientX;
        leftBaseY = t.clientY;

        // 摇杆底座定位到触摸点
        if (leftBaseEl) {
            leftBaseEl.style.left = leftBaseX + 'px';
            leftBaseEl.style.top  = leftBaseY + 'px';
            leftBaseEl.style.display = 'block';
        }
        // 摇杆头归中
        if (leftKnobEl) {
            leftKnobEl.style.transition = 'none';
            leftKnobEl.style.transform  = 'translate(0, 0)';
        }
        // 隐藏静态提示圈
        if (leftHintEl) leftHintEl.style.opacity = '0';

        _resetMoveKeys();
    }, { passive: false });

    leftZoneEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;

        const t = Array.from(e.changedTouches).find(t => t.identifier === leftTouchId);
        if (!t) return;

        let dx = t.clientX - leftBaseX;
        let dy = t.clientY - leftBaseY;

        // 超出半径 → 钳制到边缘
        const dist = Math.hypot(dx, dy);
        if (dist > LEFT_RADIUS) {
            const k = LEFT_RADIUS / dist;
            dx *= k;
            dy *= k;
        }

        // 摇杆头跟随
        if (leftKnobEl) {
            leftKnobEl.style.transition = 'transform 0.04s linear';
            leftKnobEl.style.transform  = `translate(${dx}px, ${dy}px)`;
        }

        // 归一化到 [-1, 1]
        const nx = dx / LEFT_RADIUS;
        const ny = dy / LEFT_RADIUS;

        const K = window.SETTINGS_keys || {
            forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD'
        };
        keys[K.forward]  = ny < -LEFT_DEAD_ZONE;
        keys[K.backward] = ny >  LEFT_DEAD_ZONE;
        keys[K.left]     = nx < -LEFT_DEAD_ZONE;
        keys[K.right]    = nx >  LEFT_DEAD_ZONE;
    }, { passive: false });

    function _endLeftTouch(e) {
        if (NET.isSpectator()) return;
        const t = Array.from(e.changedTouches).find(t => t.identifier === leftTouchId);
        if (!t) return;

        leftTouchId = null;

        if (leftBaseEl) leftBaseEl.style.display = 'none';
        if (leftHintEl) leftHintEl.style.opacity = '';
        if (leftKnobEl) leftKnobEl.style.transform = 'translate(0, 0)';

        _resetMoveKeys();
    }

    leftZoneEl.addEventListener('touchend',    _endLeftTouch, { passive: false });
    leftZoneEl.addEventListener('touchcancel', () => {
        leftTouchId = null;
        if (leftBaseEl) leftBaseEl.style.display = 'none';
        if (leftHintEl) leftHintEl.style.opacity = '';
        if (leftKnobEl) leftKnobEl.style.transform = 'translate(0, 0)';
        _resetMoveKeys();
    });
}

// 兼容旧代码里对 leftEl 的引用
const leftEl = leftZoneEl;

// ============================================================
// ★ 右侧视角区域（不变）
// ============================================================
let rightTouchId = null;
let lastRightX = 0, lastRightY = 0;
const rightEl = document.getElementById('touch-right');
if (rightEl) {
    rightEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) {
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
            return;
        }
        const t = e.changedTouches[0];
        rightTouchId = t.identifier;
        lastRightX = t.clientX; lastRightY = t.clientY;
    }, { passive: false });
    rightEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;
        const t = Array.from(e.changedTouches).find(t => t.identifier === rightTouchId);
        if (!t) return;
        const dx = t.clientX - lastRightX;
        const dy = t.clientY - lastRightY;
        lastRightX = t.clientX; lastRightY = t.clientY;

        if (running && !isOver()) {
            const S  = (window.SETTINGS && window.SETTINGS.sensitivity) ? window.SETTINGS.sensitivity : null;
            const RT = window.SETTINGS_RT || {};

            const baseSens = (RT.touchSens !== undefined) ? RT.touchSens : 0.006;
            const vertMul  = (S && S.vertMul)  ? S.vertMul  : 1.0;
            const invertY  = !!(S && S.invertY);

            const sens = baseSens * (p1.cam.fov / BASE_FOV);
            p1.yaw -= dx * sens;

            const ySign = invertY ? 1 : -1;
            p1.pitch += ySign * dy * sens * vertMul;
            p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
        }
    }, { passive: false });
    rightEl.addEventListener('touchend', (e) => { e.preventDefault(); rightTouchId = null; }, { passive: false });
    rightEl.addEventListener('touchcancel', () => { rightTouchId = null; });
}

// ============================================================
// ★ 开火按钮
// ============================================================
const fireBtn = document.getElementById('btn-fire');
if (fireBtn) {
    fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;
        if (typeof p1 !== 'undefined' && p1 && p1.isSmoke) {
            if (running && !isOver() && gameState === 'combat') {
                _requestFuseStart('smoke');
            }
            return;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.isFlash) {
            if (running && !isOver() && gameState === 'combat') {
                _requestFuseStart('flash');
            }
            return;
        }
        mouse.leftDown = true;
    }, { passive: false });
    fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        mouse.leftDown = false;
        _requestFuseRelease();
    }, { passive: false });
    fireBtn.addEventListener('touchcancel', () => {
        mouse.leftDown = false;
        if (typeof p1 !== 'undefined' && p1 && p1.throwFuseActive && typeof cancelThrowFuse === 'function') {
            cancelThrowFuse(p1);
        }
    });
}

// ============================================================
// ★ 跳跃按钮
// ============================================================
const jumpBtn = document.getElementById('btn-jump');
if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;
        const K = window.SETTINGS_keys || { jump: 'Space' };
        keys[K.jump] = true;
    }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        const K = window.SETTINGS_keys || { jump: 'Space' };
        keys[K.jump] = false;
    }, { passive: false });
    jumpBtn.addEventListener('touchcancel', () => {
        const K = window.SETTINGS_keys || { jump: 'Space' };
        keys[K.jump] = false;
    });
}

// ============================================================
// ★ 开镜按钮
// ============================================================
const aimBtn = document.getElementById('btn-aim');
if (aimBtn) {
    aimBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;
        if (running && !isOver() && gameState === 'combat') {
            if (typeof p1 !== 'undefined' && p1 && p1.isMelee) {
                tryMelee(p1, performance.now(), true);
                if (_isOnlineClient()) { NET.pendingMelee = true; NET.pendingMeleeHeavy = true; }
            } else if (typeof p1 !== 'undefined' && p1 && (p1.isSmoke || p1.isFlash)) { /* 无 */ }
            else toggleAim();
        }
    }, { passive: false });
}

// ============================================================
// ★ 换弹按钮
// ============================================================
const reloadBtn = document.getElementById('btn-reload');
if (reloadBtn) {
    reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (NET.isSpectator()) return;
        if (running && !isOver() && gameState === 'combat') {
            startReload(p1, performance.now());
            if (_isOnlineClient()) NET.pendingReload = true;
        }
    }, { passive: false });
}

// ============================================================
// ★ 换枪按钮
// ============================================================
const weaponBtn = document.getElementById('btn-weapon');
if (weaponBtn) {
    weaponBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (NET.isSpectator()) return;
        if (!(running && !isOver())) return;
        if (typeof p1 === 'undefined' || !p1) return;

        if (gameState === 'prep') {
            const panel = document.getElementById('weaponPanel');
            if (!panel) return;
            panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
            return;
        }
        if (gameState === 'combat') {
            let newKey;
            if (p1.isMelee)      newKey = 'smoke';
            else if (p1.isSmoke) newKey = 'flash';
            else if (p1.isFlash) newKey = p1.primaryWeaponKey || 'rifle';
            else                 newKey = 'knife';
            setWeapon(p1, newKey);
            if (_isOnlineClient()) NET.pendingWeaponSwitch = newKey;
        }
    }, { passive: false });
}

// ============================================================
// ★ 武器面板关闭按钮
// ============================================================
const weaponCloseBtn = document.getElementById('weaponCloseBtn');
if (weaponCloseBtn) {
    weaponCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById('weaponPanel');
        if (panel) panel.style.display = 'none';
    });
}

// ============================================================
// ★ 全局 touch 阻止默认（防止页面滚动 / 缩放）
// ============================================================
document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.overlay') || e.target.closest('#mobile-controls') || e.target.closest('#chatBox')) return;
    e.preventDefault();
}, { passive: false });
document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.overlay') || e.target.closest('#mobile-controls') || e.target.closest('#chatBox')) return;
    e.preventDefault();
}, { passive: false });

document.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); }, false);
window.addEventListener('gesturestart', e => { e.preventDefault(); e.stopPropagation(); }, false);
window.addEventListener('gesturechange', e => { e.preventDefault(); e.stopPropagation(); }, false);
window.addEventListener('gestureend', e => { e.preventDefault(); e.stopPropagation(); }, false);