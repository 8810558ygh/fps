// ===== js/input.js – 键盘/鼠标/触摸输入（服务器权威版） =====
const keys = {};
const mouse = { aim: false, leftDown: false };

function _isOnlineClient() {
    return typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.role === 'player' && !NET.isHost;
}

window.addEventListener('keydown', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;

    if (typeof NET !== 'undefined' && NET.role === 'spectator') {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            if (running && !isOver() && typeof openChat === 'function') {
                e.preventDefault(); openChat(); return;
            }
        }
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        return;
    }

    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (running && !isOver() && typeof openChat === 'function') {
            e.preventDefault(); openChat(); return;
        }
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W' || e.key === 't' || e.key === 'T')) {
        e.preventDefault(); e.stopPropagation();
    }
    if ((e.ctrlKey || e.metaKey) && ['f','F','s','S','p','P'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
    }

    if (!e.repeat) {
        const isOC = _isOnlineClient();

        // 1：主武器
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                if (p1.isMelee || p1.isSmoke || p1.isFlash) {
                    const key = p1.primaryWeaponKey || 'rifle';
                    setWeapon(p1, key);
                    if (isOC) NET.pendingWeaponSwitch = key;
                }
            }
            return;
        }
        // 2：近战刀
        if (e.code === 'Digit2' || e.code === 'Numpad2') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                if (!p1.isMelee) {
                    setWeapon(p1, 'knife');
                    if (isOC) NET.pendingWeaponSwitch = 'knife';
                }
            }
            return;
        }
        // 3：烟雾弹
        if (e.code === 'Digit3' || e.code === 'Numpad3') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                const key = p1.isSmoke ? (p1.primaryWeaponKey || 'rifle') : 'smoke';
                setWeapon(p1, key);
                if (isOC) NET.pendingWeaponSwitch = key;
            }
            return;
        }
        // 4：闪光弹
        if (e.code === 'Digit4' || e.code === 'Numpad4') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                const key = p1.isFlash ? (p1.primaryWeaponKey || 'rifle') : 'flash';
                setWeapon(p1, key);
                if (isOC) NET.pendingWeaponSwitch = key;
            }
            return;
        }

        if (e.code === 'KeyR') {
            startReload(p1, performance.now());
            if (_isOnlineClient()) NET.pendingReload = true;
        }

        if (e.code === 'KeyB') {
            if (running && !isOver() && gameState === 'prep') {
                const panel = document.getElementById('weaponPanel');
                if (panel) {
                    const isOpen = panel.style.display === 'flex';
                    if (isOpen) {
                        panel.style.display = 'none';
                        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
                            if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
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
window.addEventListener('keyup', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    keys[e.code] = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- 鼠标 ----------
document.addEventListener('mousedown', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;

    if (typeof NET !== 'undefined' && NET.role === 'spectator') {
        if (e.button === 0) {
            e.preventDefault(); e.stopPropagation();
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
        } else { e.preventDefault(); e.stopPropagation(); }
        return;
    }

    if (e.button === 0) {
        if (typeof p1 !== 'undefined' && p1 && p1.isSmoke) {
            if (running && !isOver() && gameState === 'combat') {
                throwSmoke(p1, performance.now());
                if (_isOnlineClient()) NET.pendingThrowSmoke = true;
            }
            e.preventDefault(); return;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.isFlash) {
            if (running && !isOver() && gameState === 'combat') {
                throwFlash(p1, performance.now());
                if (_isOnlineClient()) NET.pendingThrowFlash = true;
            }
            e.preventDefault(); return;
        }
        mouse.leftDown = true;
    } else if (e.button === 2) {
        e.preventDefault(); e.stopPropagation();
        if (running && !isOver() && gameState === 'combat') {
            if (typeof p1 !== 'undefined' && p1 && p1.isMelee) {
                tryMelee(p1, performance.now(), true);
                if (_isOnlineClient()) {
                    NET.pendingMelee = true;
                    NET.pendingMeleeHeavy = true;
                }
            } else if (typeof p1 !== 'undefined' && p1 && (p1.isSmoke || p1.isFlash)) { /* 无右键 */ }
            else toggleAim();
        }
    } else { e.preventDefault(); e.stopPropagation(); }
});

document.addEventListener('mouseup', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (typeof NET !== 'undefined' && NET.role === 'spectator') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.button === 0) mouse.leftDown = false;
    else if (e.button === 2) { e.preventDefault(); e.stopPropagation(); }
});

document.addEventListener('wheel', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
    e.preventDefault(); e.stopPropagation();
    if (!running || isOver()) return;
    if (typeof p1 === 'undefined' || !p1) return;
    if (gameState === 'prep') return;

    let newKey;
    if (p1.isMelee)       newKey = 'smoke';
    else if (p1.isSmoke)  newKey = 'flash';
    else if (p1.isFlash)  newKey = p1.primaryWeaponKey || 'rifle';
    else                  newKey = 'knife';
    setWeapon(p1, newKey);
    if (_isOnlineClient()) NET.pendingWeaponSwitch = newKey;
}, { passive: false });

// ---------- 触摸 ----------
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
                throwSmoke(p1, performance.now());
                if (_isOnlineClient()) NET.pendingThrowSmoke = true;
            }
            return;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.isFlash) {
            if (running && !isOver() && gameState === 'combat') {
                throwFlash(p1, performance.now());
                if (_isOnlineClient()) NET.pendingThrowFlash = true;
            }
            return;
        }
        mouse.leftDown = true;
    }, { passive: false });
    fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); mouse.leftDown = false; }, { passive: false });
    fireBtn.addEventListener('touchcancel', () => { mouse.leftDown = false; });
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