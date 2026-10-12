// ===== js/effects_trace.js – 弹痕 / 刀痕对象池 + 纹理 + 生命周期 =====
// 从 game_effects.js 拆出，不改变任何对外接口

const TRACE_POOL_SIZE      = 200;
const BULLET_HOLE_LIFE_MS  = 10000;
const BULLET_HOLE_FADE_MS  = 2000;

const _tracePool       = [];
const _traceActive     = [];
let   _tracePoolIdx    = 0;
let   _tracePoolInited = false;

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

    for (let i = 0; i < TRACE_POOL_SIZE; i++) {
        const slot = _tracePool[(_tracePoolIdx + i) % TRACE_POOL_SIZE];
        if (!slot.active) {
            _tracePoolIdx = (_tracePoolIdx + i + 1) % TRACE_POOL_SIZE;
            return slot;
        }
    }

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
// 生成弹痕（池化版 · 使用单位平面 + scale 缩放）
// ============================================================
function spawnBulletHole(point, normal) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    const slot = _acquireTraceSlot();
    if (!slot) return;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();

    const tex = getBulletHoleTexture();
    if (slot.mat.map !== tex) {
        slot.mat.map = tex;
        slot.mat.needsUpdate = true;
    }

    slot.mesh.position.copy(point).addScaledVector(n, 0.008);

    const up = Math.abs(n.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(up, n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const m = new THREE.Matrix4().makeBasis(t1, t2, n);
    slot.mesh.setRotationFromMatrix(m);
    slot.mesh.rotateZ(Math.random() * Math.PI * 2);

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
// 刀痕纹理（锐利的金属切割痕）
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
// 生成刀痕（池化版 · 使用单位平面 + scale 缩放）
// ============================================================
function spawnSlashMark(point, normal, playerYaw, isVertical) {
    if (typeof scene === 'undefined') return;
    if (!point) return;

    const slot = _acquireTraceSlot();
    if (!slot) return;

    const n = (normal ? normal.clone() : new THREE.Vector3(0, 1, 0)).normalize();

    const tex = getSlashMarkTexture();
    if (slot.mat.map !== tex) {
        slot.mat.map = tex;
        slot.mat.needsUpdate = true;
    }

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

window.dumpTracePool = function () {
    console.log(
        `[effects] 弹痕池: 活跃 ${_traceActive.length} / 总 ${TRACE_POOL_SIZE}`
    );
    return {
        active: _traceActive.length,
        total: TRACE_POOL_SIZE,
    };
};

// 启动时初始化
if (typeof scene !== 'undefined' && scene) {
    _initTracePool();
}