// ===== js/scene.js – 场景框架（多地图支持 + 通用工具 + 可破坏油桶） =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcc9d2);
scene.fog = new THREE.Fog(0xbcc9d2, 50, 120);

// 灯光
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(35, 55, 20);
sun.castShadow = true;

if (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
} else {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
}
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0004;
scene.add(sun);

// 地面
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
window.groundMesh = ground;

// 碰撞与弹道阻挡表
const wallMeshes = [];
const crateMeshes = [];
const colliders = [];
window.platforms = [];

// ★ C3：路灯 PointLight 列表
//   ★ 优化后：不再往里添加任何 light（保留数组本身，兼容 main_loop.js 的遍历）
window.lampLights = [];

let currentMapGroup = null;
let currentMapId = null;
let currentMapDef = null;
window.currentMapSpawns = null;

// ★ 新增：当前地图的活动半径（默认等于全局 ARENA）
window.currentArenaHalf = (typeof ARENA !== 'undefined') ? ARENA : 26;

const MAP_BUILDERS = {};

function registerMap(id, def) {
    MAP_BUILDERS[id] = def;
}
window.registerMap = registerMap;

// ============================================================
// ★ B2：静态地图物体材质复用
// ============================================================
const _staticMatCache = new Map();
const _colorMatCache  = new Map();

function _getStaticMat(tex) {
    let m = _staticMatCache.get(tex);
    if (!m) {
        m = new THREE.MeshLambertMaterial({ map: tex });
        _staticMatCache.set(tex, m);
    }
    return m;
}
window._getStaticMat = _getStaticMat;

function _getColorMat(color) {
    let m = _colorMatCache.get(color);
    if (!m) {
        m = new THREE.MeshLambertMaterial({ color });
        _colorMatCache.set(color, m);
    }
    return m;
}
window._getColorMat = _getColorMat;

function _notifyShotTargetsDirty() {
    if (typeof window.markShotTargetsDirty === 'function') {
        window.markShotTargetsDirty();
    }
}

function addPlatform(x, z, w, d, topY) {
    window.platforms.push({
        x0: x - w / 2, x1: x + w / 2,
        z0: z - d / 2, z1: z + d / 2,
        topY: topY
    });
}

function solid(x, z, w, h, d, tex, ry) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        _getStaticMat(tex)
    );
    m.position.set(x, h / 2, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    if (currentMapGroup) currentMapGroup.add(m);
    else scene.add(m);
    wallMeshes.push(m);
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: h, bottom: 0 });
    return m;
}

function addStairs(cx, cz, dir, width, numSteps, stepH, stepD) {
    for (let i = 0; i < numSteps; i++) {
        const height = (numSteps - i) * stepH;
        const offset = i * stepD + stepD / 2;
        let x = cx, z = cz;
        if (dir === 'N') z -= offset;
        if (dir === 'S') z += offset;
        if (dir === 'E') x += offset;
        if (dir === 'W') x -= offset;

        const isNS = (dir === 'N' || dir === 'S');
        const sx = isNS ? width : stepD;
        const sz = isNS ? stepD : width;

        const m = new THREE.Mesh(
            new THREE.BoxGeometry(sx, height, sz),
            _getStaticMat(concreteTex)
        );
        m.position.set(x, height / 2, z);
        m.castShadow = m.receiveShadow = true;
        if (currentMapGroup) currentMapGroup.add(m);
        else scene.add(m);
        wallMeshes.push(m);
        colliders.push({
            x0: x - sx / 2, x1: x + sx / 2,
            z0: z - sz / 2, z1: z + sz / 2,
            top: height, bottom: 0
        });
        addPlatform(x, z, sx, sz, height);
    }
}

// ============================================================
// 油桶（★ 现在注册为可破坏）
// ============================================================
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
barrelGeo._shared = true;
const barrelMat = new THREE.MeshLambertMaterial({ map: metalTex });

function addBarrel(x, z) {
    const m = new THREE.Mesh(barrelGeo, barrelMat);
    m.position.set(x, 0.55, z);
    m.castShadow = m.receiveShadow = true;
    if (currentMapGroup) currentMapGroup.add(m);
    else scene.add(m);
    wallMeshes.push(m);
    const collider = { x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, top: 1.1, bottom: 0 };
    colliders.push(collider);
    addPlatform(x, z, 0.9, 0.9, 1.1);

    // ★ 注册为可破坏油桶
    if (typeof window.registerBarrel === 'function') {
        window.registerBarrel(m, x, z, collider);
    }
}

// ============================================================
// 报废汽车
// ============================================================
const _carWheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
_carWheelGeo.rotateX(Math.PI / 2);
_carWheelGeo._shared = true;
const _carBodyGeo = new THREE.BoxGeometry(4.2, 0.85, 1.9);
_carBodyGeo._shared = true;
const _carHoodGeo = new THREE.BoxGeometry(1.1, 0.28, 1.8);
_carHoodGeo._shared = true;
const _carCabGeo  = new THREE.BoxGeometry(2.1, 0.72, 1.72);
_carCabGeo._shared = true;

function addCar(x, z, col, ry) {
    const g = new THREE.Group();
    const mat  = _getColorMat(col);
    const dark = _getColorMat(0x1e2126);
    const body = new THREE.Mesh(_carBodyGeo, mat);
    body.position.y = 0.82;
    const hood = new THREE.Mesh(_carHoodGeo, dark);
    hood.position.set(1.4, 1.28, 0);
    const cab = new THREE.Mesh(_carCabGeo, dark);
    cab.position.set(-0.35, 1.6, 0);
    [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(_carWheelGeo, dark);
        w.position.set(wx, 0.36, wz);
        g.add(w);
    });
    g.add(body, hood, cab);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.set(x, 0, z);
    if (ry) g.rotation.y = ry;
    if (currentMapGroup) currentMapGroup.add(g);
    else scene.add(g);
    const rotated = ry && Math.abs(Math.sin(ry)) > 0.5;
    const cw = rotated ? 1.9 : 4.2;
    const cd = rotated ? 4.2 : 1.9;
    colliders.push({ x0: x - cw / 2, x1: x + cw / 2, z0: z - cd / 2, z1: z + cd / 2, top: 1.8, bottom: 0 });
    addPlatform(x, z, cw, cd, 1.8);
    g.traverse(o => { if (o.isMesh) wallMeshes.push(o); });
}

// ============================================================
// 路灯
//
//   ★ 性能优化：不再创建 PointLight
//
//     原因：three.js 使用 forward rendering，每个材质的 shader 里
//           都有 `for (int i = 0; i < NUM_POINT_LIGHTS; i++)` 的循环，
//           NUM_POINT_LIGHTS 是编译时常量，等于"当前场景里可见的
//           PointLight 数量"。
//           而路灯的 PointLight 是按距离动态显隐的（main_loop.js 里
//           每帧根据距离改 L.visible），一旦某个路灯显隐切换，
//           就会触发全局 shader 重编译 → 卡顿。
//
//     视觉：灯头本身用 emissive 材质表现"亮着"，从远处看依然是
//           亮黄的路灯。视觉损失很小，收益很大。
// ============================================================
const _lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8);
_lampPoleGeo._shared = true;
const _lampHeadGeo = new THREE.BoxGeometry(0.6, 0.22, 0.3);
_lampHeadGeo._shared = true;
let _lampPoleMat = null;
let _lampHeadMat = null;

function addLamp(x, z) {
    if (!_lampPoleMat) {
        _lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
        _lampHeadMat = new THREE.MeshLambertMaterial({
            color: 0xffd9a0,
            emissive: 0xffc070,
            // ★ 从 0.9 调到 1.4，弥补没有真实光的损失
            emissiveIntensity: 1.4,
        });
    }
    const pole = new THREE.Mesh(_lampPoleGeo, _lampPoleMat);
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    const head = new THREE.Mesh(_lampHeadGeo, _lampHeadMat);
    head.position.set(x, 4.35, z);
    if (currentMapGroup) {
        currentMapGroup.add(pole);
        currentMapGroup.add(head);
    } else {
        scene.add(pole, head);
    }
    // ★ 不再创建 PointLight，也不再 push 到 lampLights
}

function addFloatingSlab(x, z, w, h, d, y, tex) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        _getStaticMat(tex)
    );
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    if (currentMapGroup) currentMapGroup.add(m);
    else scene.add(m);
    wallMeshes.push(m);
    addPlatform(x, z, w, d, y + h);
    colliders.push({
        x0: x - w / 2, x1: x + w / 2,
        z0: z - d / 2, z1: z + d / 2,
        top: y + h, bottom: y
    });
}

function clearMap() {
    if (currentMapGroup) {
        scene.remove(currentMapGroup);
        currentMapGroup.traverse(o => {
            if (o.isMesh) {
                if (o.geometry && !o.geometry._shared) o.geometry.dispose();
            }
        });
        currentMapGroup = null;
    }
    if (window.groundMesh) window.groundMesh.visible = true;
    window.terrainHeightFn = null;

    wallMeshes.length = 0;
    crateMeshes.length = 0;
    colliders.length = 0;
    window.platforms.length = 0;

    // ★ 清空路灯列表（现在永远是空数组，保留兼容）
    window.lampLights.length = 0;

    // ★ 清空油桶注册表
    if (typeof window.clearBarrels === 'function') {
        window.clearBarrels();
    }

    // ★ 新增：清空滑索注册表
    if (typeof window.clearZiplines === 'function') {
        window.clearZiplines();
    }

    _notifyShotTargetsDirty();
}
window.clearMap = clearMap;

function loadMap(mapId) {
    const def = MAP_BUILDERS[mapId];
    if (!def) {
        console.warn('未知地图:', mapId);
        return false;
    }
    clearMap();
    currentMapId = mapId;
    currentMapDef = def;
    currentMapGroup = new THREE.Group();
    scene.add(currentMapGroup);

    def.build(currentMapGroup);

    _notifyShotTargetsDirty();

    if (window.groundMesh) {
        window.groundMesh.visible = !def.hideGround;
    }

    if (def.ambience) {
        const a = def.ambience;
        if (a.background !== undefined) scene.background = new THREE.Color(a.background);
        if (a.fogExp2 !== undefined) {
            scene.fog = new THREE.FogExp2(a.fogExp2, a.fogDensity || 0.0026);
        } else if (a.fog !== undefined) {
            scene.fog = new THREE.Fog(a.fog, a.fogNear || 50, a.fogFar || 120);
        }
    }

    window.currentMapSpawns = def.spawns || {
        p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
        p2: { x: 21, z: 21, yaw: Math.PI / 4 }
    };

    // ============================================================
    // ★ 切换当前地图的活动半径
    // ============================================================
    window.currentArenaHalf = (typeof def.arenaHalf === 'number')
        ? def.arenaHalf
        : ARENA;

    // ============================================================
    // ★ 按地图调整阴影相机（含动态 far）
    // ============================================================
    (function updateShadowCamera() {
        const baseHalf = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) ? 35 : 40;
        const half = (typeof def.shadowHalf === 'number') ? def.shadowHalf : baseHalf;

        sun.shadow.camera.left   = -half;
        sun.shadow.camera.right  =  half;
        sun.shadow.camera.top    =  half;
        sun.shadow.camera.bottom = -half;

        // ★ 动态 far：沙漠覆盖 2.4 倍半径；战场回退 130
        sun.shadow.camera.far = (typeof def.shadowHalf === 'number')
            ? half * 2.4
            : 130;

        sun.shadow.camera.updateProjectionMatrix();

        if (typeof window.requestShadowUpdate === 'function') {
            window.requestShadowUpdate();
        }
    })();

    if (typeof p1 !== 'undefined' && p1 && window.currentMapSpawns.p1) {
        p1.spawn.x = window.currentMapSpawns.p1.x;
        p1.spawn.z = window.currentMapSpawns.p1.z;
        p1.spawn.yaw = window.currentMapSpawns.p1.yaw;
    }
    if (typeof p2 !== 'undefined' && p2 && window.currentMapSpawns.p2) {
        p2.spawn.x = window.currentMapSpawns.p2.x;
        p2.spawn.z = window.currentMapSpawns.p2.z;
        p2.spawn.yaw = window.currentMapSpawns.p2.yaw;
    }
    window.terrainHeightFn = def.terrainHeightFn || null;

    // 重建物理静态刚体
    if (window.PHYSICS && window.PHYSICS.isReady && window.PHYSICS.isReady()) {
        window.PHYSICS.rebuildStaticBodies();
    }

    if (typeof window.refreshMinimap === 'function') window.refreshMinimap();
    if (typeof window.requestShadowUpdate === 'function') window.requestShadowUpdate();

    return true;
}
window.loadMap = loadMap;

function getCurrentMapId() { return currentMapId; }
window.getCurrentMapId = getCurrentMapId;

function getAvailableMaps() {
    return Object.keys(MAP_BUILDERS).map(id => ({
        id,
        name: MAP_BUILDERS[id].name || id
    }));
}
window.getAvailableMaps = getAvailableMaps;