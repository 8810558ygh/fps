// ===== js/player.js – 玩家构造 + 武器切换（每把枪独立弹药） =====

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

    // ============================================================
    // ★ 切换前保存当前枪械的弹药
    //   （无论切到哪把枪/刀/烟/闪，都先把当前枪的弹药存起来）
    // ============================================================
    if (!p.weaponAmmo) p.weaponAmmo = {};
    if (p.weapon && p.weapon.mag !== undefined
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        p.weaponAmmo[p.weaponKey] = { ammo: p.ammo, reserve: p.reserve };
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

    // 枪械分支
    const w = WEAPONS[key];
    if (!w) return;

    p.weaponKey = key; p.primaryWeaponKey = key; p.weapon = w;
    p.isMelee = false; p.isSmoke = false; p.isFlash = false;
    while (p.gunHolder.children.length) p.gunHolder.remove(p.gunHolder.children[0]);
    p.gunHolder.add(makeWeaponModel(key, p.mat));
    while (p.vm.children.length) p.vm.remove(p.vm.children[0]);
    p.vm.add(makeViewmodel(key, p.mat));

    // ============================================================
    // ★ 从独立弹药记录恢复（首次访问该枪则初始化为标准弹药）
    //   换枪不会重置弹药 —— 每把枪各自记录
    // ============================================================
    if (!p.weaponAmmo[key]) {
        p.weaponAmmo[key] = { ammo: w.mag, reserve: w.startReserve };
    }
    p.ammo = p.weaponAmmo[key].ammo;
    p.reserve = p.weaponAmmo[key].reserve;

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
// ★ 通用武器模型切换函数（网络同步用，不改弹药）
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
        isMelee = true; weaponKey = 'knife'; weapon = MELEE;
    } else if (key === 'smoke') {
        isSmoke = true; weaponKey = 'smoke'; weapon = SMOKE;
    } else if (key === 'flash') {
        isFlash = true; weaponKey = 'flash'; weapon = FLASH;
    } else if (WEAPONS[key]) {
        weaponKey = key; weapon = WEAPONS[key];
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
// 暴露玩家可命中网格
// ============================================================
function getPlayerHitMeshes(p) {
    if (!p) return [];
    return [
        p.head, p.body, p.visor, p.pack,
        p.legL, p.legR, p.footL, p.footR,
        p.armLUp, p.armLLow, p.armRUp, p.armRLow,
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

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.30), mat);
    head.position.y = 1.69;
    head.userData.part = 'head';

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.05), DARK_MAT);
    visor.position.set(0, 1.70, -0.17);
    visor.userData.part = 'head';

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.16), DARK_MAT);
    pack.position.set(0, 1.24, 0.24);
    pack.userData.part = 'body';

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.32), mat);
    body.position.y = 1.23;
    body.userData.part = 'body';

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.84, 0.24), mat);
    legL.position.set(-0.12, 0.50, 0);
    legL.userData.part = 'leg';
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.84, 0.24), mat);
    legR.position.set( 0.12, 0.50, 0);
    legR.userData.part = 'leg';

    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.34), DARK_MAT);
    footL.position.set(-0.12, 0.04, -0.06);
    footL.userData.part = 'leg';
    const footR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.34), DARK_MAT);
    footR.position.set( 0.12, 0.04, -0.06);
    footR.userData.part = 'leg';

    const armLUp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), mat);
    armLUp.position.set(-0.31, 1.32, 0);
    armLUp.userData.part = 'body';
    const armRUp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.16), mat);
    armRUp.position.set( 0.31, 1.32, 0);
    armRUp.userData.part = 'body';

    const armLLow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), mat);
    armLLow.position.set(-0.31, 1.02, 0);
    armLLow.userData.part = 'body';
    const armRLow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), mat);
    armRLow.position.set( 0.31, 1.02, 0);
    armRLow.userData.part = 'body';

    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.14), DARK_MAT);
    handL.position.set(-0.31, 0.80, 0);
    handL.userData.part = 'body';
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.14), DARK_MAT);
    handR.position.set( 0.31, 0.80, 0);
    handR.userData.part = 'body';

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

    // 闪光指示器
    const flashIndicator = new THREE.Group();
    flashIndicator.position.set(0, 1.69, -0.28);
    flashIndicator.visible = false;

    const fiSphereMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending
    });
    const fiSphere = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), fiSphereMat);
    fiSphere.renderOrder = 100;
    fiSphere.castShadow = false;
    flashIndicator.add(fiSphere);

    const fiHaloMat = new THREE.MeshBasicMaterial({
        color: 0xfff4c0, transparent: true, opacity: 0.45,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const fiHalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), fiHaloMat);
    fiHalo.renderOrder = 99;
    fiHalo.castShadow = false;
    flashIndicator.add(fiHalo);

    flashIndicator.userData.sphere = fiSphere;
    flashIndicator.userData.halo   = fiHalo;

    g.add(flashIndicator);

    // 易伤指示器
    const vulnIndicator = new THREE.Group();
    vulnIndicator.position.set(0, 1.0, 0);
    vulnIndicator.visible = false;

    const vulnSphereMat = new THREE.MeshBasicMaterial({
        color: 0xaa44ff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    });
    const vulnSphere = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), vulnSphereMat);
    vulnSphere.renderOrder = 97;
    vulnSphere.castShadow = false;
    vulnIndicator.add(vulnSphere);

    const vulnCoreMat = new THREE.MeshBasicMaterial({
        color: 0xcc66ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const vulnCore = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), vulnCoreMat);
    vulnCore.renderOrder = 98;
    vulnCore.castShadow = false;
    vulnIndicator.add(vulnCore);

    vulnIndicator.userData.sphere = vulnSphere;
    vulnIndicator.userData.core   = vulnCore;

    g.add(vulnIndicator);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    fiSphere.castShadow = false;
    fiHalo.castShadow = false;
    vulnSphere.castShadow = false;
    vulnCore.castShadow = false;
    scene.add(g);

    const cam = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
    cam.rotation.order = 'YXZ';
    scene.add(cam);
    const vm = new THREE.Group();
    cam.add(vm);

    const p = {
        id, mesh: g, mat, muzzle: light, gunHolder, cam, vm,
        flashIndicator,
        vulnIndicator,

        head, body, visor, pack,
        legL, legR, footL, footR,
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

        // ★ 每把枪的独立弹药记录
        weaponAmmo: {},

        recoil: {
            offsetPitch: 0,
            offsetYaw: 0,
            bulletCount: 0,
            lastShotTime: 0,
            horizontalDir: 1,
        },

        _netTargetPos: new THREE.Vector3(spawn.x, 0, spawn.z),
        _netTargetYaw: spawn.yaw,

        zipline: { active: false, lineIdx: -1, t: 0, dir: 1 },
        _zipStunPending: false,
        stunUntil: 0,
        vulnerableUntil: 0,

        input: {
            forward: 0, right: 0, jump: false,
            crouch: false, fire: false, aim: false
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