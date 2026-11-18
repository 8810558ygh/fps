// ===== js/combat/combat_melee.js – 近战攻击 =====
// 从 game_combat.js 拆出，不改变任何对外接口
// 依赖：
//   · combat_shared.js 提供 _ray / _rcOrigin / _applyVulnerabilityBonus / _addDamage
//   · combat_damage.js 提供 damage（运行时读取）
//   · survival/zombie.js 提供 getAllZombies / damageZombie（生存模式）

function findMeleeTargetsInCone(p, candidates, worldTargets, options = {}) {
    if (!p || !p.cam || !Array.isArray(candidates) || candidates.length === 0) return [];
    const origin = p.cam.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion).normalize();
    const results = [];
    const isAlive = options.isAlive
        || (target => target.baseVisible && target.hp > 0);
    const getTeam = options.getTeam
        || (target => target.team);

    for (const target of candidates) {
        if (!target || !isAlive(target)) continue;
        const team = getTeam(target);
        if (team && p.team && team === p.team) continue;
        const point = new THREE.Vector3(
            target.pos.x,
            target.pos.y + (target.height || 1.8) * 0.55,
            target.pos.z
        );
        const offset = point.clone().sub(origin);
        const distance = offset.length();
        if (distance <= 0.001 || distance > MELEE.fallbackRange) continue;
        const dot = offset.multiplyScalar(1 / distance).dot(forward);
        if (dot < MELEE.coneCos) continue;

        const lineRay = new THREE.Raycaster(
            origin,
            point.clone().sub(origin).normalize(),
            0,
            Math.max(0.01, distance - 0.2)
        );
        const blockers = lineRay.intersectObjects(worldTargets || [], false);
        if (blockers.length > 0) continue;

        results.push({ target, point, distance, dot });
    }
    results.sort((a, b) => a.distance - b.distance || b.dot - a.dot);
    return results;
}
window.findMeleeTargetsInCone = findMeleeTargetsInCone;

function findMeleeFallbackTarget(p, candidates, worldTargets) {
    return findMeleeTargetsInCone(p, candidates, worldTargets)[0] || null;
}
window.findMeleeFallbackTarget = findMeleeFallbackTarget;

function applyMeleePlayerDamage(p, target, isHeavy, hitPoint, isOnlineHost) {
    const isBack = isBackAttack(p, target);
    let rawDmg = isHeavy ? MELEE.dmgHeavy : MELEE.dmgLight;
    if (isBack) rawDmg *= MELEE.backMultiplier;
    const dmg = _applyVulnerabilityBonus(target, rawDmg, performance.now());

    _addDamage(p, target.id, 'body', dmg);
    spawnSparks(hitPoint, 0xff5040);
    if (p.id === 1) {
        hitmark(p);
    } else if (isOnlineHost) {
        NET_broadcast({ type: 'hitmarkForClient' });
    }
    emitWorldSound('hit', hitPoint.x, hitPoint.y, hitPoint.z, p.id === 1);
    damage(target, dmg, p);
}

function tryMelee(p, now, isHeavy) {
    if (gameState !== 'combat') return;
    if (!p.isMelee) return;
    if (typeof _isPlayerStunned === 'function' && _isPlayerStunned(p)) return;
    if (now < p.equipEnd || now < p.meleeRecovery || now < p.deadUntil) return;

    const m = MELEE;
    const fireMs = isHeavy ? m.heavyFireMs : m.lightFireMs;
    const recovery = isHeavy ? m.heavyRecovery : m.lightRecovery;
    if (!isHeavy) p.meleeCombo = (p.meleeCombo + 1) % 3;
    else p.meleeCombo = 0;

    p.meleeEnd = now + fireMs;
    p.meleeRecovery = now + fireMs + recovery;
    p.meleeIsHeavy = isHeavy;
    p.lastMeleeTime = now;

    emitWorldSound('melee',
        p.pos.x, p.pos.y + p.eyeH, p.pos.z,
        p.id === 1,
        { isHeavy }
    );

    if (gameMode === 'lan') {
        if (typeof LAN_tryMelee === 'function') LAN_tryMelee(p, now, isHeavy);
        return;
    }

    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        // 轻刀和重刀都必须上报；之前只有右键重刀会上报，客户端左键轻刀没有伤害。
        NET.pendingMelee = true;
        NET.pendingMeleeHeavy = !!isHeavy;
        return;
    }

    const isOnlineHost = (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost);

    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    // ============================================================
    // ★ targets 拼装
    //   · 生存模式：加所有存活僵尸的 hitMeshes + 演奏僵尸
    //   · 其他模式：加 p2（对手）的 hitMeshes
    // ============================================================
    const targets = prepareShotTargets();
    const worldTargets = targets.slice();
    const o = other(p);
    const survivalCandidates = [];

    if (gameMode === 'survival') {
        if (typeof getAllZombies === 'function') {
            const zombies = getAllZombies();
            for (let zi = 0; zi < zombies.length; zi++) {
                const z = zombies[zi];
                if (!z.alive || z.dead) continue;
                survivalCandidates.push(z);
                const zParts = z.hitMeshes;
                for (let pi = 0; pi < zParts.length; pi++) targets.push(zParts[pi]);
            }
        }

        // ★ 演奏僵尸 hitMeshes
        if (typeof PlayerZombie !== 'undefined'
            && PlayerZombie.active
            && !PlayerZombie.active.dead) {
            const pz = PlayerZombie.active;
            survivalCandidates.push(pz);
            for (let pi = 0; pi < pz.hitMeshes.length; pi++) {
                targets.push(pz.hitMeshes[pi]);
            }
        }
    } else {
        if (now >= o.deadUntil) {
            const parts = getPlayerHitMeshes(o);
            for (let i = 0; i < parts.length; i++) targets.push(parts[i]);
        }
    }

    _ray.set(_rcOrigin, _rcDir);
    _ray.near = 0;
    _ray.far = m.range;
    const hits = _ray.intersectObjects(targets, false);
    const firstHit = hits[0] || null;

    if (gameMode === 'survival') {
        const directZombie = firstHit ? firstHit.object.userData.zombieRef : null;
        const coneZombies = findMeleeTargetsInCone(
            p,
            survivalCandidates,
            worldTargets,
            {
                isAlive: zombie => zombie.alive && !zombie.dead && zombie.hp > 0,
                getTeam: () => null,
            }
        );
        const attackTargets = new Map();
        for (const item of coneZombies) {
            attackTargets.set(item.target, item.point);
        }
        if (directZombie && directZombie.alive && !directZombie.dead) {
            attackTargets.set(directZombie, firstHit.point);
        }

        const barrel = firstHit ? firstHit.object.userData.barrelRef : null;
        if (barrel && !barrel.exploded && typeof hitBarrel === 'function') {
            hitBarrel(barrel, isHeavy ? m.dmgHeavy : m.dmgLight, p, firstHit.point);
        }

        if (attackTargets.size === 0) {
            if (firstHit && !barrel) {
                spawnSparks(firstHit.point, 0xffd28a);
                const normal = getHitWorldNormal(firstHit);
                if (typeof spawnSlashMark === 'function') {
                    spawnSlashMark(firstHit.point, normal, p.yaw, isHeavy);
                }
            }
            return;
        }

        let firstPoint = null;
        let anyCrit = false;
        for (const [zombie, point] of attackTargets) {
            if (!zombie || !zombie.alive || zombie.dead || zombie.hp <= 0) continue;
            let zombieDamage = isHeavy ? m.dmgHeavy : m.dmgLight;
            let isCrit = false;
            if (p.id === 1 && typeof SurvivalStats !== 'undefined') {
                const roll = SurvivalStats.rollDamage(zombieDamage);
                zombieDamage = roll.dmg;
                isCrit = roll.isCrit;
            }
            if (zombie._isPlayerZombie) {
                if (typeof PlayerZombie !== 'undefined') PlayerZombie.damage(zombieDamage, p);
            } else if (typeof damageZombie === 'function') {
                damageZombie(zombie, zombieDamage, p);
            }
            if (p.id === 1 && typeof spawnDamageNumber === 'function') {
                spawnDamageNumber(point, zombieDamage, isCrit);
            }
            spawnSparks(point, isCrit ? 0xffd24a : 0xff5040);
            if (!firstPoint) firstPoint = point;
            anyCrit = anyCrit || isCrit;
        }

        if (firstPoint) {
            emitWorldSound('hit', firstPoint.x, firstPoint.y, firstPoint.z, p.id === 1);
            if (p.id === 1) {
                hitmark(p);
                if (anyCrit && typeof _flashCritHitmark === 'function') {
                    _flashCritHitmark();
                }
            }
        }
        return;
    }

    if (gameMode !== 'survival' && o && now >= o.deadUntil
        && (!firstHit
            || (!firstHit.object.userData.part
                && !firstHit.object.userData.barrelRef))) {
        const fallback = findMeleeFallbackTarget(p, [o], worldTargets);
        if (fallback) {
            applyMeleePlayerDamage(p, o, isHeavy, fallback.point, isOnlineHost);
            return;
        }
    }

    if (hits.length > 0) {
        const h = hits[0];

        const barrelRef = h.object.userData.barrelRef;
        if (barrelRef) {
            const dmg = isHeavy ? m.dmgHeavy : m.dmgLight;
            window.hitBarrel(barrelRef, dmg, p, h.point);
            if (p.id === 1) {
                hitmark(p);
            } else if (isOnlineHost) {
                NET_broadcast({ type: 'hitmarkForClient' });
            }
            emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
        } else {
            const part = h.object.userData.part;

            if (part && part.startsWith('zombie_')) {
                const zombie = h.object.userData.zombieRef;
                if (zombie && zombie.alive) {
                    let dmg = isHeavy ? m.dmgHeavy : m.dmgLight;
                    let isCrit = false;

                    // ★ 个人属性加成：伤害倍率 + 暴击
                    if (gameMode === 'survival'
                        && p.id === 1
                        && typeof SurvivalStats !== 'undefined') {
                        const roll = SurvivalStats.rollDamage(dmg);
                        dmg = roll.dmg;
                        isCrit = roll.isCrit;
                    }

                    // ★ 演奏僵尸走独立伤害入口
                    if (zombie._isPlayerZombie) {
                        if (typeof PlayerZombie !== 'undefined') {
                            PlayerZombie.damage(dmg, p);
                        }
                    } else if (typeof damageZombie === 'function') {
                        damageZombie(zombie, dmg, p);
                    }

                    // ★ 伤害飘字
                    if (p.id === 1 && typeof spawnDamageNumber === 'function') {
                        spawnDamageNumber(h.point, dmg, isCrit);
                    }

                    spawnSparks(h.point, isCrit ? 0xffd24a : 0xff5040);

                    if (p.id === 1) {
                        hitmark(p);
                        if (isCrit && typeof _flashCritHitmark === 'function') {
                            _flashCritHitmark();
                        }
                    }
                    emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                }
            } else if (part) {
                applyMeleePlayerDamage(p, o, isHeavy, h.point, isOnlineHost);
            } else {
                spawnSparks(h.point, 0xffd28a);

                const n = (typeof getHitWorldNormal === 'function')
                    ? getHitWorldNormal(h)
                    : new THREE.Vector3(0, 1, 0);

                if (typeof spawnSlashMark === 'function') {
                    spawnSlashMark(h.point, n, p.yaw, !!isHeavy);
                }
                if (isOnlineHost) {
                    NET_broadcast({
                        type: 'slashMark',
                        x: h.point.x, y: h.point.y, z: h.point.z,
                        nx: n.x, ny: n.y, nz: n.z,
                        yaw: p.yaw,
                        isVertical: !!isHeavy,
                    });
                }
            }
        }
    }
}
