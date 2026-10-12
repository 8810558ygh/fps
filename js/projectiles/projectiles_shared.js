// ===== js/projectiles_shared.js – 投掷物共享常量 / 几何体 / 材质 / mesh 工厂 =====
// 从 game_projectiles.js 拆出，不改变任何对外接口

// ============================================================
// 投掷物注册表（被 chat.js / game.js 等多处引用）
// ============================================================
const activeSmokes = [];
const activeFlashes = [];

const SMOKE_PROJ_RADIUS = 0.09;
const SMOKE_PROJ_HALF_H = 0.12;

// ============================================================
// 投掷物几何体 / 材质共享
// ============================================================
const _projBodyGeo = new THREE.CylinderGeometry(
    SMOKE_PROJ_RADIUS, SMOKE_PROJ_RADIUS, SMOKE_PROJ_HALF_H * 2, 14
);
const _projCapGeo = new THREE.CylinderGeometry(
    SMOKE_PROJ_RADIUS + 0.01, SMOKE_PROJ_RADIUS + 0.01, 0.03, 14
);
const _projBandGeo = new THREE.CylinderGeometry(
    SMOKE_PROJ_RADIUS + 0.005, SMOKE_PROJ_RADIUS + 0.005, 0.045, 14
);

let _projMats = null;
function _ensureProjectileMaterials() {
    if (_projMats) return _projMats;
    const smokeMain = SMOKE_MAT.clone();
    smokeMain.emissiveIntensity = 0.7;
    const flashMain = FLASH_MAT.clone();
    flashMain.emissiveIntensity = 0.7;
    _projMats = {
        smokeMain,
        flashMain,
        smokeBand: SMOKE_BAND_MAT,
        flashBand: FLASH_BAND_MAT,
        smokeCap:  SMOKE_CAP_MAT,
        flashCap:  FLASH_CAP_MAT,
    };
    return _projMats;
}

// ============================================================
// 投掷物 mesh 工厂
// ============================================================
function createThrownProjectileMesh(kind) {
    const M = _ensureProjectileMaterials();
    const isFlash = (kind === 'flash');

    const mainMat = isFlash ? M.flashMain : M.smokeMain;
    const bandMat = isFlash ? M.flashBand : M.smokeBand;
    const capMat  = isFlash ? M.flashCap  : M.smokeCap;

    const mesh = new THREE.Mesh(_projBodyGeo, mainMat);
    mesh.castShadow = true;

    const capTop = new THREE.Mesh(_projCapGeo, capMat);
    capTop.position.y = SMOKE_PROJ_HALF_H + 0.015;
    mesh.add(capTop);

    const capBot = new THREE.Mesh(_projCapGeo, capMat);
    capBot.position.y = -SMOKE_PROJ_HALF_H - 0.015;
    mesh.add(capBot);

    const band = new THREE.Mesh(_projBandGeo, bandMat);
    mesh.add(band);

    return mesh;
}

// ============================================================
// 共享临时四元数（供 updateSmokes / updateFlashes 使用）
// ============================================================
const _projQuat = new THREE.Quaternion();