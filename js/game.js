// ===== js/game.js – 核心游戏逻辑（含烟雾弹 + 闪光弹 + 弹痕） =====
let running = false;
let matchStart = 0;
let gameMode = 'range';

let gameState = 'idle';
let stateEndTime = 0;
let roundNumber = 0;
let lastKillReport = null;

const tracers = [];
const sparks = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true });
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

const activeSmokes = [];
const activeFlashes = [];
const activeFlashBursts = [];

let smokeTrajLine = null;
let flashTrajLine = null;
const SMOKE_TRAJ_STEPS = 60;
const SMOKE_TRAJ_DT = 0.04;

const SMOKE_PROJ_RADIUS = 0.09;
const SMOKE_PROJ_HALF_H = 0.12;

// ============================================================
// ★ 弹痕系统
// ============================================================
const bulletHoles = [];
const MAX_BULLET_HOLES = 80;
const BULLET_HOLE_LIFE_MS = 15000;
const BULLET_HOLE_FADE_MS = 2500;

let _bulletHoleTex = null;
function getBulletHoleTexture() {
    if (_bulletHoleTex) return _bulletHoleTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');

    const grd = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd.addColorStop(0.00, 'rgba(0,0,0,0.98)');
    grd.addColorStop(0.35, 'rgba(15,12,10,0.90)');
    grd.addColorStop(0.60, 'rgba(50,42,36,0.55)');
    grd.addColorStop(0.85, 'rgba(80,70,60,0.22)');
    grd.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(8,6,5,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const r1 = 5 + Math.random() * 3;
        const r2 = 12 + Math.random() * 14;
        const midA = a + (Math.random() - 0.5) * 0.4;
        ctx.beginPath();
        ctx.moveTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1);
        ctx.lineTo(32 + Math.cos(midA) * ((r1 + r2) * 0.5), 32 + Math.sin(midA) * ((r1 + r2) * 0.5));
        ctx.lineTo(32 + Math.cos(a) * r2, 32 + Math.sin(a) * r2);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(30, 29, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    _bulletHoleTex = t;
    return t;
}

let _bulletHoleGeo = null;
function getBulletHoleGeo() {
    if (_bulletHoleGeo) return _bulletHoleGeo;
    _bulletHoleGeo = new THREE.PlaneGeometry(0.18, 0.18);
    return _bulletHoleGeo;
}

function getHitWorldNormal(h) {
    if (h && h.face && h.object) {
        return h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
    }
    if (h && h.ray) {
        return h.ray.direction.clone().negate();
    }
    return new THREE.Vector3(0, 1, 0);
}
window.getHitWorldNormal = getHitWorldNormal;

function spawnBulletHole(point, normal) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();
    const geo = getBulletHoleGeo();

    const mat = new THREE.MeshBasicMaterial({
        map: getBulletHoleTexture(),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point).addScaledVector(n, 0.008);

    const up = Math.abs(n.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(up, n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const m = new THREE.Matrix4().makeBasis(t1, t2, n);
    mesh.setRotationFromMatrix(m);
    mesh.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.75 + Math.random() * 0.7;
    mesh.scale.set(s, s, s);

    mesh.renderOrder = 5;
    scene.add(mesh);

    bulletHoles.push({ mesh, born: performance.now() });

    while (bulletHoles.length > MAX_BULLET_HOLES) {
        const old = bulletHoles.shift();
        if (old.mesh) {
            scene.remove(old.mesh);
            if (old.mesh.material) old.mesh.material.dispose();
        }
    }
}
window.spawnBulletHole = spawnBulletHole;

function updateBulletHoles(now) {
    for (let i = bulletHoles.length - 1; i >= 0; i--) {
        const bh = bulletHoles[i];
        const age = now - bh.born;
        if (age >= BULLET_HOLE_LIFE_MS) {
            scene.remove(bh.mesh);
            if (bh.mesh.material) bh.mesh.material.dispose();
            bulletHoles.splice(i, 1);
        } else {
            const remain = BULLET_HOLE_LIFE_MS - age;
            if (remain < BULLET_HOLE_FADE_MS) {
                bh.mesh.material.opacity = Math.max(0, remain / BULLET_HOLE_FADE_MS);
            }
        }
    }
}

function clearAllBulletHoles() {
    for (const bh of bulletHoles) {
        if (bh.mesh) {
            scene.remove(bh.mesh);
            if (bh.mesh.material) bh.mesh.material.dispose();
        }
    }
    bulletHoles.length = 0;
}
window.clearAllBulletHoles = clearAllBulletHoles;

function getShotTargets() {
    const t = wallMeshes.concat(crateMeshes);
    if (typeof window.groundMesh !== 'undefined' && window.groundMesh) {
        t.push(window.groundMesh);
    }
    return t;
}
window.getShotTargets = getShotTargets;

function muzzleWorld(p, out) {
    return out.set(0.28, -0.2, -1.25).applyMatrix4(p.cam.matrixWorld);
}

function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, until: performance.now() + 90 });
}

function spawnSparks(point, color) {
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color }));
        m.position.copy(point);
        scene.add(m);
        sparks.push({
            mesh: m,
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4),
            life: 0.4
        });
    }
}

// ============================================================
// 通用投掷物物理
// ============================================================
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

// ============================================================
// 通用投掷物模型生成
// ============================================================
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

// ============================================================
// 烟雾云生成
// ============================================================
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

// ============================================================
// 生成投掷物
// ============================================================
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

// ============================================================
// 闪光弹爆炸 + 判定
// ============================================================
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

// ============================================================
// 更新烟雾弹
// ============================================================
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

// ============================================================
// 主更新
// ============================================================
function updateEffects(dt, now) {
    for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.line.material.opacity = Math.max(0, (t.until - now) / 90);
        if (now > t.until) { scene.remove(t.line); t.line.geometry.dispose(); tracers.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) { scene.remove(s.mesh); s.mesh.material.dispose(); sparks.splice(i, 1); }
    }
    if (p1.muzzle.intensity > 0) p1.muzzle.intensity = Math.max(0, p1.muzzle.intensity - 14 * dt);
    if (p1.vmMuzzle.intensity > 0) p1.vmMuzzle.intensity = Math.max(0, p1.vmMuzzle.intensity - 14 * dt);
    if (p2.muzzle && p2.muzzle.intensity > 0) p2.muzzle.intensity = Math.max(0, p2.muzzle.intensity - 14 * dt);

    updateSmokes(dt, now);
    updateFlashes(dt, now);
    updateFlashBursts(dt, now);
    updateFlashOverlay(now);
    updateSmokeTrajectory(now);
    updateFlashTrajectory(now);
    updateBulletHoles(now);
}

// ============================================================
// 抛物线轨迹
// ============================================================
function simulateThrowTrajectory(origin, dir, throwSpeed, upBias, gravity, bounces, friction, steps, dt) {
    const pts = [];
    const vel = dir.clone().multiplyScalar(throwSpeed);
    vel.y += upBias * throwSpeed;
    const pos = origin.clone();

    let stopped = false;
    let restX = pos.x, restY = pos.y, restZ = pos.z;

    for (let i = 0; i < steps; i++) {
        if (stopped) { pts.push(new THREE.Vector3(restX, restY, restZ)); continue; }
        pts.push(pos.clone());

        vel.y -= gravity * dt;
        pos.addScaledVector(vel, dt);

        if (pos.y <= SMOKE_PROJ_HALF_H) {
            pos.y = SMOKE_PROJ_HALF_H;
            if (Math.abs(vel.y) > 0.8) {
                vel.y = -vel.y * bounces;
                vel.x *= friction;
                vel.z *= friction;
            } else {
                vel.y = 0;
                vel.x *= 0.2; vel.z *= 0.2;
                if (vel.lengthSq() < 0.05) {
                    stopped = true;
                    restX = pos.x; restY = pos.y; restZ = pos.z;
                }
            }
        }
        if (Math.abs(pos.x) > ARENA - 0.5) { pos.x = Math.sign(pos.x) * (ARENA - 0.5); vel.x *= -0.3; }
        if (Math.abs(pos.z) > ARENA - 0.5) { pos.z = Math.sign(pos.z) * (ARENA - 0.5); vel.z *= -0.3; }
    }
    return pts;
}

function ensureTrajLine(existingVar, color) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SMOKE_TRAJ_STEPS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.9, depthTest: false
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 20;
    scene.add(line);
    return line;
}

function updateTrajLine(line, pts) {
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i < SMOKE_TRAJ_STEPS; i++) {
        const p = pts[i] || pts[pts.length - 1];
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.visible = true;
}

function updateSmokeTrajectory(now) {
    const show = typeof p1 !== 'undefined' && p1
        && p1.isSmoke && p1.smokeCharges > 0
        && running && gameState === 'combat'
        && !isOver() && now >= p1.deadUntil;

    if (!show) { if (smokeTrajLine) smokeTrajLine.visible = false; return; }
    if (!smokeTrajLine) smokeTrajLine = ensureTrajLine(null, 0x7ee08a);

    const origin = p1.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p1.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, SMOKE.throwSpeed, SMOKE.throwUpBias,
        SMOKE.gravity, SMOKE.bounces, SMOKE.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(smokeTrajLine, pts);
}

function updateFlashTrajectory(now) {
    const show = typeof p1 !== 'undefined' && p1
        && p1.isFlash && p1.flashCharges > 0
        && running && gameState === 'combat'
        && !isOver() && now >= p1.deadUntil;

    if (!show) { if (flashTrajLine) flashTrajLine.visible = false; return; }
    if (!flashTrajLine) flashTrajLine = ensureTrajLine(null, 0xffe066);

    const origin = p1.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p1.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, FLASH.throwSpeed, FLASH.throwUpBias,
        FLASH.gravity, FLASH.bounces, FLASH.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(flashTrajLine, pts);
}

// ============================================================
// 投掷动作
// ============================================================
function throwSmoke(p, now) {
    if (gameState !== 'combat') return;
    if (!p.isSmoke) return;
    if (p.smokeCharges <= 0) return;
    if (now < p.smokeCooldownEnd) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    p.smokeCharges--;
    p.smokeCooldownEnd = now + SMOKE.cooldownMs;
    p.lastSmokeThrowAt = now;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(SMOKE.throwSpeed);
    vel.y += SMOKE.throwUpBias * SMOKE.throwSpeed;

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.roomId) {
        if (NET.isHost) {
            spawnSmokeProjectile(origin, vel, SMOKE.fuseMs, now);
            if (typeof sSmokeThrow === 'function') sSmokeThrow();
            if (typeof NET_broadcast === 'function') {
                NET_broadcast({
                    type: 'smokeSpawn',
                    px: origin.x, py: origin.y, pz: origin.z,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    fuseMs: SMOKE.fuseMs
                });
            }
        } else if (NET.role === 'player') {
            if (typeof NET_sendToHost === 'function') {
                NET_sendToHost({
                    type: 'smokeThrow',
                    px: origin.x, py: origin.y, pz: origin.z,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    fuseMs: SMOKE.fuseMs
                });
            }
            if (typeof sSmokeThrow === 'function') sSmokeThrow();
        }
    } else {
        spawnSmokeProjectile(origin, vel, SMOKE.fuseMs, now);
        if (typeof sSmokeThrow === 'function') sSmokeThrow();
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}

function throwFlash(p, now) {
    if (gameState !== 'combat') return;
    if (!p.isFlash) return;
    if (p.flashCharges <= 0) return;
    if (now < p.flashCooldownEnd) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    p.flashCharges--;
    p.flashCooldownEnd = now + FLASH.cooldownMs;
    p.lastFlashThrowAt = now;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(FLASH.throwSpeed);
    vel.y += FLASH.throwUpBias * FLASH.throwSpeed;

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.roomId) {
        if (NET.isHost) {
            spawnFlashProjectile(origin, vel, FLASH.fuseMs, now);
            if (typeof sFlashThrow === 'function') sFlashThrow();
            if (typeof NET_broadcast === 'function') {
                NET_broadcast({
                    type: 'flashSpawn',
                    px: origin.x, py: origin.y, pz: origin.z,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    fuseMs: FLASH.fuseMs
                });
            }
        } else if (NET.role === 'player') {
            if (typeof NET_sendToHost === 'function') {
                NET_sendToHost({
                    type: 'flashThrow',
                    px: origin.x, py: origin.y, pz: origin.z,
                    vx: vel.x, vy: vel.y, vz: vel.z,
                    fuseMs: FLASH.fuseMs
                });
            }
            if (typeof sFlashThrow === 'function') sFlashThrow();
        }
    } else {
        spawnFlashProjectile(origin, vel, FLASH.fuseMs, now);
        if (typeof sFlashThrow === 'function') sFlashThrow();
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

// ============================================================
// 通用逻辑
// ============================================================
function isOver() { return document.getElementById('endOverlay').style.display === 'flex'; }

function startReload(p, now) {
    if (!running || gameState !== 'combat') return;
    if (p.isMelee || p.isSmoke || p.isFlash) return;
    const w = p.weapon;
    if (now < p.deadUntil || p.reloadEnd > now || p.ammo === w.mag || p.reserve <= 0) return;
    if (now < p.boltEnd) return;
    p.reloadEnd = now + w.reloadMs;
    p.aimStage = 0; p.aiming = false;
    if (p.input) p.input.aim = false;
    if (p.id === 1) mouse.aim = false;
    sReload(p.id);
}

function toggleAim() {
    if (!running || isOver() || gameState !== 'combat') return;
    if (p1.isMelee || p1.isSmoke || p1.isFlash) return;
    const now = performance.now();
    const p = p1;
    if (now < p.boltEnd || p.reloadEnd > now || now < p.deadUntil) return;
    const w = p.weapon;
    if (w.key === 'sniper') p.aimStage = (p.aimStage + 1) % 3;
    else p.aimStage = p.aimStage > 0 ? 0 : 1;
    p.input.aim = p.aimStage > 0;
    mouse.aim = p.input.aim;
}

function stanceEye(h) { return h <= HEIGHT_CROUCH + 0.01 ? EYE_CROUCH : EYE_STAND; }

function canFit(p, h) {
    const r = 0.42;
    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        if (p.pos.y < top - 0.001 && p.pos.y + h > bot + 0.001) return false;
    }
    return true;
}

function collideWorld(p) {
    const lim = ARENA - 0.6;
    p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
    p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));
    const r = 0.42;
    const h = p.height;

    for (const c of colliders) {
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.vy <= 0 && p.pos.y < top && p.prevY >= top - 0.35 && p.pos.y >= bot - 0.01) {
            p.pos.y = top; p.vy = 0; p.onGround = true;
        }
        if (p.vy > 0 && p.pos.y < bot && p.pos.y + h >= bot && p.prevY + h <= bot + 0.001) {
            p.pos.y = bot - h; p.vy = 0;
        }
    }

    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        if (p.onGround && top > p.pos.y + 0.001 && top - p.pos.y <= STEP_UP) {
            p.pos.y = top; continue;
        }
        if (p.pos.y >= top - 0.001) continue;
        if (p.pos.y + h <= bot + 0.001) continue;
        const cx = Math.max(c.x0, Math.min(p.pos.x, c.x1));
        const cz = Math.max(c.z0, Math.min(p.pos.z, c.z1));
        const dx = p.pos.x - cx, dz = p.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
            if (d2 > 1e-6) {
                const d = Math.sqrt(d2), push = r - d;
                p.pos.x += dx / d * push;
                p.pos.z += dz / d * push;
            } else { p.pos.x += r; }
        }
    }
}

function collidePlayers() {
    if (gameMode === 'online') return;
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.8 - d) / 2;
        const nx = dx / d, nz = dz / d;
        p1.pos.x -= nx * push; p1.pos.z -= nz * push;
        p2.pos.x += nx * push; p2.pos.z += nz * push;
    }
}

// ============================================================
// 脚步声
// ============================================================
const STRIDE_LENGTH = 2.0;
const STEP_MAX_AUDIBLE = 22;

function updateFootsteps(p, dt, now) {
    if (!running || gameState !== 'combat') { p._stepAccum = 0; return; }
    if (now < p.deadUntil) { p._stepAccum = 0; return; }
    const crouched = p.height < HEIGHT_STAND - 0.15;
    if (crouched) {
        p._stepAccum = 0;
        p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
        return;
    }
    if (p._prevStepX === undefined || p._prevStepZ === undefined) {
        p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
        p._stepAccum = 0; return;
    }
    const dx = p.pos.x - p._prevStepX;
    const dz = p.pos.z - p._prevStepZ;
    p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
    if (!p.onGround) { p._stepAccum = Math.min(p._stepAccum || 0, STRIDE_LENGTH * 0.5); return; }
    const dist = Math.hypot(dx, dz);
    p._stepAccum = (p._stepAccum || 0) + dist;
    if (p._stepAccum >= STRIDE_LENGTH) {
        p._stepAccum -= STRIDE_LENGTH;
        if (p.id === 1) {
            sFootstepSelf();
        } else {
            const ex = p.pos.x - p1.pos.x;
            const ez = p.pos.z - p1.pos.z;
            const d = Math.hypot(ex, ez);
            if (d >= STEP_MAX_AUDIBLE) return;
            const t = 1 - d / STEP_MAX_AUDIBLE;
            const vol = t * t;
            const yaw = p1.yaw;
            const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
            const dotRight = ex * rightX + ez * rightZ;
            const pan = d > 0.3 ? Math.max(-1, Math.min(1, dotRight / d)) : 0;
            sFootstepEnemy(vol, pan);
        }
    }
}

// ============================================================
// 近战
// ★ 修复：背刺判定点积方向反了（应为 > 0.3，正面/背面）
// ============================================================
function isBackAttack(attacker, victim) {
    if (!victim || !victim.mesh) return false;
    const toVictim = new THREE.Vector3().subVectors(victim.pos, attacker.pos);
    toVictim.y = 0;
    if (toVictim.lengthSq() < 1e-6) return false;
    toVictim.normalize();
    const victimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(victim.mesh.quaternion);
    victimDir.y = 0;
    if (victimDir.lengthSq() < 1e-6) return false;
    victimDir.normalize();
    // 攻击者在受害者背后 → toVictim 与 victimDir 同向 → 点积 > 0
    return toVictim.dot(victimDir) > 0.3;
}

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

    // 联机客户端：只播视觉，命中由房主判定
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;

    // 房主 / 离线：完整判定
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

// ============================================================
// 射击
// ============================================================
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

    // 联机客户端：只做本地视觉（曳光/枪火），伤害由房主判定
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        const origin = p.cam.getWorldPosition(_v1).clone();
        const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion).clone();

        // 本地弹痕（打在墙上）
        const localTargets = getShotTargets();
        const rcLocal = new THREE.Raycaster(origin.clone(), dir.clone(), 0, 150);
        const hitsLocal = rcLocal.intersectObjects(localTargets, false);
        let end = origin.clone().add(dir.clone().multiplyScalar(100));
        if (hitsLocal.length > 0) {
            const h = hitsLocal[0];
            end = h.point;
            if (!h.object.userData.part) {
                spawnBulletHole(h.point, getHitWorldNormal(h));
            }
        }
        spawnTracer(muzzleWorld(p, _v1), end);
        return;
    }

    // 房主 / 离线：完整命中判定
    const origin = p.cam.getWorldPosition(_v1).clone();
    const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pellets = w.pellets || 1;
    const spread = w.spread || 0;
    const targets = getShotTargets();
    const o = other(p);
    if (now >= o.deadUntil) targets.push(o.body, o.head);

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
                spawnBulletHole(h.point, getHitWorldNormal(h));
            }
        }
        if (i === 0) spawnTracer(muzzleWorld(p, _v1), end);
    }
}

// ============================================================
// 伤害 / 击杀 / 重置 / 回合
// ============================================================
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

function resetPlayer(p, now) {
    p.pos.set(p.spawn.x, 0, p.spawn.z);
    p.yaw = p.spawn.yaw; p.pitch = 0;
    p.vy = 0; p.prevY = 0; p.onGround = true;
    p.height = HEIGHT_STAND; p.eyeH = EYE_STAND;
    p.mesh.scale.y = 1;
    p.hp = HP_MAX; p.armor = ARMOR_MAX;
    if (!p.isMelee && !p.isSmoke && !p.isFlash) {
        p.ammo = p.weapon.mag;
        p.reserve = p.weapon.startReserve;
    } else { p.ammo = 0; p.reserve = 0; }
    p.reloadEnd = 0; p.nextShot = 0;
    p.aiming = false; p.aimStage = 0; p.boltEnd = 0;
    p.deadUntil = 0; p.invulnUntil = 0;
    p.spinUpProgress = 0; p.lastShotTime = 0;
    p.damageDealt = {};
    p.baseVisible = true;
    p.mat.opacity = 1;
    p._prevStepX = p.spawn.x; p._prevStepZ = p.spawn.z;
    p._stepAccum = 0;
    p.equipEnd = 0;
    p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
    p.meleeIsHeavy = false; p.lastMeleeTime = 0;
    p.smokeCharges = SMOKE.maxPerRound;
    p.smokeCooldownEnd = 0;
    p.lastSmokeThrowAt = 0;
    p.flashCharges = FLASH.maxPerRound;
    p.flashCooldownEnd = 0;
    p.lastFlashThrowAt = 0;
    p.flashUntil = 0;

    if (p.vm && p.vm.children.length > 0) {
        const vm = p.vm.children[0];
        if (vm.userData.basePos) {
            vm.position.copy(vm.userData.basePos);
            vm.rotation.copy(vm.userData.baseRot);
        }
    }
    if (p.cam) {
        p.cam.fov = BASE_FOV;
        p.cam.updateProjectionMatrix();
    }
}

function startRound(now) {
    roundNumber++;
    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    resetPlayer(p1, now);
    resetPlayer(p2, now);

    if (gameMode === 'ai' && typeof aiResetRound === 'function') aiResetRound(now);

    for (const k in keys) keys[k] = false;
    mouse.leftDown = false; mouse.aim = false;

    gameState = 'prep';
    stateEndTime = now + PREP_MS;

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('prep', PREP_MS, true, roundNumber);
        }
    }
}

function endPrep(now) {
    gameState = 'combat';
    if (window.closeCombatReport) window.closeCombatReport();
    const panel = document.getElementById('weaponPanel');
    if (panel) panel.style.display = 'none';
    if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
        if (document.pointerLockElement !== renderer.domElement && running) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
            renderer.domElement.requestPointerLock();
        }
    }
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('combat', 0, false, roundNumber);
        }
    }
}

function endMatch(winner) {
    running = false; gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    const el = document.getElementById('endOverlay');
    document.getElementById('endTitle').innerHTML = winner ?
        `<span class="${winner.id===1?'b':'r'}">${winner.id===1?'蓝色':'红色'}</span>玩家获胜！` : '平局！';
    document.getElementById('endScore').textContent = `${p1.score} : ${p2.score}`;
    el.style.display = 'flex';
    sWin();

    document.body.classList.remove('in-game');
    const rot = document.getElementById('rotateOverlay');
    if (rot) rot.style.display = 'none';

    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') NET_sendRoundEvent('idle', 0, false, roundNumber);
    }
}

function resetMatch() {
    const now = performance.now();
    p1.score = 0; p2.score = 0;
    roundNumber = 0; lastKillReport = null;
    matchStart = now;
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof clearChat === 'function') clearChat();
    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    running = true;
    startRound(now);
    document.body.classList.add('in-game');
    if (typeof checkOrientation === 'function') checkOrientation();
}

// ============================================================
// 视图模型动画
// ★ 近战分支重做：轻击 = 左右挥砍；重击 = 反手刺
// ============================================================
function updateSniperViewmodel(p, dt, now) {
    if (!p.vm || p.vm.children.length === 0) return;
    const vm = p.vm.children[0];
    if (!vm.userData.basePos || !vm.userData.baseRot) return;
    const w = p.weapon;

    if (p.isMelee && p.meleeEnd > now) {
        const fireMs = p.meleeIsHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs;
        const progress = 1 - (p.meleeEnd - now) / fireMs; // 0 → 1
        const bp = vm.userData.basePos;
        const br = vm.userData.baseRot;

        if (p.meleeIsHeavy) {
            // ---------- 重击：反手刺 ----------
            let phase, t;
            if (progress < 0.35) { phase = 'wind';   t = progress / 0.35; }
            else if (progress < 0.55) { phase = 'thrust'; t = (progress - 0.35) / 0.20; }
            else { phase = 'recover'; t = (progress - 0.55) / 0.45; }

            if (phase === 'wind') {
                // 反手收刀：向右后上方拉起，刀身横置
                const e = t * t;
                vm.position.set(
                    bp.x + e * 0.16,
                    bp.y + e * 0.12,
                    bp.z + e * 0.18
                );
                vm.rotation.set(
                    br.x + e * 0.10,
                    br.y - e * 0.60,
                    br.z + e * 0.55
                );
            } else if (phase === 'thrust') {
                // 向前快速刺出
                const e = 1 - Math.pow(1 - t, 2.5);
                vm.position.set(
                    bp.x + 0.16 - e * 0.22,
                    bp.y + 0.12 - e * 0.18,
                    bp.z + 0.18 - e * 0.88
                );
                vm.rotation.set(
                    br.x + 0.10 - e * 0.08,
                    br.y - 0.60 + e * 0.75,
                    br.z + 0.55 - e * 0.70
                );
            } else {
                // 收回原位
                const e = 1 - t;
                vm.position.set(
                    bp.x - 0.06 * e,
                    bp.y - 0.06 * e,
                    bp.z - 0.70 * e
                );
                vm.rotation.set(
                    br.x + 0.02 * e,
                    br.y + 0.15 * e,
                    br.z - 0.15 * e
                );
            }
            return;
        }

        // ---------- 轻击：左右挥砍 ----------
        let phase, t;
        if (progress < 0.25) { phase = 'wind';   t = progress / 0.25; }
        else if (progress < 0.55) { phase = 'swing';  t = (progress - 0.25) / 0.30; }
        else { phase = 'recover'; t = (progress - 0.55) / 0.45; }

        if (phase === 'wind') {
            // 起势：向右后方拉刀
            const e = t * t;
            vm.position.set(
                bp.x + e * 0.22,
                bp.y + e * 0.10,
                bp.z + e * 0.10
            );
            vm.rotation.set(
                br.x + e * 0.18,
                br.y - e * 0.45,
                br.z + e * 0.45
            );
        } else if (phase === 'swing') {
            // 挥出：从右向左横砍
            const e = 1 - Math.pow(1 - t, 2.2);
            vm.position.set(
                bp.x + 0.22 - e * 0.72,
                bp.y + 0.10 - e * 0.20,
                bp.z + 0.10 - e * 0.28
            );
            vm.rotation.set(
                br.x + 0.18 - e * 0.22,
                br.y - 0.45 + e * 1.55,
                br.z + 0.45 - e * 1.15
            );
        } else {
            // 收回：从左侧回到原位
            const e = 1 - t;
            vm.position.set(
                bp.x - 0.50 * e,
                bp.y - 0.10 * e,
                bp.z - 0.18 * e
            );
            vm.rotation.set(
                br.x - 0.04 * e,
                br.y + 1.10 * e,
                br.z - 0.70 * e
            );
        }
        return;
    }

    if (p.isSmoke || p.isFlash) {
        const t = now * 0.003;
        vm.position.set(vm.userData.basePos.x + Math.sin(t) * 0.005, vm.userData.basePos.y + Math.sin(t * 1.3) * 0.008, vm.userData.basePos.z);
        vm.rotation.set(vm.userData.baseRot.x + Math.sin(t * 0.7) * 0.03, vm.userData.baseRot.y + Math.sin(t) * 0.04, vm.userData.baseRot.z);
        return;
    }

    if (w.key === 'sniper' && w.boltMs && p.boltEnd > now) {
        const progress = 1 - (p.boltEnd - now) / w.boltMs;
        const pull = Math.sin(progress * Math.PI);
        vm.position.set(vm.userData.basePos.x, vm.userData.basePos.y - pull * 0.06, vm.userData.basePos.z + pull * 0.20);
        vm.rotation.x = vm.userData.baseRot.x + pull * 0.55;
        return;
    }

    const k = Math.min(1, dt * 15);
    vm.position.lerp(vm.userData.basePos, k);
    vm.rotation.x += (vm.userData.baseRot.x - vm.rotation.x) * k;
    vm.rotation.y += (vm.userData.baseRot.y - vm.rotation.y) * k;
    vm.rotation.z += (vm.userData.baseRot.z - vm.rotation.z) * k;
}

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
    collidePlayers();

    if (p.input.fire) {
        if (p.isMelee) tryMelee(p, now, false);
        else if (p.isSmoke || p.isFlash) { /* 由离散事件处理 */ }
        else tryFire(p, now);
    }

    p.mat.opacity = 1;
    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    p.cam.rotation.y = p.yaw;
    p.cam.rotation.x = p.pitch;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;

    updateSniperViewmodel(p, dt, now);
}

function updateTarget(t, dt, now) {
    if (now < t.deadUntil) { t.baseVisible = false; return; }
    t.baseVisible = true;
    t.pos.set(t.spawn.x, 0, t.spawn.z);
    t.yaw = t.spawn.yaw; t.pitch = 0;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.yaw;
    t.mesh.scale.y = 1;
    t.mat.opacity = 1;
}