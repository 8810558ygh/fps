// ===== js/game_combat.js – 射击、伤害、击杀、玩家更新、第三人称动画 =====

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

    sMelee(isHeavy);

    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;

    const origin = p.cam.getWorldPosition(_v1).clone();
    const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const targets = getShotTargets();
    const o = other(p);
    if (now >= o.deadUntil) targets.push(o.body, o.head);

    const rc = new THREE.Raycaster(origin.clone(), dir.clone(), 0, m.range);
    const hits = rc.intersectObjects(targets, false);

    if (hits.length > 0) {
        const h = hits[0];
        if (h.object.userData.part) {
            const isBack = isBackAttack(p, o);
            let dmg = isHeavy ? m.dmgHeavy : m.dmgLight;
            if (isBack) dmg *= m.backMultiplier;
            const targetId = o.id;
            if (!p.damageDealt[targetId]) p.damageDealt[targetId] = { body: 0, head: 0, total: 0 };
            p.damageDealt[targetId].body += dmg;
            p.damageDealt[targetId].total += dmg;
            spawnSparks(h.point, 0xff5040);
            if (p.id === 1) { hitmark(p); }
            sHit(p.id);
            damage(o, dmg, p);
        } else {
            spawnSparks(h.point, 0xffd28a);
        }
    }
}

function tryFire(p, now) {
    if (gameState !== 'combat') return;
    if (p.isMelee || p.isSmoke || p.isFlash) return;

    const w = p.weapon;
    if (now < p.nextShot || now < p.deadUntil || p.reloadEnd > now || now < p.boltEnd) return;
    if (p.ammo <= 0) { sEmpty(p.id); p.nextShot = now + 300; startReload(p, now); return; }
    p.ammo--;

    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        const since = now - (p.lastShotTime || 0);
        if (since < 200) p.spinUpProgress = Math.min(1, (p.spinUpProgress || 0) + since / w.spinUpMs);
        else p.spinUpProgress = 0;
        currentFireMs = Math.max(w.minFireMs, w.fireMs - (w.fireMs - w.minFireMs) * p.spinUpProgress);
    }
    p.nextShot = now + currentFireMs;
    p.lastShotTime = now;

    if (w.key === 'sniper' && w.boltMs) {
        p.boltEnd = now + w.boltMs;
        p.aimStage = 0; p.aiming = false;
        if (p.input) p.input.aim = false;
        if (p.id === 1) mouse.aim = false;
    }

    switch (w.key) {
        case 'sniper':  sShootSniper(p.id);  break;
        case 'shotgun': sShootShotgun(p.id); break;
        case 'odin':    sShootOdin(p.id);    break;
        default:        sShootRifle(p.id);   break;
    }
    p.muzzle.intensity = 2.2;
    if (p.id === 1) p.vmMuzzle.intensity = 2.2;

    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        const origin = p.cam.getWorldPosition(_v1).clone();
        const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion).clone();

        const localTargets = getShotTargets();
        const rcLocal = new THREE.Raycaster(origin.clone(), dir.clone(), 0, 150);
        const hitsLocal = rcLocal.intersectObjects(localTargets, false);
        let end = origin.clone().add(dir.clone().multiplyScalar(100));
        if (hitsLocal.length > 0) end = hitsLocal[0].point;
        spawnTracer(muzzleWorld(p, _v1), end);
        return;
    }

    const origin = p.cam.getWorldPosition(_v1).clone();
    const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pellets = w.pellets || 1;
    const spread = w.spread || 0;
    const targets = getShotTargets();
    const o = other(p);
    if (now >= o.deadUntil) targets.push(o.body, o.head);

    const isOnlineHost = (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost);

    for (let i = 0; i < pellets; i++) {
        const randDir = dir.clone();
        if (pellets > 1) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            const up = new THREE.Vector3(0, 1, 0);
            const axis = new THREE.Vector3().crossVectors(dir, up).normalize();
            if (axis.length() < 0.01) axis.set(1, 0, 0);
            const quat = new THREE.Quaternion().setFromAxisAngle(axis, phi);
            const quat2 = new THREE.Quaternion().setFromAxisAngle(dir, theta);
            randDir.applyQuaternion(quat).applyQuaternion(quat2);
        }
        const rc = new THREE.Raycaster(origin.clone(), randDir.clone(), 0, 150);
        const hits = rc.intersectObjects(targets, false);
        let end = origin.clone().add(randDir.multiplyScalar(150));
        if (hits.length) {
            const h = hits[0];
            end = h.point;
            if (h.object.userData.part) {
                const dmg = h.object.userData.part === 'head' ? w.dmgHead : w.dmgBody;
                const targetId = o.id;
                if (!p.damageDealt[targetId]) p.damageDealt[targetId] = { body: 0, head: 0, total: 0 };
                if (h.object.userData.part === 'head') p.damageDealt[targetId].head += dmg;
                else p.damageDealt[targetId].body += dmg;
                p.damageDealt[targetId].total += dmg;
                spawnSparks(h.point, 0xff5040);
                if (p.id === 1) hitmark(p);
                sHit(p.id);
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
        if (i === 0) {
            const mw = muzzleWorld(p, _v1);
            spawnTracer(mw, end);
            if (isOnlineHost) {
                NET_broadcast({
                    type: 'shootEvent',
                    weapon: w.key,
                    sx: mw.x, sy: mw.y, sz: mw.z,
                    ex: end.x, ey: end.y, ez: end.z
                });
            }
        }
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

function kill(victim, from, now) {
    from.score++;
    victim.hp = 0;
    victim.deadUntil = Infinity;
    const dmgByAttacker = from.damageDealt[victim.id] || { body: 0, head: 0, total: 0 };
    const dmgByVictim = victim.damageDealt[from.id] || { body: 0, head: 0, total: 0 };
    lastKillReport = { attacker: from, victim: victim, dmgByAttacker, dmgByVictim };

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        const killerSide = (from === p1) ? 'host' : 'client';
        const victimSide = (victim === p1) ? 'host' : 'client';
        if (typeof NET_sendKillEvent === 'function') {
            NET_sendKillEvent(killerSide, victimSide, roundNumber,
                { head: dmgByAttacker.head, body: dmgByAttacker.body, total: dmgByAttacker.total },
                { head: dmgByVictim.head, body: dmgByVictim.body, total: dmgByVictim.total });
        }
    }

    if (window.showRoundReport) window.showRoundReport(roundNumber, from, victim, dmgByAttacker, dmgByVictim);

    delete from.damageDealt[victim.id];
    delete victim.damageDealt[from.id];

    feed(victim, `被 <b style="color:${from.id===1?'#6db3ff':'#ff7a6d'}">玩家${from.id}</b> 击杀`);
    feed(from, `<b style="color:#ffd24a">击杀 玩家${victim.id}！</b>  +1`);
    sDeath();
    sKill(from.id);

    if (gameMode === 'ai' && from.id === 2 && typeof aiTaunt === 'function') aiTaunt();
    if (gameMode === 'ai' && from.id === 1 && typeof resetAiStreakOnPlayerKill === 'function') resetAiStreakOnPlayerKill();

    if (from.score >= TARGET_KILLS) { endMatch(from); return; }
    gameState = 'roundEnd';
    stateEndTime = now + ROUND_END_MS;
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('roundEnd', ROUND_END_MS, false, roundNumber);
        }
    }
}

// ============================================================
// ★ 狙击开火后坐力（供 updateSniperViewmodel 使用）
//   在开火后的 RECOIL_MS 时间窗口内返回 1 → 0 的衰减值
// ============================================================
function computeSniperRecoil(p, now) {
    if (!p || !p.lastShotTime) return 0;
    const RECOIL_MS = 750;   // ★ 380 → 750，恢复慢一倍，尾段更持久
    const dt = now - p.lastShotTime;
    if (dt < 0 || dt >= RECOIL_MS) return 0;
    const t = 1 - dt / RECOIL_MS;
    // ★ 指数改 1.35：前半段保持更久，不会瞬间回落
    return Math.pow(t, 1.35);
}

// ============================================================
// 视图模型动画（含 ★ 步枪 ADS + ★ 狙击枪独立拉栓 + ★ 狙击后坐）
// ============================================================
function updateSniperViewmodel(p, dt, now) {
    if (!p.vm || p.vm.children.length === 0) return;
    const vm = p.vm.children[0];
    if (!vm.userData.basePos || !vm.userData.baseRot) return;
    const w = p.weapon;

    // ★ 通用 ADS 分支（rifle + odin，共用 PiP 红点逻辑）
    // ============================================================
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

    // ============================================================
    // ★ 狙击枪 ADS 分支（同样使用 adsPos / adsRot）
    //   开镜时不加后坐力，保持瞄准镜锁在屏幕中心
    // ============================================================
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

        // ADS 期间拉栓也继续动
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

    // ---------- 近战挥砍 ----------
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

    // ---------- 投掷物持握摇摆 ----------
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

    // ============================================================
    // ★ 狙击拉栓（非 ADS）+ ★ 开火后坐力
    // ============================================================
    if (w.key === 'sniper' && w.boltMs && p.boltEnd > now) {
        const progress = 1 - (p.boltEnd - now) / w.boltMs;

        // 拉栓曲线：快拉 → 保持 → 缓推
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

        // ★ 开火后坐力强度（0~1）
        const recoil = computeSniperRecoil(p, now);

        // ★ 带后坐力的目标位姿
        const targetPos = vm.userData.basePos.clone();
        targetPos.y += recoil * 0.16;    // 上抬
        targetPos.z += recoil * 0.13;    // 后撤

        const targetRot = vm.userData.baseRot.clone();
        targetRot.z += recoil * 0.45;    // 枪口上翘

        // 平滑追踪
        const k = Math.min(1, dt * 16);
        vm.position.x += (targetPos.x - vm.position.x) * k;
        vm.position.y += (targetPos.y - vm.position.y) * k;
        vm.position.z += (targetPos.z - vm.position.z) * k;
        vm.rotation.x += (targetRot.x - vm.rotation.x) * k;
        vm.rotation.y += (targetRot.y - vm.rotation.y) * k;
        vm.rotation.z += (targetRot.z - vm.rotation.z) * k;

        return;
    }

    // ---------- 默认：缓慢回位 ----------
    const k = Math.min(1, dt * 15);
    vm.position.lerp(vm.userData.basePos, k);
    vm.rotation.x += (vm.userData.baseRot.x - vm.rotation.x) * k;
    vm.rotation.y += (vm.userData.baseRot.y - vm.rotation.y) * k;
    vm.rotation.z += (vm.userData.baseRot.z - vm.rotation.z) * k;

    // ★ 狙击枪：确保拉栓复位
    if (w.key === 'sniper' && vm.userData.boltGroup) {
        vm.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
    }
}

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

    // ★ 第三人称狙击枪拉栓：只动枪栓组
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
        const sink = Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.18;
        const wobble = Math.sin(t * Math.PI * 6) * 0.05;
        gh.position.set(bp.x + wobble * 0.4, bp.y - sink, bp.z + sink * 0.5);
        gh.rotation.set(br.x + sink * 1.2, br.y + wobble * 1.5, br.z + sink * 0.6);
        return;
    }

    // 非狙击（旧逻辑）：拉栓时整枪后撤
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

    const wMul = p.isMelee ? MELEE.speedMul : (p.isSmoke ? SMOKE.speedMul : (p.isFlash ? FLASH.speedMul : p.weapon.speedMul));
    let spd = SPEED * wMul;
    if (p.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * wMul;
    if (p.aiming && !p.isMelee && !p.isSmoke && !p.isFlash) spd *= p.weapon.adsSpeedMul;

    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    p.pos.x += (fx * f + rx * s) * spd * dt;
    p.pos.z += (fz * f + rz * s) * spd * dt;

    if (p.input.jump && p.onGround) { p.vy = JUMP_V; p.onGround = false; }

    p.prevY = p.pos.y;
    p.vy -= GRAV * dt;
    p.pos.y += p.vy * dt;
    collideWorld(p);
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
    const _gh = terrainGroundAt(p.pos.x, p.pos.z);
    if (p.pos.y < _gh) { p.pos.y = _gh; p.vy = 0; p.onGround = true; }
    collidePlayers();

    if (p.input.fire) {
        if (p.isMelee) tryMelee(p, now, false);
        else if (p.isSmoke || p.isFlash) { /* 由引信系统处理 */ }
        else tryFire(p, now);
    }

    p.mat.opacity = 1;
    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    p.cam.rotation.y = p.yaw;
    p.cam.rotation.x = p.pitch;
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