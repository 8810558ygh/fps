// ===== js/game_effects.js – 弹痕、刀痕、曳光弹、火花、投掷轨迹、闪光指示器 =====

// ============================================================
// ★ B1：曳光弹对象池
// ============================================================
const TRACER_POOL_SIZE = 32;
const TRACER_LIFETIME_MS = 90;
const _tracerPool = [];
let _tracerPoolIdx = 0;

function _initTracerPool() {
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 1 });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        line.visible = false;
        line.renderOrder = 3;
        scene.add(line);
        _tracerPool.push({ line, geo, mat, until: 0 });
    }
}
_initTracerPool();

function spawnTracer(from, to) {
    const t = _tracerPool[_tracerPoolIdx];
    _tracerPoolIdx = (_tracerPoolIdx + 1) % TRACER_POOL_SIZE;

    const arr = t.geo.attributes.position.array;
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x;   arr[4] = to.y;   arr[5] = to.z;
    t.geo.attributes.position.needsUpdate = true;

    t.mat.opacity = 1;
    t.line.visible = true;
    t.until = performance.now() + TRACER_LIFETIME_MS;
}
window.spawnTracer = spawnTracer;

function updateTracers(now) {
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
        const t = _tracerPool[i];
        if (!t.line.visible) continue;
        const remain = t.until - now;
        if (remain <= 0) {
            t.line.visible = false;
            continue;
        }
        t.mat.opacity = Math.max(0, remain / TRACER_LIFETIME_MS);
    }
}
window.updateTracers = updateTracers;

// ============================================================
// ★ 火花（对象池化：预建 128 个 Mesh，用完隐藏归还）
// ============================================================
const sparks = [];                                  // 活跃火花列表
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);

const SPARK_POOL_SIZE = 128;
const _sparkFreePool = [];                          // 空闲 Mesh 池
let _sparkPoolInitialized = false;
let _sparkPoolStarved = 0;                          // 池满跳过计数器（调试用）

function _initSparkPool() {
    if (_sparkPoolInitialized) return;
    if (typeof scene === 'undefined' || !scene) return;
    _sparkPoolInitialized = true;

    // 借一个默认材质，实际用时会被替换成颜色对应的材质
    const dummyMat = _getSparkMat(0xffd28a);

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
        const m = new THREE.Mesh(sparkGeo, dummyMat);
        m.visible = false;
        m.frustumCulled = false;         // 火花移动快，避免每帧做剔除计算
        m.renderOrder = 2;               // 稍微靠前一点，避免被地面遮挡时闪烁
        scene.add(m);                     // ★ 只在初始化时 add 一次，之后永不 remove
        _sparkFreePool.push({
            mesh: m,
            vel:  new THREE.Vector3(),
            life: 0,
        });
    }
    console.log('[effects] 火花池已初始化:', SPARK_POOL_SIZE);
}

// 借一个空闲火花（池满返回 null）
function _acquireSpark() {
    if (!_sparkPoolInitialized) _initSparkPool();
    if (_sparkFreePool.length === 0) return null;
    return _sparkFreePool.pop();
}

// 归还火花
function _releaseSpark(s) {
    s.mesh.visible = false;
    s.life = 0;
    s.vel.set(0, 0, 0);
    _sparkFreePool.push(s);
}

// ============================================================
// 帧预算计数器（火花 / 弹痕共用）
// ============================================================
let _fxFrameStamp = -1;
let _fxSparkCount = 0;
let _fxHoleCount  = 0;
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

const _sparkMatCache = new Map();
function _getSparkMat(color) {
    let m = _sparkMatCache.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color });
        _sparkMatCache.set(color, m);
    }
    return m;
}

// ===== 弹痕 / 刀痕共用列表 =====
const bulletHoles = [];
const MAX_BULLET_HOLES = 80;
const BULLET_HOLE_LIFE_MS = 15000;
const BULLET_HOLE_FADE_MS = 2500;

// ============================================================
// 圆形弹孔纹理（枪械）
// ============================================================
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

    _tickFxBudget();
    if (_fxHoleCount >= FX_HOLE_PER_FRAME) return;
    _fxHoleCount++;

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

// ============================================================
// ★ 刀痕纹理（锐利的金属切割痕）
// ============================================================
let _slashMarkTex = null;
function getSlashMarkTexture() {
    if (_slashMarkTex) return _slashMarkTex;

    const W = 512, H = 64;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    const startX = W * 0.06;
    const endX   = W * 0.94;
    const cy     = H / 2;

    const segs = 80;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = startX + (endX - startX) * t;
        const wave =
              Math.sin(t * Math.PI * 2.7)        * 1.8
            + Math.sin(t * Math.PI * 6.1 + 0.7)  * 0.9
            + Math.sin(t * Math.PI * 13.5 + 2.1) * 0.35;
        pts.push({ x, y: cy + wave, t });
    }

    function widthAt(t) {
        const inEdge = Math.min(t / 0.12, (1 - t) / 0.12);
        const c01 = Math.max(0, Math.min(1, inEdge));
        return Math.pow(c01, 0.6);
    }

    function drawBand(halfWidth, colorStr) {
        ctx.fillStyle = colorStr;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const hw = widthAt(p.t) * halfWidth;
            if (i === 0) ctx.moveTo(p.x, p.y - hw);
            else ctx.lineTo(p.x, p.y - hw);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            const hw = widthAt(p.t) * halfWidth;
            ctx.lineTo(p.x, p.y + hw);
        }
        ctx.closePath();
        ctx.fill();
    }

    drawBand(8.5, 'rgba(30, 22, 16, 0.18)');
    drawBand(5.5, 'rgba(12, 10, 8, 0.55)');
    drawBand(2.6, 'rgba(0, 0, 0, 0.95)');

    const SPIKES = 90;
    for (let i = 0; i < SPIKES; i++) {
        const t = 0.12 + Math.random() * 0.76;
        const idx = Math.floor(t * segs);
        const p = pts[idx];
        const wf = widthAt(p.t);
        if (wf < 0.25) continue;

        const side = Math.random() < 0.5 ? -1 : 1;
        const baseOffset = 2.2 + Math.random() * 1.5;
        const baseY = p.y + side * baseOffset;
        const tipY  = baseY + side * (1.5 + Math.random() * 4.5);
        const tipX  = p.x + (Math.random() - 0.5) * 4;

        const bright = 175 + Math.floor(Math.random() * 70);
        ctx.fillStyle = `rgba(${bright}, ${bright - 8}, ${bright - 25}, ${0.55 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(p.x - 1.4, baseY);
        ctx.lineTo(p.x + 1.4, baseY);
        ctx.lineTo(tipX, tipY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(0, 0, 0, ${0.4 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(p.x - 1.4, baseY);
        ctx.lineTo(p.x + 1.4, baseY);
        ctx.lineTo(p.x, baseY + side * 0.8);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 252, 240, 0.9)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const wf = widthAt(p.t);
        if (wf < 0.15) { first = true; continue; }
        const oy = -0.9;
        if (first) { ctx.moveTo(p.x, p.y + oy); first = false; }
        else ctx.lineTo(p.x, p.y + oy);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 245, 220, 0.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    first = true;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const wf = widthAt(p.t);
        if (wf < 0.15) { first = true; continue; }
        const oy = 1.1;
        if (first) { ctx.moveTo(p.x, p.y + oy); first = false; }
        else ctx.lineTo(p.x, p.y + oy);
    }
    ctx.stroke();

    for (let i = 0; i < 30; i++) {
        const t = 0.15 + Math.random() * 0.7;
        const idx = Math.floor(t * segs);
        const p = pts[idx];
        const wf = widthAt(p.t);
        if (wf < 0.3) continue;
        const ox = (Math.random() - 0.5) * 5;
        const oy = (Math.random() - 0.5) * 3;
        const r = 0.4 + Math.random() * 1.0;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.55 + Math.random() * 0.35})`;
        ctx.beginPath();
        ctx.arc(p.x + ox, p.y + oy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalCompositeOperation = 'destination-in';
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0.00, 'rgba(0,0,0,0)');
    grad.addColorStop(0.05, 'rgba(0,0,0,0.7)');
    grad.addColorStop(0.14, 'rgba(0,0,0,1)');
    grad.addColorStop(0.86, 'rgba(0,0,0,1)');
    grad.addColorStop(0.95, 'rgba(0,0,0,0.7)');
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    const t = new THREE.CanvasTexture(c);
    t.encoding  = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    _slashMarkTex = t;
    return t;
}

let _slashMarkGeo = null;
function getSlashMarkGeo() {
    if (_slashMarkGeo) return _slashMarkGeo;
    _slashMarkGeo = new THREE.PlaneGeometry(0.48, 0.06);
    return _slashMarkGeo;
}

function spawnSlashMark(point, normal, playerYaw, isVertical) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    _tickFxBudget();
    if (_fxHoleCount >= FX_HOLE_PER_FRAME) return;
    _fxHoleCount++;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();

    let swingDir = new THREE.Vector3();

    if (isVertical) {
        swingDir.set(0, 1, 0);
        const dot = swingDir.dot(n);
        swingDir.sub(n.clone().multiplyScalar(dot));

        if (swingDir.lengthSq() < 0.001) {
            swingDir.set(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
            const d2 = swingDir.dot(n);
            swingDir.sub(n.clone().multiplyScalar(d2));
        }
    } else {
        swingDir.set(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
        const dot = swingDir.dot(n);
        swingDir.sub(n.clone().multiplyScalar(dot));

        if (swingDir.lengthSq() < 0.001) {
            const up = Math.abs(n.y) > 0.9
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 1, 0);
            swingDir.crossVectors(up, n).normalize();
        }
    }

    swingDir.normalize();

    const bitangent = new THREE.Vector3().crossVectors(n, swingDir).normalize();
    const basisMat = new THREE.Matrix4().makeBasis(swingDir, bitangent, n);

    const geo = getSlashMarkGeo();
    const mat = new THREE.MeshBasicMaterial({
        map: getSlashMarkTexture(),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point).addScaledVector(n, 0.008);
    mesh.setRotationFromMatrix(basisMat);

    if (!isVertical) {
        mesh.rotateZ((Math.random() - 0.5) * 0.12);
    }

    const s = 0.9 + Math.random() * 0.25;
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
window.spawnSlashMark = spawnSlashMark;

// ============================================================
// 弹痕 / 刀痕生命周期
// ============================================================
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

// ============================================================
// ★ 性能优化（A4）：getShotTargets 缓存
// ============================================================
const _shotTargetsBase = [];
const _shotTargetsWork = [];
let _shotTargetsDirty = true;

function markShotTargetsDirty() { _shotTargetsDirty = true; }
window.markShotTargetsDirty = markShotTargetsDirty;

function getShotTargets() {
    if (_shotTargetsDirty) {
        _shotTargetsBase.length = 0;
        for (let i = 0; i < wallMeshes.length; i++) _shotTargetsBase.push(wallMeshes[i]);
        for (let i = 0; i < crateMeshes.length; i++) _shotTargetsBase.push(crateMeshes[i]);
        if (typeof window.groundMesh !== 'undefined' && window.groundMesh) {
            _shotTargetsBase.push(window.groundMesh);
        }
        _shotTargetsDirty = false;
    }
    return _shotTargetsBase;
}
window.getShotTargets = getShotTargets;

function prepareShotTargets() {
    _shotTargetsWork.length = 0;
    const base = getShotTargets();
    for (let i = 0; i < base.length; i++) _shotTargetsWork.push(base[i]);
    return _shotTargetsWork;
}
window.prepareShotTargets = prepareShotTargets;

// ===== 枪口世界坐标 =====
function muzzleWorld(p, out) {
    if (p && p.vm && p.vm.children.length > 0) {
        const vmGun = p.vm.children[0];
        const mp = vmGun.getObjectByName('muzzlePoint');
        if (mp) {
            return mp.getWorldPosition(out);
        }
    }
    return out.set(0.28, -0.2, -1.25).applyMatrix4(p.cam.matrixWorld);
}

// ============================================================
// ★ 火花生成（池化版）
// ============================================================
function spawnSparks(point, color) {
    _tickFxBudget();
    if (_fxSparkCount >= FX_SPARK_PER_FRAME) return;
    _fxSparkCount++;

    const mat = _getSparkMat(color);

    for (let i = 0; i < 6; i++) {
        const s = _acquireSpark();
        if (!s) {
            // 池满：跳过剩余火花（视觉上几乎无感，只是少几粒）
            _sparkPoolStarved++;
            return;
        }

        s.mesh.material = mat;
        s.mesh.position.copy(point);
        s.mesh.visible = true;

        s.vel.set(
            (Math.random() - 0.5) * 4,
            Math.random() * 3.5,
            (Math.random() - 0.5) * 4
        );
        s.life = 0.4;

        sparks.push(s);
    }
}
window.spawnSparks = spawnSparks;

// ★ 调试：查看火花池状态
window.dumpSparkPool = function () {
    console.log(
        `[effects] 火花池: 活跃 ${sparks.length} / 空闲 ${_sparkFreePool.length} / 总 ${SPARK_POOL_SIZE}\n` +
        `           因池满跳过: ${_sparkPoolStarved} 次`
    );
    return {
        active: sparks.length,
        free: _sparkFreePool.length,
        total: SPARK_POOL_SIZE,
        starved: _sparkPoolStarved,
    };
};

// ===== 投掷轨迹线 =====
let smokeTrajLine = null;
let flashTrajLine = null;

const SMOKE_TRAJ_STEPS = 144;
const SMOKE_TRAJ_DT = 1 / 60;

function simulateThrowTrajectory(origin, dir, throwSpeed, upBias, gravity, bounces, friction, steps, dt) {
    const pts = [];
    const vel = dir.clone().multiplyScalar(throwSpeed);
    vel.y += upBias * throwSpeed;
    const pos = origin.clone();

    let stopped = false;
    let restX = pos.x, restY = pos.y, restZ = pos.z;

    const LINEAR_DAMPING = 0.05;
    const GROUND_Y = (typeof SMOKE_PROJ_RADIUS !== 'undefined') ? SMOKE_PROJ_RADIUS : 0.09;
    const dampFactor = Math.pow(1 - LINEAR_DAMPING, dt);

    for (let i = 0; i < steps; i++) {
        if (stopped) {
            pts.push(new THREE.Vector3(restX, restY, restZ));
            continue;
        }
        pts.push(pos.clone());

        vel.multiplyScalar(dampFactor);

        vel.y -= gravity * dt;
        pos.addScaledVector(vel, dt);

        if (pos.y <= GROUND_Y) {
            pos.y = GROUND_Y;
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
        if (Math.abs(pos.x) > ARENA - 0.5) {
            pos.x = Math.sign(pos.x) * (ARENA - 0.5);
            vel.x *= -0.3;
        }
        if (Math.abs(pos.z) > ARENA - 0.5) {
            pos.z = Math.sign(pos.z) * (ARENA - 0.5);
            vel.z *= -0.3;
        }
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

// ===== 闪光指示器 =====
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
            const t = Math.max(0, Math.min(1, remain / total));

            p.flashIndicator.visible = true;

            const pulse = 1 + Math.sin(now * 0.012) * 0.12;
            p.flashIndicator.scale.setScalar(pulse);

            const sphere = p.flashIndicator.userData.sphere;
            const halo   = p.flashIndicator.userData.halo;
            const light  = p.flashIndicator.userData.light;

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