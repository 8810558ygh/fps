// ===== js/ai.js – 人机对战 AI（不使用近战刀，防御性确保始终持枪） =====

const AI_CFG = {
    aimTurnSpeed: 3.5,
    pitchSpeed: 6,
    aimErrorMax: 0.07,
    fireAngle: 0.14,
    reactionTime: 200,
    moveInterval: 1400,
    jumpCooldown: 3500,
    jumpChance: 0.4,
    stanceInterval: 3000,
};

const ai = {
    targetYaw: 0,
    targetPitch: 0,
    aimJitterYaw: 0,
    aimJitterPitch: 0,
    nextJitterAt: 0,

    moveF: 0,
    moveS: 0,
    nextMoveChange: 0,
    nextJumpAt: 0,

    stance: 'stand',
    stanceUntil: 0,

    lastSeenAt: 0,
    nextShotReady: 0,

    lastVisibilityCheck: 0,
    lastVisibilityResult: false,

    reservedWeaponKey: 'rifle',
};

const AI_WEAPON_POOL = ['rifle', 'rifle', 'sniper', 'shotgun', 'odin'];

const _aiRay          = new THREE.Raycaster();
const _aiSightOrigin  = new THREE.Vector3();
const _aiSightTarget  = new THREE.Vector3();
const _aiSightDir     = new THREE.Vector3();

const _aiEye     = new THREE.Vector3();
const _aiDir     = new THREE.Vector3();
const _aiEuler   = new THREE.Euler(0, 0, 0, 'YXZ');
const _aiRandDir = new THREE.Vector3();
const _aiEnd     = new THREE.Vector3();
const _aiUp      = new THREE.Vector3(0, 1, 0);
const _aiAxis    = new THREE.Vector3();
const _aiQ1      = new THREE.Quaternion();
const _aiQ2      = new THREE.Quaternion();

function aiResetRound(now) {
    // ★ 靶子模式：不再随机换枪，保持当前武器；只重置内部 AI 状态
    if (!aiEnabled) {
        ai.targetYaw = p2.yaw;
        ai.targetPitch = 0;
        ai.aimJitterYaw = 0;
        ai.aimJitterPitch = 0;
        ai.nextJitterAt = now;
        ai.moveF = 0;
        ai.moveS = 0;
        ai.nextMoveChange = now + 999999;
        ai.nextJumpAt = now + 999999;
        ai.stance = 'stand';
        ai.stanceUntil = now + 999999;
        ai.lastSeenAt = 0;
        ai.nextShotReady = now;
        ai.lastVisibilityCheck = 0;
        ai.lastVisibilityResult = false;
        return;
    }

    const key = AI_WEAPON_POOL[Math.floor(Math.random() * AI_WEAPON_POOL.length)];

    ai.reservedWeaponKey = key;

    setWeapon(p2, key);
    p2.isMelee = false;
    p2.equipEnd = 0;

    ai.targetYaw = p2.yaw;
    ai.targetPitch = 0;
    ai.aimJitterYaw = 0;
    ai.aimJitterPitch = 0;
    ai.nextJitterAt = now;
    ai.moveF = 0;
    ai.moveS = 0;
    ai.nextMoveChange = now + 500;
    ai.nextJumpAt = now + 3000;
    ai.stance = 'stand';
    ai.stanceUntil = now + 1500;
    ai.lastSeenAt = 0;
    ai.nextShotReady = now;
    ai.lastVisibilityCheck = 0;
    ai.lastVisibilityResult = false;
}

function aiCanSeePlayer(now) {
    if (now - ai.lastVisibilityCheck < 80) {
        return ai.lastVisibilityResult;
    }
    ai.lastVisibilityCheck = now;

    if (p1.deadUntil > now) {
        ai.lastVisibilityResult = false;
        return false;
    }

    const eyeY = p2.pos.y + p2.eyeH;
    _aiSightOrigin.set(p2.pos.x, eyeY, p2.pos.z);
    const targetY = p1.pos.y + p1.eyeH * 0.85;
    _aiSightTarget.set(p1.pos.x, targetY, p1.pos.z);

    _aiSightDir.copy(_aiSightTarget).sub(_aiSightOrigin);
    const dist = _aiSightDir.length();
    if (dist < 0.5) { ai.lastVisibilityResult = true; return true; }
    _aiSightDir.normalize();

    _aiRay.set(_aiSightOrigin, _aiSightDir);
    _aiRay.near = 0;
    _aiRay.far = dist;
    const targets = wallMeshes.concat(crateMeshes);
    const hits = _aiRay.intersectObjects(targets, false);

    if (hits.length > 0 && hits[0].distance < dist - 0.3) {
        ai.lastVisibilityResult = false;
        return false;
    }
    ai.lastVisibilityResult = true;
    return true;
}

function aiStartReload(now) {
    if (p2.isMelee) return;
    const w = p2.weapon;
    if (p2.reloadEnd > 0 || p2.ammo === w.mag || p2.reserve <= 0) return;
    p2.reloadEnd = now + w.reloadMs;
    sReload(p2.id);
}

function aiFire(now) {
    if (gameState !== 'combat') return;
    if (!aiEnabled) return;              // ★ 靶子不开火
    if (p2.isMelee) return;
    if (now < p2.nextShot || p2.reloadEnd > now) return;
    if (p2.deadUntil > now) return;

    const w = p2.weapon;
    if (p2.ammo <= 0) {
        // ★ 空间化：AI 空弹
        emitWorldSound('empty', p2.pos.x, p2.pos.y + p2.eyeH, p2.pos.z, false);
        p2.nextShot = now + 300;
        aiStartReload(now);
        return;
    }
    p2.ammo--;

    // ============================================================
    // ★ 射速计算（与 tryFire 保持一致）
    //   优先级：
    //     1. 奥丁（spinUpMs）→ 开镜直接满射速，腰射按 spin-up 曲线
    //     2. 其他武器（如狂徒）→ 开镜时按 adsFireRateMul 缩放
    //     3. 其余 → 固定 fireMs
    // ============================================================
    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        if (p2.aiming) {
            p2.spinUpProgress = 1;
            currentFireMs = w.minFireMs;
        } else {
            const since = now - (p2.lastShotTime || 0);
            if (since < 200) {
                p2.spinUpProgress = Math.min(1, (p2.spinUpProgress || 0) + since / w.spinUpMs);
            } else {
                p2.spinUpProgress = 0;
            }
            currentFireMs = Math.max(w.minFireMs, w.fireMs - (w.fireMs - w.minFireMs) * p2.spinUpProgress);
        }
    } else if (p2.aiming && w.adsFireRateMul) {
        // ★ 通用开镜射速惩罚（与 tryFire 保持一致）
        currentFireMs = currentFireMs / w.adsFireRateMul;
    }
    p2.nextShot = now + currentFireMs;
    p2.lastShotTime = now;

    // ★ 空间化：AI 开火音效（AI 是 p2，isSelf = false）
    const _aiEyeY = p2.pos.y + p2.eyeH;
    switch (w.key) {
        case 'sniper':  emitWorldSound('sniper',  p2.pos.x, _aiEyeY, p2.pos.z, false); break;
        case 'shotgun': emitWorldSound('shotgun', p2.pos.x, _aiEyeY, p2.pos.z, false); break;
        case 'odin':    emitWorldSound('odin',    p2.pos.x, _aiEyeY, p2.pos.z, false); break;
        default:        emitWorldSound('rifle',   p2.pos.x, _aiEyeY, p2.pos.z, false); break;
    }

    p2.muzzle.intensity = 2.2;

    const eyeY = p2.pos.y + p2.eyeH;
    _aiEye.set(p2.pos.x, eyeY, p2.pos.z);
    _aiEuler.set(p2.pitch, p2.yaw, 0, 'YXZ');
    _aiDir.set(0, 0, -1).applyEuler(_aiEuler);

    const pellets = w.pellets || 1;
    const spread = w.spread || 0;

    const targets = prepareShotTargets();
    if (now >= p1.deadUntil) {
        const parts = getPlayerHitMeshes(p1);
        for (let i = 0; i < parts.length; i++) targets.push(parts[i]);
    }

    for (let i = 0; i < pellets; i++) {
        _aiRandDir.copy(_aiDir);
        if (pellets > 1) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            _aiAxis.crossVectors(_aiDir, _aiUp).normalize();
            if (_aiAxis.length() < 0.01) _aiAxis.set(1, 0, 0);
            _aiQ1.setFromAxisAngle(_aiAxis, phi);
            _aiQ2.setFromAxisAngle(_aiDir, theta);
            _aiRandDir.applyQuaternion(_aiQ1).applyQuaternion(_aiQ2);
        }

        _aiRay.set(_aiEye, _aiRandDir);
        _aiRay.near = 0;
        _aiRay.far = 150;
        const hits = _aiRay.intersectObjects(targets, false);

        _aiEnd.copy(_aiEye).addScaledVector(_aiRandDir, 150);
        if (hits.length) {
            const h = hits[0];
            _aiEnd.copy(h.point);
            const part = h.object.userData.part;
            if (part) {
                // ★ 传入命中距离，支持距离衰减（奥丁 30m 分档）
                const dmg = _resolveDamage(w, part, h.distance);

                if (!p2.damageDealt[1]) {
                    p2.damageDealt[1] = { body: 0, head: 0, leg: 0, total: 0 };
                }
                if (part === 'head') p2.damageDealt[1].head += dmg;
                else if (part === 'leg') p2.damageDealt[1].leg += dmg;
                else p2.damageDealt[1].body += dmg;
                p2.damageDealt[1].total += dmg;

                spawnSparks(h.point, 0xff5040);
                damage(p1, dmg, p2);
                // ★ 空间化：AI 命中玩家
                emitWorldSound('hit', h.point.x, h.point.y, h.point.z, false);
            } else {
                spawnSparks(h.point, 0xffd28a);
                if (typeof spawnBulletHole === 'function' && typeof getHitWorldNormal === 'function') {
                    spawnBulletHole(h.point, getHitWorldNormal(h));
                }
            }
        }
        if (i === 0) spawnTracer(_aiEye.clone(), _aiEnd);
    }
}

function aiPreferredRange(w) {
    if (w.key === 'sniper') return 22;
    if (w.key === 'shotgun') return 4;
    if (w.key === 'odin') return 12;
    return 10;
}

function aiUpdate(dt, now) {
    if (p2.deadUntil > now) {
        p2.baseVisible = false;
        return;
    }
    p2.baseVisible = true;

    // ============================================================
    // ★ AI 关闭：站桩靶子模式
    // ============================================================
    if (!aiEnabled) {
        p2.prevY = p2.pos.y;
        p2.vy -= GRAV * dt;
        p2.pos.y += p2.vy * dt;
        p2._vyBeforeLand = p2.vy;

        collideWorld(p2);
        if (p2.pos.y <= 0) {
            p2.pos.y = 0;
            p2.vy = 0;
            p2.onGround = true;
        }
        const _ghStand = terrainGroundAt(p2.pos.x, p2.pos.z);
        if (p2.pos.y < _ghStand) {
            p2.pos.y = _ghStand;
            p2.vy = 0;
            p2.onGround = true;
        }

        p2.mesh.position.copy(p2.pos);
        p2.mesh.rotation.y = p2.yaw;
        p2.mesh.scale.y = p2.height / HEIGHT_STAND;
        return;
    }

    if (p2.isMelee || p2.isSmoke || p2.isFlash) {
        const key = (WEAPONS[ai.reservedWeaponKey]) ? ai.reservedWeaponKey : 'rifle';
        setWeapon(p2, key);

        p2.equipEnd = 0;
        p2.meleeEnd = 0;
        p2.meleeRecovery = 0;
        p2.meleeIsHeavy = false;
        p2.throwFuseActive = false;
        p2.throwFuseType = null;
        p2.throwFuseInHand = false;
    }

    if (p2.reloadEnd > 0 && now >= p2.reloadEnd) {
        const w = p2.weapon;
        const need = w.mag - p2.ammo;
        const take = Math.min(need, p2.reserve);
        p2.ammo += take;
        p2.reserve -= take;
        p2.reloadEnd = 0;
    }

    if (gameState !== 'combat') {
        p2.mesh.position.copy(p2.pos);
        p2.mesh.rotation.y = p2.yaw;
        p2.mesh.scale.y = p2.height / HEIGHT_STAND;
        return;
    }

    const eyeY = p2.pos.y + p2.eyeH;
    const dx = p1.pos.x - p2.pos.x;
    const dz = p1.pos.z - p2.pos.z;
    const dy = (p1.pos.y + p1.eyeH * 0.9) - eyeY;
    const distH = Math.hypot(dx, dz);
    const dist3D = Math.hypot(dx, dy, dz);

    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.max(distH, 0.001));

    let yawDiff = wantYaw - p2.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const maxYawStep = AI_CFG.aimTurnSpeed * dt;
    p2.yaw += Math.max(-maxYawStep, Math.min(maxYawStep, yawDiff));

    p2.pitch += (wantPitch - p2.pitch) * Math.min(1, dt * AI_CFG.pitchSpeed);

    if (now > ai.nextJitterAt) {
        ai.nextJitterAt = now + 250 + Math.random() * 500;
        ai.aimJitterYaw = (Math.random() - 0.5) * AI_CFG.aimErrorMax;
        ai.aimJitterPitch = (Math.random() - 0.5) * AI_CFG.aimErrorMax * 0.6;
    }

    const w = p2.weapon;
    const prefRange = aiPreferredRange(w);

    if (now > ai.nextMoveChange) {
        ai.nextMoveChange = now + AI_CFG.moveInterval + Math.random() * 900;
        const distErr = dist3D - prefRange;
        const r = Math.random();

        if (r < 0.45) {
            let f = 0;
            if (distErr > 2.5) f = 1;
            else if (distErr < -2.5) f = -1;
            else f = (Math.random() - 0.5) * 0.6;
            ai.moveF = f;
            ai.moveS = (Math.random() - 0.5) * 1.5;
        } else if (r < 0.82) {
            ai.moveF = (Math.random() - 0.5) * 0.7;
            ai.moveS = (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.9);
        } else {
            ai.moveF = 0;
            ai.moveS = 0;
        }
    }

    let f = ai.moveF;
    let s = ai.moveS;

    let spd = SPEED * w.speedMul;
    if (p2.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * w.speedMul;

    const mlen = Math.hypot(f, s);
    if (mlen > 0.01) {
        f /= mlen;
        s /= mlen;
        const fx = -Math.sin(p2.yaw), fz = -Math.cos(p2.yaw);
        const rx = Math.cos(p2.yaw), rz = -Math.sin(p2.yaw);
        p2.pos.x += (fx * f + rx * s) * spd * dt;
        p2.pos.z += (fz * f + rz * s) * spd * dt;
    }

    if (now > ai.stanceUntil) {
        const r = Math.random();
        if (r < 0.7) {
            ai.stance = 'stand';
            ai.stanceUntil = now + AI_CFG.stanceInterval + Math.random() * 2000;
        } else {
            ai.stance = 'crouch';
            ai.stanceUntil = now + 800 + Math.random() * 1200;
        }
    }

    let targetH = HEIGHT_STAND;
    if (ai.stance === 'crouch') targetH = HEIGHT_CROUCH;

    const k = Math.min(1, dt * 12);
    p2.height += (targetH - p2.height) * k;
    p2.eyeH += (stanceEye(targetH) - p2.eyeH) * k;

    if (now > ai.nextJumpAt && p2.onGround) {
        if (Math.random() < AI_CFG.jumpChance * dt * 3) {
            p2.vy = JUMP_V;
            p2.onGround = false;
            ai.nextJumpAt = now + AI_CFG.jumpCooldown;
        }
    }

    p2.prevY = p2.pos.y;
    p2.vy -= GRAV * dt;
    p2.pos.y += p2.vy * dt;
    p2._vyBeforeLand = p2.vy;
    collideWorld(p2);
    if (p2.pos.y <= 0) {
        p2.pos.y = 0;
        p2.vy = 0;
        p2.onGround = true;
    }
    const _gh2 = terrainGroundAt(p2.pos.x, p2.pos.z);
    if (p2.pos.y < _gh2) {
        p2.pos.y = _gh2;
        p2.vy = 0;
        p2.onGround = true;
    }

    const vis = aiCanSeePlayer(now);
    const totalYawErr = Math.abs(yawDiff) + Math.abs(ai.aimJitterYaw);
    const aimed = totalYawErr < AI_CFG.fireAngle;

    if (vis && aimed && now >= p1.deadUntil) {
        if (ai.lastSeenAt === 0) {
            ai.lastSeenAt = now;
            ai.nextShotReady = now + AI_CFG.reactionTime;
        }
        if (now >= ai.nextShotReady) {
            const savedYaw = p2.yaw;
            const savedPitch = p2.pitch;
            p2.yaw += ai.aimJitterYaw;
            p2.pitch += ai.aimJitterPitch;
            aiFire(now);
            p2.yaw = savedYaw;
            p2.pitch = savedPitch;
        }
    } else {
        ai.lastSeenAt = 0;
    }

    if (p2.ammo === 0 && p2.reloadEnd === 0 && p2.reserve > 0) {
        aiStartReload(now);
    }

    p2.mesh.position.copy(p2.pos);
    p2.mesh.rotation.y = p2.yaw;
    p2.mesh.scale.y = p2.height / HEIGHT_STAND;
}