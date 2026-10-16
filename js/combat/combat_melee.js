// ===== js/combat/combat_melee.js – 近战攻击 =====
// 从 game_combat.js 拆出，不改变任何对外接口
// 依赖：
//   · combat_shared.js 提供 _ray / _rcOrigin / _applyVulnerabilityBonus / _addDamage
//   · combat_damage.js 提供 damage（运行时读取）
//   · survival/zombie.js 提供 getAllZombies / damageZombie（生存模式）

// ============================================================
// 近战攻击
//   ★ 硬直期间禁止近战
//   ★ 易伤在 _addDamage 之前应用
//   ★ 生存模式命中僵尸 → 走 damageZombie()，不走玩家伤害链
//   ★ 生存模式 + p1 → 应用个人属性倍率 + 暴击
// ============================================================
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

    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;

    const isOnlineHost = (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost);

    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    // ============================================================
    // ★ targets 拼装
    //   · 生存模式：加所有存活僵尸的 hitMeshes
    //   · 其他模式：加 p2（对手）的 hitMeshes
    // ============================================================
    const targets = prepareShotTargets();
    const o = other(p);

    if (gameMode === 'survival') {
        if (typeof getAllZombies === 'function') {
            const zombies = getAllZombies();
            for (let zi = 0; zi < zombies.length; zi++) {
                const z = zombies[zi];
                if (!z.alive) continue;
                const zParts = z.hitMeshes;
                for (let pi = 0; pi < zParts.length; pi++) targets.push(zParts[pi]);
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

    if (hits.length > 0) {
        const h = hits[0];

        // ============================================================
        // 命中油桶
        // ============================================================
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

            // ============================================================
            // ★ 命中僵尸
            //   · 部位映射：zombie_head → head，zombie_leg → leg，其他 → body
            //   · 直接走 damageZombie()，不做玩家易伤/护甲/背刺
            //   · 刀对僵尸造成与打玩家相同的伤害（dmgLight / dmgHeavy）
            //   · 生存模式 + p1 → 应用个人属性倍率 + 暴击
            // ============================================================
            if (part && part.startsWith('zombie_')) {
                const zombie = h.object.userData.zombieRef;
                if (zombie && zombie.alive) {
                    // 僵尸没有明确弱点（头/腿伤害一样），用普通伤害
                    // 背刺也不做（僵尸没背）
                    let dmg = isHeavy ? m.dmgHeavy : m.dmgLight;
                    let isCrit = false;

                    // ★ 个人属性加成：伤害倍率 + 暴击（仅生存模式 + 玩家 p1）
                    if (gameMode === 'survival'
                        && p.id === 1
                        && typeof SurvivalStats !== 'undefined') {
                        const roll = SurvivalStats.rollDamage(dmg);
                        dmg = roll.dmg;
                        isCrit = roll.isCrit;
                    }

                    if (typeof damageZombie === 'function') {
                        damageZombie(zombie, dmg, p);
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
                // ============================================================
                // ★ 命中玩家（原有逻辑）
                // ============================================================
                const isBack = isBackAttack(p, o);
                let rawDmg = isHeavy ? m.dmgHeavy : m.dmgLight;
                if (isBack) rawDmg *= m.backMultiplier;

                // 应用易伤（在 _addDamage 之前）
                const dmg = _applyVulnerabilityBonus(o, rawDmg, now);

                _addDamage(p, o.id, 'body', dmg);

                spawnSparks(h.point, 0xff5040);
                if (p.id === 1) {
                    hitmark(p);
                } else if (isOnlineHost) {
                    NET_broadcast({ type: 'hitmarkForClient' });
                }
                emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                damage(o, dmg, p);
            } else {
                // ============================================================
                // ★ 命中场景（墙 / 箱子）→ 生成刀痕
                // ============================================================
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