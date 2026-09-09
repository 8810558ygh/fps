// ===== js/scene.js – 场景构建（含平台记录） =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c8d4);
scene.fog = new THREE.Fog(0xbcc9d2, 40, 100);

// 天空球
const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
);
scene.add(sky);

// 灯光
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(20, 32, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
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

// 碰撞与弹道阻挡表
const wallMeshes = [];
const crateMeshes = [];
const colliders = [];

// ---------- 平台数据 ----------
window.platforms = [];

function addPlatform(x, z, w, d, topY) {
    window.platforms.push({
        x0: x - w/2,
        x1: x + w/2,
        z0: z - d/2,
        z1: z + d/2,
        topY: topY
    });
}

// 辅助：生成实心方块（地面放置）
function solid(x, z, w, h, d, tex, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(x, h / 2, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    wallMeshes.push(m);
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: h, bottom: 0 });
    return m;
}

function slab(x, z, w, h, d, tex, yBase) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(x, yBase + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    wallMeshes.push(m);
    return m;
}

// ---- 外围墙 + 砖柱 ----
solid(0, -(ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(0, (ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(-(ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
solid((ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
[
    [-20, -20],
    [20, -20],
    [-20, 20],
    [20, 20],
    [0, -20],
    [0, 20],
    [-20, 0],
    [20, 0]
].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2), new THREE.MeshLambertMaterial({ map: brickTex }));
    p.position.set(x, 2.6, z);
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
    wallMeshes.push(p);
});

// ---- 中央废墟建筑 ----
(function building() {
    const T = 0.4,
        H = 1.15,
        WIN = 0.9,
        H2 = 3.2;

    function wallSeg(cx, cz, w, d) {
        solid(cx, cz, w, H, d, brickTex);
        slab(cx, cz, w, H2 - H - WIN, d, brickTex, H + WIN);
    }
    wallSeg(-3.05, -5, 3.9, T);
    wallSeg(3.05, -5, 3.9, T);
    wallSeg(-3.05, 5, 3.9, T);
    wallSeg(3.05, 5, 3.9, T);
    wallSeg(-5, -3.05, T, 3.9);
    wallSeg(-5, 3.05, T, 3.9);
    wallSeg(5, -3.05, T, 3.9);
    wallSeg(5, 3.05, T, 3.9);
    colliders.push({ x0: -5.6, x1: -1.1, z0: -5.4, z1: -4.6, top: 3.2, bottom: 0 }, { x0: 1.1, x1: 5.6, z0: -5.4, z1: -4.6, top: 3.2, bottom: 0 },
        { x0: -5.6, x1: -1.1, z0: 4.6, z1: 5.4, top: 3.2, bottom: 0 }, { x0: 1.1, x1: 5.6, z0: 4.6, z1: 5.4, top: 3.2, bottom: 0 },
        { x0: -5.4, x1: -4.6, z0: -5.6, z1: -1.1, top: 3.2, bottom: 0 }, { x0: -5.4, x1: -4.6, z0: 1.1, z1: 5.6, top: 3.2, bottom: 0 },
        { x0: 4.6, x1: 5.4, z0: -5.6, z1: -1.1, top: 3.2, bottom: 0 }, { x0: 4.6, x1: 5.4, z0: 1.1, z1: 5.6, top: 3.2, bottom: 0 }
    );
    // 屋内瓦砾
    [
        [1.5, 1.2, 0.9],
        [-1.8, -0.8, 0.7],
        [0.2, -2.0, 0.6]
    ].forEach(([x, z, s]) => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), new THREE.MeshLambertMaterial({ map: concreteTex }));
        r.position.set(x, s * 0.3, z);
        r.rotation.y = Math.random() * 3;
        r.castShadow = r.receiveShadow = true;
        scene.add(r);
        wallMeshes.push(r);
    });
})();

// ---- 外围断墙 ----
const brokenWalls = [
    [-11, 6, 4.2, 0.4, 2.4],
    [11, -6, 4.2, 0.4, 2.4],
    [-6, -12, 0.4, 4.2, 1.8],
    [6, 12, 0.4, 4.2, 1.8],
    [14, 7, 3.2, 0.4, 1.4],
    [-14, -7, 3.2, 0.4, 1.4],
    [3, 14, 4.5, 0.4, 2.6],
    [-3, -14, 4.5, 0.4, 2.6]
];
brokenWalls.forEach(([x, z, w, d, h]) => {
    solid(x, z, w, h, d, brickTex);
    addPlatform(x, z, w, d, h);
});

// ---- 沙袋工事 ----
const sandbags = [
    [-3, -8.5, 2.4, 0.95, 0.8],
    [3, 8.5, 2.4, 0.95, 0.8],
    [9, 1, 0.8, 0.95, 2.4],
    [-9, -1, 0.8, 0.95, 2.4]
];
sandbags.forEach(([x, z, w, h, d]) => {
    solid(x, z, w, h, d, sandTex);
    addPlatform(x, z, w, d, h);
});

// ---- 木箱 ----
const crateDefs = [
    [-6, -2, 2, 1.2],
    [6, -6, 3, 1.8],
    [-9, 6, 2, 2.2],
    [10, 2, 2, 1.2],
    [2, -10, 2.5, 1.5],
    [-4, 10, 2, 1.0],
    [12, -12, 2, 2.0],
    [-13, -6, 2, 1.4],
    [0, 8, 2, 1.0],
    [7, 9, 2, 1.6],
    [-2, -14, 2, 1.2]
];
crateDefs.forEach(([cx, cz, w, h]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ map: woodTex }));
    m.position.set(cx, h / 2, cz);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    crateMeshes.push(m);
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - w / 2, z1: cz + w / 2, top: h, bottom: 0 });
    addPlatform(cx, cz, w, w, h);
});

// ---- 油桶 ----
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14);
const barrelMat = new THREE.MeshLambertMaterial({ map: metalTex });

function addBarrel(x, z) {
    const m = new THREE.Mesh(barrelGeo, barrelMat);
    m.position.set(x, 0.55, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    wallMeshes.push(m);
    colliders.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, top: 1.1, bottom: 0 });
    addPlatform(x, z, 0.9, 0.9, 1.1);
}
addBarrel(5.5, 4.5);
addBarrel(6.3, 4.7);
addBarrel(5.7, 5.3);
addBarrel(-5.5, -4.5);
addBarrel(-6.3, -4.7);
addBarrel(-5.7, -5.3);
addBarrel(-16, 10);
addBarrel(16, -10);

// ---- 报废汽车 ----
function addCar(x, z, col) {
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
    [
        [1.45, 0.95],
        [1.45, -0.95],
        [-1.45, 0.95],
        [-1.45, -0.95]
    ].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(wg, dark);
        w.position.set(wx, 0.36, wz);
        g.add(w);
    });
    g.add(body, hood, cab);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true;
            wallMeshes.push(o); } });
    g.position.set(x, 0, z);
    scene.add(g);
    colliders.push({ x0: x - 2.15, x1: x + 2.15, z0: z - 1.0, z1: z + 1.0, top: 1.8, bottom: 0 });
    addPlatform(x, z, 4.2, 1.9, 1.8);
}
addCar(-7, 11.5, 0x6a4a3a);
addCar(7, -11.5, 0x46586a);

// ---- 路灯 ----
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
    scene.add(pole, head, light);
}
addLamp(11, -11);
addLamp(-11, 11);
addLamp(-11, -4);
addLamp(11, 4);

// ---- 地面杂物 ----
const debrisMats = [0x555a52, 0x6b6154, 0x4a4f45].map(c => new THREE.MeshLambertMaterial({ color: c }));
for (let i = 0; i < 20; i++) {
    const s = 0.15 + Math.random() * 0.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), debrisMats[i % 3]);
    m.position.set((Math.random() - 0.5) * 36, s * 0.25, (Math.random() - 0.5) * 36);
    m.rotation.y = Math.random() * 3;
    m.castShadow = true;
    scene.add(m);
}