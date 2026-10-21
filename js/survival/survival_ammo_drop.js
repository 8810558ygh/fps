// ===== js/survival/survival_ammo_drop.js – 弹药包掉落 =====
//
// 规则：
//   · 靠近后长按 F 蓄力 2 秒
//   · 只补充手里拿的主武器（恢复弹匣和初始备弹）
//   · 奥丁不补充，提示“没有机枪子弹”
//   · 补给后箱子不消失，一直留在原地，直到下一波开始

const AMMO_DROP_PICKUP_RADIUS = 2.5; // 交互半径
const AMMO_FILL_TIME_MS = 2000;      // 补充所需时间 (2秒)

let _ammoDropMesh = null;
let _ammoDrop = null;
let _ammoPromptEl = null;
let _fillBarEl = null;
let _fillBarFill = null;

let _filling = false;
let _fillStartTime = 0;
let _targetWeaponKey = null;

// ============================================================
// 懒创建 mesh
// ============================================================
function _ensureAmmoDropMesh() {
    if (_ammoDropMesh) return _ammoDropMesh;
    if (typeof scene === 'undefined' || !scene) return null;

    const g = new THREE.Group();

    const boxGeo = new THREE.BoxGeometry(0.42, 0.28, 0.32);
    const boxMat = new THREE.MeshLambertMaterial({
        color: 0x4a3520,
        emissive: 0x2a1a08,
        emissiveIntensity: 0.4,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    g.add(box);

    const stripGeo = new THREE.BoxGeometry(0.44, 0.055, 0.34);
    const stripMat = new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 0.05;
    g.add(strip);

    const glowGeo = new THREE.CircleGeometry(0.7, 20);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.14;
    g.add(glow);

    g.traverse(o => {
        if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
        }
    });

    g.visible = false;
    scene.add(g);

    _ammoDropMesh = g;
    return g;
}

// ============================================================
// 生成 / 移除
// ============================================================
function spawnAmmoDrop(x, y, z) {
    const mesh = _ensureAmmoDropMesh();
    if (!mesh) return;

    mesh.position.set(x, y + 0.5, z);
    mesh.rotation.set(0, 0, 0);
    mesh.visible = true;

    _ammoDrop = { x, y, z, active: true };

    console.log('[ammoDrop] 弹药包已掉落 @',
                x.toFixed(1), y.toFixed(1), z.toFixed(1));
}
window.spawnAmmoDrop = spawnAmmoDrop;

function despawnAmmoDrop() {
    if (_ammoDropMesh) _ammoDropMesh.visible = false;
    _ammoDrop = null;
    if (_ammoPromptEl) _ammoPromptEl.style.display = 'none';
    if (_fillBarEl) _fillBarEl.style.display = 'none';
    _filling = false;
}
window.despawnAmmoDrop = despawnAmmoDrop;

function isAmmoDropActive() {
    return !!(_ammoDrop && _ammoDrop.active);
}
window.isAmmoDropActive = isAmmoDropActive;

// ============================================================
// 距离检测 (供 input.js 拦截 F 键)
// ============================================================
function isPlayerNearAmmoDrop() {
    if (!_ammoDrop || !_ammoDrop.active) return false;
    if (typeof p1 === 'undefined' || !p1 || p1.hp <= 0) return false;
    const dx = p1.pos.x - _ammoDrop.x;
    const dz = p1.pos.z - _ammoDrop.z;
    return (dx * dx + dz * dz) < AMMO_DROP_PICKUP_RADIUS * AMMO_DROP_PICKUP_RADIUS;
}
window.isPlayerNearAmmoDrop = isPlayerNearAmmoDrop;

// ============================================================
// 提示 UI
// ============================================================
function _ensureAmmoPrompt() {
    if (_ammoPromptEl) return _ammoPromptEl;
    if (typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'ammoDropPrompt';
    el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:160px',
        'transform:translateX(-50%)', 'z-index:16',
        'padding:8px 22px', 'background:rgba(255,210,74,0.92)',
        'color:#08131f', 'border-radius:8px', 'font-size:15px',
        'font-weight:700', 'letter-spacing:2px', 'pointer-events:none',
        'display:none', 'box-shadow:0 6px 20px rgba(0,0,0,0.6)',
        'font-family:"Microsoft YaHei",Arial,sans-serif',
    ].join(';');
    document.body.appendChild(el);
    _ammoPromptEl = el;
    return el;
}

// ============================================================
// 进度条 UI
// ============================================================
function _ensureFillBar() {
    if (_fillBarEl) return;
    if (typeof document === 'undefined') return;

    const el = document.createElement('div');
    el.id = 'ammoFillBar';
    el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:22%',
        'transform:translateX(-50%)', 'z-index:15',
        'display:none', 'flex-direction:column', 'align-items:center',
        'gap:8px', 'padding:14px 30px',
        'background:rgba(13,19,30,0.9)', 'border:2px solid rgba(255,210,74,0.55)',
        'border-radius:12px', 'box-shadow:0 8px 30px rgba(0,0,0,0.75)',
        'pointer-events:none', 'font-family:"Microsoft YaHei",Arial,sans-serif',
    ].join(';');

    el.innerHTML = `
        <div style="font-size:15px;font-weight:700;color:#ffd24a;letter-spacing:3px;">正在补充弹药</div>
        <div style="width:220px;height:14px;background:rgba(255,210,74,0.12);border:1px solid rgba(255,210,74,0.4);border-radius:7px;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,0.6);">
            <div id="ammoFillBarFill" style="height:100%;width:0%;background:linear-gradient(90deg,#ffd24a,#f0a92e);border-radius:7px;box-shadow:0 0 10px rgba(255,210,74,0.8);transition:width 0.05s linear;"></div>
        </div>
        <div style="font-size:11px;color:#9fb2c8;letter-spacing:2px;">松开 F 取消</div>
    `;
    document.body.appendChild(el);
    _fillBarEl = el;
    _fillBarFill = document.getElementById('ammoFillBarFill');
}

// ============================================================
// 每帧更新
// ============================================================
function updateAmmoDrop(dt, now) {
    if (!_ammoDrop || !_ammoDrop.active) return;
    if (!_ammoDropMesh) return;

    const t = now * 0.001;
    _ammoDropMesh.rotation.y = t * 1.8;
    _ammoDropMesh.position.y = _ammoDrop.y + 0.5 + Math.sin(t * 2.5) * 0.10;

    if (typeof p1 === 'undefined' || !p1) return;

    const near = isPlayerNearAmmoDrop();
    const promptEl = _ensureAmmoPrompt();

    // 1. 如果不在附近或死亡，取消蓄力
    if (!near || p1.hp <= 0 || p1.deadUntil > now) {
        if (promptEl) promptEl.style.display = 'none';
        if (_fillBarEl) _fillBarEl.style.display = 'none';
        _filling = false;
        return;
    }

    // 2. 判断当前武器的状态
    let key = null;
    if (p1.weapon && p1.weapon.mag > 0 && !p1.isMelee && !p1.isSmoke && !p1.isFlash && !p1.isMedkit) {
        key = p1.weaponKey;
    } else {
        key = p1.primaryWeaponKey || 'rifle';
    }

    if (key === 'odin') {
        if (promptEl) {
            promptEl.textContent = '没有机枪子弹';
            promptEl.style.display = 'block';
        }
        if (_fillBarEl) _fillBarEl.style.display = 'none';
        _filling = false;
        return;
    }

    const w = window.getWeaponConfig(key);
    if (!w) return;

    let curAmmo, curRes;
    if (p1.weaponKey === key && !p1.isMelee && !p1.isSmoke && !p1.isFlash && !p1.isMedkit) {
        curAmmo = p1.ammo;
        curRes = p1.reserve;
    } else {
        if (!p1.weaponAmmo) p1.weaponAmmo = {};
        const wa = p1.weaponAmmo[key];
        curAmmo = wa ? wa.ammo : 0;
        curRes = wa ? wa.reserve : 0;
    }

    const isFull = (curAmmo >= w.mag && curRes >= w.startReserve);

    if (isFull) {
        if (promptEl) {
            promptEl.textContent = '当前武器弹药已充足';
            promptEl.style.display = 'block';
        }
        if (_fillBarEl) _fillBarEl.style.display = 'none';
        _filling = false;
        return;
    }

    // 3. 处理长按蓄力逻辑
    _ensureFillBar();

    if (typeof keys !== 'undefined' && keys['KeyF']) {
        if (!_filling) {
            _filling = true;
            _fillStartTime = now;
            _targetWeaponKey = key;
        }

        // 如果蓄力中途切枪了，或者切成了奥丁，取消蓄力
        if (key !== _targetWeaponKey) {
            _filling = false;
            _fillStartTime = 0;
            if (_fillBarEl) _fillBarEl.style.display = 'none';
            return;
        }

        const elapsed = now - _fillStartTime;
        const progress = Math.min(1, elapsed / AMMO_FILL_TIME_MS);

        if (_fillBarEl) _fillBarEl.style.display = 'flex';
        if (_fillBarFill) _fillBarFill.style.width = (progress * 100) + '%';

        if (progress >= 1) {
            // ★ 蓄力完成，补充弹药
            if (!p1.weaponAmmo) p1.weaponAmmo = {};
            p1.weaponAmmo[key] = {
                ammo: w.mag,
                reserve: w.startReserve
            };

            if (p1.weaponKey === key && !p1.isMelee && !p1.isSmoke && !p1.isFlash && !p1.isMedkit) {
                p1.ammo = w.mag;
                p1.reserve = w.startReserve;
                p1.reloadEnd = 0;
            }

            if (typeof sPickup === 'function') sPickup(1);
            if (typeof feed === 'function') feed(p1, `💛 补充 <b style="color:#ffd24a">${w.name}</b> 弹药`);

            // 重置蓄力状态，允许继续按住F补下一把枪
            _filling = false;
            _fillStartTime = 0;
            if (_fillBarEl) _fillBarEl.style.display = 'none';
        }
    } else {
        // 松开 F，重置进度
        _filling = false;
        _fillStartTime = 0;
        if (_fillBarEl) _fillBarEl.style.display = 'none';
        if (promptEl) {
            promptEl.textContent = '按住 F 补充主武器弹药';
            promptEl.style.display = 'block';
        }
    }
}
window.updateAmmoDrop = updateAmmoDrop;