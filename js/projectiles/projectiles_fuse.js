// ===== js/projectiles_fuse.js – 引信系统 + 手里爆炸 + 掉落引信 =====
// 从 game_projectiles.js 拆出，不改变任何对外接口

// ============================================================
// 引信系统
// ============================================================
function startThrowFuse(p, type) {
    if (!p) return;
    if (p.throwFuseActive) return;
    if (gameState !== 'combat') return;
    if (typeof running !== 'undefined' && !running) return;
    if (typeof isOver === 'function' && isOver()) return;

    const now = performance.now();
    if (now < p.deadUntil || now < p.equipEnd) return;

    if (type === 'smoke') {
        if (!p.isSmoke) return;
        if (p.smokeCharges <= 0) return;
        if (now < p.smokeCooldownEnd) return;
        p.smokeCharges--;
        p.smokeCooldownEnd = now + SMOKE.cooldownMs;
        p.lastSmokeThrowAt = now;
    } else if (type === 'flash') {
        if (!p.isFlash) return;
        if (p.flashCharges <= 0) return;
        if (now < p.flashCooldownEnd) return;
        p.flashCharges--;
        p.flashCooldownEnd = now + FLASH.cooldownMs;
        p.lastFlashThrowAt = now;
    } else {
        return;
    }

    const cfg = type === 'smoke' ? SMOKE : FLASH;
    p.throwFuseActive = true;
    p.throwFuseType = type;
    p.throwFuseStart = now;
    p.throwFuseEnd = now + cfg.fuseMs;
    p.throwFuseInHand = true;

    if (type === 'smoke' && typeof sSmokeThrow === 'function') sSmokeThrow();
    else if (type === 'flash' && typeof sFlashThrow === 'function') sFlashThrow();
}
window.startThrowFuse = startThrowFuse;

function releaseThrowFuse(p) {
    if (!p || !p.throwFuseActive || !p.throwFuseInHand) return null;
    const type = p.throwFuseType;
    const now = performance.now();
    const remainMs = Math.max(0, p.throwFuseEnd - now);

    if (gameState !== 'combat') return null;

    let thrown = null;
    if (type === 'smoke') {
        if (!p.isSmoke) return null;
        p.throwFuseInHand = false;
        throwSmoke(p, now, remainMs);
        thrown = 'smoke';
    } else if (type === 'flash') {
        if (!p.isFlash) return null;
        p.throwFuseInHand = false;
        throwFlash(p, now, remainMs);
        thrown = 'flash';
    }
    return thrown;
}
window.releaseThrowFuse = releaseThrowFuse;

function cancelThrowFuse(p) {
    if (!p) return;
    p.throwFuseActive = false;
    p.throwFuseType = null;
    p.throwFuseInHand = false;
}
window.cancelThrowFuse = cancelThrowFuse;

function updateThrowFuseForPlayer(p, now) {
    if (!p || !p.throwFuseActive) return;

    if (gameState !== 'combat' || isOver() || !running || now < p.deadUntil) {
        cancelThrowFuse(p);
        return;
    }
    if (p.throwFuseInHand) {
        if (p.throwFuseType === 'smoke' && !p.isSmoke) { cancelThrowFuse(p); return; }
        if (p.throwFuseType === 'flash' && !p.isFlash) { cancelThrowFuse(p); return; }
    }

    if (now >= p.throwFuseEnd) {
        const type = p.throwFuseType;
        const inHand = p.throwFuseInHand;

        p.throwFuseActive = false;
        p.throwFuseType = null;
        p.throwFuseInHand = false;

        if (inHand) {
            detonateInHand(p, type, now);
            const backKey = p.primaryWeaponKey || 'rifle';
            setWeapon(p, backKey);
        }
    }
}

function updateThrowFuse(now) {
    if (typeof p1 === 'undefined' || !p1) return;

    if (isOnlineClientPlayer()) return;

    updateThrowFuseForPlayer(p1, now);

    if (gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.isHost
        && typeof p2 !== 'undefined' && p2) {
        updateThrowFuseForPlayer(p2, now);
    }
}
window.updateThrowFuse = updateThrowFuse;

// ============================================================
// 掉落引信（切枪时原地扔出）
// ============================================================
function dropFuseInPlace(p) {
    if (!p || !p.throwFuseActive || !p.throwFuseInHand) return;
    const type = p.throwFuseType;
    if (!type) return;
    const now = performance.now();
    const remainMs = Math.max(0, p.throwFuseEnd - now);

    p.throwFuseInHand = false;

    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z);
    const vel = new THREE.Vector3(0, 0, 0);

    if (type === 'smoke') {
        spawnSmokeProjectile(origin, vel, remainMs, now);
        if (typeof sSmokeThrow === 'function') sSmokeThrow();
        if (gameMode === 'online'
            && typeof NET !== 'undefined'
            && NET.isHost
            && typeof NET_broadcast === 'function') {
            NET_broadcast({
                type: 'smokeSpawn',
                px: origin.x, py: origin.y, pz: origin.z,
                vx: 0, vy: 0, vz: 0,
                fuseMs: remainMs
            });
        }
    } else if (type === 'flash') {
        spawnFlashProjectile(origin, vel, remainMs, now);
        if (typeof sFlashThrow === 'function') sFlashThrow();
        if (gameMode === 'online'
            && typeof NET !== 'undefined'
            && NET.isHost
            && typeof NET_broadcast === 'function') {
            NET_broadcast({
                type: 'flashSpawn',
                px: origin.x, py: origin.y, pz: origin.z,
                vx: 0, vy: 0, vz: 0,
                fuseMs: remainMs
            });
        }
    }
}
window.dropFuseInPlace = dropFuseInPlace;

// ============================================================
// 手里爆炸（近距离自爆）
// ============================================================
function detonateInHand(p, type, now) {
    const eyePos  = p.cam.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(p.cam.quaternion);

    const origin = eyePos.clone()
        .addScaledVector(forward, 0.40)
        .addScaledVector(right,   -0.10)
        .add(new THREE.Vector3(0, -0.20, 0));

    const vel = new THREE.Vector3(0, 0, 0);

    if (type === 'smoke') {
        spawnSmokeProjectile(origin, vel, 0, now);
        if (typeof sSmokeThrow === 'function') sSmokeThrow();
        if (gameMode === 'online'
            && typeof NET !== 'undefined'
            && NET.isHost
            && typeof NET_broadcast === 'function') {
            NET_broadcast({
                type: 'smokeSpawn',
                px: origin.x, py: origin.y, pz: origin.z,
                vx: 0, vy: 0, vz: 0,
                fuseMs: 0
            });
        }
    } else if (type === 'flash') {
        spawnFlashProjectile(origin, vel, 0, now);
        if (typeof sFlashThrow === 'function') sFlashThrow();
        if (gameMode === 'online'
            && typeof NET !== 'undefined'
            && NET.isHost
            && typeof NET_broadcast === 'function') {
            NET_broadcast({
                type: 'flashSpawn',
                px: origin.x, py: origin.y, pz: origin.z,
                vx: 0, vy: 0, vz: 0,
                fuseMs: 0
            });
        }
    }
}
window.detonateInHand = detonateInHand;