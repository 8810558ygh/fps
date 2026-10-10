// ===== js/game_combat.js – 射击、伤害、击杀、玩家更新、第三人称动画 =====

// ============================================================
// 复用 Raycaster 与临时向量
// ============================================================
const _ray        = new THREE.Raycaster();
const _rcOrigin   = new THREE.Vector3();
const _rcTarget   = new THREE.Vector3();
const _rcDir      = new THREE.Vector3();
const _rcEnd      = new THREE.Vector3();
const _rcRandDir  = new THREE.Vector3();
const _rcMuzzle   = new THREE.Vector3();
const _rcUp       = new THREE.Vector3(0, 1, 0);
const _rcAxis     = new THREE.Vector3();
const _rcQ1       = new THREE.Quaternion();
const _rcQ2       = new THREE.Quaternion();
const _rcRecoilPos = new THREE.Vector3();
const _rcRecoilRot = new THREE.Euler();

// ============================================================
// ★ 命中部位 → 伤害解析（新增 distance 参数，支持距离衰减）
// ============================================================
function _resolveDamage(weaponCfg, part, distance) {
    if (!weaponCfg) return 0;

    const useFar = (weaponCfg.falloffDistance !== undefined)
        && (distance !== undefined)
        && (distance > weaponCfg.falloffDistance);

    if (part === 'head') {
        const near = weaponCfg.dmgHead || 0;
        const far  = (weaponCfg.dmgHeadFar !== undefined) ? weaponCfg.dmgHeadFar : near;
        return useFar ? far : near;
    }
    if (part === 'leg') {
        const near = weaponCfg.dmgLeg || 0;
        const far  = (weaponCfg.dmgLegFar !== undefined) ? weaponCfg.dmgLegFar : near;
        return useFar ? far : near;
    }
    const near = weaponCfg.dmgBody || 0;
    const far  = (weaponCfg.dmgBodyFar !== undefined) ? weaponCfg.dmgBodyFar : near;
    return useFar ? far : near;
}
window._resolveDamage = _resolveDamage;

// ============================================================
// 伤害统计
// ============================================================
function _ensureDmgEntry(p, targetId) {
    if (!p.damageDealt[targetId]) {
        p.damageDealt[targetId] = { body: 0, head: 0, leg: 0, total: 0 };
    }
    return p.damageDealt[targetId];
}
function _addDamage(p, targetId, part, dmg) {
    const e = _ensureDmgEntry(p, targetId);
    if (part === 'head') e.head += dmg;
    else if (part === 'leg') e.leg += dmg;
    else e.body += dmg;
    e.total += dmg;
}

// ============================================================
// ★★★ 后坐力系统 ★★★
// ============================================================

// 判断玩家是否正在移动（用于移动开火倍率）
function _isPlayerMoving(p) {
    if (!p || !p.input) return false;
    return (Math.abs(p.input.forward || 0) > 0.1)
        || (Math.abs(p.input.right   || 0) > 0.1);
}

// ============================================================
// 应用后坐力：每次开火后调用（★ 必须在弹丸发射完成之后）
//
//   ★ 时序说明：
//     1. 弹丸沿"当前 cam 方向"射出（此时不含本发后坐力）
//     2. 所有弹丸处理完之后，才调用本函数累积偏移
//     3. 因此第一枪永远精准，从第二发开始上抬
// ============================================================
function applyRecoil(p, w, now) {
    const cfg = w.recoil;
    if (!cfg) return;
    if (!p.recoil) return;

    const r = p.recoil;

    // ---- 判断是否是新连发序列 ----
    const timeSinceLastShot = now - r.lastShotTime;
    if (timeSinceLastShot > 250) {
        r.bulletCount = 0;
        r.horizontalDir = Math.random() < 0.5 ? 1 : -1;
    }
    r.lastShotTime = now;
    r.bulletCount++;

    const shotIdx = r.bulletCount - 1;   // 0-based

    // ---- 垂直后坐力（每发递增，到上限后稳定）----
    const vertRaw    = cfg.vertFirst + shotIdx * cfg.vertPerShot;
    const vertAmount = Math.min(vertRaw, cfg.vertMax);

    // ---- 水平后坐力（前 N 发保护）----
    let horizAmount = 0;
    if (r.bulletCount > cfg.horizStart) {
        if (Math.random() < cfg.horizSwitchRate) {
            r.horizontalDir *= -1;
        }
        const horizIdx    = r.bulletCount - cfg.horizStart;
        const horizGrowth = Math.min(1, horizIdx / 8);
        horizAmount = cfg.horizMax * horizGrowth * r.horizontalDir;
    }

    // ---- 姿态倍率 ----
    let mul = 1.0;
    if (p.input && p.input.crouch) mul *= cfg.crouchMul;
    if (p.aiming)                  mul *= cfg.adsMul;
    if (_isPlayerMoving(p))        mul *= cfg.moveMul;

    // ---- 施加到后坐力偏移（不污染 p.pitch / p.yaw）----
    r.offsetPitch += vertAmount * mul;
    r.offsetYaw   += horizAmount * mul;

    // ---- 上限钳制 ----
    if (r.offsetPitch > cfg.maxOffsetPitch) r.offsetPitch = cfg.maxOffsetPitch;
    if (r.offsetYaw > cfg.maxOffsetYaw)     r.offsetYaw   = cfg.maxOffsetYaw;
    if (r.offsetYaw < -cfg.maxOffsetYaw)    r.offsetYaw   = -cfg.maxOffsetYaw;

    // ---- 立即更新摄像机，让下一发子弹方向正确 ----
    if (p.cam) {
        p.cam.rotation.x = p.pitch + r.offsetPitch;
        p.cam.rotation.y = p.yaw   + r.offsetYaw;
        p.cam.updateMatrixWorld(true);
    }
}

// ============================================================
// 更新后坐力恢复（每帧调用）
// ============================================================
function updateRecoilRecovery(p, dt, now) {
    if (!p || !p.recoil) return;

    const r = p.recoil;
    const timeSinceLastShot = now - r.lastShotTime;

    // 未到恢复延迟，或正在开火，直接跳过
    if (timeSinceLastShot < RECOIL_RECOVER_DELAY_MS) return;

    // 指数衰减
    const decay = 1 - Math.exp(-RECOIL_RECOVER_RATE * dt);

    r.offsetPitch *= (1 - decay);
    r.offsetYaw   *= (1 - decay);

    // 低于阈值时归零
    if (Math.abs(r.offsetPitch) < RECOIL_MIN_THRESHOLD) r.offsetPitch = 0;
    if (Math.abs(r.offsetYaw)   < RECOIL_MIN_THRESHOLD) r.offsetYaw   = 0;

    // 完全恢复后重置连发计数
    if (r.offsetPitch === 0 && r.offsetYaw === 0) {
        r.bulletCount = 0;
    }
}

// ============================================================
// 近战攻击（含油桶命中）
//
//   · 轻击（左键）：水平刀痕（挥砍）
//   · 重击（右键）：垂直刀痕（往前刺）
// ============================================================
function tryMelee(p, now, isHeavy) {
    if (gameState !== 'combat') return;
    if (!p.isMelee) return;
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

    const targets = prepareShotTargets();
    const o = other(p);
    if (now >= o.deadUntil) {
        const parts = getPlayerHitMeshes(o);
        for (let i = 0; i < parts.length; i++) targets.push(parts[i]);
    }

    _ray.set(_rcOrigin, _rcDir);
    _ray.near = 0;
    _ray.far = m.range;
    const hits = _ray.intersectObjects(targets, false);

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
            if (part) {
                const isBack = isBackAttack(p, o);
                let dmg = isHeavy ? m.dmgHeavy : m.dmgLight;
                if (isBack) dmg *= m.backMultiplier;

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
                // ---- 命中墙面 / 箱子 ----
                spawnSparks(h.point, 0xffd28a);

                const n = (typeof getHitWorldNormal === 'function')
                    ? getHitWorldNormal(h)
                    : new THREE.Vector3(0, 1, 0);

                // 轻击 → 水平刀痕；重击 → 垂直刀痕
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

// ============================================================
// 开火（含油桶命中 + 弹壳抛射 + 后坐力）
//
// ★ 后坐力时序（关键修复）：
//   1. 用「当前 cam 方向」发射所有弹丸（不含本发后坐力）
//   2. 所有弹丸处理完毕后，才调用 applyRecoil 累积偏移
//   3. 因此第一枪永远精准，从第二发开始才上抬
// ============================================================
function tryFire(p, now) {
    if (gameState !== 'combat') return;
    if (p.isMelee || p.isSmoke || p.isFlash) return;

    const w = p.weapon;
    if (now < p.nextShot || now < p.deadUntil || p.reloadEnd > now || now < p.boltEnd) return;
    if (p.ammo <= 0) {
        emitWorldSound('empty', p.pos.x, p.pos.y + p.eyeH, p.pos.z, p.id === 1);
        p.nextShot = now + 300;
        startReload(p, now);
        return;
    }
    p.ammo--;

    // ============================================================
    // 射速计算（含开镜惩罚 + 奥丁 spin-up）
    // ============================================================
    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        if (p.aiming) {
            p.spinUpProgress = 1;
            currentFireMs = w.minFireMs;
        } else {
            const since = now - (p.lastShotTime || 0);
            if (since < 200) {
                p.spinUpProgress = Math.min(1, (p.spinUpProgress || 0) + since / w.spinUpMs);
            } else {
                p.spinUpProgress = 0;
            }
            currentFireMs = Math.max(
                w.minFireMs,
                w.fireMs - (w.fireMs - w.minFireMs) * p.spinUpProgress
            );
        }
    } else if (p.aiming && w.adsFireRateMul) {
        currentFireMs = currentFireMs / w.adsFireRateMul;
    }
    p.nextShot = now + currentFireMs;
    p.lastShotTime = now;

    if (w.key === 'sniper' && w.boltMs) {
        p.boltEnd = now + w.boltMs;
        p.aimStage = 0; p.aiming = false;
        if (p.input) p.input.aim = false;
        if (p.id === 1) mouse.aim = false;
    }

    // ---- 音效 ----
    const _fxEyeY = p.pos.y + p.eyeH;
    const _fxIsSelf = (p.id === 1);
    switch (w.key) {
        case 'sniper':  emitWorldSound('sniper',  p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        case 'shotgun': emitWorldSound('shotgun', p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        case 'odin':    emitWorldSound('odin',    p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
        default:        emitWorldSound('rifle',   p.pos.x, _fxEyeY, p.pos.z, _fxIsSelf); break;
    }
    p.muzzle.intensity = 2.2;
    if (p.id === 1) p.vmMuzzle.intensity = 2.2;

    if (typeof window.spawnShellCasing === 'function') {
        window.spawnShellCasing(p, now);
    }

    // ============================================================
    // 联机客户端：只发射曳光弹
    //   ★ 先发射（用当前 cam 方向，不含本发后坐力）
    //   ★ 发射完之后再应用后坐力（影响下一发）
    // ============================================================
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        p.cam.getWorldPosition(_rcOrigin);
        _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

        const localTargets = getShotTargets();
        _ray.set(_rcOrigin, _rcDir);
        _ray.near = 0;
        _ray.far = 150;
        const hitsLocal = _ray.intersectObjects(localTargets, false);
        _rcEnd.copy(_rcOrigin).addScaledVector(_rcDir, 100);
        if (hitsLocal.length > 0) _rcEnd.copy(hitsLocal[0].point);
        spawnTracer(muzzleWorld(p, _rcMuzzle), _rcEnd);

        // ★ 发射后应用后坐力（只影响下一发）
        if (w.recoil) {
            applyRecoil(p, w, now);
        }
        return;
    }

    // ============================================================
    // 本地/房主：完整射击逻辑
    //   ★ 关键：这里用当前 cam 方向（不含本发后坐力），
    //     因为 applyRecoil 还没被调用
    // ============================================================
    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    const pellets = w.pellets || 1;
    const spread = w.spread || 0;

    const targets = prepareShotTargets();
    const o = other(p);
    if (now >= o.deadUntil) {
        const parts = getPlayerHitMeshes(o);
        for (let i = 0; i < parts.length; i++) targets.push(parts[i]);
    }

    const isOnlineHost = (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost);

    let hitmarkSent = false;

    // ---------- 弹丸循环（每个弹丸都用同一"当前朝向"）----------
    for (let i = 0; i < pellets; i++) {
        _rcRandDir.copy(_rcDir);
        if (pellets > 1) {
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
        if (hits.length) {
            const h = hits[0];
            _rcEnd.copy(h.point);

            const barrelRef = h.object.userData.barrelRef;
            if (barrelRef) {
                const dmg = w.dmgBody || 30;
                window.hitBarrel(barrelRef, dmg, p, h.point);
                if (p.id === 1) {
                    hitmark(p);
                } else if (isOnlineHost && !hitmarkSent) {
                    NET_broadcast({ type: 'hitmarkForClient' });
                    hitmarkSent = true;
                }
                emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
            } else {
                const part = h.object.userData.part;
                if (part) {
                    const dmg = _resolveDamage(w, part, h.distance);
                    _addDamage(p, o.id, part, dmg);

                    spawnSparks(h.point, 0xff5040);
                    if (p.id === 1) {
                        hitmark(p);
                    } else if (isOnlineHost && !hitmarkSent) {
                        NET_broadcast({ type: 'hitmarkForClient' });
                        hitmarkSent = true;
                    }
                    emitWorldSound('hit', h.point.x, h.point.y, h.point.z, p.id === 1);
                    damage(o, dmg, p);
                } else {
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
                    sx: mw.x, sy: mw.y, sz: mw.z,
                    ex: _rcEnd.x, ey: _rcEnd.y, ez: _rcEnd.z
                });
            }
        }
    }

    // ============================================================
    // ★★★ 所有弹丸都射完了，才应用后坐力 ★★★
    //   —— 只影响下一发的方向，本次开火方向保持不变
    // ============================================================
    if (w.recoil) {
        applyRecoil(p, w, now);
    }
}

function damage(victim, dmg, from) {
    if (gameState !== 'combat') return;
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;
    const now = performance.now();
    if (victim.hp <= 0) return;
    if (now < victim.invulnUntil) { sEmpty(from.id); return; }
    let hpDamage = dmg;
    if (victim.armor > 0) {
        const wantAbsorb = dmg * ARMOR_ABSORB;
        const actualAbsorb = Math.min(victim.armor, wantAbsorb);
        victim.armor = Math.max(0, victim.armor - actualAbsorb);
        hpDamage = dmg - actualAbsorb;
    }
    victim.hp -= hpDamage;
    dmgFlash(victim);
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (victim === p2 && typeof NET_sendDamageEvent === 'function') {
            NET_sendDamageEvent('p2', dmg);
        }
    }
    if (victim.hp <= 0) kill(victim, from, now);
}

// ============================================================
// kill
// ============================================================
function kill(victim, from, now) {
    const isSuicide = (from === victim);

    const scoringPlayer = isSuicide ? other(victim) : from;

    if (scoringPlayer) scoringPlayer.score++;

    victim.hp = 0;
    victim.deadUntil = Infinity;

    const emptyDmg = { body: 0, head: 0, leg: 0, total: 0 };
    const dmgByAttacker = scoringPlayer.damageDealt[victim.id] || emptyDmg;
    const dmgByVictim   = victim.damageDealt[scoringPlayer.id] || emptyDmg;
    lastKillReport = { attacker: scoringPlayer, victim: victim, dmgByAttacker, dmgByVictim };

    let killerSeat = null, victimSeat = null;
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        const hostSeat  = (NET.mySeat === 'red') ? 'red' : 'blue';
        const otherSeat = (hostSeat === 'blue')  ? 'red' : 'blue';

        if (isSuicide) {
            const suicideSeat = (victim === p1) ? hostSeat : otherSeat;
            killerSeat = suicideSeat;
            victimSeat = suicideSeat;
        } else {
            killerSeat = (scoringPlayer === p1) ? hostSeat : otherSeat;
            victimSeat = (victim === p1) ? hostSeat : otherSeat;
        }

        if (typeof NET_sendKillEvent === 'function') {
            NET_sendKillEvent(
                killerSeat, victimSeat, roundNumber,
                { head: dmgByAttacker.head, body: dmgByAttacker.body, leg: dmgByAttacker.leg, total: dmgByAttacker.total },
                { head: dmgByVictim.head,   body: dmgByVictim.body,   leg: dmgByVictim.leg,   total: dmgByVictim.total }
            );
        }
    }

    if (window.showRoundReport) {
        window.showRoundReport(
            roundNumber, scoringPlayer, victim,
            dmgByAttacker, dmgByVictim,
            killerSeat, victimSeat
        );
    }

    delete from.damageDealt[victim.id];
    delete victim.damageDealt[from.id];

    if (isSuicide) {
        feed(victim, `<b style="color:#ff7a6d">自我击杀</b>（自爆）`);
    } else {
        feed(victim, `被 <b style="color:${from.id===1?'#6db3ff':'#ff7a6d'}">玩家${from.id}</b> 击杀`);
        feed(from, `<b style="color:#ffd24a">击杀 玩家${victim.id}！</b>  +1`);
    }

    const _vEyeY = victim.pos.y + victim.eyeH;
    emitWorldSound('death', victim.pos.x, _vEyeY, victim.pos.z, victim.id === 1);
    const _kEyeY = scoringPlayer.pos.y + scoringPlayer.eyeH;
    emitWorldSound('kill', scoringPlayer.pos.x, _kEyeY, scoringPlayer.pos.z, scoringPlayer.id === 1);

    if (gameMode === 'ai' && !isSuicide) {
        if (from.id === 2 && typeof aiTaunt === 'function') aiTaunt();
        if (from.id === 1 && typeof resetAiStreakOnPlayerKill === 'function') resetAiStreakOnPlayerKill();
    }

    if (scoringPlayer.score >= TARGET_KILLS) { endMatch(scoringPlayer); return; }
    gameState = 'roundEnd';
    stateEndTime = now + ROUND_END_MS;
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('roundEnd', ROUND_END_MS, false, roundNumber);
        }
    }
}

// ============================================================
// 狙击开火后坐力
// ============================================================
function computeSniperRecoil(p, now) {
    if (!p || !p.lastShotTime) return 0;
    const RECOIL_MS = 750;
    const dt = now - p.lastShotTime;
    if (dt < 0 || dt >= RECOIL_MS) return 0;
    const t = 1 - dt / RECOIL_MS;
    return Math.pow(t, 1.35);
}

// ============================================================
// ★ 第一人称换弹动画（步枪 · 拆弹匣 → 装新弹匣）
// ============================================================
function updateRifleReloadAnim(vm, p, now) {
    const w = p.weapon;
    const total = w.reloadMs || 2500;
    const elapsed = total - (p.reloadEnd - now);
    const t = Math.max(0, Math.min(1, elapsed / total));

    if (!p._reloadAnimLogged) {
        p._reloadAnimLogged = true;
        console.log('[reload anim] 触发。magazineGroup =',
            vm.userData.magazineGroup ? 'OK' : 'MISSING');
    }

    const bp = vm.userData.basePos;
    const br = vm.userData.baseRot;

    let sink = 0;
    if (t < 0.10) sink = t / 0.10;
    else if (t < 0.90) sink = 1;
    else sink = 1 - (t - 0.90) / 0.10;

    const tilt   = sink * 0.22;
    const sinkY  = sink * 0.10;
    const rollZ  = sink * 0.25;
    const wobble = Math.sin(t * Math.PI * 6) * 0.006 * sink;

    vm.position.set(bp.x + wobble, bp.y - sinkY, bp.z);
    vm.rotation.set(br.x + tilt, br.y, br.z + rollZ);

    const mag = vm.userData.magazineGroup;
    if (!mag) return;

    if (!mag.userData._basePos) {
        mag.userData._basePos = {
            x: mag.position.x,
            y: mag.position.y,
            z: mag.position.z
        };
    }
    const mb = mag.userData._basePos;

    let oy = 0;
    let oz = 0;

    if (t < 0.12) {
        oy = 0; oz = 0;
    } else if (t < 0.30) {
        const mt = (t - 0.12) / 0.18;
        const e = 1 - Math.pow(1 - mt, 2);
        oy =  0.14 * e;
        oz =  0.03 * e;
    } else if (t < 0.50) {
        const mt = (t - 0.30) / 0.20;
        const e = mt * mt;
        oy =  0.14 - 0.75 * e;
        oz =  0.03 - 0.05 * e;
    } else if (t < 0.65) {
        oy = -0.61;
        oz = -0.02;
    } else if (t < 0.85) {
        const mt = (t - 0.65) / 0.20;
        const e = 1 - Math.pow(1 - mt, 2);
        oy = -0.61 + 0.65 * e;
        oz = -0.02 * (1 - e);
    } else {
        const mt = (t - 0.85) / 0.15;
        const e = 1 - Math.pow(1 - mt, 2);
        oy = 0.04 * (1 - e);
        oz = 0;
    }

    mag.position.set(mb.x, mb.y + oy, mb.z + oz);
}

// ============================================================
// 第一人称视图模型动画
// ============================================================
function updateSniperViewmodel(p, dt, now) {
    // ★ 只有本地视角玩家（p1）需要 viewmodel 动画。
    //    p2 的 viewmodel 在 main.js 的 render() 里被强制隐藏，
    //    永远不可见 → 在这里为它跑动画纯属浪费 CPU。
    if (p !== p1) return;
    if (!p.vm || p.vm.children.length === 0) return;
    const vm = p.vm.children[0];
    if (!vm.userData.basePos || !vm.userData.baseRot) return;
    const w = p.weapon;

    if (w && w.key === 'rifle' && vm.userData.magazineGroup
        && p.reloadEnd > now
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        updateRifleReloadAnim(vm, p, now);
        return;
    }

    if (w && vm.userData.adsPos
        && (w.key === 'rifle' || w.key === 'odin')
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        const adsOn = !!p.aiming;
        const targetPos = adsOn ? vm.userData.adsPos : vm.userData.basePos;
        const targetRot = adsOn ? vm.userData.adsRot : vm.userData.baseRot;
        const speed = adsOn ? 20 : 12;
        const k = Math.min(1, dt * speed);

        vm.position.x += (targetPos.x - vm.position.x) * k;
        vm.position.y += (targetPos.y - vm.position.y) * k;
        vm.position.z += (targetPos.z - vm.position.z) * k;
        vm.rotation.x += (targetRot.x - vm.rotation.x) * k;
        vm.rotation.y += (targetRot.y - vm.rotation.y) * k;
        vm.rotation.z += (targetRot.z - vm.rotation.z) * k;

        return;
    }

    if (w && w.key === 'sniper' && vm.userData.adsPos
        && !p.isMelee && !p.isSmoke && !p.isFlash
        && p.aiming) {
        const targetPos = vm.userData.adsPos;
        const targetRot = vm.userData.adsRot;
        const speed = 14;
        const k = Math.min(1, dt * speed);

        vm.position.x += (targetPos.x - vm.position.x) * k;
        vm.position.y += (targetPos.y - vm.position.y) * k;
        vm.position.z += (targetPos.z - vm.position.z) * k;
        vm.rotation.x += (targetRot.x - vm.rotation.x) * k;
        vm.rotation.y += (targetRot.y - vm.rotation.y) * k;
        vm.rotation.z += (targetRot.z - vm.rotation.z) * k;

        if (p.boltEnd > now && w.boltMs && vm.userData.boltGroup) {
            const progress = 1 - (p.boltEnd - now) / w.boltMs;
            let pull;
            if (progress < 0.30) {
                const t = progress / 0.30;
                pull = t * t;
            } else if (progress < 0.55) {
                pull = 1.0;
            } else {
                const t = (progress - 0.55) / 0.45;
                pull = 1 - t * t;
            }
            pull = Math.max(0, Math.min(1, pull));
            vm.userData.boltGroup.position.x = -pull * 0.18;
        } else if (vm.userData.boltGroup) {
            vm.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
        }

        return;
    }

    if (p.isMelee && p.meleeEnd > now) {
        const fireMs = p.meleeIsHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs;
        const progress = 1 - (p.meleeEnd - now) / fireMs;
        const bp = vm.userData.basePos;
        const br = vm.userData.baseRot;

        if (p.meleeIsHeavy) {
            let phase, t;
            if (progress < 0.35) { phase = 'wind';   t = progress / 0.35; }
            else if (progress < 0.55) { phase = 'thrust'; t = (progress - 0.35) / 0.20; }
            else { phase = 'recover'; t = (progress - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = t * t;
                vm.position.set(bp.x + e * 0.16, bp.y + e * 0.12, bp.z + e * 0.18);
                vm.rotation.set(br.x + e * 0.10, br.y - e * 0.60, br.z + e * 0.55);
            } else if (phase === 'thrust') {
                const e = 1 - Math.pow(1 - t, 2.5);
                vm.position.set(bp.x + 0.16 - e * 0.22, bp.y + 0.12 - e * 0.18, bp.z + 0.18 - e * 0.88);
                vm.rotation.set(br.x + 0.10 - e * 0.08, br.y - 0.60 + e * 0.75, br.z + 0.55 - e * 0.70);
            } else {
                const e = 1 - t;
                vm.position.set(bp.x - 0.06 * e, bp.y - 0.06 * e, bp.z - 0.70 * e);
                vm.rotation.set(br.x + 0.02 * e, br.y + 0.15 * e, br.z - 0.15 * e);
            }
            return;
        }

        let phase, t;
        if (progress < 0.25) { phase = 'wind';   t = progress / 0.25; }
        else if (progress < 0.55) { phase = 'swing';  t = (progress - 0.25) / 0.30; }
        else { phase = 'recover'; t = (progress - 0.55) / 0.45; }
        if (phase === 'wind') {
            const e = t * t;
            vm.position.set(bp.x + e * 0.22, bp.y + e * 0.10, bp.z + e * 0.10);
            vm.rotation.set(br.x + e * 0.18, br.y - e * 0.45, br.z + e * 0.45);
        } else if (phase === 'swing') {
            const e = 1 - Math.pow(1 - t, 2.2);
            vm.position.set(bp.x + 0.22 - e * 0.72, bp.y + 0.10 - e * 0.20, bp.z + 0.10 - e * 0.28);
            vm.rotation.set(br.x + 0.18 - e * 0.22, br.y - 0.45 + e * 1.55, br.z + 0.45 - e * 1.15);
        } else {
            const e = 1 - t;
            vm.position.set(bp.x - 0.50 * e, bp.y - 0.10 * e, bp.z - 0.18 * e);
            vm.rotation.set(br.x - 0.04 * e, br.y + 1.10 * e, br.z - 0.70 * e);
        }
        return;
    }

    if (p.isSmoke || p.isFlash) {
        const t = now * 0.003;
        vm.position.set(vm.userData.basePos.x + Math.sin(t) * 0.005,
                        vm.userData.basePos.y + Math.sin(t * 1.3) * 0.008,
                        vm.userData.basePos.z);
        vm.rotation.set(vm.userData.baseRot.x + Math.sin(t * 0.7) * 0.03,
                        vm.userData.baseRot.y + Math.sin(t) * 0.04,
                        vm.userData.baseRot.z);
        return;
    }

    if (w.key === 'sniper' && w.boltMs && p.boltEnd > now) {
        const progress = 1 - (p.boltEnd - now) / w.boltMs;

        let pull;
        if (progress < 0.30) {
            const t = progress / 0.30;
            pull = t * t;
        } else if (progress < 0.55) {
            pull = 1.0;
        } else {
            const t = (progress - 0.55) / 0.45;
            pull = 1 - t * t;
        }
        pull = Math.max(0, Math.min(1, pull));

        const boltGroup = vm.userData.boltGroup;
        if (boltGroup) {
            boltGroup.position.x = -pull * 0.18;
        }

        const recoil = computeSniperRecoil(p, now);

        _rcRecoilPos.copy(vm.userData.basePos);
        _rcRecoilPos.y += recoil * 0.16;
        _rcRecoilPos.z += recoil * 0.13;

        _rcRecoilRot.copy(vm.userData.baseRot);
        _rcRecoilRot.z += recoil * 0.45;

        const k = Math.min(1, dt * 16);
        vm.position.x += (_rcRecoilPos.x - vm.position.x) * k;
        vm.position.y += (_rcRecoilPos.y - vm.position.y) * k;
        vm.position.z += (_rcRecoilPos.z - vm.position.z) * k;
        vm.rotation.x += (_rcRecoilRot.x - vm.rotation.x) * k;
        vm.rotation.y += (_rcRecoilRot.y - vm.rotation.y) * k;
        vm.rotation.z += (_rcRecoilRot.z - vm.rotation.z) * k;

        return;
    }

    const k = Math.min(1, dt * 15);
    vm.position.lerp(vm.userData.basePos, k);
    vm.rotation.x += (vm.userData.baseRot.x - vm.rotation.x) * k;
    vm.rotation.y += (vm.userData.baseRot.y - vm.rotation.y) * k;
    vm.rotation.z += (vm.userData.baseRot.z - vm.rotation.z) * k;

    if (w.key === 'sniper' && vm.userData.boltGroup) {
        vm.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
    }
}

// ============================================================
// ★★★ 第三人称动画（远端玩家看到的动画） ★★★
// ============================================================
function updateThirdPersonWeapon(p, dt, now) {
    if (!p.gunHolder) return;
    const gh = p.gunHolder;

    if (!gh.userData.basePos) {
        gh.userData.basePos = gh.position.clone();
        gh.userData.baseRot = gh.rotation.clone();
    }
    const bp = gh.userData.basePos;
    const br = gh.userData.baseRot;

    const k = Math.min(1, dt * 14);

    const gun = gh.children.length > 0 ? gh.children[0] : null;

    if (gun && gun.userData && gun.userData.boltGroup) {
        if (p.weapon && p.weapon.key === 'sniper' && p.weapon.boltMs && p.boltEnd > now) {
            const progress = 1 - (p.boltEnd - now) / p.weapon.boltMs;
            let pull;
            if (progress < 0.30) {
                const t = progress / 0.30;
                pull = t * t;
            } else if (progress < 0.55) {
                pull = 1.0;
            } else {
                const t = (progress - 0.55) / 0.45;
                pull = 1 - t * t;
            }
            pull = Math.max(0, Math.min(1, pull));
            gun.userData.boltGroup.position.x = -pull * 0.18;
        } else {
            gun.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
        }
    }

    if (p.isMelee && p.meleeEnd > now) {
        const fireMs = p.meleeIsHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs;
        const t = 1 - (p.meleeEnd - now) / fireMs;

        if (p.meleeIsHeavy) {
            let phase, tt;
            if (t < 0.35) { phase = 'wind'; tt = t / 0.35; }
            else if (t < 0.55) { phase = 'thrust'; tt = (t - 0.35) / 0.20; }
            else { phase = 'recover'; tt = (t - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = tt * tt;
                gh.position.set(bp.x + e * 0.10, bp.y + e * 0.15, bp.z + e * 0.20);
                gh.rotation.set(br.x - e * 0.30, br.y - e * 0.60, br.z + e * 0.50);
            } else if (phase === 'thrust') {
                const e = 1 - Math.pow(1 - tt, 2.5);
                gh.position.set(bp.x + 0.10 - e * 0.05, bp.y + 0.15 - e * 0.20, bp.z + 0.20 - e * 0.95);
                gh.rotation.set(br.x - 0.30 + e * 0.20, br.y - 0.60 + e * 0.70, br.z + 0.50 - e * 0.60);
            } else {
                const e = 1 - tt;
                gh.position.set(bp.x + 0.05 * e, bp.y - 0.05 * e, bp.z - 0.75 * e);
                gh.rotation.set(br.x - 0.10 * e, br.y + 0.10 * e, br.z - 0.10 * e);
            }
        } else {
            let phase, tt;
            if (t < 0.25) { phase = 'wind'; tt = t / 0.25; }
            else if (t < 0.55) { phase = 'swing'; tt = (t - 0.25) / 0.30; }
            else { phase = 'recover'; tt = (t - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = tt * tt;
                gh.position.set(bp.x + e * 0.20, bp.y + e * 0.08, bp.z + e * 0.10);
                gh.rotation.set(br.x - e * 0.20, br.y - e * 0.30, br.z + e * 0.30);
            } else if (phase === 'swing') {
                const e = 1 - Math.pow(1 - tt, 2.2);
                gh.position.set(bp.x + 0.20 - e * 0.65, bp.y + 0.08 - e * 0.15, bp.z + 0.10 - e * 0.25);
                gh.rotation.set(br.x - 0.20 + e * 0.30, br.y - 0.30 + e * 1.20, br.z + 0.30 - e * 1.00);
            } else {
                const e = 1 - tt;
                gh.position.set(bp.x - 0.45 * e, bp.y - 0.07 * e, bp.z - 0.15 * e);
                gh.rotation.set(br.x + 0.10 * e, br.y + 0.90 * e, br.z - 0.70 * e);
            }
        }
        return;
    }

    if (p.reloadEnd > now && !p.isMelee && !p.isSmoke && !p.isFlash) {
        const w = p.weapon;
        const total = w.reloadMs || 2000;
        const t = 1 - (p.reloadEnd - now) / total;

        let sink = 0;
        if (t < 0.10) sink = t / 0.10;
        else if (t < 0.90) sink = 1;
        else sink = 1 - (t - 0.90) / 0.10;

        const tilt   = sink * 0.22;
        const sinkY  = sink * 0.10;
        const rollZ  = sink * 0.22;
        const wobble = Math.sin(t * Math.PI * 6) * 0.02 * sink;

        gh.position.set(bp.x + wobble, bp.y - sinkY, bp.z);
        gh.rotation.set(br.x + tilt, br.y, br.z + rollZ);

        if (gun && gun.userData && gun.userData.magazineGroup) {
            const mag = gun.userData.magazineGroup;

            if (!mag.userData._basePos) {
                mag.userData._basePos = {
                    x: mag.position.x,
                    y: mag.position.y,
                    z: mag.position.z
                };
            }
            const mb = mag.userData._basePos;

            let oy = 0;
            let oz = 0;

            if (t < 0.12) {
                oy = 0; oz = 0;
            } else if (t < 0.30) {
                const mt = (t - 0.12) / 0.18;
                const e = 1 - Math.pow(1 - mt, 2);
                oy =  0.14 * e;
                oz =  0.03 * e;
            } else if (t < 0.50) {
                const mt = (t - 0.30) / 0.20;
                const e = mt * mt;
                oy =  0.14 - 0.75 * e;
                oz =  0.03 - 0.05 * e;
            } else if (t < 0.65) {
                oy = -0.61;
                oz = -0.02;
            } else if (t < 0.85) {
                const mt = (t - 0.65) / 0.20;
                const e = 1 - Math.pow(1 - mt, 2);
                oy = -0.61 + 0.65 * e;
                oz = -0.02 * (1 - e);
            } else {
                const mt = (t - 0.85) / 0.15;
                const e = 1 - Math.pow(1 - mt, 2);
                oy = 0.04 * (1 - e);
                oz = 0;
            }

            mag.position.set(mb.x, mb.y + oy, mb.z + oz);
        }

        return;
    }

    if (p.boltEnd > now && p.weapon && p.weapon.boltMs && p.weapon.key !== 'sniper') {
        const total = p.weapon.boltMs;
        const t = 1 - (p.boltEnd - now) / total;
        const pull = Math.sin(t * Math.PI);
        gh.position.set(bp.x, bp.y - pull * 0.06, bp.z + pull * 0.18);
        gh.rotation.set(br.x + pull * 0.35, br.y + pull * 0.15, br.z);
        return;
    }

    gh.position.lerp(bp, k);
    gh.rotation.x += (br.x + p.pitch - gh.rotation.x) * k;
    gh.rotation.y += (br.y - gh.rotation.y) * k;
    gh.rotation.z += (br.z - gh.rotation.z) * k;
}
window.updateThirdPersonWeapon = updateThirdPersonWeapon;

// ============================================================
// updatePlayer
// ============================================================
function updatePlayer(p, dt, now) {
    if (now < p.deadUntil) {
        p.baseVisible = false;
        p.aiming = false; p.aimStage = 0;
        if (p.id === 1) centerMsg(p, '回合结束');
        return;
    }
    p.baseVisible = true;

    if (p.id === 1) {
        let msg = '';
        if (gameState === 'prep') msg = `第 ${roundNumber} 回合 · 准备阶段`;
        else if (gameState === 'roundEnd') msg = '回合结束';
        centerMsg(p, msg);
    }

    if (p.equipEnd > 0 && now >= p.equipEnd) p.equipEnd = 0;

    if (!p.isMelee && !p.isSmoke && !p.isFlash) {
        if (p.reloadEnd > 0 && now >= p.reloadEnd) {
            const w = p.weapon, need = w.mag - p.ammo, take = Math.min(need, p.reserve);
            p.ammo += take; p.reserve -= take;
            p.reloadEnd = 0;
        }
        if (p.boltEnd > 0 && now >= p.boltEnd) p.boltEnd = 0;
    }

    const wantAim = !!p.input.aim;
    const canAim = !p.isMelee && !p.isSmoke && !p.isFlash && (gameState === 'combat')
                   && (now >= p.boltEnd) && (p.reloadEnd <= now);
    p.aiming = wantAim && canAim;

    let targetFov = BASE_FOV;
    if (p.aiming) {
        if (p.weapon.key === 'sniper' && p.aimStage === 2 && p.weapon.zoomFov2) targetFov = p.weapon.zoomFov2;
        else targetFov = p.weapon.zoomFov;
    }
    if (Math.abs(p.cam.fov - targetFov) > 0.05) {
        p.cam.fov += (targetFov - p.cam.fov) * Math.min(1, dt * 11);
        p.cam.updateProjectionMatrix();
    }

    const wantCrouch = !!p.input.crouch;
    let targetH = wantCrouch ? HEIGHT_CROUCH : HEIGHT_STAND;
    if (targetH > p.height + 0.001 && !canFit(p, targetH)) targetH = p.height;
    const k = Math.min(1, dt * 12);
    p.height += (targetH - p.height) * k;
    p.eyeH += (stanceEye(targetH) - p.eyeH) * k;

    const f = p.input.forward;
    const s = p.input.right;

    const wMul = p.isMelee ? MELEE.speedMul
              : (p.isSmoke ? SMOKE.speedMul
              : (p.isFlash ? FLASH.speedMul : p.weapon.speedMul));
    let spd = SPEED * wMul;
    if (p.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * wMul;
    if (p.aiming && !p.isMelee && !p.isSmoke && !p.isFlash) spd *= p.weapon.adsSpeedMul;

    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw),  rz = -Math.sin(p.yaw);
    p.pos.x += (fx * f + rx * s) * spd * dt;
    p.pos.z += (fz * f + rz * s) * spd * dt;

    if (p.input.jump && p.onGround) { p.vy = JUMP_V; p.onGround = false; }

    p.prevY = p.pos.y;
    p.vy -= GRAV * dt;
    p.pos.y += p.vy * dt;

    p._vyBeforeLand = p.vy;

    collideWorld(p);
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
    const _gh = terrainGroundAt(p.pos.x, p.pos.z);
    if (p.pos.y < _gh) { p.pos.y = _gh; p.vy = 0; p.onGround = true; }
    collidePlayers();

    if (window.PHYSICS && window.PHYSICS.isReady()) {
        window.PHYSICS.syncPlayerToBody(p, dt);
    }

    // ★ 后坐力恢复（在开火之前处理，保证本帧开火用的是恢复后的偏移）
    if (p.recoil) {
        updateRecoilRecovery(p, dt, now);
    }

    if (p.input.fire) {
        if (p.isMelee) tryMelee(p, now, false);
        else if (p.isSmoke || p.isFlash) { /* 由引信系统处理 */ }
        else tryFire(p, now);
    }

    p.mat.opacity = 1;
    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);

    // ============================================================
    // ★ 摄像机旋转 = 玩家瞄准 + 后坐力偏移
    // ============================================================
    const recoilPitch = p.recoil ? p.recoil.offsetPitch : 0;
    const recoilYaw   = p.recoil ? p.recoil.offsetYaw   : 0;
    p.cam.rotation.y = p.yaw   + recoilYaw;
    p.cam.rotation.x = p.pitch + recoilPitch;

    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;

    updateThirdPersonWeapon(p, dt, now);
    updateSniperViewmodel(p, dt, now);
}

function updateTarget(t, dt, now) {
    if (now < t.deadUntil) { t.baseVisible = false; return; }
    t.baseVisible = true;
    const _tgh = terrainGroundAt(t.spawn.x, t.spawn.z);
    t.pos.set(t.spawn.x, _tgh, t.spawn.z);
    t.yaw = t.spawn.yaw; t.pitch = 0;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.yaw;
    t.mesh.scale.y = 1;
    t.mat.opacity = 1;
}