// ===== js/input.js – 键盘/鼠标输入（服务器权威版） =====
const keys = {};
const mouse = { aim: false, leftDown: false };

function _isOnlineClient() {
    return typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.role === 'player' && !NET.isHost;
}

function _requestFuseStart(type) {
    if (_isOnlineClient()) {
        if (typeof NET !== 'undefined') NET.pendingFuseStart = type;
    } else {
        if (typeof startThrowFuse === 'function' && typeof p1 !== 'undefined' && p1) {
            startThrowFuse(p1, type);
        }
    }
}
function _requestFuseRelease() {
    if (_isOnlineClient()) {
        if (typeof NET !== 'undefined') NET.pendingFuseRelease = true;
    } else {
        if (typeof p1 !== 'undefined' && p1
            && p1.throwFuseActive && p1.throwFuseInHand
            && typeof releaseThrowFuse === 'function') {
            releaseThrowFuse(p1);
        }
    }
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
        if (e.code === 'Digit2' || e.code === 'Numpad2') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                if (!p1.isMelee) {
                    setWeapon(p1, 'knife');
                    if (isOC) NET.pendingWeaponSwitch = 'knife';
                }
            }
            return;
        }
        if (e.code === 'Digit3' || e.code === 'Numpad3') {
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                const key = p1.isSmoke ? (p1.primaryWeaponKey || 'rifle') : 'smoke';
                setWeapon(p1, key);
                if (isOC) NET.pendingWeaponSwitch = key;
            }
            return;
        }
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
                _requestFuseStart('smoke');
            }
            e.preventDefault(); return;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.isFlash) {
            if (running && !isOver() && gameState === 'combat') {
                _requestFuseStart('flash');
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
    if (e.button === 0) {
        mouse.leftDown = false;
        _requestFuseRelease();
    }
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