// ===== js/lan/lan_combat.js – 多人射线射击与近战 =====

function LAN_tryFire(p, now, weaponCfg) {
    if (!LAN.active || p !== p1 || !weaponCfg) return;

    const w = weaponCfg;
    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    const targets = prepareShotTargets();
    const enemies = LAN_getEnemies(p);
    const meshToPlayer = new Map();

    for (const enemy of enemies) {
        const meshes = getPlayerHitMeshes(enemy);
        for (const mesh of meshes) {
            if (!mesh) continue;
            mesh.userData.lanPlayerRef = enemy;
            targets.push(mesh);
            meshToPlayer.set(mesh, enemy);
        }
    }

    const pellets = Math.max(1, w.pellets || 1);
    const spread = (w.spread || 0)
        + (typeof _getMovementSpread === 'function' ? _getMovementSpread(p) : 0);
    const hitsToSend = [];
    let showedHitmark = false;
    let firstEnd = null;

    for (let i = 0; i < pellets; i++) {
        _rcRandDir.copy(_rcDir);
        if (spread > 0) {
            const theta = Math.random() * Math.PI * 2;
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
        const intersections = _ray.intersectObjects(targets, false);
        _rcEnd.copy(_rcOrigin).addScaledVector(_rcRandDir, 150);
        const pierced = new Set();
        let pierceLeft = w.pierce || 0;

        if (intersections.length > 0) {
            for (const hit of intersections) {
                _rcEnd.copy(hit.point);
                const target = meshToPlayer.get(hit.object) || hit.object.userData.lanPlayerRef;
                if (target) {
                    if (!target.baseVisible || target.team === p1.team || pierced.has(target)) continue;
                    pierced.add(target);

                    const part = hit.object.userData.part || 'body';
                    hitsToSend.push({
                        targetId: target.netId,
                        part,
                        distance: Number(hit.distance.toFixed(2)),
                    });
                    spawnSparks(hit.point, 0xff5040);
                    emitWorldSound('hit', hit.point.x, hit.point.y, hit.point.z, true);
                    if (!showedHitmark) {
                        showedHitmark = true;
                        hitmark(p1);
                        sHit(1);
                    }

                    if (pierceLeft > 0) {
                        pierceLeft--;
                        continue;
                    }
                    break;
                }

                spawnSparks(hit.point, 0xffd28a);
                const normal = getHitWorldNormal(hit);
                spawnBulletHole(hit.point, normal);
                emitWorldSound('hit', hit.point.x, hit.point.y, hit.point.z, true);
                break;
            }
        }

        if (i === 0) {
            spawnTracer(muzzleWorld(p, _rcMuzzle), _rcEnd);
            firstEnd = _rcEnd.clone();
        }
    }

    if (w.recoil && typeof applyRecoil === 'function') {
        applyRecoil(p, w, now);
    }
    LAN_onLocalShot(hitsToSend, w.key, firstEnd ? {
        sx: _rcOrigin.x, sy: _rcOrigin.y, sz: _rcOrigin.z,
        ex: firstEnd.x, ey: firstEnd.y, ez: firstEnd.z,
    } : null);
}

function LAN_tryMelee(p, now, isHeavy) {
    if (!LAN.active || p !== p1) return;

    p.cam.getWorldPosition(_rcOrigin);
    _rcDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);

    const targets = prepareShotTargets();
    const enemies = LAN_getEnemies(p);
    for (const enemy of enemies) {
        const meshes = getPlayerHitMeshes(enemy);
        for (const mesh of meshes) {
            if (!mesh) continue;
            mesh.userData.lanPlayerRef = enemy;
            targets.push(mesh);
        }
    }

    _ray.set(_rcOrigin, _rcDir);
    _ray.near = 0;
    _ray.far = MELEE.range;
    const hits = _ray.intersectObjects(targets, false);
    if (hits.length === 0) return;

    const hit = hits[0];
    const target = hit.object.userData.lanPlayerRef;
    if (!target) {
        spawnSparks(hit.point, 0xffd28a);
        const normal = getHitWorldNormal(hit);
        if (typeof spawnSlashMark === 'function') {
            spawnSlashMark(hit.point, normal, p.yaw, isHeavy);
        }
        return;
    }
    if (!target.baseVisible || target.team === p.team) return;

    let damage = isHeavy ? MELEE.dmgHeavy : MELEE.dmgLight;
    if (typeof isBackAttack === 'function' && isBackAttack(p, target)) {
        damage *= MELEE.backMultiplier;
    }

    spawnSparks(hit.point, 0xff5040);
    emitWorldSound('hit', hit.point.x, hit.point.y, hit.point.z, true);
    hitmark(p);
    sHit(1);
    LAN_onLocalMelee(target, damage);
}

window.LAN_tryFire = LAN_tryFire;
window.LAN_tryMelee = LAN_tryMelee;
