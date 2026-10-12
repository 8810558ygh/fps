// ===== js/combat_recoil.js – 后坐力 / 移动散布 =====
// 从 game_combat.js 拆出，不改变任何对外接口

// ============================================================
// 移动判定
// ============================================================
function _isPlayerMoving(p) {
    if (!p || !p.input) return false;
    return (Math.abs(p.input.forward || 0) > 0.1)
        || (Math.abs(p.input.right   || 0) > 0.1);
}

// ============================================================
// ★★★ 移动/跳跃散布 ★★★
// ============================================================
function _getMovementSpread(p) {
    const w = p.weapon;
    if (!w) return 0;
    if (p.isMelee || p.isSmoke || p.isFlash) return 0;

    if (!p.onGround) {
        return (w.airSpread !== undefined) ? w.airSpread : 0;
    }
    if (_isPlayerMoving(p)) {
        return (w.moveSpread !== undefined) ? w.moveSpread : 0;
    }
    return 0;
}

// ============================================================
// 应用后坐力
// ============================================================
function applyRecoil(p, w, now) {
    const cfg = w.recoil;
    if (!cfg) return;
    if (!p.recoil) return;

    const r = p.recoil;

    const timeSinceLastShot = now - r.lastShotTime;
    if (timeSinceLastShot > 250) {
        r.bulletCount = 0;
        r.horizontalDir = Math.random() < 0.5 ? 1 : -1;
    }
    r.lastShotTime = now;
    r.bulletCount++;

    const shotIdx = r.bulletCount - 1;

    const vertRaw    = cfg.vertFirst + shotIdx * cfg.vertPerShot;
    const vertAmount = Math.min(vertRaw, cfg.vertMax);

    let horizAmount = 0;
    if (r.bulletCount > cfg.horizStart) {
        if (Math.random() < cfg.horizSwitchRate) {
            r.horizontalDir *= -1;
        }
        const horizIdx    = r.bulletCount - cfg.horizStart;
        const horizGrowth = Math.min(1, horizIdx / 8);
        horizAmount = cfg.horizMax * horizGrowth * r.horizontalDir;
    }

    let mul = 1.0;
    if (p.input && p.input.crouch) mul *= cfg.crouchMul;
    if (p.aiming)                  mul *= cfg.adsMul;
    if (_isPlayerMoving(p))        mul *= cfg.moveMul;

    r.offsetPitch += vertAmount * mul;
    r.offsetYaw   += horizAmount * mul;

    if (r.offsetPitch > cfg.maxOffsetPitch) r.offsetPitch = cfg.maxOffsetPitch;
    if (r.offsetYaw > cfg.maxOffsetYaw)     r.offsetYaw   = cfg.maxOffsetYaw;
    if (r.offsetYaw < -cfg.maxOffsetYaw)    r.offsetYaw   = -cfg.maxOffsetYaw;

    if (p.cam) {
        p.cam.rotation.x = p.pitch + r.offsetPitch;
        p.cam.rotation.y = p.yaw   + r.offsetYaw;
        p.cam.updateMatrixWorld(true);
    }
}

// ============================================================
// 更新后坐力恢复
// ============================================================
function updateRecoilRecovery(p, dt, now) {
    if (!p || !p.recoil) return;

    const r = p.recoil;
    const timeSinceLastShot = now - r.lastShotTime;

    if (timeSinceLastShot < RECOIL_RECOVER_DELAY_MS) return;

    const decay = 1 - Math.exp(-RECOIL_RECOVER_RATE * dt);

    r.offsetPitch *= (1 - decay);
    r.offsetYaw   *= (1 - decay);

    if (Math.abs(r.offsetPitch) < RECOIL_MIN_THRESHOLD) r.offsetPitch = 0;
    if (Math.abs(r.offsetYaw)   < RECOIL_MIN_THRESHOLD) r.offsetYaw   = 0;

    if (r.offsetPitch === 0 && r.offsetYaw === 0) {
        r.bulletCount = 0;
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