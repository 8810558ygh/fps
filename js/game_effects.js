// ===== js/game_effects.js – 弹痕、刀痕、曳光弹、火花、投掷轨迹、闪光指示器 =====
// ★ 弹痕/刀痕已改为对象池化（方案 B），所有武器共用，无每帧预算限制
// ★ 投掷轨迹 Vector3 已改为对象池化，消除手持烟/闪时的 GC 卡顿

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
const sparks = [];
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);

const SPARK_POOL_SIZE = 128;
const _sparkFreePool = [];
let _sparkPoolInitialized = false;
let _sparkPoolStarved = 0;

function _initSparkPool() {
    if (_sparkPoolInitialized) return;
    if (typeof scene === 'undefined' || !scene) return;
    _sparkPoolInitialized = true;

    const dummyMat = _getSparkMat(0xffd28a);

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
        const m = new THREE.Mesh(sparkGeo, dummyMat);
        m.visible = false;
        m.frustumCulled = false;
        m.renderOrder = 2;
        scene.add(m);
        _sparkFreePool.push({
            mesh: m,
            vel:  new THREE.Vector3(),
            life: 0,
        });
    }
    console.log('[effects] 火花池已初始化:', SPARK_POOL_SIZE);
}

function _acquireSpark() {
    if (!_sparkPoolInitialized) _initSparkPool();
    if (_sparkFreePool.length === 0) return null;
    return _sparkFreePool.pop();
}

function _releaseSpark(s) {
    s.mesh.visible = false;
    s.life = 0;
    s.vel.set(0, 0, 0);
    _sparkFreePool.push(s);
}

// ============================================================
// 帧预算计数器（仅火花使用；弹痕已改为池化，不再需要预算）
// ============================================================
let _fxFrameStamp = -1;
let _fxSparkCount = 0;
const FX_SPARK_PER_FRAME = 3;

function _tickFxBudget() {
    const stamp = Math.floor(performance.now() / 16.0);
    if (stamp !== _fxFrameStamp) {
        _fxFrameStamp = stamp;
        _fxSparkCount = 0;
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

// ============================================================
// ★ 弹痕 / 刀痕对象池（方案 B · 池化复用 · 所有武器共用）
// ============================================================
const TRACE_POOL_SIZE      = 200;      // 池容量
const BULLET_HOLE_LIFE_MS  = 10000;    // 生命周期 10s
const BULLET_HOLE_FADE_MS  = 2000;     // 淡出 2s

const _tracePool       = [];
const _traceActive     = [];
let   _tracePoolIdx    = 0;
let   _tracePoolInited = false;

// 弹痕 / 刀痕共用单位平面几何体（靠 scale 调整实际尺寸）
let _traceBaseGeo = null;
function _getTraceBaseGeo() {
    if (!_traceBaseGeo) _traceBaseGeo = new THREE.PlaneGeometry(1, 1);
    return _traceBaseGeo;
}

function _initTracePool() {
    if (_tracePoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _tracePoolInited = true;

    const geo = _getTraceBaseGeo();

    for (let i = 0; i < TRACE_POOL_SIZE; i++) {
        const mat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -8,
            polygonOffsetUnits: -8,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        mesh.renderOrder = 5;
        mesh.frustumCulled = false;
        scene.add(mesh);

        _tracePool.push({
            mesh,
            mat,
            active: false,
            born: 0,
            until: 0,
        });
    }
    console.log('[effects] 弹痕池已初始化:', TRACE_POOL_SIZE);
}

function _acquireTraceSlot() {
    if (!_tracePoolInited) _initTracePool();
    if (_tracePool.length === 0) return null;

    // 优先找空闲槽位（round-robin 起点）
    for (let i = 0; i < TRACE_POOL_SIZE; i++) {
        const slot = _tracePool[(_tracePoolIdx + i) % TRACE_POOL_SIZE];
        if (!slot.active) {
            _tracePoolIdx = (_tracePoolIdx + i + 1) % TRACE_POOL_SIZE;
            return slot;
        }
    }

    // 池满 → 回收最旧的活跃槽位
    let oldest = _traceActive[0];
    for (let i = 1; i < _traceActive.length; i++) {
        if (_traceActive[i].born < oldest.born) oldest = _traceActive[i];
    }
    _releaseTraceSlot(oldest);
    return oldest;
}

function _releaseTraceSlot(slot) {
    if (!slot || !slot.active) return;
    slot.active = false;
    slot.mesh.visible = false;
    slot.mat.opacity = 0;

    const idx = _traceActive.indexOf(slot);
    if (idx >= 0) _traceActive.splice(idx, 1);
}

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

// ============================================================
// ★ 生成弹痕（池化版 · 使用单位平面 + scale 缩放）
// ============================================================
function spawnBulletHole(point, normal) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    const slot = _acquireTraceSlot();
    if (!slot) return;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();

    // 切换纹理为弹孔纹理（同池内切换成本极低）
    const tex = getBulletHoleTexture();
    if (slot.mat.map !== tex) {
        slot.mat.map = tex;
        slot.mat.needsUpdate = true;
    }

    slot.mesh.position.copy(point).addScaledVector(n, 0.008);

    // 平面法线对齐命中面法线
    const up = Math.abs(n.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(up, n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const m = new THREE.Matrix4().makeBasis(t1, t2, n);
    slot.mesh.setRotationFromMatrix(m);
    slot.mesh.rotateZ(Math.random() * Math.PI * 2);

    // 尺寸：基础 0.18 × 随机系数（原 PlaneGeometry(0.18, 0.18) + scale s）
    const s = 0.75 + Math.random() * 0.7;
    slot.mesh.scale.set(0.18 * s, 0.18 * s, 1);

    slot.mat.opacity = 1;
    slot.mesh.visible = true;

    slot.active = true;
    slot.born   = performance.now();
    slot.until  = slot.born + BULLET_HOLE_LIFE_MS;

    _traceActive.push(slot);
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

// ============================================================
// ★ 生成刀痕（池化版 · 使用单位平面 + scale 缩放）
// ============================================================
function spawnSlashMark(point, normal, playerYaw, isVertical) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    const slot = _acquireTraceSlot();
    if (!slot) return;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();

    // 切换纹理为刀痕纹理
    const tex = getSlashMarkTexture();
    if (slot.mat.map !== tex) {
        slot.mat.map = tex;
        slot.mat.needsUpdate = true;
    }

    // 计算刀刃方向
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

    slot.mesh.position.copy(point).addScaledVector(n, 0.008);
    slot.mesh.setRotationFromMatrix(basisMat);

    if (!isVertical) {
        slot.mesh.rotateZ((Math.random() - 0.5) * 0.12);
    }

    // 尺寸：原 PlaneGeometry(0.48, 0.06) + scale s
    const s = 0.9 + Math.random() * 0.25;
    slot.mesh.scale.set(0.48 * s, 0.06 * s, 1);

    slot.mat.opacity = 1;
    slot.mesh.visible = true;

    slot.active = true;
    slot.born   = performance.now();
    slot.until  = slot.born + BULLET_HOLE_LIFE_MS;

    _traceActive.push(slot);
}
window.spawnSlashMark = spawnSlashMark;

// ============================================================
// 弹痕 / 刀痕生命周期更新
// ============================================================
function updateBulletHoles(now) {
    for (let i = _traceActive.length - 1; i >= 0; i--) {
        const slot = _traceActive[i];
        const age  = now - slot.born;

        if (age >= BULLET_HOLE_LIFE_MS) {
            _releaseTraceSlot(slot);
            continue;
        }

        const remain = BULLET_HOLE_LIFE_MS - age;
        if (remain < BULLET_HOLE_FADE_MS) {
            slot.mat.opacity = Math.max(0, remain / BULLET_HOLE_FADE_MS);
        }
    }
}

function clearAllBulletHoles() {
    for (let i = _traceActive.length - 1; i >= 0; i--) {
        _releaseTraceSlot(_traceActive[i]);
    }
    _traceActive.length = 0;
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

// ★ 调试：查看弹痕池状态
window.dumpTracePool = function () {
    console.log(
        `[effects] 弹痕池: 活跃 ${_traceActive.length} / 总 ${TRACE_POOL_SIZE}`
    );
    return {
        active: _traceActive.length,
        total: TRACE_POOL_SIZE,
    };
};

// ★ 调试：查看投掷轨迹池状态
window.dumpTrajPool = function () {
    console.log(
        `[effects] 投掷轨迹池: 容量 ${TRAJ_POOL_SIZE} / 当前索引 ${_trajPoolIdx}`
    );
    return {
        size: TRAJ_POOL_SIZE,
        idx: _trajPoolIdx,
    };
};

// ===== 投掷轨迹线 =====
let smokeTrajLine = null;
let flashTrajLine = null;

const SMOKE_TRAJ_STEPS = 144;
const SMOKE_TRAJ_DT = 1 / 60;

// ============================================================
// ★ 投掷轨迹 Vector3 对象池
//   每次模拟需要 144 个 Vector3（抛物线上每个点一个）
//   池容量取 288 = 两套，留出安全余量
// ============================================================
const TRAJ_POOL_SIZE = 288;
const _trajPool = [];
for (let i = 0; i < TRAJ_POOL_SIZE; i++) {
    _trajPool.push(new THREE.Vector3());
}
let _trajPoolIdx = 0;

function _acquireTrajVec() {
    const v = _trajPool[_trajPoolIdx];
    _trajPoolIdx = (_trajPoolIdx + 1) % TRAJ_POOL_SIZE;
    return v;
}

// 复用的临时向量（原来每个函数调用都会 new 两个）
const _trajTmpVel = new THREE.Vector3();
const _trajTmpPos = new THREE.Vector3();

// ============================================================
// ★ 投掷轨迹模拟（池化版 · 不再分配 Vector3）
// ============================================================
function simulateThrowTrajectory(origin, dir, throwSpeed, upBias, gravity, bounces, friction, steps, dt) {
    // ★ 每帧从池头重新开始借
    _trajPoolIdx = 0;

    const pts = [];
    // ★ 复用临时向量，不再 clone / new
    const vel = _trajTmpVel.copy(dir).multiplyScalar(throwSpeed);
    vel.y += upBias * throwSpeed;
    const pos = _trajTmpPos.copy(origin);

    let stopped = false;
    let restX = pos.x, restY = pos.y, restZ = pos.z;

    const LINEAR_DAMPING = 0.05;
    const GROUND_Y = (typeof SMOKE_PROJ_RADIUS !== 'undefined') ? SMOKE_PROJ_RADIUS : 0.09;
    const dampFactor = Math.pow(1 - LINEAR_DAMPING, dt);

    for (let i = 0; i < steps; i++) {
        if (stopped) {
            // ★ 从池借 Vector3，只改值
            const v = _acquireTrajVec();
            v.set(restX, restY, restZ);
            pts.push(v);
            continue;
        }

        // ★ 从池借 Vector3，只改值
        const v = _acquireTrajVec();
        v.copy(pos);
        pts.push(v);

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

// ============================================================
// 启动时初始化弹痕池（如场景已存在）
// ============================================================
if (typeof scene !== 'undefined' && scene) {
    _initTracePool();
}