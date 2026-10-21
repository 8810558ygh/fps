// ===== js/combat/combat_fire.js – 开火 =====
// 从 game_combat.js 拆出，不改变任何对外接口

function tryFire(p, now) {
    if (gameState !== 'combat') return;
    if (p.isMelee || p.isSmoke || p.isFlash) return;
    if (typeof _isPlayerStunned === 'function' && _isPlayerStunned(p)) return;

    const w = p.weapon;
    if (now < p.nextShot || now < p.deadUntil || p.reloadEnd > now || now < p.boltEnd) return;
    if (p.ammo <= 0) {
        emitWorldSound('empty', p.pos.x, p.pos.y + p.eyeH, p.pos.z, p.id === 1);
        p.nextShot = now + 300;
        startReload(p, now);
        return;
    }
    p.ammo--;

    const currentFireMs = _computeFireInterval(p, w, now);
    p.nextShot = now + currentFireMs;
    p.lastShotTime = now;

    if (w.key === 'sniper' && w.boltMs) {
        p.boltEnd = now + w.boltMs;
        p.aimStage = 0; p.aiming = false;
        if (p.input) p.input.aim = false;
        if (p.id === 1) mouse.aim = false;
    }

    const _fxEyeY = p.pos.y + p.eyeH;
    const _fxIsSelf = (p.id === 1);
    switch (w.key) {
        case 'sniper':  emitWorldSound('sniper',  p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        case 'shotgun': emitWorldSound('shotgun', p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        case 'odin':    emitWorldSound('odin',    p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        default:        emitWorldSound('rifle',   p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
    }
    if (p.muzzle) p.muzzle.intensity = 2.2;

    if (typeof window.spawnShellCasing === 'function') {
        window.spawnShellCasing(p, now);
    }

    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        p.cam.getWorldPosition(_rcOrigin);
        _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

        const cliSpread = (w.spread || 0) + _getMovementSpread(p);
        _rcRandDir.copy(_rcDir);
        if (cliSpread > 0) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(cliSpread)));
            _rcAxis.crossVectors(_rcDir, _rcUp).normalize();
            if (_rcAxis.length() < 0.01) _rcAxis.set(1, 0, 0);
            _rcQ1.setFromAxisAngle(_rcAxis, phi);
            _rcQ2.setFromAxisAngle(_rcDir, theta);
            _rcRandDir.applyQuaternion(_rcQ1).applyQuaternion(_rcQ2);
        }

        const localTargets = getShotTargets();
        _ray.set(_rcOrigin, _rcRandDir);
        _ray.near = 0;
        _ray.far = 150;
        const hitsLocal = _ray.intersectObjects(localTargets, false);
        _rcEnd.copy(_rcOrigin).addScaledVector(_rcRandDir, 100);
        if (hitsLocal.length > 0) _rcEnd.copy(hitsLocal[0].point);
        spawnTracer(muzzleWorld(p, _rcMuzzle), _rcEnd);

        if (w.recoil) {
            applyRecoil(p, w, now);
        }
        return;
    }

    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    const pellets = w.pellets || 1;
    const spread = (w.spread || 0) + _getMovementSpread(p);

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
        if (typeof PlayerZombie !== 'undefined' && PlayerZombie.active && !PlayerZombie.active.dead) {
            const pz = PlayerZombie.active;
            for (let pi = 0; pi < pz.hitMeshes.length; pi++) targets.push(pz.hitMeshes[pi]);
        }
    } else {
        if (now >= o.deadUntil) {
            const parts = getPlayerHitMeshes(o);
            for (let i = 0; i < parts.length; i++) targets.push(parts[i]);
        }
    }

    const isOnlineHost = (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost);
    let hitmarkSent = false;

    for (let i = 0; i < pellets; i++) {
        _rcRandDir.copy(_rcDir);
        if (spread > 0) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            _rcAxis.crossVectors(_rcDir, _rcUp).normalize();
            if (_rcAxis.length() < 0.01) _rcAxis.set(1, 0, 0);
            _rcQ1.setFromAxisAngle(_rcAxis, phi);
            _rcQ2.setFromAxisAngle(_rcDir, theta);
            _rcRandDir.applyQuaternion(_rcQ1).applyQuaternion(_rcQ2);
        }

        _ray.set(_rcOrigin, _rcRandDir);
        _ray.near = 0;
        _ray.far = 150;
        const hits = _ray.intersectObjects(targets, false);

        _rcEnd.copy(_rcOrigin).addScaledVector(_rcRandDir, 150);

        if (hits.length > 0) {
            let pierceLeft = w.pierce || 0;
            const hitTargets = new Set(); // 防止一次穿透打中同一个目标的不同部位两次

            for (let j = 0; j < hits.length; j++) {
                const h = hits[j];
                
                // 曳光弹终点暂时停在当前命中点
                _rcEnd.copy(h.point);

                const barrelRef = h.object.userData.barrelRef;
                const part = h.object.userData.part;
                const zombie = h.object.userData.zombieRef;

                let entityTarget = null;
                let isBarrel = false;
                let isZombie = false;
                let isPlayer = false;

                if (barrelRef) {
                    entityTarget = barrelRef;
                    isBarrel = true;
                } else if (part && part.startsWith('zombie_')) {
                    entityTarget = zombie;
                    isZombie = true;
                } else if (part) {
                    entityTarget = o;
                    isPlayer = true;
                }

                if (entityTarget) {
                    // 防止同一颗子弹在穿透时，击中同一个目标的多个部位（比如打穿手臂又打中身体）
                    if (hitTargets.has(entityTarget)) continue;
                    hitTargets.add(entityTarget);

                    // ---- 处理伤害 ----
                    if (isBarrel) {
                        const dmg = w.dmgBody || 30;
                        window.hitBarrel(barrelRef, dmg, p, h.point);
                        if (p.id === 1) hitmark(p);
                        else if (isOnlineHost && !hitmarkSent) { NET_broadcast({ type: 'hitmarkForClient' }); hitmarkSent = true; }
                        emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                    } else if (isZombie) {
                        if (zombie && zombie.alive) {
                            const dmgPart = (part === 'zombie_head') ? 'head' : (part === 'zombie_leg') ? 'leg' : 'body';
                            let dmg = _resolveDamage(w, dmgPart, h.distance);
                            let isCrit = false;

                            if (gameMode === 'survival' && p.id === 1 && typeof SurvivalStats !== 'undefined') {
                                const roll = SurvivalStats.rollDamage(dmg);
                                dmg = roll.dmg;
                                isCrit = roll.isCrit;
                            }

                            if (zombie._isPlayerZombie) {
                                if (typeof PlayerZombie !== 'undefined') PlayerZombie.damage(dmg, p);
                            } else if (typeof damageZombie === 'function') {
                                damageZombie(zombie, dmg, p);
                            }

                            if (p.id === 1 && typeof spawnDamageNumber === 'function') {
                                spawnDamageNumber(h.point, dmg, isCrit);
                            }
                            spawnSparks(h.point, isCrit ? 0xffd24a : 0xff5040);

                            if (p.id === 1) {
                                hitmark(p);
                                if (isCrit && typeof _flashCritHitmark === 'function') _flashCritHitmark();
                            }
                            emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                        }
                    } else if (isPlayer) {
                        const rawDmg = _resolveDamage(w, part, h.distance);
                        const dmg = _applyVulnerabilityBonus(o, rawDmg, now);
                        _addDamage(p, o.id, part, dmg);

                        spawnSparks(h.point, 0xff5040);
                        if (p.id === 1) hitmark(p);
                        else if (isOnlineHost && !hitmarkSent) { NET_broadcast({ type: 'hitmarkForClient' }); hitmarkSent = true; }
                        emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                        damage(o, dmg, p);
                    }

                    // ★ 判断穿透
                    if (pierceLeft > 0) {
                        pierceLeft--; // 消耗一次穿透，继续循环检测后面的物体
                    } else {
                        break; // 没穿透了，子弹停止
                    }
                } else {
                    // ---- 打中墙、箱子、地面（不可穿透物）----
                    spawnSparks(h.point, 0xffd28a);
                    const n = getHitWorldNormal(h);
                    spawnBulletHole(h.point, n);
                    if (isOnlineHost) {
                        NET_broadcast({
                            type: 'bulletHole',
                            x: h.point.x, y: h.point.y, z: h.point.z,
                            nx: n.x, ny: n.y, nz: n.z
                        });
                    }
                    break; // 穿墙失败，子弹立即停止
                }
            }
        }

        if (i === 0) {
            const mw = muzzleWorld(p, _rcMuzzle);
            spawnTracer(mw, _rcEnd);
            if (isOnlineHost) {
                NET_broadcast({
                    type: 'shootEvent',
                    weapon: w.key,
                    shooter: (p === p1) ? 'p1' : 'p2',
                    sx: mw.x, sy: mw.y, sz: mw.z,
                    ex: _rcEnd.x, ey: _rcEnd.y, ez: _rcEnd.z
                });
            }
        }
    }

    if (w.recoil) {
        applyRecoil(p, w, now);
    }
}