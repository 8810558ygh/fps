// ===== js/game_projectiles.js – 投掷物、烟雾、闪光、引信 =====

const activeSmokes = [];
const activeFlashes = [];
const activeFlashBursts = [];

const SMOKE_PROJ_RADIUS = 0.09;
const SMOKE_PROJ_HALF_H = 0.12;

// ===== 通用投掷物理 =====
function updateThrownPhysics(s, dt) {
    s.vel.y -= s.gravity * dt;
    const next = s.pos.clone().addScaledVector(s.vel, dt);

    if (next.y <= SMOKE_PROJ_HALF_H) {
        next.y = SMOKE_PROJ_HALF_H;
        if (Math.abs(s.vel.y) > 0.8) {
            s.vel.y = -s.vel.y * s.bounces;
            s.vel.x *= s.friction;
            s.vel.z *= s.friction;
        } else {
            s.vel.y = 0;
            s.vel.x *= 0.2;
            s.vel.z *= 0.2;
        }
    }
    if (Math.abs(next.x) > ARENA - 0.5) { next.x = Math.sign(next.x) * (ARENA - 0.5); s.vel.x *= -0.3; }
    if (Math.abs(next.z) > ARENA - 0.5) { next.z = Math.sign(next.z) * (ARENA - 0.5); s.vel.z *= -0.3; }

    const r = SMOKE_PROJ_RADIUS;
    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (next.y < bot || next.y - SMOKE_PROJ_HALF_H > top) continue;
        if (next.x + r <= c.x0 || next.x - r >= c.x1) continue;
        if (next.z + r <= c.z0 || next.z - r >= c.z1) continue;
        const dxL = next.x - c.x0, dxR = c.x1 - next.x;
        const dzL = next.z - c.z0, dzR = c.z1 - next.z;
        const minH = Math.min(dxL, dxR, dzL, dzR);
        if (minH === dxL)      { next.x = c.x0 - r; s.vel.x *= -0.3; }
        else if (minH === dxR) { next.x = c.x1 + r; s.vel.x *= -0.3; }
        else if (minH === dzL) { next.z = c.z0 - r; s.vel.z *= -0.3; }
        else                   { next.z = c.z1 + r; s.vel.z *= -0.3; }
    }

    s.pos.copy(next);
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.y += dt * 3.0;
}

function createThrownProjectileMesh(kind) {
    const mainMat = kind === 'flash' ? FLASH_MAT.clone() : SMOKE_MAT.clone();
    mainMat.emissiveIntensity = 0.7;
    const bandMat = kind === 'flash' ? FLASH_BAND_MAT : SMOKE_BAND_MAT;
    const capMat = kind === 'flash' ? FLASH_CAP_MAT : SMOKE_CAP_MAT;

    const geo = new THREE.CylinderGeometry(SMOKE_PROJ_RADIUS, SMOKE_PROJ_RADIUS, SMOKE_PROJ_HALF_H * 2, 14);
    const mesh = new THREE.Mesh(geo, mainMat);
    mesh.castShadow = true;

    const capTop = new THREE.Mesh(
        new THREE.CylinderGeometry(SMOKE_PROJ_RADIUS + 0.01, SMOKE_PROJ_RADIUS + 0.01, 0.03, 14), capMat
    );
    capTop.position.y = SMOKE_PROJ_HALF_H + 0.015;
    mesh.add(capTop);

    const capBot = new THREE.Mesh(
        new THREE.CylinderGeometry(SMOKE_PROJ_RADIUS + 0.01, SMOKE_PROJ_RADIUS + 0.01, 0.03, 14), capMat
    );
    capBot.position.y = -SMOKE_PROJ_HALF_H - 0.015;
    mesh.add(capBot);

    const band = new THREE.Mesh(
        new THREE.CylinderGeometry(SMOKE_PROJ_RADIUS + 0.005, SMOKE_PROJ_RADIUS + 0.005, 0.045, 14), bandMat
    );
    mesh.add(band);

    return mesh;
}

function createSmokeCloud(pos, radius, verticalRadius, centerHeight) {
    const group = new THREE.Group();
    group.position.set(pos.x, centerHeight, pos.z);

    const meshList = [];
    const layers = [
        { scale: 1.18, opacity: 0.22, color: 0xd0dad0, order: 1 },
        { scale: 1.00, opacity: 0.52, color: 0xb6c4b6, order: 2 },
        { scale: 0.84, opacity: 0.80, color: 0x9aa89a, order: 3 },
        { scale: 0.62, opacity: 0.97, color: 0x84928a, order: 4 },
    ];
    const vScale = verticalRadius / radius;

    for (const L of layers) {
        const geo = new THREE.SphereGeometry(radius * L.scale, 24, 18);
        const mat = new THREE.MeshLambertMaterial({
            color: L.color, transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            emissive: 0x4a5a4a, emissiveIntensity: 0.22
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.y = vScale;
        mesh.renderOrder = L.order;
        mesh.userData.baseOpacity = L.opacity;
        group.add(mesh);
        meshList.push(mesh);
    }

    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
        const rFactor = 0.25 + Math.random() * 0.45;
        const dist = radius * rFactor;
        const subR = radius * (0.28 + Math.random() * 0.22);
        const geo = new THREE.SphereGeometry(subR, 14, 10);
        const mat = new THREE.MeshLambertMaterial({
            color: 0x8c9a8e, transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            emissive: 0x4a5a4a, emissiveIntensity: 0.2
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
            Math.cos(a) * dist,
            (Math.random() - 0.5) * verticalRadius * 0.85,
            Math.sin(a) * dist
        );
        m.scale.set(0.85 + Math.random() * 0.3, 0.9 + Math.random() * 0.35, 0.85 + Math.random() * 0.3);
        m.renderOrder = 10 + i;
        m.userData.baseOpacity = 0.55 + Math.random() * 0.25;
        group.add(m);
        meshList.push(m);
    }

    group.userData.layers = meshList;
    return group;
}

function spawnSmokeProjectile(pos, vel, fuseMs, now) {
    const mesh = createThrownProjectileMesh('smoke');
    mesh.position.copy(pos);
    scene.add(mesh);
    activeSmokes.push({
        mesh, pos: pos.clone(), vel: vel.clone(),
        fuseEnd: now + fuseMs, state: 'flying',
        expandStart: 0, doneAt: 0, cloudMesh: null,
        gravity: SMOKE.gravity, bounces: SMOKE.bounces, friction: SMOKE.friction
    });
}
window.spawnSmokeProjectile = spawnSmokeProjectile;

function spawnFlashProjectile(pos, vel, fuseMs, now) {
    const mesh = createThrownProjectileMesh('flash');
    mesh.position.copy(pos);
    scene.add(mesh);
    activeFlashes.push({
        mesh, pos: pos.clone(), vel: vel.clone(),
        fuseEnd: now + fuseMs, state: 'flying',
        gravity: FLASH.gravity, bounces: FLASH.bounces, friction: FLASH.friction
    });
}
window.spawnFlashProjectile = spawnFlashProjectile;

function spawnFlashBurst(pos) {
    const geo = new THREE.SphereGeometry(0.5, 20, 14);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.copy(pos);
    scene.add(shell);

    const light = new THREE.PointLight(0xffffff, 12, 40);
    light.position.copy(pos);
    scene.add(light);

    activeFlashBursts.push({
        shell, light,
        born: performance.now(),
        life: 380
    });
}

function checkFlashHit(target, flashPos, now) {
    if (!target) return false;
    if (target.hp <= 0) return false;
    if (target.flashUntil > now) return false;
    if (typeof running !== 'undefined' && !running) return false;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return false;
    if (target.deadUntil > now) return false;

    const eye = new THREE.Vector3(target.pos.x, target.pos.y + target.eyeH, target.pos.z);
    const toFlash = flashPos.clone().sub(eye);
    const dist = toFlash.length();

    if (dist < 0.6) return true;
    if (dist > FLASH.maxDistance) return false;

    toFlash.normalize();

    let lookDir;
    if (target.id === 1 && target.cam) {
        lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(target.cam.quaternion);
    } else {
        const e = new THREE.Euler(target.pitch || 0, target.yaw || 0, 0, 'YXZ');
        lookDir = new THREE.Vector3(0, 0, -1).applyEuler(e);
    }

    const vFov = (target.id === 1 && target.cam ? target.cam.fov : BASE_FOV) * Math.PI / 180;
    const aspect = (target.id === 1 && target.cam ? target.cam.aspect : 1.6);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const maxHalfAngle = hFov / 2 + FLASH.minFovMargin;
    const cosAngle = toFlash.dot(lookDir);
    if (cosAngle < Math.cos(maxHalfAngle)) return false;

    const ray = new THREE.Raycaster(eye, toFlash, 0, dist - 0.3);
    const targets = wallMeshes.concat(crateMeshes);
    if (typeof activeSmokes !== 'undefined') {
        for (const s of activeSmokes) {
            if (!s.cloudMesh) continue;
            const layers = s.cloudMesh.userData.layers;
            let maxOp = 0;
            for (const m of layers) if (m.material.opacity > maxOp) maxOp = m.material.opacity;
            if (maxOp < 0.5) continue;
            s.cloudMesh.traverse(o => { if (o.isMesh) targets.push(o); });
        }
    }
    const hits = ray.intersectObjects(targets, false);
    if (hits.length > 0) return false;

    return true;
}

function detonateFlash(pos, now) {
    spawnFlashBurst(pos);
    if (typeof sFlashDetonate === 'function') sFlashDetonate();

    if (checkFlashHit(p1, pos, now)) {
        p1.flashUntil = now + FLASH.flashDurationMs;
    }
    if (checkFlashHit(p2, pos, now)) {
        p2.flashUntil = now + FLASH.flashDurationMs;
        if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
            if (typeof NET_broadcast === 'function') {
                NET_broadcast({ type: 'flashEvent', durationMs: FLASH.flashDurationMs });
            }
        }
    }
}

function updateSmokes(dt, now) {
    for (let i = activeSmokes.length - 1; i >= 0; i--) {
        const s = activeSmokes[i];

        if (s.state === 'flying') {
            updateThrownPhysics(s, dt);

            if (now >= s.fuseEnd) {
                scene.remove(s.mesh);
                s.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                if (s.mesh.geometry) s.mesh.geometry.dispose();
                if (s.mesh.material) s.mesh.material.dispose();
                s.mesh = null;

                const cloud = createSmokeCloud(s.pos, SMOKE.radius, SMOKE.verticalRadius, SMOKE.centerHeight);
                cloud.scale.set(0.04, 0.04, 0.04);
                cloud.position.y = SMOKE.radius * 0.3;
                scene.add(cloud);
                s.cloudMesh = cloud;
                s.state = 'expanding';
                s.expandStart = now;

                if (typeof sSmokePop === 'function') sSmokePop();
            }
        } else if (s.state === 'expanding') {
            const t = Math.min(1, (now - s.expandStart) / SMOKE.growMs);
            const e = 1 - Math.pow(1 - t, 3);
            const scale = 0.04 + e * 0.96;
            s.cloudMesh.scale.set(scale, scale, scale);
            const startY = SMOKE.radius * 0.3;
            const endY = SMOKE.centerHeight;
            s.cloudMesh.position.y = startY + (endY - startY) * e;
            if (s.cloudMesh.userData.layers) {
                for (const m of s.cloudMesh.userData.layers) {
                    m.material.opacity = m.userData.baseOpacity * e;
                }
            }
            if (t >= 1) {
                s.state = 'active';
                s.doneAt = now + SMOKE.durationMs;
                s.cloudMesh.scale.set(1, 1, 1);
                s.cloudMesh.position.y = SMOKE.centerHeight;
            }
        } else if (s.state === 'active') {
            const pulse = 1 + Math.sin(now * 0.0013) * 0.018;
            s.cloudMesh.scale.set(pulse, pulse * 1.005, pulse);
            s.cloudMesh.position.y = SMOKE.centerHeight + Math.sin(now * 0.0009) * 0.18;
            const remain = s.doneAt - now;
            if (remain < 2200) {
                const fade = Math.max(0, remain / 2200);
                if (s.cloudMesh.userData.layers) {
                    for (const m of s.cloudMesh.userData.layers) {
                        m.material.opacity = m.userData.baseOpacity * fade;
                    }
                }
            }
            if (now >= s.doneAt) {
                scene.remove(s.cloudMesh);
                s.cloudMesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                activeSmokes.splice(i, 1);
            }
        }
    }
}

function updateFlashes(dt, now) {
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
        const s = activeFlashes[i];
        if (s.state === 'flying') {
            updateThrownPhysics(s, dt);

            if (now >= s.fuseEnd) {
                scene.remove(s.mesh);
                s.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                if (s.mesh.geometry) s.mesh.geometry.dispose();
                if (s.mesh.material) s.mesh.material.dispose();

                const isAuthority = (gameMode !== 'online') || (typeof NET !== 'undefined' && NET.isHost);
                if (isAuthority) {
                    detonateFlash(s.pos.clone(), now);
                } else {
                    spawnFlashBurst(s.pos.clone());
                    if (typeof sFlashDetonate === 'function') sFlashDetonate();
                }
                activeFlashes.splice(i, 1);
            }
        }
    }
}

function updateFlashBursts(dt, now) {
    for (let i = activeFlashBursts.length - 1; i >= 0; i--) {
        const b = activeFlashBursts[i];
        const age = now - b.born;
        const t = age / b.life;
        if (t >= 1) {
            scene.remove(b.shell); scene.remove(b.light);
            b.shell.geometry.dispose();
            b.shell.material.dispose();
            activeFlashBursts.splice(i, 1);
            continue;
        }
        const scale = 1 + t * 8;
        b.shell.scale.set(scale, scale, scale);
        b.shell.material.opacity = 1 - t;
        b.light.intensity = 12 * (1 - t);
    }
}

// ===== 闪光覆盖层 =====
let flashOverlayEl = null;
function ensureFlashOverlay() {
    if (flashOverlayEl) return flashOverlayEl;
    const el = document.createElement('div');
    el.id = 'flashOverlay';
    el.style.cssText = `
        position: fixed; inset: 0; z-index: 45;
        background: #ffffff;
        pointer-events: none;
        opacity: 0;
        transition: none;
        will-change: opacity;
    `;
    document.body.appendChild(el);
    flashOverlayEl = el;
    return el;
}

function updateFlashOverlay(now) {
    const el = ensureFlashOverlay();
    if (typeof p1 === 'undefined' || !p1) { el.style.opacity = '0'; return; }
    const remain = p1.flashUntil - now;
    if (remain <= 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        return;
    }
    if (remain > FLASH.flashFadeMs) {
        if (el.style.opacity !== '1') el.style.opacity = '1';
    } else {
        el.style.opacity = String(remain / FLASH.flashFadeMs);
    }
}

// ===== 投掷引信系统 =====
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

function detonateInHand(p, type, now) {
    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z);
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

function throwSmoke(p, now, fuseMs) {
    if (gameState !== 'combat') return;
    if (!p.isSmoke) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    const effectiveFuseMs = (fuseMs !== undefined && fuseMs !== null) ? fuseMs : SMOKE.fuseMs;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(SMOKE.throwSpeed);
    vel.y += SMOKE.throwUpBias * SMOKE.throwSpeed;

    spawnSmokeProjectile(origin, vel, effectiveFuseMs, now);
    if (typeof sSmokeThrow === 'function') sSmokeThrow();

    if (gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.isHost
        && typeof NET_broadcast === 'function') {
        NET_broadcast({
            type: 'smokeSpawn',
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}

function throwFlash(p, now, fuseMs) {
    if (gameState !== 'combat') return;
    if (!p.isFlash) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    const effectiveFuseMs = (fuseMs !== undefined && fuseMs !== null) ? fuseMs : FLASH.fuseMs;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(FLASH.throwSpeed);
    vel.y += FLASH.throwUpBias * FLASH.throwSpeed;

    spawnFlashProjectile(origin, vel, effectiveFuseMs, now);
    if (typeof sFlashThrow === 'function') sFlashThrow();

    if (gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.isHost
        && typeof NET_broadcast === 'function') {
        NET_broadcast({
            type: 'flashSpawn',
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}

function clearAllSmokes() {
    for (const s of activeSmokes) {
        if (s.mesh) {
            scene.remove(s.mesh);
            s.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        }
        if (s.cloudMesh) {
            scene.remove(s.cloudMesh);
            s.cloudMesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        }
    }
    activeSmokes.length = 0;
    if (smokeTrajLine) smokeTrajLine.visible = false;
}

function clearAllFlashes() {
    for (const s of activeFlashes) {
        if (s.mesh) {
            scene.remove(s.mesh);
            s.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        }
    }
    activeFlashes.length = 0;

    for (const b of activeFlashBursts) {
        scene.remove(b.shell); scene.remove(b.light);
        b.shell.geometry.dispose();
        b.shell.material.dispose();
    }
    activeFlashBursts.length = 0;

    if (flashTrajLine) flashTrajLine.visible = false;
}