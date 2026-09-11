// ===== js/scene.js – 场景构建（紧凑地图 + 垂直空间） =====
const scene = new THREE.Scene();

// 背景与雾（地图变小，雾距收紧）
scene.background = new THREE.Color(0xbcc9d2);
scene.fog = new THREE.Fog(0xbcc9d2, 50, 120);

// 灯光
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
sun.position.set(35, 55, 20);
sun.castShadow = true;

// 阴影质量按设备分级
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

// 碰撞与弹道阻挡表
const wallMeshes = [];
const crateMeshes = [];
const colliders = [];

// 平台数据
window.platforms = [];

function addPlatform(x, z, w, d, topY) {
    window.platforms.push({
        x0: x - w / 2,
        x1: x + w / 2,
        z0: z - d / 2,
        z1: z + d / 2,
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

// ★ 新增：楼梯生成器（逐级抬升的台阶）
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
        scene.add(m);
        wallMeshes.push(m);
        colliders.push({
            x0: x - sx / 2, x1: x + sx / 2,
            z0: z - sz / 2, z1: z + sz / 2,
            top: height, bottom: 0
        });
        addPlatform(x, z, sx, sz, height);
    }
}

// ---- 外围墙 ----
solid(0, -(ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(0, (ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
solid(-(ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
solid((ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);

// ---- 稀疏砖柱（装饰 + 拐角，比原地图减少一半） ----
[
    [-22, -22], [22, -22], [-22, 22], [22, 22],
    [-22, 0], [22, 0], [0, -22], [0, 22]
].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2), new THREE.MeshLambertMaterial({ map: brickTex }));
    p.position.set(x, 2.6, z);
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
    wallMeshes.push(p);
    colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, top: 5.2, bottom: 0 });
});

// ============================================================
// 中央高台（8×8，高 2.5）—— 核心地标与争夺点
// ============================================================
(function centralPlatform() {
    const H = 2.5;

    // 主台体
    solid(0, 0, 8, H, 8, concreteTex);
    addPlatform(0, 0, 8, 8, H);

    // 四条楼梯（宽 2.5，5 级，每级 0.5 高、0.6 深）
    addStairs(0, -4, 'N', 2.5, 5, 0.5, 0.6);
    addStairs(0, 4, 'S', 2.5, 5, 0.5, 0.6);
    addStairs(4, 0, 'E', 2.5, 5, 0.5, 0.6);
    addStairs(-4, 0, 'W', 2.5, 5, 0.5, 0.6);

    // 台顶四个方向的矮墙掩体（提供蹲位掩护）
    // 使用 solidAt 风格手动放置（顶部在 H 之上）
    function railAt(x, z, w, d) {
        const h = 0.6;
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ map: brickTex })
        );
        m.position.set(x, H + h / 2, z);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        wallMeshes.push(m);
        colliders.push({
            x0: x - w / 2, x1: x + w / 2,
            z0: z - d / 2, z1: z + d / 2,
            top: H + h, bottom: H
        });
    }
    // 四个角落各放一段矮墙（不挡楼梯）
    railAt(-3, -3, 1.8, 0.4);
    railAt(3, -3, 1.8, 0.4);
    railAt(-3, 3, 1.8, 0.4);
    railAt(3, 3, 1.8, 0.4);
})();

// ============================================================
// 侧翼平台 ×2（6×6，高 3.0）—— 斜对角远程视野
// ============================================================
(function westPlatform() {
    // 西北平台
    const H = 3.0;
    solid(-15, 15, 6, H, 6, concreteTex);
    addPlatform(-15, 15, 6, 6, H);
    // 楼梯：从东侧（朝向中心）延伸
    addStairs(-12, 15, 'E', 2.5, 6, 0.5, 0.6);
})();

(function eastPlatform() {
    // 东南平台
    const H = 3.0;
    solid(15, -15, 6, H, 6, concreteTex);
    addPlatform(15, -15, 6, 6, H);
    // 楼梯：从西侧（朝向中心）延伸
    addStairs(12, -15, 'W', 2.5, 6, 0.5, 0.6);
})();

// ============================================================
// 掩体散布（替代大量墙体）
// ============================================================

// ---- 沙袋工事（围绕中央高台，形成低掩体与接近路线） ----
const sandbags = [
    [-6, -8, 3.0, 0.95, 0.8],
    [6, -8, 3.0, 0.95, 0.8],
    [-6, 8, 3.0, 0.95, 0.8],
    [6, 8, 3.0, 0.95, 0.8],
    [-8, -3, 0.8, 0.95, 2.4],
    [-8, 3, 0.8, 0.95, 2.4],
    [8, -3, 0.8, 0.95, 2.4],
    [8, 3, 0.8, 0.95, 2.4],
    // 外围沙袋
    [-20, -10, 2.6, 0.95, 0.8],
    [20, 10, 2.6, 0.95, 0.8],
    [-10, -20, 0.8, 0.95, 2.6],
    [10, 20, 0.8, 0.95, 2.6]
];
sandbags.forEach(([x, z, w, h, d]) => {
    solid(x, z, w, h, d, sandTex);
    addPlatform(x, z, w, d, h);
});

// ---- 木箱（可跳上，形成小跳板） ----
const crateDefs = [
    [-11, 0, 2, 1.4],
    [11, 0, 2, 1.4],
    [0, -11, 2, 1.4],
    [0, 11, 2, 1.4],
    [-19, 7, 2, 1.2],
    [19, -7, 2, 1.2],
    [7, -19, 2, 1.2],
    [-7, 19, 2, 1.2],
    [-19, -19, 2.4, 1.8],
    [19, 19, 2.4, 1.8],
    [-22, 5, 2, 1.0],
    [22, -5, 2, 1.0]
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

// ---- 油桶（小掩体，可堆叠跳跃） ----
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
addBarrel(-13, -13);
addBarrel(-12.2, -13.2);
addBarrel(13, 13);
addBarrel(13.2, 12.2);
addBarrel(-20, -3);
addBarrel(-20, -4);
addBarrel(20, 3);
addBarrel(20, 4);
addBarrel(-3, 20);
addBarrel(3, -20);

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
addCar(-13, 7, 0x6a4a3a);
addCar(13, -7, 0x46586a);
addCar(-7, -13, 0x4a5a3a);
addCar(7, 13, 0x6a3a4a);

// ---- 路灯（减少数量） ----
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
addLamp(20, -20);
addLamp(-20, 20);
addLamp(20, 20);
addLamp(-20, -20);

// ---- 地面杂物 ----
const debrisMats = [0x555a52, 0x6b6154, 0x4a4f45].map(c => new THREE.MeshLambertMaterial({ color: c }));
for (let i = 0; i < 40; i++) {
    const s = 0.15 + Math.random() * 0.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), debrisMats[i % 3]);
    m.position.set((Math.random() - 0.5) * (ARENA * 2 - 4), s * 0.25, (Math.random() - 0.5) * (ARENA * 2 - 4));
    m.rotation.y = Math.random() * 3;
    m.castShadow = true;
    scene.add(m);
}