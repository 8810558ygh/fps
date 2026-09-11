// ===== js/ai.js – 人机对战 AI =====

const AI_CFG = {
    // 瞄准
    aimTurnSpeed: 3.5,
    pitchSpeed: 6,
    aimErrorMax: 0.07,
    fireAngle: 0.14,
    reactionTime: 200,

    // 移动
    moveInterval: 1400,
    jumpCooldown: 3500,
    jumpChance: 0.4,

    // 姿态
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
};

// 武器随机池（狂徒出现率略高）
const AI_WEAPON_POOL = ['rifle', 'rifle', 'sniper', 'shotgun', 'odin'];

function aiResetRound(now) {
    const key = AI_WEAPON_POOL[Math.floor(Math.random() * AI_WEAPON_POOL.length)];
    setWeapon(p2, key);

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
    const eye = new THREE.Vector3(p2.pos.x, eyeY, p2.pos.z);
    const targetY = p1.pos.y + p1.eyeH * 0.85;
    const target = new THREE.Vector3(p1.pos.x, targetY, p1.pos.z);

    const dir = target.clone().sub(eye);
    const dist = dir.length();
    if (dist < 0.5) { ai.lastVisibilityResult = true; return true; }
    dir.normalize();

    const ray = new THREE.Raycaster(eye, dir, 0, dist);
    const targets = wallMeshes.concat(crateMeshes);
    const hits = ray.intersectObjects(targets, false);

    if (hits.length > 0 && hits[0].distance < dist - 0.3) {
        ai.lastVisibilityResult = false;
        return false;
    }
    ai.lastVisibilityResult = true;
    return true;
}

const _aiEye = new THREE.Vector3();
const _aiDir = new THREE.Vector3();
const _aiEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function aiStartReload(now) {
    const w = p2.weapon;
    if (p2.reloadEnd > 0 || p2.ammo === w.mag || p2.reserve <= 0) return;
    p2.reloadEnd = now + w.reloadMs;
    sReload(p2.id);
}

function aiFire(now) {
    if (gameState !== 'combat') return;
    if (now < p2.nextShot || p2.reloadEnd > now) return;
    if (p2.deadUntil > now) return;

    const w = p2.weapon;
    if (p2.ammo <= 0) {
        sEmpty(p2.id);
        p2.nextShot = now + 300;
        aiStartReload(now);
        return;
    }
    p2.ammo--;

    // 奥丁预热
    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        const since = now - (p2.lastShotTime || 0);
        if (since < 200) {
            p2.spinUpProgress = Math.min(1, (p2.spinUpProgress || 0) + since / w.spinUpMs);
        } else {
            p2.spinUpProgress = 0;
        }
        currentFireMs = Math.max(w.minFireMs, w.fireMs - (w.fireMs - w.minFireMs) * p2.spinUpProgress);
    }
    p2.nextShot = now + currentFireMs;
    p2.lastShotTime = now;

    switch (w.key) {
        case 'sniper':  sShootSniper(p2.id);  break;
        case 'shotgun': sShootShotgun(p2.id); break;
        case 'odin':    sShootOdin(p2.id);    break;
        default:        sShootRifle(p2.id);   break;
    }

    p2.muzzle.intensity = 2.2;

    const eyeY = p2.pos.y + p2.eyeH;
    _aiEye.set(p2.pos.x, eyeY, p2.pos.z);
    _aiEuler.set(p2.pitch, p2.yaw, 0, 'YXZ');
    _aiDir.set(0, 0, -1).applyEuler(_aiEuler);

    const pellets = w.pellets || 1;
    const spread = w.spread || 0;
    const targets = wallMeshes.concat(crateMeshes);
    if (now >= p1.deadUntil) targets.push(p1.body, p1.head);

    for (let i = 0; i < pellets; i++) {
        const randDir = _aiDir.clone();
        if (pellets > 1) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            const up = new THREE.Vector3(0, 1, 0);
            const axis = new THREE.Vector3().crossVectors(_aiDir, up).normalize();
            if (axis.length() < 0.01) axis.set(1, 0, 0);
            const q1 = new THREE.Quaternion().setFromAxisAngle(axis, phi);
            const q2 = new THREE.Quaternion().setFromAxisAngle(_aiDir, theta);
            randDir.applyQuaternion(q1).applyQuaternion(q2);
        }
        const rc = new THREE.Raycaster(_aiEye.clone(), randDir.clone(), 0, 150);
        const hits = rc.intersectObjects(targets, false);
        let end = _aiEye.clone().add(randDir.clone().multiplyScalar(150));
        if (hits.length) {
            const h = hits[0];
            end = h.point;
            if (h.object.userData.part) {
                const dmg = h.object.userData.part === 'head' ? w.dmgHead : w.dmgBody;
                if (!p2.damageDealt[1]) p2.damageDealt[1] = { body: 0, head: 0, total: 0 };
                if (h.object.userData.part === 'head') p2.damageDealt[1].head += dmg;
                else p2.damageDealt[1].body += dmg;
                p2.damageDealt[1].total += dmg;
                spawnSparks(h.point, 0xff5040);
                damage(p1, dmg, p2);
                sHit(p2.id);
            } else {
                spawnSparks(h.point, 0xffd28a);
            }
        }
        if (i === 0) spawnTracer(_aiEye.clone(), end);
    }
}

// 根据武器选择偏好距离
function aiPreferredRange(w) {
    if (w.key === 'sniper') return 22;
    if (w.key === 'shotgun') return 4;
    if (w.key === 'odin') return 12;
    return 10; // rifle
}

function aiUpdate(dt, now) {
    if (p2.deadUntil > now) {
        p2.baseVisible = false;
        return;
    }
    p2.baseVisible = true;

    // 换弹完成
    if (p2.reloadEnd > 0 && now >= p2.reloadEnd) {
        const w = p2.weapon;
        const need = w.mag - p2.ammo;
        const take = Math.min(need, p2.reserve);
        p2.ammo += take;
        p2.reserve -= take;
        p2.reloadEnd = 0;
    }

    // 准备阶段：站在出生点，面向出生朝向
    if (gameState !== 'combat') {
        p2.mesh.position.copy(p2.pos);
        p2.mesh.rotation.y = p2.yaw;
        p2.mesh.scale.y = p2.height / HEIGHT_STAND;
        return;
    }

    // ================= 瞄准 =================
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

    // 瞄准抖动
    if (now > ai.nextJitterAt) {
        ai.nextJitterAt = now + 250 + Math.random() * 500;
        ai.aimJitterYaw = (Math.random() - 0.5) * AI_CFG.aimErrorMax;
        ai.aimJitterPitch = (Math.random() - 0.5) * AI_CFG.aimErrorMax * 0.6;
    }

    // ================= 移动 =================
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

    // ================= 姿态（仅站立 / 蹲下） =================
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

    // ================= 跳跃 =================
    if (now > ai.nextJumpAt && p2.onGround) {
        if (Math.random() < AI_CFG.jumpChance * dt * 3) {
            p2.vy = JUMP_V;
            p2.onGround = false;
            ai.nextJumpAt = now + AI_CFG.jumpCooldown;
        }
    }

    // 重力
    p2.prevY = p2.pos.y;
    p2.vy -= GRAV * dt;
    p2.pos.y += p2.vy * dt;
    collideWorld(p2);
    if (p2.pos.y <= 0) {
        p2.pos.y = 0;
        p2.vy = 0;
        p2.onGround = true;
    }

    // ================= 开火决策 =================
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

    // 自动换弹
    if (p2.ammo === 0 && p2.reloadEnd === 0 && p2.reserve > 0) {
        aiStartReload(now);
    }

    // ================= 更新网格 =================
    p2.mesh.position.copy(p2.pos);
    p2.mesh.rotation.y = p2.yaw;
    p2.mesh.scale.y = p2.height / HEIGHT_STAND;
}