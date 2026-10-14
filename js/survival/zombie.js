// ===== js/survival/zombie.js – 僵尸系统（多类型注册表版 · 动态波次） =====
// 工厂 / 池 / AI / 伤害 / 击杀 / 物理碰撞 / 跳跃 / 类型系统 / 弹药掉落 / 金币掉落
//
// 波次生成（动态公式）：
//   总数   N = 3 + 2n
//   精英数 E = max(0, n - 2)
//   普通数   = N - E
//   精英从 ZOMBIE_ELITE_TYPES 里随机挑
//
// 阴影：
//   · 只给 body + head 开 castShadow
//   · 手臂 / 腿 不投
//
// ★ 僵尸间分离：
//   · 每帧对所有存活僵尸做一次 O(n²) 分离
//   · 同屏 10 只 → 45 对，开销可以忽略
//   · 体型大的僵尸（tank）分离半径也按 sizeMul 缩放

// ============================================================
// ★★★ 僵尸类型注册表 ★★★
// ============================================================
const ZOMBIE_TYPES = {

    normal: {
        name: '普通僵尸',
        hp: 100,
        speedMul: 0.7,
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

    runner: {
        name: '跑者',
        hp: 60,
        speedMul: 1.2,
        attackDamage: 10,
        attackRange: 1.2,
        attackHeight: 1.6,
        attackCooldown: 800,
        jumpV: 13,
        sizeMul: 0.75,
        color: 0x8a3a3a,
        headColor: 0xaa4a4a,
        darkColor: 0x3a1a1a,
        ai: null,
    },

    tank: {
        name: '坦克',
        hp: 400,
        speedMul: 0.4,
        attackDamage: 30,
        attackRange: 2.2,
        attackHeight: 2.6,
        attackCooldown: 1400,
        jumpV: 8,
        sizeMul: 1.4,
        color: 0x2a3a4a,
        headColor: 0x3a4a5a,
        darkColor: 0x1a2a3a,
        ai: null,
    },
};

const ZOMBIE_ELITE_TYPES = ['runner', 'tank'];

const ZOMBIE_JUMP_COOLDOWN    = 900;
const ZOMBIE_STUCK_THRESHOLD  = 0.3;
const ZOMBIE_STUCK_MOVE_RATIO = 0.3;
const ZOMBIE_POOL_SIZE        = 32;

const ZOMBIE_BASE_HEIGHT = 1.8;
const ZOMBIE_BASE_EYE_H  = 1.6;

// ============================================================
// ★ 僵尸间分离参数
// ============================================================
const ZOMBIE_SEPARATION_RADIUS   = 0.50;   // 基础半径
const ZOMBIE_SEPARATION_STRENGTH = 0.55;   // 每帧推开比例（0~1）

const _zombiePool = [];
let _zombiePoolInited = false;

// ============================================================
// 波次生成公式
// ============================================================
function buildWaveComposition(wave) {
    const total   = 3 + wave * 2;
    const elites  = Math.max(0, wave - 2);
    const normals = Math.max(0, total - elites);

    const list = [];
    for (let i = 0; i < normals; i++) list.push('normal');

    const elitePool = (typeof ZOMBIE_ELITE_TYPES !== 'undefined' && ZOMBIE_ELITE_TYPES.length > 0)
        ? ZOMBIE_ELITE_TYPES
        : ['runner'];

    for (let i = 0; i < elites; i++) {
        const t = elitePool[Math.floor(Math.random() * elitePool.length)];
        list.push(t);
    }

    return list;
}

// ============================================================
// 僵尸工厂
// ============================================================
function _makeZombieMesh() {
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

    return { group: g, body, head, armL, armR, legL, legR };
}

// ============================================================
// 初始化僵尸池
// ============================================================
function _initZombiePool() {
    if (_zombiePoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _zombiePoolInited = true;

    for (let i = 0; i < ZOMBIE_POOL_SIZE; i++) {
        const parts = _makeZombieMesh();

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
            mesh: parts.group,
            body: parts.body,
            head: parts.head,
            armL: parts.armL,
            armR: parts.armR,
            legL: parts.legL,
            legR: parts.legR,

            vy: 0,
            prevY: 0,
            onGround: true,
            _vyBeforeLand: 0,

            _stuckTime: 0,
            _nextJumpAt: 0,

            _aiState: {},
        };

        zombie.hitMeshes = [
            parts.head, parts.body,
            parts.armL, parts.armR,
            parts.legL, parts.legR,
        ];

        for (const m of zombie.hitMeshes) {
            m.userData.zombieRef = zombie;
        }

        zombie.mesh.visible = false;
        scene.add(zombie.mesh);
        _zombiePool.push(zombie);
    }

    console.log('[zombie] 僵尸池已初始化:', ZOMBIE_POOL_SIZE);
}

window.initZombiePool = function () {
    _initZombiePool();
};

function _acquireZombie() {
    _initZombiePool();
    for (let i = 0; i < _zombiePool.length; i++) {
        if (!_zombiePool[i].alive) return _zombiePool[i];
    }
    return null;
}

// ============================================================
// 应用颜色 / 体型
// ============================================================
function _applyZombieColors(zombie, cfg) {
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
// 生成僵尸
// ============================================================
function spawnZombie(x, z, wave, type) {
    type = type || 'normal';
    const cfg = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.normal;

    const zombie = _acquireZombie();
    if (!zombie) {
        console.warn('[zombie] 池已满，无法生成');
        return null;
    }

    const groundY = (typeof terrainGroundAt === 'function')
        ? terrainGroundAt(x, z) : 0;

    zombie.alive = true;
    zombie.type = type;
    zombie.hp = cfg.hp;
    zombie.maxHp = cfg.hp;
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

    zombie._aiState = {};

    _applyZombieColors(zombie, cfg);
    _applyZombieSize(zombie, cfg);

    zombie.mesh.visible = true;
    zombie.mesh.position.copy(zombie.pos);
    zombie.mesh.rotation.y = zombie.yaw;

    return zombie;
}
window.spawnZombie = spawnZombie;

// ============================================================
// 找最近的玩家
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
        if (d2 < bestDistSq) {
            bestDistSq = d2;
            nearest = p;
        }
    }
    return nearest;
}

// ============================================================
// 更新单个僵尸（AI 分发）
// ============================================================
function updateZombie(zombie, dt, now) {
    if (!zombie.alive) return;

    const cfg = ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;

    if (typeof cfg.ai === 'function') {
        const handled = cfg.ai(zombie, dt, now, cfg);
        if (handled) {
            _applyZombiePhysics(zombie, dt, now, undefined, undefined, undefined, cfg);
            zombie.mesh.position.copy(zombie.pos);
            zombie.mesh.rotation.y = zombie.yaw;
            return;
        }
    }

    _defaultZombieAI(zombie, dt, now, cfg);
}

// ============================================================
// 默认 AI：直线追 + 近战
// ============================================================
function _defaultZombieAI(zombie, dt, now, cfg) {
    const target = _findNearestPlayer(zombie);
    if (!target) {
        zombie.mesh.position.copy(zombie.pos);
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
}

// ============================================================
// 通用物理
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
// ★ 僵尸间碰撞分离
//
//   · 遍历所有存活僵尸对，若水平距离 < 半径之和，互相推开
//   · 半径按 sizeMul 缩放：tank 大、runner 小
//   · 每帧推 overlap × STRENGTH / 2（双方各推一半）
//   · 完全重合时随机方向推开
//   · 分离后同步 mesh 位置，并钳制到地图边界内
// ============================================================
function _resolveZombieCollisions() {
    // 收集存活僵尸（局部数组，避免每帧新建）
    const alive = _resolveZombieCollisions._buf || (_resolveZombieCollisions._buf = []);
    alive.length = 0;
    for (let i = 0; i < _zombiePool.length; i++) {
        if (_zombiePool[i].alive) alive.push(_zombiePool[i]);
    }

    const n = alive.length;
    if (n < 2) {
        // 单只或零只，也要同步 mesh（可能被分离函数影响）
        return;
    }

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
                // 完全重合 → 随机推开
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

    // ---- 分离后：钳制到地图边界 + 同步 mesh ----
    const half = (typeof window.currentArenaHalf === 'number')
        ? window.currentArenaHalf : ARENA;
    const lim = half - 0.6;

    for (let i = 0; i < n; i++) {
        const z = alive[i];
        if (z.pos.x < -lim) z.pos.x = -lim;
        if (z.pos.x >  lim) z.pos.x =  lim;
        if (z.pos.z < -lim) z.pos.z = -lim;
        if (z.pos.z >  lim) z.pos.z =  lim;

        z.mesh.position.copy(z.pos);
    }
}

// ============================================================
// 更新全部僵尸
// ============================================================
function updateAllZombies(dt, now) {
    for (let i = 0; i < _zombiePool.length; i++) {
        const z = _zombiePool[i];
        if (z.alive) updateZombie(z, dt, now);
    }

    // ★ 所有僵尸更新完后，做一次分离
    _resolveZombieCollisions();
}
window.updateAllZombies = updateAllZombies;

// ============================================================
// 僵尸攻击玩家
// ============================================================
function _zombieAttack(zombie, target, cfg) {
    if (!target) return;
    if (target.hp <= 0) return;
    if (target.deadUntil > performance.now()) return;

    cfg = cfg || ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;

    const now = performance.now();

    let rawDmg = cfg.attackDamage;

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
// 僵尸阵亡 + 金币掉落 + 弹药掉落
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

    console.log('[survival] 僵尸阵亡（' + zombie.type + '），剩余：', getZombiesAliveCount());

    // 金币掉落
    if (typeof SurvivalState !== 'undefined'
        && SurvivalState && SurvivalState.active) {

        const isElite = (zombie.type === 'runner' || zombie.type === 'tank');
        const r = Math.random();
        let drop = 0;

        if (isElite) {
            drop = (r < 0.5) ? 1 : 2;
        } else {
            if (r < 1 / 3)      drop = 1;
            else if (r < 2 / 3) drop = 2;
        }

        if (drop > 0) {
            SurvivalState.coins = (SurvivalState.coins || 0) + drop;

            if (typeof feed === 'function'
                && typeof p1 !== 'undefined' && p1
                && (from === p1 || (from && from.id === 1))) {
                feed(p1, `💰 <b style="color:#ffd24a">+${drop}</b> 金币` +
                         ` · 总计 ${SurvivalState.coins}`);
            }
        }
    }

    // 弹药掉落：偶数波清空时，最后一个死亡的僵尸掉落
    if (getZombiesAliveCount() === 0
        && typeof SurvivalState !== 'undefined'
        && SurvivalState
        && SurvivalState.wave > 0
        && SurvivalState.wave % 2 === 0) {

        const queueLen = (SurvivalState.waveQueue && SurvivalState.waveQueue.length)
            ? SurvivalState.waveQueue.length : 0;

        if (queueLen === 0 && typeof spawnAmmoDrop === 'function') {
            spawnAmmoDrop(zombie.pos.x, zombie.pos.y, zombie.pos.z);
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
    return n;
}
window.getZombiesAliveCount = getZombiesAliveCount;

function getAllZombies() {
    return _zombiePool;
}
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
    if (_resolveZombieCollisions._buf) _resolveZombieCollisions._buf.length = 0;
}
window.clearAllZombies = clearAllZombies;

// ============================================================
// 对外暴露
// ============================================================
window.ZOMBIE_TYPES = ZOMBIE_TYPES;
window.ZOMBIE_ELITE_TYPES = ZOMBIE_ELITE_TYPES;
window.buildWaveComposition = buildWaveComposition;
window.spawnZombieByType = function (x, z, wave, type) {
    return spawnZombie(x, z, wave, type);
};