// ===== js/player.js – 玩家构造 + 武器切换（服务器权威版） =====

function setWeapon(p, key) {
    if (p.throwFuseActive && p.throwFuseInHand) {
        const isClient = (typeof gameMode !== 'undefined'
            && gameMode === 'online'
            && typeof NET !== 'undefined'
            && !NET.isHost);
        if (!isClient) {
            const isCombat = (typeof gameState === 'undefined' || gameState === 'combat');
            if (isCombat && typeof window.dropFuseInPlace === 'function') {
                window.dropFuseInPlace(p);
            } else {
                p.throwFuseActive = false;
                p.throwFuseType = null;
                p.throwFuseInHand = false;
            }
        }
    }

    if (key === 'knife') {
        p.weaponKey = 'knife'; p.weapon = MELEE;
        p.isMelee = true; p.isSmoke = false; p.isFlash = false;
        while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
        p.gunHolder.add(makeWeaponModel('knife', p.mat));
        while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
        p.vm.add(makeViewmodel('knife', p.mat));
        p.ammo = 0; p.reserve = 0; p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + MELEE.equipMs;
        p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
        p.meleeIsHeavy = false; p.lastMeleeTime = 0;
        return;
    }

    if (key === 'smoke') {
        p.weaponKey = 'smoke'; p.weapon = SMOKE;
        p.isMelee = false; p.isSmoke = true; p.isFlash = false;
        while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
        p.gunHolder.add(makeWeaponModel('smoke', p.mat));
        while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
        p.vm.add(makeViewmodel('smoke', p.mat));
        p.ammo = 0; p.reserve = 0; p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + 400;
        return;
    }

    if (key === 'flash') {
        p.weaponKey = 'flash'; p.weapon = FLASH;
        p.isMelee = false; p.isSmoke = false; p.isFlash = true;
        while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
        p.gunHolder.add(makeWeaponModel('flash', p.mat));
        while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
        p.vm.add(makeViewmodel('flash', p.mat));
        p.ammo = 0; p.reserve = 0; p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + 400;
        return;
    }

    const w = WEAPONS[key];
    if (!w) return;
    p.weaponKey = key; p.primaryWeaponKey = key; p.weapon = w;
    p.isMelee = false; p.isSmoke = false; p.isFlash = false;
    while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
    p.gunHolder.add(makeWeaponModel(key, p.mat));
    while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
    p.vm.add(makeViewmodel(key, p.mat));
    p.ammo = w.mag; p.reserve = w.startReserve; p.reloadEnd = 0;
    p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
    if (p.input) p.input.aim = false;
    p.spinUpProgress = 0; p.lastShotTime = 0;
    p.damageDealt = {};
    p.recoilVertical = 0; p.recoilHorizontal = 0;
    p.shotCount = 0; p.lastRecoilTime = 0;
    p.equipEnd = performance.now() + 500;
    p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
    p.meleeIsHeavy = false;
}

function makePlayer(id, color, spawn, weaponKey) {
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.42), mat);
    body.position.y = 0.95; body.userData.part = 'body';
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.44), mat);
    head.position.y = 1.62; head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), DARK_MAT);
    visor.position.set(0, 1.64, -0.23);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.22), DARK_MAT);
    pack.position.set(0, 1.05, 0.32);
    const gunHolder = new THREE.Group();
    gunHolder.position.set(0.26, 1.28, -0.42);
    const light = new THREE.PointLight(0xffcc66, 0, 9);
    light.position.set(0.26, 1.3, -0.85);
    g.add(body, head, visor, pack, gunHolder, light);

    // ★ 闪光指示器：被闪光弹命中时在角色眼前显示光晕
    const flashIndicator = new THREE.Group();
    flashIndicator.position.set(0, 1.62, -0.28);
    flashIndicator.visible = false;

    const fiSphereMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const fiSphere = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), fiSphereMat);
    fiSphere.renderOrder = 100;
    fiSphere.castShadow = false;
    flashIndicator.add(fiSphere);

    const fiHaloMat = new THREE.MeshBasicMaterial({
        color: 0xfff4c0,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const fiHalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), fiHaloMat);
    fiHalo.renderOrder = 99;
    fiHalo.castShadow = false;
    flashIndicator.add(fiHalo);

    const fiLight = new THREE.PointLight(0xffffff, 0, 8);
    fiLight.position.set(0, 0, 0);
    flashIndicator.add(fiLight);

    flashIndicator.userData.sphere = fiSphere;
    flashIndicator.userData.halo   = fiHalo;
    flashIndicator.userData.light  = fiLight;

    g.add(flashIndicator);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    fiSphere.castShadow = false;
    fiHalo.castShadow = false;
    scene.add(g);

    const cam = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
    cam.rotation.order = 'YXZ';
    scene.add(cam);
    const vm = new THREE.Group();
    cam.add(vm);
    const vmMuzzle = new THREE.PointLight(0xffcc66, 0, 7);
    vmMuzzle.position.set(0.28, -0.18, -1.3);
    cam.add(vmMuzzle);

    const p = {
        id, mesh: g, body, head, mat, muzzle: light, gunHolder, cam, vm, vmMuzzle,
        flashIndicator,
        weaponKey: weaponKey || 'rifle',
        primaryWeaponKey: weaponKey || 'rifle',
        weapon: WEAPONS[weaponKey || 'rifle'],
        isMelee: false, isSmoke: false, isFlash: false,
        aiming: false, aimStage: 0, boltEnd: 0,
        pos: new THREE.Vector3(spawn.x, 0, spawn.z),
        spawn, yaw: spawn.yaw, pitch: 0,
        vy: 0, prevY: 0, onGround: true,
        height: HEIGHT_STAND, eyeH: EYE_STAND,
        hp: HP_MAX, armor: ARMOR_MAX,
        ammo: 30, reserve: 60, reloadEnd: 0, nextShot: 0,
        deadUntil: 0, invulnUntil: 0, score: 0,
        baseVisible: true,
        spinUpProgress: 0, lastShotTime: 0, damageDealt: {},
        recoilVertical: 0, recoilHorizontal: 0, shotCount: 0, lastRecoilTime: 0,
        equipEnd: 0,
        meleeCombo: 0, meleeEnd: 0, meleeRecovery: 0,
        meleeIsHeavy: false, lastMeleeTime: 0,
        smokeCharges: SMOKE.maxPerRound,
        smokeCooldownEnd: 0,
        lastSmokeThrowAt: 0,
        flashCharges: FLASH.maxPerRound,
        flashCooldownEnd: 0,
        lastFlashThrowAt: 0,
        flashUntil: 0,
        throwFuseActive: false,
        throwFuseType: null,
        throwFuseStart: 0,
        throwFuseEnd: 0,
        throwFuseInHand: false,

        input: {
            forward: 0,
            right: 0,
            jump: false,
            crouch: false,
            fire: false,
            aim: false
        }
    };
    setWeapon(p, weaponKey || 'rifle');
    p.equipEnd = 0;
    return p;
}

const p1 = makePlayer(1, 0x3a7bd5, { x: -21, z: -21, yaw: -3 * Math.PI / 4 }, 'rifle');
const p2 = makePlayer(2, 0xd54a3a, { x: 21, z: 21, yaw: Math.PI / 4 }, 'rifle');

p2.mesh.position.copy(p2.pos);
p2.mesh.rotation.y = p2.yaw;
p2.gunHolder.visible = false;

const players = [p1, p2];
const other = p => p === p1 ? p2 : p1;