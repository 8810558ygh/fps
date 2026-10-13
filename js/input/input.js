// ===== js/input.js – 键盘/鼠标输入 =====
const keys = {};
const mouse = { aim: false, leftDown: false };

function _isSpectatorSafe() {
    return typeof NET !== 'undefined'
        && typeof NET.isSpectator === 'function'
        && NET.isSpectator();
}

function _isOnlineClient() {
    return typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.role === 'player' && !NET.isHost;
}

// ★ 生存模式判断（用于拦截烟/闪相关操作）
function _isSurvivalMode() {
    return typeof gameMode !== 'undefined' && gameMode === 'survival';
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
        if (typeof p1 !== 'undefined' && p1
            && p1.throwFuseActive && p1.throwFuseInHand
            && p1.throwFuseType
            && typeof NET !== 'undefined') {

            const type   = p1.throwFuseType;
            const camPos = p1.cam.getWorldPosition(new THREE.Vector3()).clone();
            const dir    = new THREE.Vector3(0, 0, -1).applyQuaternion(p1.cam.quaternion);
            const cfg    = (type === 'smoke') ? SMOKE : FLASH;
            const vel    = dir.clone().multiplyScalar(cfg.throwSpeed);
            vel.y += cfg.throwUpBias * cfg.throwSpeed;

            const remainMs = Math.max(0, p1.throwFuseEnd - performance.now());

            NET.pendingFuseRelease = {
                type: type,
                px: camPos.x, py: camPos.y, pz: camPos.z,
                vx: vel.x, vy: vel.y, vz: vel.z,
                fuseMs: remainMs,
            };
        } else {
            if (typeof NET !== 'undefined') NET.pendingFuseRelease = true;
        }
    } else {
        if (typeof p1 !== 'undefined' && p1
            && p1.throwFuseActive && p1.throwFuseInHand
            && typeof releaseThrowFuse === 'function') {
            releaseThrowFuse(p1);
        }
    }
}

// ============================================================
// ★ 判断当前是否"允许打开武器选择面板"（非生存模式）
// ============================================================
function _canOpenWeaponPanel() {
    if (!running || isOver()) return false;
    if (gameState === 'prep') return true;
    return false;
}

window.addEventListener('keydown', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;

    // ============================================================
    // ★ 商店打开时：屏蔽所有游戏输入，只允许 B / Esc 关闭
    // ============================================================
    if (typeof window.Shop !== 'undefined'
        && typeof window.Shop.isOpen === 'function'
        && window.Shop.isOpen()) {
        if (e.code === 'Escape' || e.code === 'KeyB') {
            e.preventDefault();
            window.Shop.close();
        }
        return;
    }

    if (_isSpectatorSafe()) {
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
        const isSV = _isSurvivalMode();

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

        // ★ 生存模式没有烟/闪，直接拦截
        if (e.code === 'Digit3' || e.code === 'Numpad3') {
            if (isSV) return;
            if (running && !isOver() && typeof p1 !== 'undefined' && p1) {
                const key = p1.isSmoke ? (p1.primaryWeaponKey || 'rifle') : 'smoke';
                setWeapon(p1, key);
                if (isOC) NET.pendingWeaponSwitch = key;
            }
            return;
        }
        if (e.code === 'Digit4' || e.code === 'Numpad4') {
            if (isSV) return;
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

        // ============================================================
        // ★ B 键
        //   · 生存模式 → 商店（随时）
        //   · 其他模式 → prep 阶段的武器面板
        // ============================================================
        if (e.code === 'KeyB') {
            if (isSV
                && typeof window.Shop !== 'undefined'
                && typeof window.Shop.canOpen === 'function'
                && window.Shop.canOpen()) {
                window.Shop.toggle();
                return;
            }
            if (_canOpenWeaponPanel()) {
                const panel = document.getElementById('weaponPanel');
                if (panel) {
                    const isOpen = panel.style.display === 'flex';
                    if (isOpen) {
                        panel.style.display = 'none';
                        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
                            if (document.pointerLockElement !== renderer.domElement) {
                                renderer.domElement.requestPointerLock();
                            }
                        }
                    } else {
                        if (typeof window.updateWeaponPanelLocks === 'function') {
                            window.updateWeaponPanelLocks();
                        }
                        panel.style.display = 'flex';
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                }
            }
        }

        if (e.code === 'KeyT') {
            if (typeof gameMode !== 'undefined' && gameMode === 'ai'
                && running && !isOver()) {
                if (typeof window.toggleAiEnabled === 'function') {
                    window.toggleAiEnabled();
                }
            }
            return;
        }

        if (e.code === 'KeyF') {
            if (typeof tryEnterPortal === 'function' && tryEnterPortal()) {
                return;
            }

            if (running && !isOver() && gameState === 'combat') {
                if (typeof p1 !== 'undefined' && p1
                    && typeof window.tryMountZipline === 'function') {
                    const mounted = window.tryMountZipline(p1);
                    if (mounted && isOC && p1.zipline) {
                        NET.pendingZiplineMount = {
                            lineIdx: p1.zipline.lineIdx,
                            t: p1.zipline.t,
                            dir: p1.zipline.dir,
                        };
                    }
                }
            }
            return;
        }

        if (e.code === 'Space') {
            if (typeof p1 !== 'undefined' && p1
                && p1.zipline && p1.zipline.active) {
                if (typeof window.dismountZipline === 'function') {
                    window.dismountZipline(p1);
                    if (isOC) NET.pendingZiplineDismount = true;
                }
                e.preventDefault();
                return;
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

    // ★ 商店打开时屏蔽鼠标
    if (typeof window.Shop !== 'undefined'
        && typeof window.Shop.isOpen === 'function'
        && window.Shop.isOpen()) return;

    if (_isSpectatorSafe()) {
        if (e.button === 0) {
            e.preventDefault(); e.stopPropagation();
            if (typeof NET_spectatorToggle === 'function') NET_spectatorToggle();
        } else { e.preventDefault(); e.stopPropagation(); }
        return;
    }

    if (e.button === 0) {
        if (typeof p1 !== 'undefined' && p1 && p1.isSmoke) {
            if (running && !isOver() && gameState === 'combat') _requestFuseStart('smoke');
            e.preventDefault(); return;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.isFlash) {
            if (running && !isOver() && gameState === 'combat') _requestFuseStart('flash');
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
            } else if (typeof p1 !== 'undefined' && p1 && (p1.isSmoke || p1.isFlash)) { /* 无 */ }
            else toggleAim();
        }
    } else { e.preventDefault(); e.stopPropagation(); }
});

document.addEventListener('mouseup', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (_isSpectatorSafe()) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.button === 0) {
        mouse.leftDown = false;
        _requestFuseRelease();
    } else if (e.button === 2) { e.preventDefault(); e.stopPropagation(); }
});

document.addEventListener('wheel', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    if (_isSpectatorSafe()) return;

    // ★ 商店打开时屏蔽滚轮
    if (typeof window.Shop !== 'undefined'
        && typeof window.Shop.isOpen === 'function'
        && window.Shop.isOpen()) return;

    e.preventDefault(); e.stopPropagation();
    if (!running || isOver()) return;
    if (typeof p1 === 'undefined' || !p1) return;
    if (gameState === 'prep') return;

    // ============================================================
    // ★ 生存模式：只在【主武器 ⇄ 刀】之间切换
    //   不经过烟/闪
    // ============================================================
    if (_isSurvivalMode()) {
        let newKey;
        if (p1.isMelee) newKey = p1.primaryWeaponKey || 'rifle';
        else            newKey = 'knife';
        setWeapon(p1, newKey);
        return;
    }

    let newKey;
    if (p1.isMelee)       newKey = 'smoke';
    else if (p1.isSmoke)  newKey = 'flash';
    else if (p1.isFlash)  newKey = p1.primaryWeaponKey || 'rifle';
    else                  newKey = 'knife';
    setWeapon(p1, newKey);
    if (_isOnlineClient()) NET.pendingWeaponSwitch = newKey;
}, { passive: false });