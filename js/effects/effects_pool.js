// ===== js/effects_pool.js – 曳光弹池 + 火花池 + 帧预算 =====
// 从 game_effects.js 拆出，不改变任何对外接口

// ============================================================
// 帧预算计数器（仅火花使用）
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

// ============================================================
// 曳光弹对象池
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
// 火花（对象池化：预建 128 个 Mesh，用完隐藏归还）
// ============================================================
const sparks = [];
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);

const SPARK_POOL_SIZE = 128;
const _sparkFreePool = [];
let _sparkPoolInitialized = false;
let _sparkPoolStarved = 0;

const _sparkMatCache = new Map();
function _getSparkMat(color) {
    let m = _sparkMatCache.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color });
        _sparkMatCache.set(color, m);
    }
    return m;
}

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