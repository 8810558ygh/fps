// ===== js/player.js – 玩家构造 + 武器建模（含奥丁） =====
const DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
const LENS_MAT = new THREE.MeshLambertMaterial({ color: 0x8fe8ff, emissive: 0x35b6d5, emissiveIntensity: 0.7 });

function makeWeaponModel(type, mat) {
    const g = new THREE.Group();
    if (type === 'sniper') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 1.1), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.04, -0.85);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), DARK_MAT);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.04, -1.2);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10), mat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.16, -0.1);
        const lensF = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10), LENS_MAT);
        lensF.rotation.x = Math.PI / 2;
        lensF.position.set(0, 0.16, -0.28);
        const lensB = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), LENS_MAT);
        lensB.rotation.x = Math.PI / 2;
        lensB.position.set(0, 0.16, 0.08);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.4), mat);
        stock.position.set(0, -0.02, 0.62);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.14), DARK_MAT);
        magz.position.set(0, -0.14, 0.15);
        g.add(body, barrel, muzzle, scope, lensF, lensB, stock, magz);
    } else if (type === 'shotgun') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.6), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.45);
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
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.55);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.14), mat);
        magz.position.set(0, -0.22, 0.0);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.4), mat);
        stock.position.set(0, -0.02, 0.45);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), DARK_MAT);
        grip.position.set(0, -0.12, 0.0);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.12), DARK_MAT);
        sight.position.set(0, 0.15, -0.2);
        g.add(body, barrel, magz, stock, grip, sight);
    } else { // rifle
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.8), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.45), DARK_MAT);
        barrel.position.set(0, 0.04, -0.58);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.15), mat);
        magz.position.set(0, -0.17, 0.02);
        magz.rotation.x = 0.18;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), mat);
        stock.position.set(0, -0.01, 0.48);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.12), DARK_MAT);
        sight.position.set(0, 0.13, -0.25);
        g.add(body, barrel, magz, stock, sight);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}

function makeViewmodel(type, mat) {
    const g = new THREE.Group();
    if (type === 'sniper') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.9), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.035, -0.75);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), mat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.14, -0.05);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 10), LENS_MAT);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.14, -0.21);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.34), mat);
        stock.position.set(0, -0.03, 0.5);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.12), DARK_MAT);
        magz.position.set(0, -0.12, 0.1);
        g.add(body, barrel, scope, lens, stock, magz);
        g.position.set(0.26, -0.26, -0.55);
        g.rotation.y = 0.02;
    } else if (type === 'shotgun') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.5), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.25, 8), DARK_MAT);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.4);
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
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.5);
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
    } else { // rifle
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.65), DARK_MAT);
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), DARK_MAT);
        barrel.position.set(0, 0.03, -0.5);
        const magz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.13), mat);
        magz.position.set(0, -0.14, 0);
        magz.rotation.x = 0.18;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.26), mat);
        stock.position.set(0, -0.02, 0.4);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.1), DARK_MAT);
        sight.position.set(0, 0.11, -0.2);
        g.add(body, barrel, magz, stock, sight);
        g.position.set(0.28, -0.28, -0.5);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return g;
}

function setWeapon(p, key) {
    const w = WEAPONS[key];
    p.weapon = w;
    while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
    p.gunHolder.add(makeWeaponModel(key, p.mat));
    while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
    p.vm.add(makeViewmodel(key, p.mat));
    p.ammo = w.mag;
    p.reserve = w.startReserve;
    p.reloadEnd = 0;
    p.aiming = false;
    p.spinUpProgress = 0;
    p.lastShotTime = 0;
    p.damageDealt = {};
    p.recoilVertical = 0;
    p.recoilHorizontal = 0;
    p.shotCount = 0;
    p.lastRecoilTime = 0;
}

// 创建玩家（玩家1）
function makePlayer(id, color, spawn, weaponKey) {
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.42), mat);
    body.position.y = 0.95;
    body.userData.part = 'body';
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.44), mat);
    head.position.y = 1.62;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), DARK_MAT);
    visor.position.set(0, 1.64, -0.23);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.22), DARK_MAT);
    pack.position.set(0, 1.05, 0.32);
    const gunHolder = new THREE.Group();
    gunHolder.position.set(0.26, 1.28, -0.42);
    const light = new THREE.PointLight(0xffcc66, 0, 9);
    light.position.set(0.26, 1.3, -0.85);
    g.add(body, head, visor, pack, gunHolder, light);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);

    // 摄像机：完整窗口宽高比（不再是分屏遗留的 /2），远裁剪面扩大到 250 以适应大地图
    const cam = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
    cam.rotation.order = 'YXZ';
    scene.add(cam);
    const vm = new THREE.Group();
    cam.add(vm);
    const vmMuzzle = new THREE.PointLight(0xffcc66, 0, 7);
    vmMuzzle.position.set(0.28, -0.18, -1.3);
    cam.add(vmMuzzle);

    const p = {
        id,
        mesh: g,
        body,
        head,
        mat,
        muzzle: light,
        gunHolder,
        cam,
        vm,
        vmMuzzle,
        weapon: WEAPONS.rifle,
        aiming: false,
        pos: new THREE.Vector3(spawn.x, 0, spawn.z),
        spawn,
        yaw: spawn.yaw,
        pitch: 0,
        vy: 0,
        prevY: 0,
        onGround: true,
        height: HEIGHT_STAND,
        eyeH: EYE_STAND,
        hp: HP_MAX,
        ammo: 30,
        reserve: 60,
        reloadEnd: 0,
        nextShot: 0,
        deadUntil: 0,
        invulnUntil: 0,
        score: 0,
        baseVisible: true,
        spinUpProgress: 0,
        lastShotTime: 0,
        damageDealt: {},
        recoilVertical: 0,
        recoilHorizontal: 0,
        shotCount: 0,
        lastRecoilTime: 0
    };
    setWeapon(p, weaponKey || 'rifle');
    return p;
}

// 创建靶子（玩家2）
function makeTarget(id, color, spawn) {
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.42), mat);
    body.position.y = 0.95;
    body.userData.part = 'body';
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.44), mat);
    head.position.y = 1.62;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), DARK_MAT);
    visor.position.set(0, 1.64, -0.23);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.22), DARK_MAT);
    pack.position.set(0, 1.05, 0.32);
    g.add(body, head, visor, pack);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);

    const target = {
        id,
        mesh: g,
        body,
        head,
        mat,
        pos: new THREE.Vector3(spawn.x, 0, spawn.z),
        spawn: spawn,
        yaw: spawn.yaw,
        pitch: 0,
        hp: HP_MAX,
        deadUntil: 0,
        invulnUntil: 0,
        score: 0,
        baseVisible: true,
    };
    return target;
}

// ★ 出生点随地图放大到 ±30（两端对应两边角落）
const p1 = makePlayer(1, 0x3a7bd5, { x: -30, z: -30, yaw: -3 * Math.PI / 4 }, 'rifle');
const p2 = makeTarget(2, 0xd54a3a, { x: 30, z: 30, yaw: Math.PI / 4 });
const players = [p1, p2];
const other = p => p === p1 ? p2 : p1;