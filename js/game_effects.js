// ===== js/game_effects.js – 弹痕、曳光弹、火花、投掷轨迹、闪光指示器 =====

// ===== 特效池 =====
const tracers = [];
const sparks = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true });
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);

// ============================================================
// ★ 特效帧预算：一帧最多创建 N 个 spark / bullet hole
//   霰弹枪 12 颗弹丸同帧命中时，避免一帧创建上百个 Mesh + 材质
// ============================================================
let _fxFrameStamp = -1;
let _fxSparkCount = 0;
let _fxHoleCount = 0;
const FX_SPARK_PER_FRAME = 3;
const FX_HOLE_PER_FRAME  = 3;

function _tickFxBudget() {
    const stamp = Math.floor(performance.now() / 16.0);
    if (stamp !== _fxFrameStamp) {
        _fxFrameStamp = stamp;
        _fxSparkCount = 0;
        _fxHoleCount = 0;
    }
}

// ============================================================
// ★ 火花材质缓存（避免每次开火 new MeshBasicMaterial）
//   移除时不能 dispose，因为材质是共享的
// ============================================================
const _sparkMatCache = new Map();
function _getSparkMat(color) {
    let m = _sparkMatCache.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color });
        _sparkMatCache.set(color, m);
    }
    return m;
}

// ===== 弹痕 =====
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

    // ★ 帧预算：霰弹枪 12 颗弹丸同帧命中时，最多创建 3 个弹痕
    _tickFxBudget();
    if (_fxHoleCount >= FX_HOLE_PER_FRAME) return;
    _fxHoleCount++;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();
    const geo = getBulletHoleGeo();

    // 注意：这里每个弹痕有自己的材质（因为要独立 opacity 淡出），不共享
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

// ===== 枪口世界坐标（优先使用视图模型里的 muzzlePoint 锚点） =====
function muzzleWorld(p, out) {
    // ★ 优先从视图模型里取 muzzle 锚点（支持每把武器自己的枪口位置）
    if (p && p.vm && p.vm.children.length > 0) {
        const vmGun = p.vm.children[0];
        const mp = vmGun.getObjectByName('muzzlePoint');
        if (mp) {
            return mp.getWorldPosition(out);
        }
    }
    // 回退：没有锚点时走老逻辑（供未升级的武器使用）
    return out.set(0.28, -0.2, -1.25).applyMatrix4(p.cam.matrixWorld);
}

// ===== 曳光弹 =====
function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, until: performance.now() + 90 });
}

// ===== 火花（材质共享 + 帧预算） =====
function spawnSparks(point, color) {
    // ★ 帧预算：霰弹枪 12 颗弹丸同帧命中时，最多触发 3 次 spawnSparks
    _tickFxBudget();
    if (_fxSparkCount >= FX_SPARK_PER_FRAME) return;
    _fxSparkCount++;

    const mat = _getSparkMat(color);
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(sparkGeo, mat);
        m.position.copy(point);
        scene.add(m);
        sparks.push({
            mesh: m,
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 3.5,
                (Math.random() - 0.5) * 4
            ),
            life: 0.4
        });
    }
}

// ===== 投掷轨迹线 =====
let smokeTrajLine = null;
let flashTrajLine = null;
const SMOKE_TRAJ_STEPS = 60;
const SMOKE_TRAJ_DT = 0.04;

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
    const p = (typeof p1 !== 'undefined') ? p1 : null;
    const inHand = p && p.isSmoke
        && (p.smokeCharges > 0
            || (p.throwFuseActive && p.throwFuseType === 'smoke' && p.throwFuseInHand));

    const show = inHand
        && running && gameState === 'combat'
        && !isOver() && now >= p.deadUntil;

    if (!show) { if (smokeTrajLine) smokeTrajLine.visible = false; return; }
    if (!smokeTrajLine) smokeTrajLine = ensureTrajLine(null, 0x7ee08a);

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, SMOKE.throwSpeed, SMOKE.throwUpBias,
        SMOKE.gravity, SMOKE.bounces, SMOKE.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(smokeTrajLine, pts);
}

function updateFlashTrajectory(now) {
    const p = (typeof p1 !== 'undefined') ? p1 : null;
    const inHand = p && p.isFlash
        && (p.flashCharges > 0
            || (p.throwFuseActive && p.throwFuseType === 'flash' && p.throwFuseInHand));

    const show = inHand
        && running && gameState === 'combat'
        && !isOver() && now >= p.deadUntil;

    if (!show) { if (flashTrajLine) flashTrajLine.visible = false; return; }
    if (!flashTrajLine) flashTrajLine = ensureTrajLine(null, 0xffe066);

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, FLASH.throwSpeed, FLASH.throwUpBias,
        FLASH.gravity, FLASH.bounces, FLASH.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(flashTrajLine, pts);
}

// ===== 闪光指示器：被闪光弹命中时在角色眼前显示光晕 =====
function updateFlashIndicators(now) {
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

    for (const p of [p1, p2]) {
        if (!p || !p.flashIndicator) continue;

        const isFlashed = p.flashUntil > now
            && p.baseVisible
            && p.hp > 0
            && p.deadUntil <= now;

        if (isFlashed) {
            const remain = p.flashUntil - now;
            const total = FLASH.flashDurationMs;
            const t = Math.max(0, Math.min(1, remain / total));  // 1 → 0

            p.flashIndicator.visible = true;

            // 呼吸脉动
            const pulse = 1 + Math.sin(now * 0.012) * 0.12;
            p.flashIndicator.scale.setScalar(pulse);

            const sphere = p.flashIndicator.userData.sphere;
            const halo   = p.flashIndicator.userData.halo;
            const light  = p.flashIndicator.userData.light;

            // 越接近结束越暗
            if (sphere) sphere.material.opacity = 0.85 * t;
            if (halo)   halo.material.opacity   = 0.45 * t;
            if (light)  light.intensity = 5.0 * t;
        } else if (p.flashIndicator.visible) {
            p.flashIndicator.visible = false;
            const light = p.flashIndicator.userData.light;
            if (light) light.intensity = 0;
        }
    }
}
window.updateFlashIndicators = updateFlashIndicators;