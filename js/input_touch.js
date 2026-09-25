// ===== js/input_touch.js – 触摸控制（移动端） =====

let leftTouchId = null;
const leftEl = document.getElementById('touch-left');
if (leftEl) {
    leftEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') {
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
            return;
        }
        leftTouchId = e.changedTouches[0].identifier;
    }, { passive: false });
    leftEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        const t = Array.from(e.changedTouches).find(t => t.identifier === leftTouchId);
        if (!t) return;
        const rect = e.target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = (t.clientX - cx) / (rect.width / 2);
        let dy = (t.clientY - cy) / (rect.height / 2);
        if (Math.abs(dx) < 0.15) dx = 0;
        if (Math.abs(dy) < 0.15) dy = 0;
        keys['KeyW'] = dy < -0.1; keys['KeyS'] = dy > 0.1;
        keys['KeyA'] = dx < -0.1; keys['KeyD'] = dx > 0.1;
    }, { passive: false });
    leftEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        keys['KeyW'] = false; keys['KeyS'] = false;
        keys['KeyA'] = false; keys['KeyD'] = false;
        leftTouchId = null;
    }, { passive: false });
    leftEl.addEventListener('touchcancel', () => {
        keys['KeyW'] = false; keys['KeyS'] = false;
        keys['KeyA'] = false; keys['KeyD'] = false;
        leftTouchId = null;
    });
}

let rightTouchId = null;
let lastRightX = 0, lastRightY = 0;
const rightEl = document.getElementById('touch-right');
if (rightEl) {
    rightEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') {
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
            return;
        }
        const t = e.changedTouches[0];
        rightTouchId = t.identifier;
        lastRightX = t.clientX; lastRightY = t.clientY;
    }, { passive: false });
    rightEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        const t = Array.from(e.changedTouches).find(t => t.identifier === rightTouchId);
        if (!t) return;
        const dx = t.clientX - lastRightX;
        const dy = t.clientY - lastRightY;
        lastRightX = t.clientX; lastRightY = t.clientY;
        if (running && !isOver()) {
            p1.yaw -= dx * 0.006;
            p1.pitch -= dy * 0.006;
            p1.pitch = Math.max(-1.35, Math.min(1.35, p1.pitch));
        }
    }, { passive: false });
    rightEl.addEventListener('touchend', (e) => { e.preventDefault(); rightTouchId = null; }, { passive: false });
    rightEl.addEventListener('touchcancel', () => { rightTouchId = null; });
}

const fireBtn = document.getElementById('btn-fire');
if (fireBtn) {
    fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
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

const jumpBtn = document.getElementById('btn-jump');
if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        keys['Space'] = true;
    }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys['Space'] = false; }, { passive: false });
    jumpBtn.addEventListener('touchcancel', () => { keys['Space'] = false; });
}

const aimBtn = document.getElementById('btn-aim');
if (aimBtn) {
    aimBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        if (running && !isOver() && gameState === 'combat') {
            if (typeof p1 !== 'undefined' && p1 && p1.isMelee) {
                tryMelee(p1, performance.now(), true);
                if (_isOnlineClient()) { NET.pendingMelee = true; NET.pendingMeleeHeavy = true; }
            } else if (typeof p1 !== 'undefined' && p1 && (p1.isSmoke || p1.isFlash)) { /* 无 */ }
            else toggleAim();
        }
    }, { passive: false });
}

const reloadBtn = document.getElementById('btn-reload');
if (reloadBtn) {
    reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
        if (running && !isOver() && gameState === 'combat') {
            startReload(p1, performance.now());
            if (_isOnlineClient()) NET.pendingReload = true;
        }
    }, { passive: false });
}

const weaponBtn = document.getElementById('btn-weapon');
if (weaponBtn) {
    weaponBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
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

const weaponCloseBtn = document.getElementById('weaponCloseBtn');
if (weaponCloseBtn) {
    weaponCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById('weaponPanel');
        if (panel) panel.style.display = 'none';
    });
}

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