// ===== js/scene.js – 场景构建（大地图：更多墙壁与拐角） =====
const scene = new THREE.Scene();

// ★ 删除天空球，改用纯色背景 + 雾（避免天空球被远裁剪面裁出灰面）
scene.background = new THREE.Color(0xbcc9d2);
scene.fog = new THREE.Fog(0xbcc9d2, 70, 160);

// 灯光
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(35, 55, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
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

// ---- 外围墙 ----
solid(0, -(ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(0, (ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(-(ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
solid((ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);

// ---- 沿墙砖柱（装饰 + 碰撞） ----
[
    [-32, -32], [32, -32], [-32, 32], [32, 32],
    [-18, -32], [0, -32], [18, -32],
    [-18, 32], [0, 32], [18, 32],
    [-32, -18], [-32, 0], [-32, 18],
    [32, -18], [32, 0], [32, 18]
].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2), new THREE.MeshLambertMaterial({ map: brickTex }));
    p.position.set(x, 2.6, z);
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
    wallMeshes.push(p);
    colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, top: 5.2, bottom: 0 });
});

// ---- 中央大废墟（16×16，4 房间带十字隔墙） ----
(function centralRuin() {
    const H = 3.4, T = 0.5;

    // 北墙 z=-8（中央留 3 米开口）
    solid(-4.75, -8, 6.5, H, T, brickTex);
    solid(4.75, -8, 6.5, H, T, brickTex);
    // 南墙 z=8
    solid(-4.75, 8, 6.5, H, T, brickTex);
    solid(4.75, 8, 6.5, H, T, brickTex);
    // 西墙 x=-8
    solid(-8, -4.75, T, H, 6.5, brickTex);
    solid(-8, 4.75, T, H, 6.5, brickTex);
    // 东墙 x=8
    solid(8, -4.75, T, H, 6.5, brickTex);
    solid(8, 4.75, T, H, 6.5, brickTex);

    // 内部十字隔墙（分隔 4 个房间，中心留 2.4×2.4 缺口做掩体）
    solid(-4, 0, 6, 2.6, T, brickTex);
    solid(4, 0, 6, 2.6, T, brickTex);
    solid(0, -4, T, 2.6, 6, brickTex);
    solid(0, 4, T, 2.6, 6, brickTex);

    // 中央掩体（正好填十字交叉点）
    solid(0, 0, 2.4, 1.8, 2.4, concreteTex);
})();

// ---- 从中央废墟 4 个角延伸出的 L 形长墙（形成通道 + 拐角） ----
(function crossWalls() {
    const H = 3.0, T = 0.5;
    // 东北方向
    solid(14, 8, 12, H, T, brickTex);
    solid(8, 14, T, H, 12, brickTex);
    // 东南方向
    solid(14, -8, 12, H, T, brickTex);
    solid(8, -14, T, H, 12, brickTex);
    // 西北方向
    solid(-14, 8, 12, H, T, brickTex);
    solid(-8, 14, T, H, 12, brickTex);
    // 西南方向
    solid(-14, -8, 12, H, T, brickTex);
    solid(-8, -14, T, H, 12, brickTex);
})();

// ---- 四角 L 形建筑（开口朝中心，形成角落掩体） ----
function cornerRoom(cx, cz, dirX, dirZ) {
    const H = 3.0, T = 0.4, S = 8;
    if (dirX > 0 && dirZ > 0) {
        // 西南角建筑（开口朝东北）
        solid(cx, cz - S/2, S, H, T, brickTex);
        solid(cx + S/2, cz, T, H, S, brickTex);
    } else if (dirX < 0 && dirZ > 0) {
        // 东南角建筑（开口朝西北）
        solid(cx, cz - S/2, S, H, T, brickTex);
        solid(cx - S/2, cz, T, H, S, brickTex);
    } else if (dirX < 0 && dirZ < 0) {
        // 东北角建筑（开口朝西南）
        solid(cx, cz + S/2, S, H, T, brickTex);
        solid(cx - S/2, cz, T, H, S, brickTex);
    } else {
        // 西北角建筑（开口朝东南）
        solid(cx, cz + S/2, S, H, T, brickTex);
        solid(cx + S/2, cz, T, H, S, brickTex);
    }
}
cornerRoom(-24, -24, 1, 1);
cornerRoom(24, -24, -1, 1);
cornerRoom(24, 24, -1, -1);
cornerRoom(-24, 24, 1, -1);

// ---- 中场独立 L / T 形墙（更多拐角） ----
(function midWalls() {
    const H = 2.8, T = 0.5;
    // 西南中场 L
    solid(-14, -18, 10, H, T, brickTex);
    solid(-9, -23, T, H, 10, brickTex);
    // 东南中场 L
    solid(14, -18, 10, H, T, brickTex);
    solid(9, -23, T, H, 10, brickTex);
    // 东北中场 L
    solid(14, 18, 10, H, T, brickTex);
    solid(9, 23, T, H, 10, brickTex);
    // 西北中场 L
    solid(-14, 18, 10, H, T, brickTex);
    solid(-9, 23, T, H, 10, brickTex);

    // 额外独立短墙
    solid(20, 0, 0.5, H, 8, brickTex);
    solid(-20, 0, 0.5, H, 8, brickTex);
    solid(0, 20, 8, H, 0.5, brickTex);
    solid(0, -20, 8, H, 0.5, brickTex);

    // 斜向短墙
    solid(-22, -6, 6, H, 0.5, brickTex);
    solid(22, 6, 6, H, 0.5, brickTex);
    solid(6, -22, 0.5, H, 6, brickTex);
    solid(-6, 22, 0.5, H, 6, brickTex);
})();

// ---- 外围断墙 ----
const brokenWalls = [
    [-14, 10, 5, 0.4, 2.4],
    [14, -10, 5, 0.4, 2.4],
    [-10, -14, 0.4, 5, 2.2],
    [10, 14, 0.4, 5, 2.2],
    [18, 12, 4, 0.4, 1.6],
    [-18, -12, 4, 0.4, 1.6],
    [5, 18, 5, 0.4, 2.6],
    [-5, -18, 5, 0.4, 2.6],
    [25, -2, 6, 0.4, 2.0],
    [-25, 2, 6, 0.4, 2.0],
    [2, -25, 0.4, 6, 2.0],
    [-2, 25, 0.4, 6, 2.0]
];
brokenWalls.forEach(([x, z, w, d, h]) => {
    solid(x, z, w, h, d, brickTex);
    addPlatform(x, z, w, d, h);
});

// ---- 沙袋工事 ----
const sandbags = [
    [-3, -13, 3.0, 0.95, 0.8],
    [3, 13, 3.0, 0.95, 0.8],
    [13, 1, 0.8, 0.95, 3.0],
    [-13, -1, 0.8, 0.95, 3.0],
    [-8, 22, 2.6, 0.95, 0.8],
    [8, -22, 2.6, 0.95, 0.8],
    [22, 8, 0.8, 0.95, 2.6],
    [-22, -8, 0.8, 0.95, 2.6],
    [-16, 14, 2.4, 0.95, 0.8],
    [16, -14, 2.4, 0.95, 0.8],
    [16, 16, 0.8, 0.95, 2.4],
    [-16, -16, 0.8, 0.95, 2.4]
];
sandbags.forEach(([x, z, w, h, d]) => {
    solid(x, z, w, h, d, sandTex);
    addPlatform(x, z, w, d, h);
});

// ---- 木箱（掩体 + 可跳上） ----
const crateDefs = [
    [-6, -3, 2, 1.2],
    [6, -6, 3, 1.8],
    [-11, 8, 2, 2.2],
    [11, 3, 2, 1.2],
    [3, -11, 2.5, 1.5],
    [-5, 12, 2, 1.0],
    [14, -14, 2, 2.0],
    [-15, -7, 2, 1.4],
    [1, 9, 2, 1.0],
    [8, 11, 2, 1.6],
    [-3, -16, 2, 1.2],
    [19, -3, 2.2, 1.4],
    [-19, 4, 2.2, 1.6],
    [4, 20, 2, 1.2],
    [-4, -20, 2, 1.8],
    [24, -9, 2, 1.0],
    [-24, 9, 2, 1.2],
    [10, 24, 2, 1.5],
    [-10, -24, 2, 1.5],
    [22, 18, 2.4, 2.2]
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
addBarrel(9.5, 5.0);
addBarrel(10.3, 5.2);
addBarrel(9.7, 5.8);
addBarrel(-9.5, -5.0);
addBarrel(-10.3, -5.2);
addBarrel(-9.7, -5.8);
addBarrel(-28, 12);
addBarrel(28, -12);
addBarrel(12, 28);
addBarrel(-12, -28);
addBarrel(28, 22);
addBarrel(-28, -22);
addBarrel(20, -28);
addBarrel(-20, 28);

// ---- 报废汽车（大掩体） ----
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
addCar(-16, 4, 0x6a4a3a);
addCar(16, -4, 0x46586a);
addCar(4, 16, 0x4a5a3a);
addCar(-4, -16, 0x6a3a4a);
addCar(-22, 22, 0x5a5a3a);
addCar(22, -22, 0x3a4a6a);

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
addLamp(18, -18);
addLamp(-18, 18);
addLamp(-18, -6);
addLamp(18, 6);
addLamp(-6, 18);
addLamp(6, -18);
addLamp(28, 0);
addLamp(-28, 0);

// ---- 地面杂物（覆盖 66×66 区域） ----
const debrisMats = [0x555a52, 0x6b6154, 0x4a4f45].map(c => new THREE.MeshLambertMaterial({ color: c }));
for (let i = 0; i < 60; i++) {
    const s = 0.15 + Math.random() * 0.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), debrisMats[i % 3]);
    m.position.set((Math.random() - 0.5) * 66, s * 0.25, (Math.random() - 0.5) * 66);
    m.rotation.y = Math.random() * 3;
    m.castShadow = true;
    scene.add(m);
}