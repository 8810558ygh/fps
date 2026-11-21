// ===== js/lan/lan_ai.js – 房主客户端运行的局域网团队 AI =====

const LAN_AI_CFG = Object.freeze({
    aimTurnSpeed: 3.5,
    pitchSpeed: 6,
    aimErrorMax: 0.07,
    fireAngle: 0.14,
    reactionTime: 200,
    moveInterval: 1400,
    jumpCooldown: 3500,
    jumpChance: 0.4,
    stanceInterval: 3000,
    stateIntervalMs: 33,
});

const LAN_AI_WEAPON_POOL = ['rifle', 'rifle', 'sniper', 'shotgun', 'odin'];

const LAN_AI = {
    enabled: true,
    units: new Map(),
    lastStateSentAt: 0,
    roundKey: '',
};
window.LAN_AI = LAN_AI;

const _lanAIRay = new THREE.Raycaster();
const _lanAIEye = new THREE.Vector3();
const _lanAITargetEye = new THREE.Vector3();
const _lanAIDir = new THREE.Vector3();
const _lanAIEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _lanAIEnd = new THREE.Vector3();
const _lanAIRandDir = new THREE.Vector3();
const _lanAIAxis = new THREE.Vector3();
const _lanAIUp = new THREE.Vector3(0, 1, 0);
const _lanAIQ1 = new THREE.Quaternion();
const _lanAIQ2 = new THREE.Quaternion();

function _lanAIIsAuthority() {
    return !!(LAN.active
        && (LAN.mode === 'team' || LAN.mode === 'survival')
        && LAN.room
        && LAN.room.ownerId === LAN.selfId
        && LANNET.connected);
}

function _lanAIState(id) {
    return LAN.playerStates.get(id) || null;
}

function _lanAICombatantsFor(unit) {
    if (LAN.mode === 'survival') return [];
    const result = [];
    if (p1.team !== unit.team
        && p1.deadUntil !== Infinity
        && !p1.downed
        && p1.hp > 0) {
        result.push({
            id: LAN.selfId,
            player: p1,
            state: {
                x: p1.pos.x, y: p1.pos.y, z: p1.pos.z,
                height: p1.height,
                alive: true,
                connected: true,
            },
        });
    }
    for (const [id, player] of LAN.models) {
        if (id === unit.id) continue;
        const state = LAN.playerStates.get(id);
        if (!state
            || state.team === unit.team
            || !state.alive
            || state.downed
            || state.connected === false
            || !player.baseVisible) {
            continue;
        }
        result.push({ id, player, state });
    }
    return result;
}

function _lanAISelectTarget(unit) {
    if (LAN.mode === 'survival') {
        const zombies = typeof getAllZombies === 'function' ? getAllZombies().slice() : [];
        if (typeof PlayerZombie !== 'undefined'
            && PlayerZombie.active
            && !PlayerZombie.active.dead) {
            zombies.push(PlayerZombie.active);
        }
        let bestZombie = null;
        let bestDistance = Infinity;
        for (const zombie of zombies) {
            if (!zombie?.alive) continue;
            const dx = zombie.pos.x - unit.player.pos.x;
            const dz = zombie.pos.z - unit.player.pos.z;
            const distance = dx * dx + dz * dz;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestZombie = zombie;
            }
        }
        if (!bestZombie) {
            unit.targetId = null;
            unit.target = null;
            return null;
        }
        unit.targetId = bestZombie.netId || bestZombie;
        unit.target = {
            id: unit.targetId,
            zombie: bestZombie,
            player: bestZombie,
            state: { alive: true, connected: true },
        };
        return unit.target;
    }

    const candidates = _lanAICombatantsFor(unit);
    if (candidates.length === 0) {
        unit.targetId = null;
        unit.target = null;
        return null;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const dx = candidate.player.pos.x - unit.player.pos.x;
        const dz = candidate.player.pos.z - unit.player.pos.z;
        const distance = dx * dx + dz * dz;
        if (candidate.id === unit.targetId) {
            best = candidate;
            bestDistance = distance;
            break;
        }
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    unit.target = best;
    unit.targetId = best?.id || null;
    return best;
}

function _lanAIIsCombatActive() {
    if (LAN.mode === 'survival') {
        return typeof window.LAN_SURVIVAL_STATE !== 'undefined'
            && window.LAN_SURVIVAL_STATE.active
            && window.LAN_SURVIVAL_STATE.phase === 'wave';
    }
    return LAN.phase === 'round';
}

function _lanAICanSee(unit, target, now) {
    if (!target) return false;
    if (now - unit.lastVisibilityCheck < 90) {
        return unit.lastVisibilityResult;
    }
    unit.lastVisibilityCheck = now;

    _lanAIEye.set(
        unit.player.pos.x,
        unit.player.pos.y + unit.player.eyeH,
        unit.player.pos.z
    );
    _lanAITargetEye.set(
        target.player.pos.x,
        target.player.pos.y + target.player.eyeH * 0.88,
        target.player.pos.z
    );
    _lanAIDir.copy(_lanAITargetEye).sub(_lanAIEye);
    const distance = _lanAIDir.length();
    if (distance < 0.5) {
        unit.lastVisibilityResult = true;
        return true;
    }
    _lanAIDir.normalize();
    _lanAIRay.set(_lanAIEye, _lanAIDir);
    _lanAIRay.near = 0;
    _lanAIRay.far = distance;
    const hits = _lanAIRay.intersectObjects(getShotTargets(), false);
    unit.lastVisibilityResult = !(hits.length > 0 && hits[0].distance < distance - 0.3);
    return unit.lastVisibilityResult;
}

function _lanAISetWeapon(unit, key, now) {
    const weapon = WEAPONS[key] ? key : 'rifle';
    const config = WEAPONS[weapon];
    const player = unit.player;
    _lanInstallSimpleWeapon(player, weapon);
    player.weaponKey = weapon;
    player.primaryWeaponKey = weapon;
    player.weapon = config;
    player.isMelee = false;
    player.isSmoke = false;
    player.isFlash = false;
    player.isMedkit = false;
    player.ammo = config.mag;
    player.reserve = config.startReserve;
    player.reloadEnd = 0;
    player.nextShot = now;
    player.boltEnd = 0;
    player.aiming = false;
    player.aimStage = 0;
    player.equipEnd = 0;
    unit.weaponKey = weapon;
}

function _lanAIResetUnit(unit, state, now) {
    const spawn = typeof _lanGetSpawn === 'function'
        ? _lanGetSpawn(unit.team, state.spawnSlot || 0)
        : { x: 0, z: 0, yaw: 0 };
    unit.player.pos.set(spawn.x, terrainGroundAt(spawn.x, spawn.z), spawn.z);
    unit.player.prevY = unit.player.pos.y;
    unit.player.yaw = spawn.yaw;
    unit.player.pitch = 0;
    unit.player.vy = 0;
    unit.player.onGround = true;
    unit.player.height = HEIGHT_STAND;
    unit.player.eyeH = EYE_STAND;
    unit.player.deadUntil = 0;
    unit.player.baseVisible = true;
    unit.player.hp = state.hp || 100;
    _lanAISetWeapon(
        unit,
        LAN_AI_WEAPON_POOL[Math.floor(Math.random() * LAN_AI_WEAPON_POOL.length)],
        now
    );

    unit.round = LAN.round;
    unit.targetId = null;
    unit.target = null;
    unit.nextMoveChange = now + 500;
    unit.nextJumpAt = now + 3000;
    unit.nextJitterAt = now;
    unit.nextShotReady = now;
    unit.lastSeenAt = 0;
    unit.lastVisibilityCheck = 0;
    unit.lastVisibilityResult = false;
    unit.aimJitterYaw = 0;
    unit.aimJitterPitch = 0;
    unit.stance = 'stand';
    unit.stanceUntil = now + 1500;
}

function _lanAIEnsureUnit(state, now) {
    const player = LAN.models.get(state.id);
    if (!player) return null;
    let unit = LAN_AI.units.get(state.id);
    if (!unit || unit.player !== player) {
        unit = {
            id: state.id,
            player,
            team: state.team,
            round: -1,
            targetId: null,
            target: null,
        };
        LAN_AI.units.set(state.id, unit);
        player._lanAI = true;
    }
    unit.team = state.team;
    if (unit.round !== LAN.round) {
        _lanAIResetUnit(unit, state, now);
    }
    return unit;
}

function _lanAIReload(unit, now) {
    const player = unit.player;
    const weapon = player.weapon;
    if (!weapon || player.reloadEnd > 0
        || player.ammo >= weapon.mag
        || player.reserve <= 0) {
        return;
    }
    player.reloadEnd = now + weapon.reloadMs;
}

function _lanAICompleteReload(unit, now) {
    const player = unit.player;
    const weapon = player.weapon;
    if (!weapon || player.reloadEnd <= 0 || now < player.reloadEnd) return;
    const amount = Math.min(weapon.mag - player.ammo, player.reserve);
    player.ammo += amount;
    player.reserve -= amount;
    player.reloadEnd = 0;
}

function _lanAIFire(unit, now) {
    const player = unit.player;
    const target = unit.target;
    const weapon = player.weapon;
    if (!target || !weapon || !_lanAIIsCombatActive()) return;
    if (now < player.nextShot || player.reloadEnd > now) return;

    if (player.ammo <= 0) {
        player.nextShot = now + 250;
        _lanAIReload(unit, now);
        return;
    }

    player.ammo--;
    const interval = typeof _computeFireInterval === 'function'
        ? _computeFireInterval(player, weapon, now)
        : weapon.fireMs;
    player.nextShot = now + interval;
    player.lastShotTime = now;

    const sound = weapon.key === 'sniper' ? 'sniper'
        : weapon.key === 'shotgun' ? 'shotgun'
        : weapon.key === 'odin' ? 'odin' : 'rifle';
    if (typeof emitWorldSound === 'function') {
        emitWorldSound(sound, player.pos.x, player.pos.y + player.eyeH, player.pos.z, false);
    }

    _lanAIEye.set(player.pos.x, player.pos.y + player.eyeH, player.pos.z);
    _lanAIEuler.set(player.pitch, player.yaw, 0, 'YXZ');
    _lanAIDir.set(0, 0, -1).applyEuler(_lanAIEuler);
    const pellets = Math.max(1, weapon.pellets || 1);
    const spread = weapon.spread || 0;
    const targets = prepareShotTargets();
    const meshToPlayer = new Map();
    const meshToZombie = new Map();
    const enemies = _lanAICombatantsFor(unit);
    for (const enemy of enemies) {
        for (const mesh of getPlayerHitMeshes(enemy.player)) {
            if (!mesh) continue;
            mesh.userData.lanPlayerRef = enemy.player;
            targets.push(mesh);
            meshToPlayer.set(mesh, enemy);
        }
    }
    if (LAN.mode === 'survival') {
        const zombies = typeof getAllZombies === 'function' ? getAllZombies().slice() : [];
        if (typeof PlayerZombie !== 'undefined'
            && PlayerZombie.active
            && !PlayerZombie.active.dead) {
            zombies.push(PlayerZombie.active);
        }
        for (const zombie of zombies) {
            if (!zombie?.alive) continue;
            for (const mesh of zombie.hitMeshes || []) {
                if (!mesh) continue;
                mesh.userData.lanZombieRef = zombie;
                targets.push(mesh);
                meshToZombie.set(mesh, zombie);
            }
        }
    }

    const hitsToSend = [];
    const pierced = new Set();
    let firstEnd = null;

    for (let pellet = 0; pellet < pellets; pellet++) {
        _lanAIRandDir.copy(_lanAIDir);
        if (spread > 0) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            _lanAIAxis.crossVectors(_lanAIDir, _lanAIUp).normalize();
            if (_lanAIAxis.length() < 0.01) _lanAIAxis.set(1, 0, 0);
            _lanAIQ1.setFromAxisAngle(_lanAIAxis, phi);
            _lanAIQ2.setFromAxisAngle(_lanAIDir, theta);
            _lanAIRandDir.applyQuaternion(_lanAIQ1).applyQuaternion(_lanAIQ2);
        }
        _lanAIRay.set(_lanAIEye, _lanAIRandDir);
        _lanAIRay.near = 0;
        _lanAIRay.far = 150;
        const intersections = _lanAIRay.intersectObjects(targets, false);
        _lanAIEnd.copy(_lanAIEye).addScaledVector(_lanAIRandDir, 150);
        let pierceLeft = weapon.pierce || 0;
        const hitZombies = new Set();

        for (const hit of intersections) {
            _lanAIEnd.copy(hit.point);
            const enemy = meshToPlayer.get(hit.object) || hit.object.userData.lanPlayerRef;
            if (enemy) {
                if (!enemy.state.alive
                    || enemy.state.connected === false
                    || pierced.has(enemy.id)) {
                    continue;
                }
                pierced.add(enemy.id);
                const part = hit.object.userData.part || 'body';
                hitsToSend.push({
                    targetId: enemy.id,
                    part,
                    distance: Number(hit.distance.toFixed(2)),
                });
                if (typeof spawnSparks === 'function') spawnSparks(hit.point, 0xff5040);
                if (pierceLeft > 0) {
                    pierceLeft--;
                    continue;
                }
                break;
            }

            const zombie = meshToZombie.get(hit.object) || hit.object.userData.lanZombieRef;
            if (zombie?.alive) {
                if (hitZombies.has(zombie)) continue;
                hitZombies.add(zombie);
                const rawPart = hit.object.userData.part || '';
                const part = rawPart.includes('head') ? 'head'
                    : rawPart.includes('leg') ? 'leg' : 'body';
                let damage = typeof _resolveDamage === 'function'
                    ? _resolveDamage(weapon, part, hit.distance)
                    : (part === 'head' ? weapon.dmgHead
                        : part === 'leg' ? weapon.dmgLeg : weapon.dmgBody);
                let isCrit = false;
                if (typeof SurvivalStats !== 'undefined'
                    && typeof SurvivalStats.rollDamage === 'function') {
                    const roll = SurvivalStats.rollDamage(damage || 0);
                    damage = roll.dmg;
                    isCrit = !!roll.isCrit;
                }
                if (typeof spawnDamageNumber === 'function') {
                    spawnDamageNumber(hit.point, damage, isCrit);
                }
                if (typeof window.LAN_SURVIVAL_handleZombieHit === 'function') {
                    window.LAN_SURVIVAL_handleZombieHit(
                        zombie, damage, part, hit.point, unit.id
                    );
                }
                if (typeof spawnSparks === 'function') {
                    spawnSparks(hit.point, part === 'head' ? 0xffd24a : 0xff5040);
                }
                if (pierceLeft > 0) {
                    pierceLeft--;
                    continue;
                }
                break;
            }

            if (hit.object.userData.barrelRef) {
                if (typeof spawnSparks === 'function') spawnSparks(hit.point, 0xff5040);
                break;
            }
            if (typeof spawnSparks === 'function') spawnSparks(hit.point, 0xffd28a);
            if (typeof spawnBulletHole === 'function'
                && typeof getHitWorldNormal === 'function') {
                spawnBulletHole(hit.point, getHitWorldNormal(hit));
            }
            break;
        }

        if (pellet === 0) {
            firstEnd = _lanAIEnd.clone();
            if (typeof spawnTracer === 'function') {
                spawnTracer(_lanAIEye.clone(), firstEnd);
            }
        }
    }

    LANNET.send({
        type: 'lanAIShot',
        attackerId: unit.id,
        weapon: weapon.key,
        hits: hitsToSend.slice(0, 16),
        visual: firstEnd ? {
            sx: _lanAIEye.x, sy: _lanAIEye.y, sz: _lanAIEye.z,
            ex: firstEnd.x, ey: firstEnd.y, ez: firstEnd.z,
        } : null,
    });
}

function _lanAIUpdateUnit(unit, state, now, dt) {
    const player = unit.player;
    if (state.downed && state.connected !== false) {
        player.downed = true;
        player.deadUntil = Infinity;
        player.baseVisible = true;
        player.mesh.visible = true;
        player.mesh.rotation.x = -Math.PI / 2;
        player.mesh.rotation.z = 0.08;
        player.mesh.position.y = player.pos.y + 0.24;
        if (player.gunHolder) player.gunHolder.visible = false;
        unit.targetId = null;
        unit.target = null;
        return;
    }
    if (!state.alive || state.connected === false) {
        player.downed = false;
        player.deadUntil = Infinity;
        player.baseVisible = false;
        player.mesh.visible = false;
        return;
    }

    player.downed = false;
    player.deadUntil = 0;
    player.baseVisible = true;
    player.mesh.visible = true;
    player.hp = state.hp;
    player.armor = state.armor;
    _lanAICompleteReload(unit, now);

    const target = _lanAISelectTarget(unit);
    if (!target) {
        player.mesh.position.copy(player.pos);
        player.mesh.rotation.y = player.yaw;
        player.mesh.scale.y = player.height / HEIGHT_STAND;
        return;
    }

    const eyeY = player.pos.y + player.eyeH;
    const dx = target.player.pos.x - player.pos.x;
    const dz = target.player.pos.z - player.pos.z;
    const dy = (target.player.pos.y + target.player.eyeH * 0.9) - eyeY;
    const distH = Math.hypot(dx, dz);
    const dist3D = Math.hypot(dx, dy, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.max(distH, 0.001));
    let yawDiff = wantYaw - player.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const maxYawStep = LAN_AI_CFG.aimTurnSpeed * dt;
    player.yaw += Math.max(-maxYawStep, Math.min(maxYawStep, yawDiff));
    player.pitch += (wantPitch - player.pitch) * Math.min(1, dt * LAN_AI_CFG.pitchSpeed);

    if (now >= unit.nextJitterAt) {
        unit.nextJitterAt = now + 250 + Math.random() * 500;
        unit.aimJitterYaw = (Math.random() - 0.5) * LAN_AI_CFG.aimErrorMax;
        unit.aimJitterPitch = (Math.random() - 0.5) * LAN_AI_CFG.aimErrorMax * 0.6;
    }

    if (_lanAIIsCombatActive()) {
        if (now >= unit.nextMoveChange) {
            unit.nextMoveChange = now + LAN_AI_CFG.moveInterval + Math.random() * 900;
            const preferred = player.weapon?.key === 'sniper' ? 22
                : player.weapon?.key === 'shotgun' ? 4
                : player.weapon?.key === 'odin' ? 12 : 10;
            const error = dist3D - preferred;
            const roll = Math.random();
            if (roll < 0.48) {
                unit.moveF = error > 2.5 ? 1 : (error < -2.5 ? -1 : 0);
                unit.moveS = (Math.random() - 0.5) * 1.4;
            } else if (roll < 0.82) {
                unit.moveF = (Math.random() - 0.5) * 0.7;
                unit.moveS = (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.9);
            } else {
                unit.moveF = 0;
                unit.moveS = 0;
            }
        }

        let f = unit.moveF || 0;
        let s = unit.moveS || 0;
        const moveLength = Math.hypot(f, s);
        if (moveLength > 0.01) {
            f /= moveLength;
            s /= moveLength;
            let speed = SPEED * (player.weapon?.speedMul || 1);
            if (player.height < HEIGHT_STAND - 0.1) {
                speed = SPEED_CROUCH * (player.weapon?.speedMul || 1);
            }
            if (typeof PlayerZombie !== 'undefined' && PlayerZombie.slowAmount > 0) {
                speed *= Math.max(0, 1 - PlayerZombie.slowAmount);
            }
            const forwardX = -Math.sin(player.yaw);
            const forwardZ = -Math.cos(player.yaw);
            const rightX = Math.cos(player.yaw);
            const rightZ = -Math.sin(player.yaw);
            player.pos.x += (forwardX * f + rightX * s) * speed * dt;
            player.pos.z += (forwardZ * f + rightZ * s) * speed * dt;
        }

        if (now >= unit.stanceUntil) {
            if (Math.random() < 0.7) {
                unit.stance = 'stand';
                unit.stanceUntil = now + LAN_AI_CFG.stanceInterval + Math.random() * 2000;
            } else {
                unit.stance = 'crouch';
                unit.stanceUntil = now + 800 + Math.random() * 1200;
            }
        }
        const targetHeight = unit.stance === 'crouch' ? HEIGHT_CROUCH : HEIGHT_STAND;
        const heightK = Math.min(1, dt * 12);
        player.height += (targetHeight - player.height) * heightK;
        player.eyeH += (stanceEye(targetHeight) - player.eyeH) * heightK;

        if (now >= unit.nextJumpAt && player.onGround
            && Math.random() < LAN_AI_CFG.jumpChance * dt * 3) {
            player.vy = JUMP_V;
            player.onGround = false;
            unit.nextJumpAt = now + LAN_AI_CFG.jumpCooldown;
        }
    }

    player.prevY = player.pos.y;
    player.vy -= GRAV * dt;
    player.pos.y += player.vy * dt;
    if (typeof collideWorld === 'function') collideWorld(player);
    const ground = terrainGroundAt(player.pos.x, player.pos.z);
    if (player.pos.y < ground) {
        player.pos.y = ground;
        player.vy = 0;
        player.onGround = true;
    }

    for (const other of LAN_AI.units.values()) {
        if (other === unit || other.team !== unit.team) continue;
        const ox = player.pos.x - other.player.pos.x;
        const oz = player.pos.z - other.player.pos.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 1e-6 && d2 < 0.64) {
            const d = Math.sqrt(d2);
            const push = (0.8 - d) * 0.5;
            player.pos.x += ox / d * push;
            player.pos.z += oz / d * push;
        }
    }

    const visible = _lanAICanSee(unit, target, now);
    const aimed = Math.abs(yawDiff) + Math.abs(unit.aimJitterYaw) < LAN_AI_CFG.fireAngle;
    if (_lanAIIsCombatActive() && visible && aimed) {
        if (!unit.lastSeenAt) {
            unit.lastSeenAt = now;
            unit.nextShotReady = now + LAN_AI_CFG.reactionTime;
        }
        if (now >= unit.nextShotReady) {
            const savedYaw = player.yaw;
            const savedPitch = player.pitch;
            player.yaw += unit.aimJitterYaw;
            player.pitch += unit.aimJitterPitch;
            _lanAIFire(unit, now);
            player.yaw = savedYaw;
            player.pitch = savedPitch;
        }
    } else {
        unit.lastSeenAt = 0;
    }

    if (player.ammo <= 0 && player.reloadEnd <= 0) {
        _lanAIReload(unit, now);
    }

    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.yaw;
    player.mesh.scale.y = player.height / HEIGHT_STAND;
    player._netTargetPos.copy(player.pos);
    player._netTargetYaw = player.yaw;
    player._netTargetHeight = player.height;
}

function _lanAISendStates(now, force = false) {
    if (!force && now - LAN_AI.lastStateSentAt < LAN_AI_CFG.stateIntervalMs) return;
    LAN_AI.lastStateSentAt = now;
    const states = [];
    for (const unit of LAN_AI.units.values()) {
        const player = unit.player;
        const state = _lanAIState(unit.id);
        if (!state?.alive) continue;
        states.push({
            id: unit.id,
            x: player.pos.x,
            y: player.pos.y,
            z: player.pos.z,
            yaw: player.yaw,
            pitch: player.pitch,
            height: player.height,
            weapon: player.weaponKey,
            aiming: false,
            aimStage: 0,
            crouching: player.height < HEIGHT_STAND - 0.1,
            reloadRemain: Math.max(0, player.reloadEnd - now),
        });
    }
    if (states.length > 0) {
        LANNET.send({ type: 'lanAIStates', states });
    }
}

function LAN_AI_tick(dt, now) {
    if (!LAN_AI.enabled || !_lanAIIsAuthority()) {
        LAN_AI.lastStateSentAt = 0;
        return;
    }

    const liveAIIds = new Set();
    for (const state of LAN.playerStates.values()) {
        if (!state.isAI) continue;
        const unit = _lanAIEnsureUnit(state, now);
        if (!unit) continue;
        liveAIIds.add(state.id);
        _lanAIUpdateUnit(unit, state, now, dt);
    }
    for (const id of Array.from(LAN_AI.units.keys())) {
        if (liveAIIds.has(id)) continue;
        LAN_AI.units.delete(id);
    }
    _lanAISendStates(now);
}

function LAN_AI_reset() {
    LAN_AI.units.clear();
    LAN_AI.lastStateSentAt = 0;
    LAN_AI.roundKey = '';
}

window.LAN_AI_tick = LAN_AI_tick;
window.LAN_AI_reset = LAN_AI_reset;
