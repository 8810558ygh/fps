// ===== js/input.js – 键盘/鼠标输入（服务器权威版） =====
const keys = {};
const mouse = { aim: false, leftDown: false };

// ============================================================
// ★ 安全访问 NET —— 避免加载顺序变化时 NET 未定义直接报错
//
//   原来多处直接调用 NET.isSpectator()，依赖 online_net.js
//   在 input.js 之前加载。一旦加载顺序被调换 / online_net.js
//   加载失败 / 未来改成可选模块，都会炸：
//       "Cannot read properties of undefined (reading 'isSpectator')"
//
//   统一走 _isSpectatorSafe()，内部先判 NET 是否存在。
// ============================================================
function _isSpectatorSafe() {
    return typeof NET !== 'undefined'
        && typeof NET.isSpectator === 'function'
        && NET.isSpectator();
}

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

// ============================================================
// ★ 修复：客户端释放引信时，本地计算 origin/vel/fuseMs 并上报
//
// 之前的问题：客户端只上报 fuseRelease = true，房主用 p2.cam 推算 origin，
// 而 p2.cam 是房主端根据客户端上报的位置/朝向插值出来的（滞后 + 有误差），
// 于是房主 spawn 的烟/闪位置 ≠ 客户端本地轨迹线终点 → 两边看到的不一样。
//
// 现在：客户端在松手瞬间用 p1.cam 计算 origin/vel/fuseMs，一起上报，
// 房主直接用它 spawn 并广播，两端 origin 完全一致。
// ============================================================
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
                type:   type,
                px:     camPos.x, py: camPos.y, pz: camPos.z,
                vx:     vel.x,    vy: vel.y,    vz: vel.z,
                fuseMs: remainMs,
            };
        } else {
            // 兜底：拿不到本地状态时，退回旧行为
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

window.addEventListener('keydown', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;

    // ★ 原：if (NET.isSpectator()) { ... }
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
            if (running && !isOver() && gameState === 'combat') {
                if (typeof p1 !== 'undefined' && p1
                    && typeof window.tryMountZipline === 'function') {
                    const mounted = window.tryMountZipline(p1);
                    if (mounted && isOC && p1.zipline) {
                        NET.pendingZiplineMount = {
                            lineIdx: p1.zipline.lineIdx,
                            t:       p1.zipline.t,
                            dir:     p1.zipline.dir,
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
                    if (isOC) {
                        NET.pendingZiplineDismount = true;
                    }
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

    // ★ 原：if (NET.isSpectator()) { ... }
    if (_isSpectatorSafe()) {
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

    // ★ 原：if (NET.isSpectator()) { e.preventDefault(); ... return; }
    if (_isSpectatorSafe()) { e.preventDefault(); e.stopPropagation(); return; }

    if (e.button === 0) {
        mouse.leftDown = false;
        _requestFuseRelease();
    }
    else if (e.button === 2) { e.preventDefault(); e.stopPropagation(); }
});

document.addEventListener('wheel', e => {
    if (typeof isChatOpen === 'function' && isChatOpen()) return;

    // ★ 原：if (NET.isSpectator()) return;
    if (_isSpectatorSafe()) return;

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