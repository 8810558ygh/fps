// ===== js/survival/zombie.js – 僵尸系统 =====
// 工厂 / 池 / AI / 伤害 / 击杀 / 物理碰撞

// ============================================================
// 配置
// ============================================================
const ZOMBIE_BASE_HP          = 100;
const ZOMBIE_WALK_SPEED_MUL   = 0.7;
const ZOMBIE_ATTACK_RANGE     = 2.2;
const ZOMBIE_ATTACK_HEIGHT    = 2.5;
const ZOMBIE_ATTACK_COOLDOWN  = 1000;
const ZOMBIE_ATTACK_DAMAGE    = 15;
const ZOMBIE_POOL_SIZE        = 24;

const _zombiePool = [];
let _zombiePoolInited = false;

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
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });

    return { group: g, body, head, armL, armR, legL, legR };
}

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
            hp: 0,
            maxHp: ZOMBIE_BASE_HP,
            pos: new THREE.Vector3(0, 0, 0),
            yaw: 0,
            height: 1.8,
            eyeH: 1.6,
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

            // ============================================================
            // ★ 物理字段（供 collideWorld() 使用）
            //   collideWorld 是通用函数，读这些字段处理墙体 / 台阶 / 地形
            // ============================================================
            vy: 0,
            prevY: 0,
            onGround: true,
            _vyBeforeLand: 0,
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

// ★ 对外暴露
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

function spawnZombie(x, z, wave) {
    const zombie = _acquireZombie();
    if (!zombie) {
        console.warn('[zombie] 池已满，无法生成');
        return null;
    }

    const groundY = (typeof terrainGroundAt === 'function')
        ? terrainGroundAt(x, z) : 0;

    zombie.alive = true;
    zombie.hp = ZOMBIE_BASE_HP;
    zombie.maxHp = ZOMBIE_BASE_HP;
    zombie.pos.set(x, groundY, z);
    zombie.yaw = Math.random() * Math.PI * 2;
    zombie.nextAttackTime = 0;
    zombie.deadUntil = 0;
    zombie.invulnUntil = 0;

    // ★ 重置物理字段
    zombie.vy = 0;
    zombie.prevY = groundY;
    zombie.onGround = true;
    zombie._vyBeforeLand = 0;

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
// ★ 僵尸 AI + 物理
//
//   物理步进（和玩家一样走 collideWorld）：
//     1. 水平移动（追玩家）
//     2. 施加重力
//     3. collideWorld() —— 处理墙体、台阶上移、侧向推动、地形高度
//     4. 地面钳制
//
//   效果：
//     · 不能穿墙（会被侧向推开）
//     · 遇到台阶会走上去（STEP_UP = 0.55 内自动抬升）
//     · 遇到高台（> 0.55）会被挡住
//     · 会站到地形高度上（沙漠图沙丘）
// ============================================================
function updateZombie(zombie, dt, now) {
    if (!zombie.alive) return;

    const target = _findNearestPlayer(zombie);
    if (!target) {
        zombie.mesh.position.copy(zombie.pos);
        return;
    }

    const dx = target.pos.x - zombie.pos.x;
    const dz = target.pos.z - zombie.pos.z;
    const dy = target.pos.y - zombie.pos.y;
    const distH = Math.hypot(dx, dz);

    // 朝向玩家
    if (distH > 0.001) {
        zombie.yaw = Math.atan2(-dx, -dz);
    }

    // 攻击判定：水平够近 + 高度差在允许范围内
    const inAttackRange = (distH <= ZOMBIE_ATTACK_RANGE)
                       && (Math.abs(dy) <= ZOMBIE_ATTACK_HEIGHT);

    // ---- 1. 水平移动 / 攻击 ----
    if (!inAttackRange) {
        if (distH > 0.001) {
            const nx = dx / distH;
            const nz = dz / distH;
            const speed = SPEED * ZOMBIE_WALK_SPEED_MUL;
            zombie.pos.x += nx * speed * dt;
            zombie.pos.z += nz * speed * dt;
        }
    } else {
        if (now >= zombie.nextAttackTime) {
            zombie.nextAttackTime = now + ZOMBIE_ATTACK_COOLDOWN;
            _zombieAttack(zombie, target);
        }
    }

    // ---- 2. 物理步进（重力 + collideWorld） ----
    zombie.prevY = zombie.pos.y;
    zombie.vy -= GRAV * dt;
    zombie.pos.y += zombie.vy * dt;
    zombie._vyBeforeLand = zombie.vy;

    if (typeof collideWorld === 'function') {
        collideWorld(zombie);
    }

    // ---- 3. 地面钳制 ----
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

    // ---- 4. 同步 mesh ----
    zombie.mesh.position.copy(zombie.pos);
    zombie.mesh.rotation.y = zombie.yaw;
}

function updateAllZombies(dt, now) {
    for (let i = 0; i < _zombiePool.length; i++) {
        const z = _zombiePool[i];
        if (z.alive) updateZombie(z, dt, now);
    }
}
window.updateAllZombies = updateAllZombies;

// ============================================================
// 僵尸攻击玩家
// ============================================================
function _zombieAttack(zombie, target) {
    if (!target) return;
    if (target.hp <= 0) return;
    if (target.deadUntil > performance.now()) return;

    let hpDamage = ZOMBIE_ATTACK_DAMAGE;
    if (target.armor > 0) {
        const absorb = Math.min(target.armor, ZOMBIE_ATTACK_DAMAGE * ARMOR_ABSORB);
        target.armor = Math.max(0, target.armor - absorb);
        hpDamage = ZOMBIE_ATTACK_DAMAGE - absorb;
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

function _killZombie(zombie, from) {
    zombie.alive = false;
    zombie.hp = 0;
    zombie.mesh.visible = false;

    if (from && !from._isZombie && from.id !== undefined) {
        if (typeof from.survivalKills !== 'number') from.survivalKills = 0;
        from.survivalKills++;
    }

    if (typeof emitWorldSound === 'function') {
        emitWorldSound('death',
            zombie.pos.x, zombie.pos.y + zombie.eyeH, zombie.pos.z, false);
    }

    console.log('[survival] 僵尸阵亡，剩余：', getZombiesAliveCount());
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
    }
}
window.clearAllZombies = clearAllZombies;