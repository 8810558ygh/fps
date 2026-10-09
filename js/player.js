// ===== js/player.js – 玩家构造 + 武器切换（服务器权威版 · 切枪保留弹药修复 v2） =====

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
        p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + MELEE.equipMs;
        p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
        p.meleeIsHeavy = false; p.lastMeleeTime = 0;
        if (p._shadowDisabled) {
            p.gunHolder.traverse(o => { if (o.isMesh) o.castShadow = false; });
        }
        return;
    }

    if (key === 'smoke') {
        p.weaponKey = 'smoke'; p.weapon = SMOKE;
        p.isMelee = false; p.isSmoke = true; p.isFlash = false;
        while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
        p.gunHolder.add(makeWeaponModel('smoke', p.mat));
        while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
        p.vm.add(makeViewmodel('smoke', p.mat));
        p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + 400;
        if (p._shadowDisabled) {
            p.gunHolder.traverse(o => { if (o.isMesh) o.castShadow = false; });
        }
        return;
    }

    if (key === 'flash') {
        p.weaponKey = 'flash'; p.weapon = FLASH;
        p.isMelee = false; p.isSmoke = false; p.isFlash = true;
        while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
        p.gunHolder.add(makeWeaponModel('flash', p.mat));
        while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
        p.vm.add(makeViewmodel('flash', p.mat));
        p.reloadEnd = 0;
        p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
        if (p.input) p.input.aim = false;
        p.equipEnd = performance.now() + 400;
        if (p._shadowDisabled) {
            p.gunHolder.traverse(o => { if (o.isMesh) o.castShadow = false; });
        }
        return;
    }

    // ============================================================
    // 枪械分支
    // ============================================================
    const w = WEAPONS[key];
    if (!w) return;

    const comingBackFromNonGun = (p.isMelee || p.isSmoke || p.isFlash);
    const isPrimaryGun = (p.primaryWeaponKey === key);
    const shouldPreserveAmmo = comingBackFromNonGun && isPrimaryGun;

    p.weaponKey = key; p.primaryWeaponKey = key; p.weapon = w;
    p.isMelee = false; p.isSmoke = false; p.isFlash = false;
    while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
    p.gunHolder.add(makeWeaponModel(key, p.mat));
    while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
    p.vm.add(makeViewmodel(key, p.mat));

    if (!shouldPreserveAmmo) {
        p.ammo = w.mag;
        p.reserve = w.startReserve;
    }
    p.reloadEnd = 0;

    p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
    if (p.input) p.input.aim = false;
    p.spinUpProgress = 0; p.lastShotTime = 0;
    p.damageDealt = {};
    p.recoilVertical = 0; p.recoilHorizontal = 0;
    p.shotCount = 0; p.lastRecoilTime = 0;
    p.equipEnd = performance.now() + 500;
    p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
    p.meleeIsHeavy = false;

    // ★ 切枪时重置后坐力状态
    if (p.recoil) {
        p.recoil.offsetPitch = 0;
        p.recoil.offsetYaw = 0;
        p.recoil.bulletCount = 0;
        p.recoil.lastShotTime = 0;
        p.recoil.horizontalDir = 1;
    }

    if (p._shadowDisabled) {
        p.gunHolder.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }
}

// ============================================================
// ★ 通用武器模型切换函数
// ============================================================
function applyWeaponToPlayer(p, key, withViewmodel) {
    if (!p) return;

    while (p.gunHolder.children.length) {
        p.gunHolder.remove(p.gunHolder.children[0]);
    }
    if (withViewmodel && p.vm) {
        while (p.vm.children.length) {
            p.vm.remove(p.vm.children[0]);
        }
    }

    let isMelee = false, isSmoke = false, isFlash = false;
    let weapon = null, weaponKey = null;

    if (key === 'knife') {
        isMelee = true;
        weaponKey = 'knife';
        weapon = MELEE;
    } else if (key === 'smoke') {
        isSmoke = true;
        weaponKey = 'smoke';
        weapon = SMOKE;
    } else if (key === 'flash') {
        isFlash = true;
        weaponKey = 'flash';
        weapon = FLASH;
    } else if (WEAPONS[key]) {
        weaponKey = key;
        weapon = WEAPONS[key];
    } else {
        return;
    }

    if (typeof makeWeaponModel === 'function') {
        p.gunHolder.add(makeWeaponModel(key, p.mat));
    }
    if (withViewmodel && p.vm && typeof makeViewmodel === 'function') {
        p.vm.add(makeViewmodel(key, p.mat));
    }

    if (p._shadowDisabled) {
        p.gunHolder.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }

    p.isMelee   = isMelee;
    p.isSmoke   = isSmoke;
    p.isFlash   = isFlash;
    p.weaponKey = weaponKey;
    p.weapon    = weapon;
}
window.applyWeaponToPlayer = applyWeaponToPlayer;

// ============================================================
// ★ 暴露某个玩家所有可命中网格
// ============================================================
function getPlayerHitMeshes(p) {
    if (!p) return [];
    return [
        p.head,
        p.body,
        p.visor,
        p.pack,
        p.legL, p.legR,
        p.footL, p.footR,
        p.armLUp, p.armLLow,
        p.armRUp, p.armRLow,
        p.handL, p.handR
    ];
}
window.getPlayerHitMeshes = getPlayerHitMeshes;

// ============================================================
// makePlayer
// ============================================================
function makePlayer(id, color, spawn, weaponKey) {
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
    const g = new THREE.Group();

    // ---- 头 ----
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.30), mat);
    head.position.y = 1.69;
    head.userData.part = 'head';

    // ---- 面罩 ----
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.05), DARK_MAT);
    visor.position.set(0, 1.70, -0.17);
    visor.userData.part = 'head';

    // ---- 背包 ----
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.16), DARK_MAT);
    pack.position.set(0, 1.24, 0.24);
    pack.userData.part = 'body';

    // ---- 躯干 ----
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.32), mat);
    body.position.y = 1.23;
    body.userData.part = 'body';

    // ---- 腿 × 2 ----
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.84, 0.24), mat);
    legL.position.set(-0.12, 0.50, 0);
    legL.userData.part = 'leg';
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.84, 0.24), mat);
    legR.position.set( 0.12, 0.50, 0);
    legR.userData.part = 'leg';

    // ---- 脚 × 2 ----
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.34), DARK_MAT);
    footL.position.set(-0.12, 0.04, -0.06);
    footL.userData.part = 'leg';
    const footR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.34), DARK_MAT);
    footR.position.set( 0.12, 0.04, -0.06);
    footR.userData.part = 'leg';

    // ---- 上臂 × 2 ----
    const armLUp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), mat);
    armLUp.position.set(-0.31, 1.32, 0);
    armLUp.userData.part = 'body';
    const armRUp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), mat);
    armRUp.position.set( 0.31, 1.32, 0);
    armRUp.userData.part = 'body';

    // ---- 前臂 × 2 ----
    const armLLow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), mat);
    armLLow.position.set(-0.31, 1.02, 0);
    armLLow.userData.part = 'body';
    const armRLow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), mat);
    armRLow.position.set( 0.31, 1.02, 0);
    armRLow.userData.part = 'body';

    // ---- 手 × 2 ----
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.14), DARK_MAT);
    handL.position.set(-0.31, 0.80, 0);
    handL.userData.part = 'body';
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.14), DARK_MAT);
    handR.position.set( 0.31, 0.80, 0);
    handR.userData.part = 'body';

    // ---- 武器挂点 ----
    const gunHolder = new THREE.Group();
    gunHolder.position.set(0.26, 1.28, -0.42);
    const light = new THREE.PointLight(0xffcc66, 0, 9);
    light.position.set(0.26, 1.3, -0.85);

    g.add(
        body, head, visor, pack,
        legL, legR, footL, footR,
        armLUp, armLLow, armRUp, armRLow,
        handL, handR,
        gunHolder, light
    );

    const flashIndicator = new THREE.Group();
    flashIndicator.position.set(0, 1.69, -0.28);
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
        id, mesh: g, mat, muzzle: light, gunHolder, cam, vm, vmMuzzle,
        flashIndicator,

        head,
        body,
        visor,
        pack,
        legL, legR,
        footL, footR,
        armLUp, armLLow, armRUp, armRLow,
        handL, handR,

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
        _shadowDisabled: false,

        // ============================================================
        // ★★★ 后坐力状态（独立于玩家基础瞄准 p.pitch / p.yaw）★★★
        //
        //   摄像机实际方向 = (p.pitch + recoil.offsetPitch,
        //                     p.yaw   + recoil.offsetYaw)
        //
        //   鼠标输入只修改 p.pitch / p.yaw（基础瞄准）
        //   后坐力只修改 recoil.offsetPitch / offsetYaw
        //   松手后偏移量指数衰减回 0（见 updatePlayer 的恢复逻辑）
        // ============================================================
        recoil: {
            offsetPitch: 0,          // 垂直后坐力累积（弧度，正值 = 向上看）
            offsetYaw: 0,            // 水平后坐力累积（弧度，正值 = 向左偏）
            bulletCount: 0,          // 当前连发子弹计数（决定后坐力强度）
            lastShotTime: 0,         // 上次开火时间（用于判断连发/新序列）
            horizontalDir: 1,        // 水平方向（1 = 右，-1 = 左）
        },

        _netTargetPos: new THREE.Vector3(spawn.x, 0, spawn.z),
        _netTargetYaw: spawn.yaw,

        input: {
            forward: 0,
            right: 0,
            jump: false,
            crouch: false,
            fire: false,
            aim: false
        }
    };

    if (window.PHYSICS && window.PHYSICS.isReady()) {
        window.PHYSICS.createPlayerBody(p);
    }

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