// ===== js/survival/zombie.js – 僵尸系统 =====
//
// 模型策略：
//   · 所有类型统一使用 js/survival/zombies/zombie_normal_model.js
//   · 通过 sizeMul 缩放：normal 1.0 / small 0.7 / big 2.0
//
// 池容量：固定 50（不再运行时调节）
// 同屏上限：SurvivalState.MAX_ALIVE_ZOMBIES（通过设置页调节，5~45）

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
        ai: null,
    },
};

const ZOMBIE_ELITE_TYPES = ['small', 'big'];

const ZOMBIE_JUMP_COOLDOWN    = 900;
const ZOMBIE_STUCK_THRESHOLD  = 0.3;
const ZOMBIE_STUCK_MOVE_RATIO = 0.3;

// ============================================================
// 池容量（固定 50）
// ============================================================
const ZOMBIE_POOL_SIZE = 50;

const ZOMBIE_BASE_HEIGHT = 1.8;
const ZOMBIE_BASE_EYE_H  = 1.6;

// 僵尸间分离参数
const ZOMBIE_SEPARATION_RADIUS   = 0.50;
const ZOMBIE_SEPARATION_STRENGTH = 0.55;

// ============================================================
// 无限模式属性加成
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

    // 演奏僵尸：只占第一个精英位，每波最多 1 只
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
// 池
// ============================================================
const _zombiePool = [];

// ============================================================
// 创建一个僵尸实例（只使用新模型）
// ============================================================
function _createOneZombie(index) {
    const partsNormal = window.ZOMBIE_MODEL_NORMAL.build();

    partsNormal.group.visible = false;
    scene.add(partsNormal.group);

    const hitNormal = [
        partsNormal.head, partsNormal.body,
        partsNormal.armL, partsNormal.armR,
        partsNormal.legL, partsNormal.legR,
    ];

    const zombie = {
        _isZombie: true,
        id: 100 + index,
        poolIndex: index,
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

        mesh:       partsNormal.group,
        body:       partsNormal.body,
        head:       partsNormal.head,
        armL:       partsNormal.armL,
        armR:       partsNormal.armR,
        legL:       partsNormal.legL,
        legR:       partsNormal.legR,
        hitMeshes:  hitNormal,

        _partsNormal: partsNormal,
        _pivots:      partsNormal.pivots,
        _animPhase:   0,
        _headPhase:   0,

        vy: 0,
        prevY: 0,
        onGround: true,
        _vyBeforeLand: 0,

        _stuckTime: 0,
        _nextJumpAt: 0,

        _nextGrowlAt: 0,

        _aiState: {},
    };

    for (const m of hitNormal) m.userData.zombieRef = zombie;

    return zombie;
}

// ============================================================
// 确保池已建满（幂等：已建满时直接 return）
// ============================================================
function _ensureZombiePoolSize() {
    if (_zombiePool.length >= ZOMBIE_POOL_SIZE) return;
    if (typeof scene === 'undefined' || !scene) return;

    while (_zombiePool.length < ZOMBIE_POOL_SIZE) {
        _zombiePool.push(_createOneZombie(_zombiePool.length));
    }

    console.log('[zombie] 僵尸池已就绪：', ZOMBIE_POOL_SIZE, '个');
}

// 兼容旧名字（loading_warmup.js 调的是 window.initZombiePool）
window.initZombiePool = function () { _ensureZombiePoolSize(); };

// ============================================================
// 从池中借一个空闲僵尸
// ============================================================
function _acquireZombie() {
    _ensureZombiePoolSize();
    for (let i = 0; i < _zombiePool.length; i++) {
        if (!_zombiePool[i].alive) return _zombiePool[i];
    }
    return null;
}

// ============================================================
// 体型
// ============================================================
function _applyZombieSize(zombie, cfg) {
    let sizeMul = (cfg.sizeMul !== undefined) ? cfg.sizeMul : 1.0;
    const mapId = (typeof window.getCurrentMapId === 'function')
        ? window.getCurrentMapId() : null;

    // 室内设施门洞净高 2.9m，大僵尸在室内缩到 1.5 倍才能正常穿门。
    if (mapId === 'indoor_complex' && sizeMul > 1.5) sizeMul = 1.5;

    zombie.mesh.scale.setScalar(sizeMul);
    zombie.height = ZOMBIE_BASE_HEIGHT * sizeMul;
    zombie.eyeH   = ZOMBIE_BASE_EYE_H  * sizeMul;
}

// ============================================================
// 生成
// ============================================================
function spawnZombie(x, z, wave, type) {
    type = type || 'normal';

    // 演奏僵尸：走独立路径，不进池
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

    // 无限模式血量加成
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

    // 叫声调度初始化（随机错开 0~2 秒）
    if (window.ZombieSounds && typeof window.ZombieSounds.initSchedule === 'function') {
        window.ZombieSounds.initSchedule(zombie, performance.now());
    } else {
        zombie._nextGrowlAt = 0;
    }

    zombie._aiState = {};
    zombie._animPhase = Math.random() * Math.PI * 2;
    zombie._headPhase = Math.random() * Math.PI * 2;

    _applyZombieSize(zombie, cfg);

    // ★ 关键：显示（原来由 _switchZombieModel 负责，现在这里补上）
    zombie.mesh.visible = true;
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

    // 周期性叫声
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

    const directDx = target.pos.x - zombie.pos.x;
    const directDz = target.pos.z - zombie.pos.z;
    const dy = target.pos.y - zombie.pos.y;
    const directDistH = Math.hypot(directDx, directDz);

    // 室内生存：从外围房间沿门洞/走廊路线进入中庭。
    let steerX = target.pos.x;
    let steerZ = target.pos.z;
    const mapId = (typeof window.getCurrentMapId === 'function')
        ? window.getCurrentMapId() : null;
    if (mapId === 'indoor_complex' && zombie._indoorRoute) {
        const route = zombie._indoorRoute;
        let ri = zombie._indoorRouteIndex || 0;
        while (ri < route.length) {
            const wp = route[ri];
            if (Math.hypot(wp.x - zombie.pos.x, wp.z - zombie.pos.z) > 1.15) break;
            ri++;
        }
        zombie._indoorRouteIndex = ri;
        if (ri < route.length) {
            steerX = route[ri].x;
            steerZ = route[ri].z;
        } else {
            zombie._indoorRoute = null;
        }
    }

    const dx = steerX - zombie.pos.x;
    const dz = steerZ - zombie.pos.z;
    const distH = Math.hypot(dx, dz);

    if (distH > 0.001) {
        zombie.yaw = Math.atan2(-dx, -dz);
    }

    const inAttackRange = (directDistH <= cfg.attackRange)
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

        // 室内房间多，默认直线追击可能被墙长期挡住。
        // 持续卡住 1.4 秒后，重新从外围房间出生并沿路线进入中庭。
        const mapId = (typeof window.getCurrentMapId === 'function')
            ? window.getCurrentMapId() : null;
        let relocated = false;
        if (mapId === 'indoor_complex'
            && zombie._stuckTime > 1.4
            && typeof window.findIndoorSurvivalSpawn === 'function') {
            const spot = window.findIndoorSurvivalSpawn();
            if (spot) {
                const groundY = (typeof terrainGroundAt === 'function')
                    ? terrainGroundAt(spot.x, spot.z) : 0;
                zombie.pos.set(spot.x, groundY, spot.z);
                zombie.prevY = groundY;
                zombie.vy = 0;
                zombie.onGround = true;
                zombie._vyBeforeLand = 0;
                zombie._stuckTime = 0;
                zombie._nextJumpAt = now + ZOMBIE_JUMP_COOLDOWN;
                zombie._indoorRoute = spot.route || null;
                zombie._indoorRouteIndex = 0;
                relocated = true;
            }
        }

        if (!relocated
            && zombie._stuckTime > ZOMBIE_STUCK_THRESHOLD
            && zombie.onGround
            && now >= zombie._nextJumpAt
            && (mapId !== 'indoor_complex' || zombie._stuckTime > 2.5)) {
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

    // 攻击时急叫
    if (window.ZombieSounds && typeof window.ZombieSounds.triggerAttack === 'function') {
        window.ZombieSounds.triggerAttack(zombie, now);
    }

    // 无限模式攻击加成
    let rawDmg = cfg.attackDamage * _getEndlessDmgMul();

    if (typeof window._applyVulnerabilityBonus === 'function') {
        rawDmg = window._applyVulnerabilityBonus(target, rawDmg, now);
    }

    if (typeof gameMode !== 'undefined' && gameMode === 'lan'
        && typeof LAN !== 'undefined' && LAN.mode === 'survival'
        && typeof window.LAN_SURVIVAL_handleZombieAttack === 'function') {
        window.LAN_SURVIVAL_handleZombieAttack(target, rawDmg, zombie);
        return;
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

    zombie.mesh.visible = false;
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

    if (typeof maybeSpawnSurvivalAmmoDrop === 'function') {
        maybeSpawnSurvivalAmmoDrop(zombie.pos.x, zombie.pos.y, zombie.pos.z);
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
    // 演奏僵尸也算活着的僵尸（卡波用）
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
        z.mesh.visible = false;
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
