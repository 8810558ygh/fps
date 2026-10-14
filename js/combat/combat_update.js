// ===== js/combat_update.js – 玩家 / 目标 每帧更新 =====

function updatePlayer(p, dt, now) {
    if (now < p.deadUntil) {
        p.baseVisible = false;
        p.aiming = false; p.aimStage = 0;
        if (p.zipline && p.zipline.active) {
            p.zipline.active = false;
        }
        if (p.id === 1) centerMsg(p, '回合结束');
        return;
    }
    p.baseVisible = true;

    // 滑索
    if (typeof updateZiplineMovement === 'function') {
        if (updateZiplineMovement(p, dt, now)) {
            p.mat.opacity = 1;
            p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
            p.cam.rotation.y = p.yaw;
            p.cam.rotation.x = p.pitch;
            p.mesh.position.copy(p.pos);
            p.mesh.rotation.y = p.yaw;
            p.mesh.scale.y = p.height / HEIGHT_STAND;
            updateThirdPersonWeapon(p, dt, now);
            updateSniperViewmodel(p, dt, now);
            if (p.id === 1) centerMsg(p, '');
            return;
        }
    }

    const _stunned = p.stunUntil > now;
    const _healing = p.healing;

    // ============================================================
    // ★ 硬直 / 治疗：在【移动计算之前】锁死输入
    // ============================================================
    if (_stunned) {
        if (p.input) {
            p.input.forward = 0;
            p.input.right   = 0;
            p.input.jump    = false;
            p.input.crouch  = false;
            p.input.fire    = false;
            p.input.aim     = false;
        }
        p.aiming = false;
        p.aimStage = 0;
        if (p.id === 1) mouse.aim = false;
    }

    if (_healing) {
        if (p.input) {
            p.input.forward = 0;
            p.input.right   = 0;
            p.input.jump    = false;
            p.input.crouch  = false;
            p.input.aim     = false;
            // ★ 注意：不清 fire —— 治疗需要一直按住左键
        }
        p.aiming = false;
        p.aimStage = 0;
        if (p.id === 1) mouse.aim = false;
    }

    if (p.id === 1) {
        let msg = '';
        if (gameState === 'prep') msg = `第 ${roundNumber} 回合 · 准备阶段`;
        else if (gameState === 'roundEnd') msg = '回合结束';
        if (!_stunned && !p.isMedkit) centerMsg(p, msg);
    }

    if (p.equipEnd > 0 && now >= p.equipEnd) p.equipEnd = 0;

    if (!p.isMelee && !p.isSmoke && !p.isFlash && !p.isMedkit) {
        if (p.reloadEnd > 0 && now >= p.reloadEnd) {
            const w = p.weapon, need = w.mag - p.ammo, take = Math.min(need, p.reserve);
            p.ammo += take; p.reserve -= take;
            p.reloadEnd = 0;
        }
        if (p.boltEnd > 0 && now >= p.boltEnd) p.boltEnd = 0;
    }

    const wantAim = !!p.input.aim && !_stunned && !_healing;
    const canAim = !p.isMelee && !p.isSmoke && !p.isFlash && !p.isMedkit && (gameState === 'combat')
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

    const wantCrouch = !!p.input.crouch && !_stunned && !_healing;
    let targetH = wantCrouch ? HEIGHT_CROUCH : HEIGHT_STAND;
    if (targetH > p.height + 0.001 && !canFit(p, targetH)) targetH = p.height;
    const k = Math.min(1, dt * 12);
    p.height += (targetH - p.height) * k;
    p.eyeH += (stanceEye(targetH) - p.eyeH) * k;

    const f = p.input.forward;
    const s = p.input.right;

    const wMul = p.isMelee ? MELEE.speedMul
              : (p.isSmoke ? SMOKE.speedMul
              : (p.isFlash ? FLASH.speedMul
              : (p.isMedkit ? MEDKIT.speedMul : p.weapon.speedMul)));
    let spd = SPEED * wMul;
    if (p.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * wMul;
    if (p.aiming && !p.isMelee && !p.isSmoke && !p.isFlash && !p.isMedkit) spd *= p.weapon.adsSpeedMul;

    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw),  rz = -Math.sin(p.yaw);
    p.pos.x += (fx * f + rx * s) * spd * dt;
    p.pos.z += (fz * f + rz * s) * spd * dt;

    if (p.input.jump && p.onGround && !_stunned && !_healing) { p.vy = JUMP_V; p.onGround = false; }

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

    if (p.recoil) {
        updateRecoilRecovery(p, dt, now);
    }

    // ============================================================
    // ★ 医疗包：按住左键蓄力，松开取消
    // ============================================================
    if (p.isMedkit) {
        const holding = !!p.input.fire;

        if (!p.healing) {
            if (holding && gameState === 'combat' && !_stunned && now >= p.deadUntil) {
                if ((p.medkits || 0) > 0 && p.hp < HP_MAX) {
                    // ★ 开始使用
                    p.healing = true;
                    p.healStart = now;
                    p.healEnd = now + MEDKIT.useTimeMs;
                    if (typeof sReload === 'function') sReload(p.id);
                } else if ((p.medkits || 0) <= 0) {
                    if (p.id === 1) {
                        centerMsg(p, '没有医疗包了');
                        if (typeof sEmpty === 'function') sEmpty(1);
                    }
                    p.input.fire = false;
                    if (p.id === 1) mouse.leftDown = false;
                } else {
                    if (p.id === 1) {
                        centerMsg(p, 'HP 已满');
                        if (typeof sEmpty === 'function') sEmpty(1);
                    }
                    p.input.fire = false;
                    if (p.id === 1) mouse.leftDown = false;
                }
            }
        } else {
            if (!holding) {
                // ★ 松开 → 取消
                p.healing = false;
                p.healStart = 0;
                p.healEnd = 0;
            } else if (now >= p.healEnd) {
                // ★ 完成
                p.healing = false;
                p.medkits = Math.max(0, (p.medkits || 0) - 1);
                const before = p.hp;
                p.hp = Math.min(HP_MAX, p.hp + MEDKIT.healAmount);
                const healed = Math.round(p.hp - before);

                if (p.id === 1) {
                    feed(p, `✚ 使用医疗包 · HP <b style="color:#ff6b8a">+${healed}</b>`);
                    if (typeof sPickup === 'function') sPickup(1);
                }

                p.input.fire = false;
                if (p.id === 1) mouse.leftDown = false;

                const backKey = p.primaryWeaponKey || 'rifle';
                setWeapon(p, backKey);
            }
        }
    } else if (p.input.fire && !_stunned) {
        if (p.isMelee) tryMelee(p, now, false);
        else if (p.isSmoke || p.isFlash) { /* 由引信系统处理 */ }
        else tryFire(p, now);
    }

    p.mat.opacity = 1;
    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);

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