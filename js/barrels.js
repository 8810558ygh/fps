// ===== js/barrels.js – 可破坏油桶（血量 + 爆炸伤害 · 爆炸后隐藏修复） =====

const BARREL_MAX_HP = 300;
const BARREL_EXPLODE_RADIUS = 6.0;
const BARREL_EXPLODE_MAX_DMG = 200;

// ============================================================
// 爆炸特效池
// ============================================================
const EXPLOSION_POOL_SIZE = 3;
const EXPLOSION_LIFE_MS = 500;
const _explosionPool = [];
let _explosionPoolInited = false;

function initExplosionPool() {
    if (_explosionPoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _explosionPoolInited = true;

    const shellGeo = new THREE.SphereGeometry(0.5, 20, 14);
    const ringGeo = new THREE.RingGeometry(0.5, 0.9, 32);

    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0xff8c20,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.visible = false;
        shell.renderOrder = 90;
        shell.frustumCulled = false;
        scene.add(shell);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffc060,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.visible = false;
        ring.renderOrder = 91;
        ring.frustumCulled = false;
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);

        const light = new THREE.PointLight(0xffa040, 0, 25);
        light.position.set(0, -1000, 0);
        scene.add(light);

        _explosionPool.push({
            shell, ring, light,
            active: false,
            born: 0,
            x: 0, y: 0, z: 0,
        });
    }
}

function _acquireExplosionSlot() {
    let slot = null;
    for (let i = 0; i < _explosionPool.length; i++) {
        if (!_explosionPool[i].active) { slot = _explosionPool[i]; break; }
    }
    if (!slot) {
        slot = _explosionPool[0];
        for (let i = 1; i < _explosionPool.length; i++) {
            if (_explosionPool[i].born < slot.born) slot = _explosionPool[i];
        }
    }
    return slot;
}

function spawnExplosionVisual(x, y, z) {
    initExplosionPool();
    const slot = _acquireExplosionSlot();
    if (!slot) return;

    slot.active = true;
    slot.born = performance.now();
    slot.x = x; slot.y = y; slot.z = z;

    slot.shell.position.set(x, y, z);
    slot.shell.scale.setScalar(0.5);
    slot.shell.material.opacity = 1;
    slot.shell.visible = true;

    slot.ring.position.set(x, 0.05, z);
    slot.ring.scale.setScalar(0.5);
    slot.ring.material.opacity = 0.9;
    slot.ring.visible = true;

    slot.light.position.set(x, y + 0.3, z);
    slot.light.intensity = 25;
}
window.spawnExplosionVisual = spawnExplosionVisual;

function updateExplosionVisuals(dt, now) {
    for (let i = 0; i < _explosionPool.length; i++) {
        const b = _explosionPool[i];
        if (!b.active) continue;

        const age = now - b.born;
        const t = age / EXPLOSION_LIFE_MS;

        if (t >= 1) {
            b.active = false;
            b.shell.visible = false;
            b.shell.material.opacity = 0;
            b.ring.visible = false;
            b.ring.material.opacity = 0;
            b.light.intensity = 0;
            b.light.position.set(0, -1000, 0);
            continue;
        }

        const shellScale = 0.5 + t * 3.5;
        b.shell.scale.setScalar(shellScale);
        b.shell.material.opacity = Math.pow(1 - t, 1.5);

        const ringScale = 0.5 + t * 8;
        b.ring.scale.setScalar(ringScale);
        b.ring.material.opacity = Math.max(0, 0.9 - t * 1.5);

        b.light.intensity = 25 * Math.pow(1 - t, 2);
    }
}
window.updateExplosionVisuals = updateExplosionVisuals;

// ============================================================
// 油桶注册表
// ============================================================
const activeBarrels = [];
window.activeBarrels = activeBarrels;

function registerBarrel(mesh, x, z, collider) {
    const barrel = {
        mesh,
        x, z,
        y: 0.55,
        radius: 0.45,
        height: 1.1,
        hp: BARREL_MAX_HP,
        maxHp: BARREL_MAX_HP,
        exploded: false,
        collider,
    };
    mesh.userData.barrelRef = barrel;
    activeBarrels.push(barrel);
    return barrel;
}
window.registerBarrel = registerBarrel;

// ============================================================
// 命中油桶
// ============================================================
function hitBarrel(barrel, dmg, from, hitPoint) {
    if (!barrel || barrel.exploded) return;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return;

    barrel.hp -= dmg;

    if (typeof spawnSparks === 'function' && hitPoint) {
        spawnSparks(hitPoint, 0xffaa40);
    }

    if (barrel.hp <= 0) {
        explodeBarrel(barrel, from);
    }
}
window.hitBarrel = hitBarrel;

function explodeBarrel(barrel, from) {
    if (barrel.exploded) return;
    barrel.exploded = true;

    const ex = barrel.x;
    const ey = barrel.y;
    const ez = barrel.z;

    // ★ 隐藏油桶 mesh（父节点是 currentMapGroup，scene.remove 无效）
    if (barrel.mesh) {
        barrel.mesh.visible = false;
    }

    // 从碰撞表移除
    if (typeof colliders !== 'undefined') {
        const ci = colliders.indexOf(barrel.collider);
        if (ci >= 0) colliders.splice(ci, 1);
    }

    // 从射线目标表移除（子弹打不中）
    if (typeof wallMeshes !== 'undefined') {
        const wi = wallMeshes.indexOf(barrel.mesh);
        if (wi >= 0) wallMeshes.splice(wi, 1);
    }

    if (typeof crateMeshes !== 'undefined') {
        const cri = crateMeshes.indexOf(barrel.mesh);
        if (cri >= 0) crateMeshes.splice(cri, 1);
    }

    if (typeof window.markShotTargetsDirty === 'function') {
        window.markShotTargetsDirty();
    }

    // 视觉 + 音效
    spawnExplosionVisual(ex, ey, ez);
    if (typeof sExplosion === 'function') sExplosion();

    // 爆炸伤害
    _applyExplosionDamageToPlayer(p1, ex, ey, ez, from);
    _applyExplosionDamageToPlayer(p2, ex, ey, ez, from);

    // 联机：广播给客户端
    if (typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.isHost
        && typeof NET_broadcast === 'function') {
        NET_broadcast({
            type: 'barrelExplode',
            x: ex, y: ey, z: ez,
        });
    }
}

function _applyExplosionDamageToPlayer(p, ex, ey, ez, from) {
    if (!p) return;
    if (typeof running !== 'undefined' && !running) return;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return;

    const now = performance.now();
    if (p.deadUntil > now) return;
    if (p.hp <= 0) return;

    const dx = p.pos.x - ex;
    const dz = p.pos.z - ez;
    const dy = (p.pos.y + p.height * 0.5) - ey;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > BARREL_EXPLODE_RADIUS) return;

    const t = 1 - dist / BARREL_EXPLODE_RADIUS;
    const dmg = BARREL_EXPLODE_MAX_DMG * Math.pow(t, 1.5);

    if (dmg <= 1) return;

    if (typeof damage === 'function') {
        const attacker = from || p;
        damage(p, dmg, attacker);
    }
}

// ============================================================
// 回合重置 / 清空
// ============================================================
function resetBarrels() {
    for (const b of activeBarrels) {
        if (b.exploded) {
            b.exploded = false;
            b.hp = b.maxHp;

            // ★ 恢复可见
            if (b.mesh) b.mesh.visible = true;

            // 恢复碰撞表
            if (typeof colliders !== 'undefined' && colliders.indexOf(b.collider) < 0) {
                colliders.push(b.collider);
            }
            // 恢复射线目标表
            if (typeof wallMeshes !== 'undefined' && wallMeshes.indexOf(b.mesh) < 0) {
                wallMeshes.push(b.mesh);
            }

            if (typeof window.markShotTargetsDirty === 'function') {
                window.markShotTargetsDirty();
            }
        } else {
            b.hp = b.maxHp;
        }
    }
}
window.resetBarrels = resetBarrels;

function clearBarrels() {
    activeBarrels.length = 0;
}
window.clearBarrels = clearBarrels;

// 启动时初始化特效池
if (typeof scene !== 'undefined' && scene) {
    initExplosionPool();
}