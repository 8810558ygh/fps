// ===== js/survival/survival_ammo_drop.js – 弹药包掉落 =====
//
// 规则：
//   · 偶数波清空时，最后一个死亡的僵尸位置掉落弹药箱
//   · 玩家靠近（默认 2m）自动拾取
//   · 拾取效果：为【手里拿着的那把枪】补一个弹匣的备弹
//       拿枪时：补当前枪
//       拿刀/烟/闪时：补主武器
//   · 不直接进弹匣，玩家需要手动按 R 换弹
//   · 进入下一波（准备阶段结束）时自动消失
//
// ★ 弹药同步：
//   · 拾取前：若手里拿着这把枪，先从 p.reserve 同步到 weaponAmmo
//   · 拾取时：同时更新 p.reserve 和 p.weaponAmmo[key].reserve
//   · 保证切枪 / 死亡 / 切地图都不丢

const AMMO_DROP_PICKUP_RADIUS = 2.0;

let _ammoDropMesh = null;
let _ammoDrop = null;

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
// 生成弹药包
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

// ============================================================
// 移除弹药包
// ============================================================
function despawnAmmoDrop() {
    if (_ammoDropMesh) _ammoDropMesh.visible = false;
    _ammoDrop = null;
}
window.despawnAmmoDrop = despawnAmmoDrop;

function isAmmoDropActive() {
    return !!(_ammoDrop && _ammoDrop.active);
}
window.isAmmoDropActive = isAmmoDropActive;

// ============================================================
// 每帧更新：浮动动画 + 拾取检测
// ============================================================
function updateAmmoDrop(dt, now) {
    if (!_ammoDrop || !_ammoDrop.active) return;
    if (!_ammoDropMesh) return;

    const t = now * 0.001;
    _ammoDropMesh.rotation.y = t * 1.8;
    _ammoDropMesh.position.y = _ammoDrop.y + 0.5 + Math.sin(t * 2.5) * 0.10;

    if (typeof p1 === 'undefined' || !p1) return;
    if (p1.hp <= 0) return;
    if (p1.deadUntil > now) return;

    const dx = p1.pos.x - _ammoDrop.x;
    const dz = p1.pos.z - _ammoDrop.z;
    const d2 = dx * dx + dz * dz;

    if (d2 < AMMO_DROP_PICKUP_RADIUS * AMMO_DROP_PICKUP_RADIUS) {
        _pickupAmmoDrop(p1);
    }
}
window.updateAmmoDrop = updateAmmoDrop;

// ============================================================
// ★ 拾取逻辑
//
//   · 手里拿着枪 → 补当前枪
//   · 手里拿着刀/烟/闪 → 补主武器
//   · 只加【一个弹匣】，不超过 reserveMax
//
//   ★ 关键修复：
//     拾取前，如果手里拿着目标枪，先把 p.reserve 同步到 weaponAmmo，
//     否则 weaponAmmo 里可能是"很久以前"的旧值（例如 p.reserve 已经
//     打空到 0，但 weaponAmmo 里还留着初始值 50），
//     会导致 0 + 25 → 错误地变成 75（看起来像"直接回满"）
// ============================================================
function _pickupAmmoDrop(p) {
    if (!p) return;

    let key = null;
    let cfg = null;

    // ---- 决定目标武器 ----
    if (p.weapon && p.weapon.mag > 0
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        key = p.weaponKey;
        cfg = p.weapon;
    } else {
        key = p.primaryWeaponKey || 'rifle';
        cfg = (typeof WEAPONS !== 'undefined') ? WEAPONS[key] : null;
    }

    if (!key || !cfg || cfg.mag <= 0) {
        despawnAmmoDrop();
        return;
    }

    const magAmount = cfg.mag;
    const reserveMax = cfg.reserveMax || (cfg.mag * 3);

    // ---- 确保 weaponAmmo 存在 ----
    if (!p.weaponAmmo) p.weaponAmmo = {};
    if (!p.weaponAmmo[key]) {
        p.weaponAmmo[key] = { ammo: cfg.mag, reserve: cfg.startReserve };
    }

    // ---- ★ 修复：手里拿着目标枪 → p.reserve 是权威值，先同步 ----
    const isHoldingThis = (p.weaponKey === key)
        && p.weapon && p.weapon.mag !== undefined
        && !p.isMelee && !p.isSmoke && !p.isFlash;
    if (isHoldingThis) {
        p.weaponAmmo[key].reserve = p.reserve;
        p.weaponAmmo[key].ammo    = p.ammo;
    }

    // ---- 加备弹（只加一个弹匣，不超过 reserveMax）----
    const before = p.weaponAmmo[key].reserve;
    p.weaponAmmo[key].reserve = Math.min(before + magAmount, reserveMax);
    const gained = p.weaponAmmo[key].reserve - before;

    // ---- 手里拿着 → 同步回 p.reserve ----
    if (isHoldingThis) {
        p.reserve = p.weaponAmmo[key].reserve;
    }

    // ---- 反馈 ----
    if (typeof sPickup === 'function') sPickup(1);

    const weaponName = (typeof WEAPONS !== 'undefined' && WEAPONS[key])
        ? WEAPONS[key].name : key;

    if (typeof feed === 'function' && p.id === 1) {
        if (gained > 0) {
            feed(p, `💛 拾取 <b style="color:#ffd24a">${weaponName}</b> 弹药 ` +
                    `<b style="color:#ffd24a">+${gained}</b> 备弹`);
        } else {
            feed(p, `💛 ${weaponName} 备弹已满`);
        }
    }

    despawnAmmoDrop();

    console.log('[ammoDrop] 拾取', weaponName, '+' + gained + ' 备弹，当前：'
                + p.weaponAmmo[key].reserve + ' / ' + reserveMax);
}