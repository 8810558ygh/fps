// ===== js/scene.js – 场景框架（多地图支持 + 通用工具） =====
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

// 地面（所有地图共用）
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// ★ 暴露地面给射击系统（用于生成弹痕）
window.groundMesh = ground;

// 碰撞与弹道阻挡表（清空后重新填充）
const wallMeshes = [];
const crateMeshes = [];
const colliders = [];
window.platforms = [];

// 当前地图组
let currentMapGroup = null;
let currentMapId = null;
let currentMapDef = null;
window.currentMapSpawns = null;
const MAP_BUILDERS = {};

// 注册地图
function registerMap(id, def) {
    MAP_BUILDERS[id] = def;
}
window.registerMap = registerMap;

// 平台
function addPlatform(x, z, w, d, topY) {
    window.platforms.push({
        x0: x - w / 2, x1: x + w / 2,
        z0: z - d / 2, z1: z + d / 2,
        topY: topY
    });
}

// 实心方块
function solid(x, z, w, h, d, tex, ry) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ map: tex })
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

// 楼梯
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
            new THREE.MeshLambertMaterial({ map: concreteTex })
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

// 油桶
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
const barrelMat = new THREE.MeshLambertMaterial({ map: metalTex });

function addBarrel(x, z) {
    const m = new THREE.Mesh(barrelGeo, barrelMat);
    m.position.set(x, 0.55, z);
    m.castShadow = m.receiveShadow = true;
    if (currentMapGroup) currentMapGroup.add(m);
    else scene.add(m);
    wallMeshes.push(m);
    colliders.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, top: 1.1, bottom: 0 });
    addPlatform(x, z, 0.9, 0.9, 1.1);
}

// 报废汽车
function addCar(x, z, col, ry) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: col });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1e2126 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.9), mat);
    body.position.y = 0.82;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.8), dark);
    hood.position.set(1.4, 1.28, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 1.72), dark);
    cab.position.set(-0.35, 1.6, 0);
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
    wg.rotateX(Math.PI / 2);
    [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(wg, dark);
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

// 路灯
function addLamp(x, z) {
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8),
        new THREE.MeshLambertMaterial({ color: 0x3a3f46 })
    );
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.22, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 0.9 })
    );
    head.position.set(x, 4.35, z);
    const light = new THREE.PointLight(0xffd9a0, 0.85, 15);
    light.position.set(x, 4.1, z);
    if (currentMapGroup) {
        currentMapGroup.add(pole);
        currentMapGroup.add(head);
        currentMapGroup.add(light);
    } else {
        scene.add(pole, head, light);
    }
}

// 悬空薄板（如车棚顶）
function addFloatingSlab(x, z, w, h, d, y, tex) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ map: tex })
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

// 清空地图
function clearMap() {
    if (currentMapGroup) {
        scene.remove(currentMapGroup);
        currentMapGroup.traverse(o => {
            if (o.isMesh) {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) {
                        o.material.forEach(m => { if (m && m.dispose) m.dispose(); });
                    } else if (o.material.dispose) {
                        o.material.dispose();
                    }
                }
            }
        });
        currentMapGroup = null;
    }
    wallMeshes.length = 0;
    crateMeshes.length = 0;
    colliders.length = 0;
    window.platforms.length = 0;
}
window.clearMap = clearMap;

// 加载地图
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

    // 环境氛围
    if (def.ambience) {
        const a = def.ambience;
        if (a.background !== undefined) scene.background = new THREE.Color(a.background);
        if (a.fog !== undefined) {
            scene.fog = new THREE.Fog(a.fog, a.fogNear || 50, a.fogFar || 120);
        }
    }

    // 出生点
    window.currentMapSpawns = def.spawns || {
        p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
        p2: { x: 21, z: 21, yaw: Math.PI / 4 }
    };
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

    // 小地图重绘
    if (typeof window.refreshMinimap === 'function') window.refreshMinimap();

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