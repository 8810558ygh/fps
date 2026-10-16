// ===== js/minimap.js – 小地图（通用，跟随当前地图的 colliders 自动绘制） =====
(function () {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // 离屏静态层：背景、网格、墙体（只在 resize / 地图切换时重绘）
    const staticCanvas = document.createElement('canvas');
    const staticCtx = staticCanvas.getContext('2d');

    let mapSize = 320;
    let dpr = 1;

    // ★ 新增：视野扇形径向渐变的缓存
    let _viewFovGrad = null;
    let _viewFovGradRadius = -1;

    // ★ 新增：取得当前地图的活动半径（半宽）
    function _getArenaHalf() {
        return (typeof window.currentArenaHalf === 'number')
            ? window.currentArenaHalf
            : ((typeof ARENA !== 'undefined') ? ARENA : 26);
    }

    function resize() {
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        mapSize = isTouch ? 210 : 320;
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = mapSize * dpr;
        canvas.height = mapSize * dpr;
        canvas.style.width = mapSize + 'px';
        canvas.style.height = mapSize + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        staticCanvas.width = mapSize * dpr;
        staticCanvas.height = mapSize * dpr;
        staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // ★ 尺寸变了，缓存作废
        _viewFovGrad = null;
        _viewFovGradRadius = -1;

        drawStatic();
    }

    // ============================================================
    // 静态层绘制（背景 + 网格 + 墙体 + 边界）
    // 数据来源：全局 colliders（由 scene.js / map_xxx.js 填充）
    // ============================================================
    function drawStatic() {
        const s = mapSize;
        staticCtx.clearRect(0, 0, s, s);

        // ---- 底色 ----
        staticCtx.fillStyle = '#1c1f24';
        staticCtx.fillRect(0, 0, s, s);

        // ---- 网格 ----
        staticCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        staticCtx.lineWidth = 1;
        const step = s / 4;
        for (let i = 1; i < 4; i++) {
            staticCtx.beginPath();
            staticCtx.moveTo(i * step, 0);
            staticCtx.lineTo(i * step, s);
            staticCtx.stroke();
            staticCtx.beginPath();
            staticCtx.moveTo(0, i * step);
            staticCtx.lineTo(s, i * step);
            staticCtx.stroke();
        }

        // ---- 墙体 ----
        if (typeof colliders === 'undefined' || !colliders) {
            staticCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            staticCtx.lineWidth = 1.5;
            staticCtx.strokeRect(0.75, 0.75, s - 1.5, s - 1.5);
            return;
        }

        // ★ 修改：动态半宽
        const half  = _getArenaHalf();
        const scale = s / (half * 2);

        const wallFill = '#d8d2c6';
        const wallEdge = 'rgba(30, 30, 34, 0.85)';
        staticCtx.lineWidth = 0.8;

        for (const c of colliders) {
            const w = c.x1 - c.x0;
            const h = c.z1 - c.z0;
            // ★ 修改：超大地图物体跳过阈值改用 half
            if (w > half * 1.5 || h > half * 1.5) continue;

            // ★ 修改：偏移量用 half
            const x = (c.x0 + half) * scale;
            const y = (c.z0 + half) * scale;
            const rectW = Math.max(w * scale, 2);
            const rectH = Math.max(h * scale, 2);

            staticCtx.fillStyle = wallFill;
            staticCtx.fillRect(x, y, rectW, rectH);
            staticCtx.strokeStyle = wallEdge;
            staticCtx.strokeRect(x, y, rectW, rectH);
        }

        // ---- 地图边界 ----
        staticCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        staticCtx.lineWidth = 1.5;
        staticCtx.strokeRect(0.75, 0.75, s - 1.5, s - 1.5);
    }

    // 复用的临时向量（避免每帧 new）
    const _eye = new THREE.Vector3();
    const _tpos = new THREE.Vector3();
    const _dir = new THREE.Vector3();
    const _camDir = new THREE.Vector3();
    const _ray = new THREE.Raycaster();

    // ============================================================
    // ★ P0-1：敌人红点光晕 sprite（离屏预渲染一次，之后每帧 drawImage）
    //
    //   背景：
    //     原代码在 draw() 里每帧调用 ctx.createRadialGradient()，
    //     每次都会分配新对象，然后被 GC 回收。
    //     60fps 下就是每秒 60 次分配 + 回收，白费 CPU。
    //
    //   做法：
    //     把"红光晕"预渲染到一张小 canvas 上，每帧用 drawImage 缩放贴图。
    //     drawImage 是 GPU 加速的，比现场建渐变便宜很多。
    // ============================================================
    const HALO_SPRITE_R = 16;
    let _enemyHaloSprite = null;

    function _ensureEnemyHaloSprite() {
        if (_enemyHaloSprite) return _enemyHaloSprite;

        const size = HALO_SPRITE_R * 2;
        const c = document.createElement('canvas');
        c.width = c.height = size;

        const cx = c.getContext('2d');
        const g = cx.createRadialGradient(
            HALO_SPRITE_R, HALO_SPRITE_R, 0,
            HALO_SPRITE_R, HALO_SPRITE_R, HALO_SPRITE_R
        );
        g.addColorStop(0, 'rgba(255, 80, 64, 0.6)');
        g.addColorStop(1, 'rgba(255, 80, 64, 0)');

        cx.fillStyle = g;
        cx.fillRect(0, 0, size, size);

        _enemyHaloSprite = c;
        return c;
    }

    // ============================================================
    // ★ 优化：可见性缓存（10Hz 节流）
    // ============================================================
    let _enemyVisibleLastCheck = 0;
    let _enemyVisibleCached = false;

    // ★ 优化：遮挡物列表缓存
    const _occluderCache = [];
    let _occluderCacheLen = -1;
    function _getOccluderList() {
        const totalLen = wallMeshes.length + crateMeshes.length;
        if (_occluderCacheLen !== totalLen) {
            _occluderCache.length = 0;
            for (let i = 0; i < wallMeshes.length; i++) _occluderCache.push(wallMeshes[i]);
            for (let i = 0; i < crateMeshes.length; i++) _occluderCache.push(crateMeshes[i]);
            _occluderCacheLen = totalLen;
        }
        return _occluderCache;
    }

    // 敌人是否在我方视野内（水平视锥 + 3D 射线无遮挡）—— 带 100ms 缓存
    function enemyVisible() {
        const now = performance.now();

        if (now - _enemyVisibleLastCheck < 100) {
            return _enemyVisibleCached;
        }
        _enemyVisibleLastCheck = now;

        if (typeof p2 === 'undefined' || !p2 || !p2.baseVisible) {
            _enemyVisibleCached = false;
            return false;
        }
        if (typeof running !== 'undefined' && !running) {
            _enemyVisibleCached = false;
            return false;
        }

        _enemyVisibleCached = _enemyVisibleUncached();
        return _enemyVisibleCached;
    }

    // 原 enemyVisible 的完整逻辑（重命名，不做节流）
    function _enemyVisibleUncached() {
        p1.cam.getWorldPosition(_eye);
        _tpos.set(p2.pos.x, 1.0, p2.pos.z);

        _dir.copy(_tpos).sub(_eye);
        const dist = _dir.length();
        if (dist < 0.001) return true;
        _dir.normalize();

        // ---- 水平视锥 ----
        const hLen = Math.hypot(_dir.x, _dir.z) || 1;
        const ndx = _dir.x / hLen, ndz = _dir.z / hLen;

        _camDir.set(0, 0, -1).applyQuaternion(p1.cam.quaternion);
        const cLen = Math.hypot(_camDir.x, _camDir.z) || 1;
        const ncx = _camDir.x / cLen, ncz = _camDir.z / cLen;

        const dot = ncx * ndx + ncz * ndz;
        const vFov = p1.cam.fov * Math.PI / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (p1.cam.aspect || 1.6));
        const halfCos = Math.cos(hFov / 2);
        if (dot < halfCos) return false;

        // ---- 遮挡检测（用缓存的数组，不再 concat） ----
        _ray.set(_eye, _dir);
        _ray.near = 0;
        _ray.far = dist;
        const targets = _getOccluderList();
        const hits = _ray.intersectObjects(targets, false);
        if (hits.length > 0 && hits[0].distance < dist - 0.25) return false;

        return true;
    }

    function draw() {
        const s = mapSize;

        // ★ 修改：动态半宽
        const half  = _getArenaHalf();
        const scale = s / (half * 2);

        // 静态层
        ctx.clearRect(0, 0, s, s);
        ctx.drawImage(staticCanvas, 0, 0, s, s);

        if (typeof p1 === 'undefined' || !p1) return;

        // ---- 玩家三角 + 视野扇形 ----
        // ★ 修改：坐标换算用 half
        const px = (p1.pos.x + half) * scale;
        const py = (p1.pos.z + half) * scale;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-p1.yaw);

        // 视野扇形
        const vFov = p1.cam.fov * Math.PI / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (p1.cam.aspect || 1.6));
        const radius = s * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -Math.PI / 2 - hFov / 2, -Math.PI / 2 + hFov / 2);
        ctx.closePath();

        // ★ 径向渐变按需创建、之后复用
        if (!_viewFovGrad || _viewFovGradRadius !== radius) {
            _viewFovGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            _viewFovGrad.addColorStop(0, 'rgba(107, 179, 255, 0.35)');
            _viewFovGrad.addColorStop(1, 'rgba(107, 179, 255, 0)');
            _viewFovGradRadius = radius;
        }
        ctx.fillStyle = _viewFovGrad;
        ctx.fill();

        // 玩家三角
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 7);
        ctx.lineTo(0, 4);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fillStyle = '#6db3ff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.restore();

        // ---- 敌人红点（仅当可见时） ----
        if (enemyVisible()) {
            // ★ 修改：坐标换算用 half
            const ex = (p2.pos.x + half) * scale;
            const ey = (p2.pos.z + half) * scale;

            // 呼吸脉冲
            const t = performance.now() / 450;
            const pulse = 1 + Math.sin(t) * 0.35;

            // ★ P0-1：光晕用预渲染 sprite + drawImage，替代每帧 createRadialGradient
            const sprite = _ensureEnemyHaloSprite();
            const drawR = 12 * pulse;
            ctx.drawImage(sprite, ex - drawR, ey - drawR, drawR * 2, drawR * 2);

            // 红点本体
            ctx.beginPath();
            ctx.arc(ex, ey, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ff5040';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.3;
            ctx.stroke();
        }
    }

    resize();
    window.addEventListener('resize', resize);

    // 暴露给主循环
    window.updateMinimap = draw;

    // ★ 暴露静态层重绘（地图切换时由 scene.js 的 loadMap 调用）
    window.refreshMinimap = function () {
        try {
            requestAnimationFrame(() => {
                try { drawStatic(); } catch (e) { console.warn('minimap refresh failed', e); }
            });
        } catch (e) {
            console.warn('minimap refresh outer failed', e);
        }
    };
})();