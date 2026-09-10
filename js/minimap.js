// ===== js/minimap.js – 小地图（敌人仅在我方视野内可见时显示） =====
(function () {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // 离屏静态层：背景、网格、墙体（只在 resize 时重绘）
    const staticCanvas = document.createElement('canvas');
    const staticCtx = staticCanvas.getContext('2d');

    let mapSize = 320;
    let dpr = 1;

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

        drawStatic();
    }

    function drawStatic() {
        const s = mapSize;
        staticCtx.clearRect(0, 0, s, s);

        // ---- 地面 / 通道底色（中性深灰，与整体 HUD 风格统一） ----
        staticCtx.fillStyle = '#1c1f24';
        staticCtx.fillRect(0, 0, s, s);

        // ---- 网格（更淡的参考线） ----
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

        // ---- 墙体：暖灰白实心 + 深色描边（与深灰通道强对比） ----
        const scale = s / (ARENA * 2);
        const wallFill = '#d8d2c6';
        const wallEdge = 'rgba(30, 30, 34, 0.85)';
        staticCtx.lineWidth = 0.8;

        for (const c of colliders) {
            const w = c.x1 - c.x0;
            const h = c.z1 - c.z0;
            // 跳过外围大墙（否则会覆盖整个小地图）
            if (w > ARENA * 1.5 || h > ARENA * 1.5) continue;

            const x = (c.x0 + ARENA) * scale;
            const y = (c.z0 + ARENA) * scale;
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

    // 敌人是否在我方视野内（水平视锥 + 3D 射线无遮挡）
    function enemyVisible() {
        if (typeof p2 === 'undefined' || !p2 || !p2.baseVisible) return false;
        if (typeof running !== 'undefined' && !running) return false;

        p1.cam.getWorldPosition(_eye);
        _tpos.set(p2.pos.x, 1.0, p2.pos.z);

        _dir.copy(_tpos).sub(_eye);
        const dist = _dir.length();
        if (dist < 0.001) return true;
        _dir.normalize();

        // ---- 水平视锥检测 ----
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

        // ---- 遮挡检测 ----
        _ray.set(_eye, _dir);
        _ray.near = 0;
        _ray.far = dist;
        const targets = wallMeshes.concat(crateMeshes);
        const hits = _ray.intersectObjects(targets, false);
        if (hits.length > 0 && hits[0].distance < dist - 0.25) return false;

        return true;
    }

    function draw() {
        const s = mapSize;
        const scale = s / (ARENA * 2);

        // 静态层
        ctx.clearRect(0, 0, s, s);
        ctx.drawImage(staticCanvas, 0, 0, s, s);

        // ---- 玩家三角 + 视野扇形 ----
        const px = (p1.pos.x + ARENA) * scale;
        const py = (p1.pos.z + ARENA) * scale;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-p1.yaw);  // 世界 yaw=0 朝 -Z，canvas 上对应"上"

        // 视野扇形
        const vFov = p1.cam.fov * Math.PI / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (p1.cam.aspect || 1.6));
        const radius = s * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -Math.PI / 2 - hFov / 2, -Math.PI / 2 + hFov / 2);
        ctx.closePath();
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, 'rgba(107, 179, 255, 0.35)');
        grad.addColorStop(1, 'rgba(107, 179, 255, 0)');
        ctx.fillStyle = grad;
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
            const ex = (p2.pos.x + ARENA) * scale;
            const ey = (p2.pos.z + ARENA) * scale;

            // 呼吸脉冲
            const t = performance.now() / 450;
            const pulse = 1 + Math.sin(t) * 0.35;

            // 光晕
            const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12 * pulse);
            halo.addColorStop(0, 'rgba(255, 80, 64, 0.6)');
            halo.addColorStop(1, 'rgba(255, 80, 64, 0)');
            ctx.beginPath();
            ctx.arc(ex, ey, 12 * pulse, 0, Math.PI * 2);
            ctx.fillStyle = halo;
            ctx.fill();

            // 红点
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
})();