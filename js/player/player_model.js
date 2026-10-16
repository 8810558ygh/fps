// ===== js/player_model.js – 玩家武器模型与第一人称模型 =====
const DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
const LENS_MAT = new THREE.MeshLambertMaterial({ color: 0x8fe8ff, emissive: 0x35b6d5, emissiveIntensity: 0.7 });
const SMOKE_MAT = new THREE.MeshLambertMaterial({ color: 0x3a4a3a, emissive: 0x141c14, emissiveIntensity: 0.5 });
const SMOKE_BAND_MAT = new THREE.MeshLambertMaterial({ color: 0x7ee08a, emissive: 0x2a6a2e, emissiveIntensity: 0.6 });
const SMOKE_CAP_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1f1a });
const FLASH_MAT = new THREE.MeshLambertMaterial({ color: 0xd4d8dc, emissive: 0x606060, emissiveIntensity: 0.55 });
const FLASH_BAND_MAT = new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0x8a6a10, emissiveIntensity: 0.7 });
const FLASH_CAP_MAT = new THREE.MeshLambertMaterial({ color: 0x2a2e34 });

// ============================================================
// ★ 高细节武器模板缓存
// ============================================================
const _hdWorldTemplates = new Map();
const _hdViewTemplates  = new Map();

// ============================================================
// ★ P1-2：一次性给克隆体建 name → node 索引
//
//   背景：
//     · 原来 _cloneHdTemplate 里连续调 8 次 _findByName
//     · 每次 _findByName 都跑一遍完整 root.traverse
//     · 奥丁有 70+ 子节点 → 一次切枪 = 8 × 70 ≈ 560 次节点访问
//
//   优化：
//     · 一次 traverse 把所有带 name 的节点塞进 Map
//     · 后续 8 次查询都是 O(1) 查表
//
//   注：name 冲突时保留「先遇到的」节点，与旧行为一致
//       （旧 _findByName 里的 found 标记也是保第一个）
// ============================================================
function _buildNameIndex(root) {
    const idx = new Map();
    root.traverse(o => {
        if (o.name && !idx.has(o.name)) {
            idx.set(o.name, o);
        }
    });
    return idx;
}

function _cloneHdTemplate(tpl) {
    if (!tpl) return null;

    const src = tpl.userData || {};

    if (!src.basePos || !src.baseRot) {
        console.warn(
            '[player_model] 模板缺少 userData.basePos / baseRot：' +
            (tpl.name || tpl.type || tpl) +
            '。若武器位置错乱，请检查对应 weapon_*_hd.js 的 build*HD()。'
        );
    }

    const _savedUserData = tpl.userData;
    tpl.userData = {};
    const clone = tpl.clone(true);
    tpl.userData = _savedUserData;

    const dst = clone.userData = {};

    dst.basePos = src.basePos ? src.basePos.clone() : tpl.position.clone();
    dst.baseRot = src.baseRot ? src.baseRot.clone() : tpl.rotation.clone();
    dst.adsPos  = src.adsPos  ? src.adsPos.clone()  : dst.basePos.clone();
    dst.adsRot  = src.adsRot  ? src.adsRot.clone()  : dst.baseRot.clone();

    clone.position.copy(dst.basePos);
    clone.rotation.copy(dst.baseRot);

    // ★ P1-2：一次 traverse 建索引，之后全是查表
    const nameIdx = _buildNameIndex(clone);

    dst.muzzlePoint   = nameIdx.get('muzzlePoint')    || null;
    dst.boltGroup     = nameIdx.get('boltGroup')      || null;
    dst.scopeCenter   = nameIdx.get('scopeCenter')    || null;
    dst.lensMeshF     = nameIdx.get('scopeLensFront') || null;
    dst.lensMeshB     = nameIdx.get('scopeLensBack')  || null;
    dst.bladeTip      = nameIdx.get('bladeTip')       || null;
    dst.attackPoint   = nameIdx.get('attackPoint')    || null;
    dst.magazineGroup = nameIdx.get('magazineGroup')  || null;

    return clone;
}

function _getWorldTemplate(type) {
    if (_hdWorldTemplates.has(type)) return _hdWorldTemplates.get(type);

    let tpl = null;
    try {
        if (type === 'rifle' && window.__HD_RIFLE && window.__HD_RIFLE.buildWorld) {
            tpl = window.__HD_RIFLE.buildWorld();
        } else if (type === 'sniper' && window.__HD_SNIPER && window.__HD_SNIPER.buildWorld) {
            tpl = window.__HD_SNIPER.buildWorld();
        } else if (type === 'shotgun' && window.__HD_SHOTGUN && window.__HD_SHOTGUN.buildWorld) {
            tpl = window.__HD_SHOTGUN.buildWorld();
        } else if (type === 'odin' && window.__HD_ODIN && window.__HD_ODIN.buildWorld) {
            tpl = window.__HD_ODIN.buildWorld();
        } else if (type === 'knife' && window.__HD_KNIFE && window.__HD_KNIFE.buildWorld) {
            tpl = window.__HD_KNIFE.buildWorld();
        } else if (type === 'smoke' && window.__HD_SMOKE && window.__HD_SMOKE.buildWorld) {
            tpl = window.__HD_SMOKE.buildWorld();
        } else if (type === 'flash' && window.__HD_FLASH && window.__HD_FLASH.buildWorld) {
            tpl = window.__HD_FLASH.buildWorld();
        } else if (type === 'medkit' && window.__HD_MEDKIT && window.__HD_MEDKIT.buildWorld) {
            tpl = window.__HD_MEDKIT.buildWorld();
        }
    } catch (e) {
        console.warn('[player_model] HD 世界模型模板构建失败:', type, e);
    }
    if (tpl) _hdWorldTemplates.set(type, tpl);
    return tpl;
}

function _getViewTemplate(type) {
    if (_hdViewTemplates.has(type)) return _hdViewTemplates.get(type);

    let tpl = null;
    try {
        if (type === 'rifle' && window.__HD_RIFLE && window.__HD_RIFLE.buildViewmodel) {
            tpl = window.__HD_RIFLE.buildViewmodel();
        } else if (type === 'sniper' && window.__HD_SNIPER && window.__HD_SNIPER.buildViewmodel) {
            tpl = window.__HD_SNIPER.buildViewmodel();
        } else if (type === 'shotgun' && window.__HD_SHOTGUN && window.__HD_SHOTGUN.buildViewmodel) {
            tpl = window.__HD_SHOTGUN.buildViewmodel();
        } else if (type === 'odin' && window.__HD_ODIN && window.__HD_ODIN.buildViewmodel) {
            tpl = window.__HD_ODIN.buildViewmodel();
        } else if (type === 'knife' && window.__HD_KNIFE && window.__HD_KNIFE.buildViewmodel) {
            tpl = window.__HD_KNIFE.buildViewmodel();
        } else if (type === 'smoke' && window.__HD_SMOKE && window.__HD_SMOKE.buildViewmodel) {
            tpl = window.__HD_SMOKE.buildViewmodel();
        } else if (type === 'flash' && window.__HD_FLASH && window.__HD_FLASH.buildViewmodel) {
            tpl = window.__HD_FLASH.buildViewmodel();
        } else if (type === 'medkit' && window.__HD_MEDKIT && window.__HD_MEDKIT.buildViewmodel) {
            tpl = window.__HD_MEDKIT.buildViewmodel();
        }
    } catch (e) {
        console.warn('[player_model] HD 视图模型模板构建失败:', type, e);
    }
    if (tpl) _hdViewTemplates.set(type, tpl);
    return tpl;
}

function preloadHdWeaponTemplates() {
    ['rifle', 'sniper', 'shotgun', 'odin', 'knife', 'smoke', 'flash', 'medkit'].forEach(t => {
        _getWorldTemplate(t);
        _getViewTemplate(t);
    });
}
window.preloadHdWeaponTemplates = preloadHdWeaponTemplates;

// ============================================================
// makeWeaponModel
// ============================================================
function makeWeaponModel(type, mat) {
    if (type === 'rifle' || type === 'sniper' || type === 'shotgun'
        || type === 'odin' || type === 'knife' || type === 'smoke'
        || type === 'flash' || type === 'medkit') {
        const tpl = _getWorldTemplate(type);
        if (tpl) return _cloneHdTemplate(tpl);
    }

    const g = new THREE.Group();
    if (type === 'sniper') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 1.1), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.85);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), DARK_MAT);
        muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.04, -1.2);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10), mat);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.16, -0.1);
        const lensF = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10), LENS_MAT);
        lensF.rotation.x = Math.PI / 2; lensF.position.set(0, 0.16, -0.28);
        const lensB = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), LENS_MAT);
        lensB.rotation.x = Math.PI / 2; lensB.position.set(0, 0.16, 0.08);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.4), mat);
        stock.position.set(0, -0.02, 0.62);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.14), DARK_MAT);
        magz.position.set(0, -0.14, 0.15);
        g.add(body, barrel, muzzle, scope, lensF, lensB, stock, magz);
    } else if (type === 'shotgun') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.6), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.45);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.1), mat);
        magz.position.set(0, -0.2, 0.0);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.35), mat);
        stock.position.set(0, -0.02, 0.4);
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), DARK_MAT);
        pump.position.set(0, -0.02, -0.2);
        g.add(body, barrel, magz, stock, pump);
    } else if (type === 'odin') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.7), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.55);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.14), mat);
        magz.position.set(0, -0.22, 0.0);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.4), mat);
        stock.position.set(0, -0.02, 0.45);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), DARK_MAT);
        grip.position.set(0, -0.12, 0.0);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.12), DARK_MAT);
        sight.position.set(0, 0.15, -0.2);
        g.add(body, barrel, magz, stock, grip, sight);
    } else if (type === 'knife') {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), DARK_MAT);
        handle.position.set(0, -0.1, 0);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), DARK_MAT);
        guard.position.set(0, 0.02, 0);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.02), mat);
        blade.position.set(0, 0.22, -0.01); blade.rotation.x = -0.05;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), mat);
        tip.position.set(0, 0.42, -0.01); tip.rotation.x = -0.05;
        g.add(handle, guard, blade, tip);
    } else if (type === 'smoke') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 14), SMOKE_MAT);
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.03, 14), SMOKE_CAP_MAT);
        capTop.position.y = 0.135;
        const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.03, 14), SMOKE_CAP_MAT);
        capBot.position.y = -0.135;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.045, 14), SMOKE_BAND_MAT);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 10), DARK_MAT);
        pin.position.set(0.11, 0.13, 0); pin.rotation.x = Math.PI / 2;
        g.add(body, capTop, capBot, band, pin);
    } else if (type === 'flash') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.22, 14), FLASH_MAT);
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 14), FLASH_CAP_MAT);
        capTop.position.y = 0.125;
        const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 14), FLASH_CAP_MAT);
        capBot.position.y = -0.125;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), FLASH_BAND_MAT);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 10), DARK_MAT);
        pin.position.set(0.1, 0.12, 0); pin.rotation.x = Math.PI / 2;
        g.add(body, capTop, capBot, band, pin);
    } else if (type === 'medkit') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.105, 0.15),
            new THREE.MeshLambertMaterial({ color: 0xe4e6e8 }));
        const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.020, 0.004),
            new THREE.MeshLambertMaterial({ color: 0xc81e1e }));
        cross1.position.set(0, 0, 0.078);
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.062, 0.004),
            new THREE.MeshLambertMaterial({ color: 0xc81e1e }));
        cross2.position.set(0, 0, 0.078);
        g.add(body, cross1, cross2);
    } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.8), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.45), DARK_MAT);
        barrel.position.set(0, 0.04, -0.58);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.15), mat);
        magz.position.set(0, -0.17, 0.02); magz.rotation.x = 0.18;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), mat);
        stock.position.set(0, -0.01, 0.48);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.12), DARK_MAT);
        sight.position.set(0, 0.13, -0.25);
        g.add(body, barrel, magz, stock, sight);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}

// ============================================================
// makeViewmodel
// ============================================================
function makeViewmodel(type, mat) {
    if (type === 'rifle' || type === 'sniper' || type === 'shotgun'
        || type === 'odin' || type === 'knife' || type === 'smoke'
        || type === 'flash' || type === 'medkit') {
        const tpl = _getViewTemplate(type);
        if (tpl) return _cloneHdTemplate(tpl);
    }

    const g = new THREE.Group();
    if (type === 'sniper') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.9), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, -0.75);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), mat);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.14, -0.05);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 10), LENS_MAT);
        lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.14, -0.21);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.34), mat);
        stock.position.set(0, -0.03, 0.5);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.12), DARK_MAT);
        magz.position.set(0, -0.12, 0.1);
        g.add(body, barrel, scope, lens, stock, magz);
        g.position.set(0.26, -0.26, -0.55); g.rotation.y = 0.02;
    } else if (type === 'shotgun') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.5), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.25, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.4);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.08), mat);
        magz.position.set(0, -0.16, 0.0);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.3), mat);
        stock.position.set(0, -0.02, 0.35);
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), DARK_MAT);
        pump.position.set(0, -0.02, -0.15);
        g.add(body, barrel, magz, stock, pump);
        g.position.set(0.30, -0.30, -0.5);
    } else if (type === 'odin') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.6), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.5);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), mat);
        magz.position.set(0, -0.18, 0.0);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.35), mat);
        stock.position.set(0, -0.02, 0.4);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), DARK_MAT);
        grip.position.set(0, -0.1, 0.0);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.1), DARK_MAT);
        sight.position.set(0, 0.12, -0.15);
        g.add(body, barrel, magz, stock, grip, sight);
        g.position.set(0.32, -0.32, -0.55);
    } else if (type === 'knife') {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.055), DARK_MAT);
        handle.position.set(0, -0.08, 0);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.055), DARK_MAT);
        guard.position.set(0, 0.03, 0);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.018), mat);
        blade.position.set(0, 0.2, -0.008); blade.rotation.x = -0.06;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), mat);
        tip.position.set(0, 0.37, -0.008); tip.rotation.x = -0.06;
        g.add(handle, guard, blade, tip);
        g.position.set(0.30, -0.32, -0.45);
        g.rotation.set(0.15, -0.25, 0.25);
    } else if (type === 'smoke') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 14), SMOKE_MAT);
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.028, 14), SMOKE_CAP_MAT);
        capTop.position.y = 0.125;
        const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.028, 14), SMOKE_CAP_MAT);
        capBot.position.y = -0.125;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 14), SMOKE_BAND_MAT);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 10), DARK_MAT);
        pin.position.set(0.1, 0.12, 0); pin.rotation.x = Math.PI / 2;
        g.add(body, capTop, capBot, band, pin);
        g.position.set(0.32, -0.30, -0.44);
        g.rotation.set(0.15, -0.30, 0.10);
    } else if (type === 'flash') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.20, 14), FLASH_MAT);
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.028, 14), FLASH_CAP_MAT);
        capTop.position.y = 0.115;
        const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.028, 14), FLASH_CAP_MAT);
        capBot.position.y = -0.115;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.038, 14), FLASH_BAND_MAT);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 10), DARK_MAT);
        pin.position.set(0.095, 0.11, 0); pin.rotation.x = Math.PI / 2;
        g.add(body, capTop, capBot, band, pin);
        g.position.set(0.32, -0.30, -0.44);
        g.rotation.set(0.15, -0.30, 0.10);
    } else if (type === 'medkit') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.105, 0.15),
            new THREE.MeshLambertMaterial({ color: 0xe4e6e8 }));
        const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.020, 0.004),
            new THREE.MeshLambertMaterial({ color: 0xc81e1e }));
        cross1.position.set(0, 0, 0.078);
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.062, 0.004),
            new THREE.MeshLambertMaterial({ color: 0xc81e1e }));
        cross2.position.set(0, 0, 0.078);
        g.add(body, cross1, cross2);
        g.position.set(0.30, -0.30, -0.44);
        g.rotation.set(0.15, -0.40, 0.10);
    } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.65), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), DARK_MAT);
        barrel.position.set(0, 0.03, -0.5);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.13), mat);
        magz.position.set(0, -0.14, 0); magz.rotation.x = 0.18;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.26), mat);
        stock.position.set(0, -0.02, 0.4);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.1), DARK_MAT);
        sight.position.set(0, 0.11, -0.2);
        g.add(body, barrel, magz, stock, sight);
        g.position.set(0.28, -0.28, -0.5);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    g.userData.basePos = g.position.clone();
    g.userData.baseRot = g.rotation.clone();
    return g;
}

// ============================================================
// ★ 供阴影开关使用：标脏所有武器模板的材质
//
//   背景：
//     · 切换阴影时 renderer.shadowMap.enabled 变化
//     · 已编译的材质 shader 需要重新编译（不同的 defines）
//     · 场景里的材质可以直接 traverse 标脏
//     · 但武器模板在 _hdWorldTemplates / _hdViewTemplates 里，
//       不在 scene 中，scene.traverse 遍历不到
//     · 结果：换枪时从模板 clone 出来的材质要现场编译 → 卡
//
//   修复：
//     提供一个全局函数，让 settings.js 在切换阴影时调用
// ============================================================
window.markAllWeaponTemplatesDirty = function () {
    const markTpl = (tpl) => {
        if (!tpl) return;
        tpl.traverse(o => {
            if (!o.isMesh && !o.isPoints && !o.isLine) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
                if (m && m.needsUpdate !== undefined) {
                    m.needsUpdate = true;
                }
            }
        });
    };

    _hdWorldTemplates.forEach(markTpl);
    _hdViewTemplates.forEach(markTpl);

    console.log('[player_model] 武器模板材质已全部标脏，下次换枪时会用新状态编译');
};