// ===== js/survival/zombie.js – 僵尸系统 =====
//
// 模型策略：
//   · 所有类型都使用 js/survival/zombies/zombie_normal_model.js
//   · 通过 sizeMul 缩放：normal 1.0 / small 0.7 / big 2.0
//   · legacy 方块模型仅在无法加载新模型时作为回退

const ZOMBIE_TYPES = {

    normal: {
        name: '普通僵尸',
        hp: 120,
        speedMul: 0.8,
        attackDamage: 15,
        attackRange: 1.6,
        attackHeight: 2.0,
        attackCooldown: 1000,
        jumpV: 11,
        sizeMul: 1.0,
        color: 0x4a6a3a,
        headColor: 0x5a7a4a,
        darkColor: 0x2a3a2a,
        ai: null,
    },

    small: {
        name: '小僵尸',
        hp: 70,
        speedMul: 1.3,
        attackDamage: 10,
        attackRange: 1.2,
        attackHeight: 1.6,
        attackCooldown: 800,
        jumpV: 13,
        sizeMul: 0.7,
        color: 0x8a3a3a,
        headColor: 0xaa4a4a,
        darkColor: 0x3a1a1a,
        ai: null,
    },

    big: {
        name: '大僵尸',
        hp: 450,
        speedMul: 0.5,
        attackDamage: 30,
        attackRange: 2.2,
        attackHeight: 2.6,
        attackCooldown: 1400,
        jumpV: 8,
        sizeMul: 2.0,
        color: 0x2a3a4a,
        headColor: 0x3a4a5a,
        darkColor: 0x1a2a3a,
        ai: null,
    },
};

const ZOMBIE_ELITE_TYPES = ['small', 'big'];

const ZOMBIE_JUMP_COOLDOWN    = 900;
const ZOMBIE_STUCK_THRESHOLD  = 0.3;
const ZOMBIE_STUCK_MOVE_RATIO = 0.3;
const ZOMBIE_POOL_SIZE        = 32;

const ZOMBIE_BASE_HEIGHT = 1.8;
const ZOMBIE_BASE_EYE_H  = 1.6;

// 僵尸间分离参数
const ZOMBIE_SEPARATION_RADIUS   = 0.50;
const ZOMBIE_SEPARATION_STRENGTH = 0.55;

// ============================================================
// ★ 无限模式属性加成
//
//   每多循环一轮（endlessLoop +1）：
//     · 血量  ×(1 + 0.15 * loop)
//     · 攻击  ×(1 + 0.08 * loop)
//     · 金币  ×(1 + 0.20 * loop)
// ============================================================
function _getEndlessLoop() {
    return (typeof SurvivalState !== 'undefined' && SurvivalState)
        ? (SurvivalState.endlessLoop || 0)
        : 0;
}

function _getEndlessHpMul() {
    return 1 + 0.15 * _getEndlessLoop();
}

function _getEndlessDmgMul() {
    return 1 + 0.08 * _getEndlessLoop();
}

function _getEndlessCoinMul() {
    return 1 + 0.20 * _getEndlessLoop();
}

// ============================================================
// 波次生成
//
//   wave：本轮内的"等效全局波次"（battlefield 1~5, desert 6~10）
//   extraNormals：无限模式额外加普通僵尸的数量
//
//   ★ 演奏僵尸：只占第一个精英位，无限模式 + 本波 ≥ 3 波 + 25% 概率
// ============================================================
function buildWaveComposition(wave, extraNormals) {
    const total  = 3 + wave * 2;
    const elites = Math.max(0, wave - 2);
    const normals = Math.max(0, total - elites) + (extraNormals || 0);

    const list = [];
    for (let i = 0; i < normals; i++) list.push('normal');

    const elitePool = (typeof ZOMBIE_ELITE_TYPES !== 'undefined' && ZOMBIE_ELITE_TYPES.length > 0)
        ? ZOMBIE_ELITE_TYPES
        : ['small'];

    // ============================================================
    // ★ 演奏僵尸：只占第一个精英位，每波最多 1 只
    // ============================================================
    let musicianSpawned = false;

    for (let i = 0; i < elites; i++) {
        if (!musicianSpawned
            && typeof PlayerZombie !== 'undefined'
            && PlayerZombie.canSpawn(wave)
            && Math.random() < 0.25) {
            list.push('musician');
            musicianSpawned = true;
            continue;
        }

        const t = elitePool[Math.floor(Math.random() * elitePool.length)];
        list.push(t);
    }

    return list;
}

// ============================================================
// legacy 方块僵尸模型（仅作回退）
// ============================================================
function _makeLegacyZombieMesh() {
    const matBody = new THREE.MeshLambertMaterial({ color: 0x4a6a3a });
    const matDark = new THREE.MeshLambertMaterial({ color: 0x2a3a2a });
    const matHead = new THREE.MeshLambertMaterial({ color: 0x5a7a4a });

    const g = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.70, 0.30), matBody);
    body.position.y = 1.05;
    body.userData.part = 'zombie_body';

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.30), matHead);
    head.position.y = 1.60;
    head.userData.part = 'zombie_head';

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), matBody);
    armL.position.set(-0.32, 1.10, 0);
    armL.userData.part = 'zombie_body';

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), matBody);
    armR.position.set(0.32, 1.10, 0);
    armR.userData.part = 'zombie_body';

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.70, 0.20), matDark);
    legL.position.set(-0.11, 0.35, 0);
    legL.userData.part = 'zombie_leg';

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.70, 0.20), matDark);
    legR.position.set(0.11, 0.35, 0);
    legR.userData.part = 'zombie_leg';

    g.add(body, head, armL, armR, legL, legR);

    body.castShadow = true;
    head.castShadow = true;
    armL.castShadow = false;
    armR.castShadow = false;
    legL.castShadow = false;
    legR.castShadow = false;

    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });

    return { group: g, body, head, armL, armR, legL, legR, pivots: null };
}

// ============================================================
// 池
// ============================================================
const _zombiePool = [];
let _zombiePoolInited = false;

function _initZombiePool() {
    if (_zombiePoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _zombiePoolInited = true;

    const hasNormalModel = !!(window.ZOMBIE_MODEL_NORMAL
        && typeof window.ZOMBIE_MODEL_NORMAL.build === 'function');

    for (let i = 0; i < ZOMBIE_POOL_SIZE; i++) {
        const partsLegacy = _makeLegacyZombieMesh();

        let partsNormal = null;
        if (hasNormalModel) {
            try {
                partsNormal = window.ZOMBIE_MODEL_NORMAL.build();
            } catch (e) {
                console.warn('[zombie] 新模型构建失败，回退 legacy:', e);
                partsNormal = null;
            }
        }

        if (partsNormal) {
            partsNormal.group.visible = false;
            scene.add(partsNormal.group);
        }
        partsLegacy.group.visible = false;
        scene.add(partsLegacy.group);

        const hitLegacy = [
            partsLegacy.head, partsLegacy.body,
            partsLegacy.armL, partsLegacy.armR,
            partsLegacy.legL, partsLegacy.legR,
        ];

        let hitNormal = null;
        if (partsNormal) {
            hitNormal = [
                partsNormal.head, partsNormal.body,
                partsNormal.armL, partsNormal.armR,
                partsNormal.legL, partsNormal.legR,
            ];
        }

        const zombie = {
            _isZombie: true,
            id: 100 + i,
            poolIndex: i,
            alive: false,
            type: 'normal',
            hp: 0,
            maxHp: 0,
            pos: new THREE.Vector3(0, 0, 0),
            yaw: 0,
            height: ZOMBIE_BASE_HEIGHT,
            eyeH: ZOMBIE_BASE_EYE_H,
            deadUntil: 0,
            invulnUntil: 0,
            armor: 0,
            nextAttackTime: 0,

            mesh: partsLegacy.group,
            body: partsLegacy.body,
            head: partsLegacy.head,
            armL: partsLegacy.armL,
            armR: partsLegacy.armR,
            legL: partsLegacy.legL,
            legR: partsLegacy.legR,
            hitMeshes: hitLegacy,

            _partsNormal: partsNormal,
            _partsLegacy: partsLegacy,
            _hitNormal: hitNormal,
            _hitLegacy: hitLegacy,
            _pivots: null,
            _animStyle: 'legacy',
            _animPhase: 0,
            _headPhase: 0,

            vy: 0,
            prevY: 0,
            onGround: true,
            _vyBeforeLand: 0,

            _stuckTime: 0,
            _nextJumpAt: 0,

            _nextGrowlAt: 0,

            _aiState: {},
        };

        for (const m of hitLegacy) m.userData.zombieRef = zombie;
        if (hitNormal) {
            for (const m of hitNormal) m.userData.zombieRef = zombie;
        }

        _zombiePool.push(zombie);
    }

    console.log('[zombie] 僵尸池已初始化:', ZOMBIE_POOL_SIZE,
                '，新模型:', hasNormalModel ? '可用' : '不可用');
}

window.initZombiePool = function () { _initZombiePool(); };

function _acquireZombie() {
    _initZombiePool();
    for (let i = 0; i < _zombiePool.length; i++) {
        if (!_zombiePool[i].alive) return _zombiePool[i];
    }
    return null;
}

// ============================================================
// 切换僵尸模型
// ============================================================
function _switchZombieModel(zombie, type) {
    if (zombie._partsNormal) {
        if (zombie._partsLegacy.group.visible) zombie._partsLegacy.group.visible = false;
        if (!zombie._partsNormal.group.visible) zombie._partsNormal.group.visible = true;

        zombie.mesh  = zombie._partsNormal.group;
        zombie.body  = zombie._partsNormal.body;
        zombie.head  = zombie._partsNormal.head;
        zombie.armL  = zombie._partsNormal.armL;
        zombie.armR  = zombie._partsNormal.armR;
        zombie.legL  = zombie._partsNormal.legL;
        zombie.legR  = zombie._partsNormal.legR;
        zombie.hitMeshes = zombie._hitNormal;
        zombie._pivots = zombie._partsNormal.pivots;
        zombie._animStyle = 'normal';
        return;
    }

    if (zombie._partsNormal && zombie._partsNormal.group.visible) {
        zombie._partsNormal.group.visible = false;
    }
    if (!zombie._partsLegacy.group.visible) zombie._partsLegacy.group.visible = true;

    zombie.mesh  = zombie._partsLegacy.group;
    zombie.body  = zombie._partsLegacy.body;
    zombie.head  = zombie._partsLegacy.head;
    zombie.armL  = zombie._partsLegacy.armL;
    zombie.armR  = zombie._partsLegacy.armR;
    zombie.legL  = zombie._partsLegacy.legL;
    zombie.legR  = zombie._partsLegacy.legR;
    zombie.hitMeshes = zombie._hitLegacy;
    zombie._pivots = null;
    zombie._animStyle = 'legacy';
}

// ============================================================
// 颜色 / 体型
// ============================================================
function _applyZombieColors(zombie, cfg) {
    if (zombie._animStyle === 'normal') return;

    const bodyColor = (cfg.color !== undefined) ? cfg.color : 0x4a6a3a;
    const headColor = (cfg.headColor !== undefined) ? cfg.headColor : bodyColor;
    const darkColor = (cfg.darkColor !== undefined) ? cfg.darkColor : 0x2a3a2a;

    if (zombie.body && zombie.body.material) {
        zombie.body.material.color.setHex(bodyColor);
    }
    if (zombie.head && zombie.head.material) {
        zombie.head.material.color.setHex(headColor);
    }
    if (zombie.legL && zombie.legL.material) {
        zombie.legL.material.color.setHex(darkColor);
    }
}

function _applyZombieSize(zombie, cfg) {
    const sizeMul = (cfg.sizeMul !== undefined) ? cfg.sizeMul : 1.0;

    zombie.mesh.scale.setScalar(sizeMul);
    zombie.height = ZOMBIE_BASE_HEIGHT * sizeMul;
    zombie.eyeH   = ZOMBIE_BASE_EYE_H  * sizeMul;
}

// ============================================================
// 生成
// ============================================================
function spawnZombie(x, z, wave, type) {
    type = type || 'normal';

    // ★ 演奏僵尸：走独立路径，不进池
    if (type === 'musician') {
        if (typeof PlayerZombie !== 'undefined' && PlayerZombie.spawn) {
            return PlayerZombie.spawn(x, z);
        }
        // 兜底：PlayerZombie 未加载 → 降级成普通僵尸
        type = 'normal';
    }

    const cfg = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.normal;

    const zombie = _acquireZombie();
    if (!zombie) {
        console.warn('[zombie] 池已满，无法生成');
        return null;
    }

    const groundY = (typeof terrainGroundAt === 'function')
        ? terrainGroundAt(x, z) : 0;

    // ★ 无限模式血量加成
    const hpMul = _getEndlessHpMul();
    const finalHp = Math.round(cfg.hp * hpMul);

    zombie.alive = true;
    zombie.type = type;
    zombie.hp = finalHp;
    zombie.maxHp = finalHp;
    zombie.pos.set(x, groundY, z);
    zombie.yaw = Math.random() * Math.PI * 2;
    zombie.nextAttackTime = 0;
    zombie.deadUntil = 0;
    zombie.invulnUntil = 0;

    zombie.vy = 0;
    zombie.prevY = groundY;
    zombie.onGround = true;
    zombie._vyBeforeLand = 0;

    zombie._stuckTime = 0;
    zombie._nextJumpAt = 0;

    // ★ 叫声调度初始化（随机错开 0~2 秒）
    if (window.ZombieSounds && typeof window.ZombieSounds.initSchedule === 'function') {
        window.ZombieSounds.initSchedule(zombie, performance.now());
    } else {
        zombie._nextGrowlAt = 0;
    }

    zombie._aiState = {};
    zombie._animPhase = Math.random() * Math.PI * 2;
    zombie._headPhase = Math.random() * Math.PI * 2;

    _switchZombieModel(zombie, type);

    _applyZombieColors(zombie, cfg);
    _applyZombieSize(zombie, cfg);

    zombie.mesh.position.copy(zombie.pos);
    zombie.mesh.rotation.y = zombie.yaw;

    return zombie;
}
window.spawnZombie = spawnZombie;

// ============================================================
// 找最近玩家
// ============================================================
function _findNearestPlayer(zombie) {
    if (typeof getSurvivalPlayers !== 'function') return null;
    const players = getSurvivalPlayers();
    let nearest = null, bestDistSq = Infinity;
    for (const p of players) {
        if (!p) continue;
        if (p.hp <= 0) continue;
        if (p.deadUntil > performance.now()) continue;
        const dx = p.pos.x - zombie.pos.x;
        const dz = p.pos.z - zombie.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) { bestDistSq = d2; nearest = p; }
    }
    return nearest;
}

// ============================================================
// 单僵尸更新
// ============================================================
function updateZombie(zombie, dt, now) {
    if (!zombie.alive) return;

    const cfg = ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;

    // ★ 周期性叫声
    if (window.ZombieSounds && typeof window.ZombieSounds.tick === 'function') {
        window.ZombieSounds.tick(zombie, now);
    }

    if (typeof cfg.ai === 'function') {
        const handled = cfg.ai(zombie, dt, now, cfg);
        if (handled) {
            _applyZombiePhysics(zombie, dt, now, undefined, undefined, undefined, cfg);
            zombie.mesh.position.copy(zombie.pos);
            zombie.mesh.rotation.y = zombie.yaw;
            _updateZombieAnimation(zombie, dt, now, cfg);
            return;
        }
    }

    _defaultZombieAI(zombie, dt, now, cfg);
}

// ============================================================
// 僵尸动画
// ============================================================
function _updateZombieAnimation(zombie, dt, now, cfg) {
    if (zombie._animStyle !== 'normal') return;
    const pivots = zombie._pivots;
    if (!pivots) return;

    const speed = SPEED * cfg.speedMul;
    zombie._animPhase += dt * speed * 2.4;
    const phase = zombie._animPhase;

    pivots.legR.rotation.x =  Math.sin(phase) * 0.78;
    pivots.legL.rotation.x = -Math.sin(phase) * 0.78;

    const ARM_BASE = -Math.PI / 2;
    const armWave  = Math.sin(phase) * 0.11;
    pivots.armR.rotation.x = ARM_BASE + armWave;
    pivots.armL.rotation.x = ARM_BASE - armWave;

    const t = now * 0.001;
    pivots.head.rotation.y = Math.sin(t * 0.62 + zombie._headPhase) * 0.24;
    pivots.head.rotation.x = Math.sin(t * 1.05 + zombie._headPhase) * 0.07;
    pivots.head.rotation.z = Math.sin(t * 0.43 + zombie._headPhase) * 0.035;

    const bob = Math.abs(Math.sin(phase)) * 0.03;
    zombie.mesh.position.y = zombie.pos.y + bob;

    zombie.mesh.rotation.z = Math.sin(phase * 0.5) * 0.012;
}

// ============================================================
// 默认 AI
// ============================================================
function _defaultZombieAI(zombie, dt, now, cfg) {
    const target = _findNearestPlayer(zombie);
    if (!target) {
        zombie.mesh.position.copy(zombie.pos);
        _updateZombieAnimation(zombie, dt, now, cfg);
        return;
    }

    const dx = target.pos.x - zombie.pos.x;
    const dz = target.pos.z - zombie.pos.z;
    const dy = target.pos.y - zombie.pos.y;
    const distH = Math.hypot(dx, dz);

    if (distH > 0.001) {
        zombie.yaw = Math.atan2(-dx, -dz);
    }

    const inAttackRange = (distH <= cfg.attackRange)
                       && (Math.abs(dy) <= cfg.attackHeight);

    const beforeX = zombie.pos.x;
    const beforeZ = zombie.pos.z;

    let intendedMoveDist = 0;
    if (!inAttackRange) {
        if (distH > 0.001) {
            const nx = dx / distH;
            const nz = dz / distH;
            const speed = SPEED * cfg.speedMul;
            intendedMoveDist = speed * dt;
            zombie.pos.x += nx * speed * dt;
            zombie.pos.z += nz * speed * dt;
        }
    } else {
        if (now >= zombie.nextAttackTime) {
            zombie.nextAttackTime = now + cfg.attackCooldown;
            _zombieAttack(zombie, target, cfg);
        }
    }

    _applyZombiePhysics(zombie, dt, now, intendedMoveDist, beforeX, beforeZ, cfg);

    zombie.mesh.position.copy(zombie.pos);
    zombie.mesh.rotation.y = zombie.yaw;

    _updateZombieAnimation(zombie, dt, now, cfg);
}

// ============================================================
// 物理
// ============================================================
function _applyZombiePhysics(zombie, dt, now, intendedMoveDist, beforeX, beforeZ, cfg) {
    cfg = cfg || ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;

    zombie.prevY = zombie.pos.y;
    zombie.vy -= GRAV * dt;
    zombie.pos.y += zombie.vy * dt;
    zombie._vyBeforeLand = zombie.vy;

    if (typeof collideWorld === 'function') {
        collideWorld(zombie);
    }

    if (zombie.pos.y <= 0) {
        zombie.pos.y = 0;
        zombie.vy = 0;
        zombie.onGround = true;
    }
    const gh = (typeof terrainGroundAt === 'function')
        ? terrainGroundAt(zombie.pos.x, zombie.pos.z) : 0;
    if (zombie.pos.y < gh) {
        zombie.pos.y = gh;
        zombie.vy = 0;
        zombie.onGround = true;
    }

    if (intendedMoveDist !== undefined && beforeX !== undefined && beforeZ !== undefined) {
        const actualMoveDist = Math.hypot(
            zombie.pos.x - beforeX,
            zombie.pos.z - beforeZ
        );

        const isMoving = intendedMoveDist > 0.001;
        const isStuck = isMoving && actualMoveDist < intendedMoveDist * ZOMBIE_STUCK_MOVE_RATIO;

        if (isStuck) {
            zombie._stuckTime += dt;
        } else {
            zombie._stuckTime = 0;
        }

        if (zombie._stuckTime > ZOMBIE_STUCK_THRESHOLD
            && zombie.onGround
            && now >= zombie._nextJumpAt) {
            zombie.vy = cfg.jumpV;
            zombie.onGround = false;
            zombie._nextJumpAt = now + ZOMBIE_JUMP_COOLDOWN;
            zombie._stuckTime = 0;
        }
    }
}

// ============================================================
// 更新全部
// ============================================================
function updateAllZombies(dt, now) {
    for (let i = 0; i < _zombiePool.length; i++) {
        const z = _zombiePool[i];
        if (z.alive) updateZombie(z, dt, now);
    }

    _resolveZombieCollisions();
}
window.updateAllZombies = updateAllZombies;

// ============================================================
// 僵尸间分离
// ============================================================
const _collisionBuf = [];

function _resolveZombieCollisions() {
    const alive = _collisionBuf;
    alive.length = 0;
    for (let i = 0; i < _zombiePool.length; i++) {
        if (_zombiePool[i].alive) alive.push(_zombiePool[i]);
    }

    const n = alive.length;
    if (n < 2) return;

    const BASE_R = ZOMBIE_SEPARATION_RADIUS;
    const S      = ZOMBIE_SEPARATION_STRENGTH;

    for (let i = 0; i < n; i++) {
        const a = alive[i];
        const cfgA = ZOMBIE_TYPES[a.type] || ZOMBIE_TYPES.normal;
        const ra = BASE_R * (cfgA.sizeMul || 1);

        for (let j = i + 1; j < n; j++) {
            const b = alive[j];
            const cfgB = ZOMBIE_TYPES[b.type] || ZOMBIE_TYPES.normal;
            const rb = BASE_R * (cfgB.sizeMul || 1);

            const minDist = ra + rb;

            let dx = b.pos.x - a.pos.x;
            let dz = b.pos.z - a.pos.z;
            const d2 = dx * dx + dz * dz;

            if (d2 >= minDist * minDist) continue;

            if (d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const overlap = minDist - d;
                const nx = dx / d;
                const nz = dz / d;
                const push = overlap * S * 0.5;

                a.pos.x -= nx * push;
                a.pos.z -= nz * push;
                b.pos.x += nx * push;
                b.pos.z += nz * push;
            } else {
                const ang = Math.random() * Math.PI * 2;
                const nx = Math.cos(ang);
                const nz = Math.sin(ang);
                const push = minDist * S * 0.5;

                a.pos.x -= nx * push;
                a.pos.z -= nz * push;
                b.pos.x += nx * push;
                b.pos.z += nz * push;
            }
        }
    }

    const half = (typeof window.currentArenaHalf === 'number')
        ? window.currentArenaHalf : ARENA;
    const lim = half - 0.6;

    for (let i = 0; i < n; i++) {
        const z = alive[i];
        if (z.pos.x < -lim) z.pos.x = -lim;
        if (z.pos.x >  lim) z.pos.x =  lim;
        if (z.pos.z < -lim) z.pos.z = -lim;
        if (z.pos.z >  lim) z.pos.z =  lim;

        z.mesh.position.x = z.pos.x;
        z.mesh.position.z = z.pos.z;
    }
}

// ============================================================
// 僵尸攻击玩家
// ============================================================
function _zombieAttack(zombie, target, cfg) {
    if (!target) return;
    if (target.hp <= 0) return;
    if (target.deadUntil > performance.now()) return;

    cfg = cfg || ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;

    const now = performance.now();

    // ★ 攻击时急叫
    if (window.ZombieSounds && typeof window.ZombieSounds.triggerAttack === 'function') {
        window.ZombieSounds.triggerAttack(zombie, now);
    }

    // ★ 无限模式攻击加成
    let rawDmg = cfg.attackDamage * _getEndlessDmgMul();

    if (typeof window._applyVulnerabilityBonus === 'function') {
        rawDmg = window._applyVulnerabilityBonus(target, rawDmg, now);
    }

    let hpDamage = rawDmg;
    if (target.armor > 0) {
        const absorb = Math.min(target.armor, rawDmg * ARMOR_ABSORB);
        target.armor = Math.max(0, target.armor - absorb);
        hpDamage = rawDmg - absorb;
    }

    target.hp -= hpDamage;

    if (typeof dmgFlash === 'function') dmgFlash(target);
    if (target.id === 1) {
        if (typeof sHit === 'function') sHit(1);
    }
    if (typeof emitWorldSound === 'function') {
        emitWorldSound('hit',
            target.pos.x, target.pos.y + target.eyeH, target.pos.z,
            target.id === 1);
    }

    if (target.hp <= 0) {
        target.hp = 0;
        target.deadUntil = Infinity;
        target.baseVisible = false;
        target.aiming = false;
        target.aimStage = 0;

        if (target.input) {
            target.input.aim     = false;
            target.input.fire    = false;
            target.input.jump    = false;
            target.input.crouch  = false;
            target.input.forward = 0;
            target.input.right   = 0;
        }

        if (target.id === 1 && typeof mouse !== 'undefined') {
            mouse.leftDown = false;
            mouse.aim = false;
        }

        console.log('[survival] 玩家阵亡（僵尸击杀）');

        if (typeof checkSurvivalDefeat === 'function') {
            checkSurvivalDefeat();
        }
    }
}

// ============================================================
// 打僵尸
// ============================================================
function damageZombie(zombie, dmg, from) {
    if (!zombie || !zombie.alive) return;
    zombie.hp -= dmg;
    if (zombie.hp <= 0) {
        _killZombie(zombie, from);
    }
}
window.damageZombie = damageZombie;

// ============================================================
// 僵尸阵亡
// ============================================================
function _killZombie(zombie, from) {
    zombie.alive = false;
    zombie.hp = 0;

    if (zombie._partsNormal) zombie._partsNormal.group.visible = false;
    if (zombie._partsLegacy) zombie._partsLegacy.group.visible = false;

    zombie.mesh.scale.setScalar(1);
    zombie.height = ZOMBIE_BASE_HEIGHT;
    zombie.eyeH   = ZOMBIE_BASE_EYE_H;

    if (from && !from._isZombie && from.id !== undefined) {
        if (typeof from.survivalKills !== 'number') from.survivalKills = 0;
        from.survivalKills++;
    }

    if (typeof emitWorldSound === 'function') {
        emitWorldSound('death',
            zombie.pos.x, zombie.pos.y + zombie.eyeH, zombie.pos.z, false);
    }

    const _cfg = ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;
    const _zhName = _cfg.name || zombie.type;
    console.log('[survival] ' + _zhName + ' 阵亡，剩余：', getZombiesAliveCount());

    // 金币
    if (typeof SurvivalState !== 'undefined'
        && SurvivalState && SurvivalState.active) {

        const isElite = (zombie.type === 'small' || zombie.type === 'big');
        const r = Math.random();
        let drop = 0;

        if (isElite) {
            drop = (r < 0.5) ? 1 : 2;
        } else {
            if (r < 1 / 3)      drop = 1;
            else if (r < 2 / 3) drop = 2;
        }

        if (drop > 0) {
            drop = Math.max(1, Math.round(drop * _getEndlessCoinMul()));

            SurvivalState.coins = (SurvivalState.coins || 0) + drop;

            if (typeof feed === 'function'
                && typeof p1 !== 'undefined' && p1
                && (from === p1 || (from && from.id === 1))) {
                feed(p1, `💰 <b style="color:#ffd24a">+${drop}</b> 金币` +
                         ` · 总计 ${SurvivalState.coins}`);
            }
        }
    }

// 弹药掉落
    if (getZombiesAliveCount() === 0
        && typeof SurvivalState !== 'undefined'
        && SurvivalState
        && SurvivalState.wave > 0) {

        // ★ 计算全局波次（战场1-5，沙漠6-10，循环累加）
        const baseGlobalWave = SurvivalState.mapIndex * SurvivalState.maxWaves + SurvivalState.wave;
        const globalWave = SurvivalState.endlessLoop * (SurvivalState.maps.length * SurvivalState.maxWaves) + baseGlobalWave;
        
        // ★ 只在每一轮的第 3 波和第 8 波掉落
        const isDropWave = (globalWave % 10 === 3) || (globalWave % 10 === 8);

        if (isDropWave) {
            const queueLen = (SurvivalState.waveQueue && SurvivalState.waveQueue.length)
                ? SurvivalState.waveQueue.length : 0;

            if (queueLen === 0 && typeof spawnAmmoDrop === 'function') {
                spawnAmmoDrop(zombie.pos.x, zombie.pos.y, zombie.pos.z);
                // 可选：在屏幕上提示一下
                if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
                    feed(p1, `💛 精英波清空！掉落弹药箱`);
                }
            }
        }
    }
}

// ============================================================
// 工具
// ============================================================
function getZombiesAliveCount() {
    let n = 0;
    for (let i = 0; i < _zombiePool.length; i++) {
        if (_zombiePool[i].alive) n++;
    }
    // ★ 演奏僵尸也算活着的僵尸（卡波用）
    if (typeof PlayerZombie !== 'undefined'
        && PlayerZombie.active
        && !PlayerZombie.active.dead) {
        n++;
    }
    return n;
}
window.getZombiesAliveCount = getZombiesAliveCount;

function getAllZombies() { return _zombiePool; }
window.getAllZombies = getAllZombies;

function clearAllZombies() {
    for (let i = 0; i < _zombiePool.length; i++) {
        const z = _zombiePool[i];
        z.alive = false;
        z.hp = 0;
        if (z._partsNormal) z._partsNormal.group.visible = false;
        if (z._partsLegacy) z._partsLegacy.group.visible = false;
        z.mesh.scale.setScalar(1);
        z.height = ZOMBIE_BASE_HEIGHT;
        z.eyeH   = ZOMBIE_BASE_EYE_H;
    }
    _collisionBuf.length = 0;
}
window.clearAllZombies = clearAllZombies;

window.ZOMBIE_TYPES = ZOMBIE_TYPES;
window.ZOMBIE_ELITE_TYPES = ZOMBIE_ELITE_TYPES;
window.buildWaveComposition = buildWaveComposition;
window.spawnZombieByType = function (x, z, wave, type) {
    return spawnZombie(x, z, wave, type);
};