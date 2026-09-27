// ===== js/loading.js – 加载页面完整实现（含真实场景编译 + 武器多角度编译 + 特效预热） =====
//
// 职责：
//   1. 显示/隐藏加载遮罩层，管理进度条与百分比
//   2. 按顺序执行任务列表
//   3. 单机模式：点击靶场/人机按钮 → 走加载 → 进入游戏
//   4. 联机模式：房主开始 → 双方进入加载 → 全员 100% → 同时进入游戏
//   5. 覆盖 onlineStartGame / lobbyRangeBtn / lobbyAiBtn 的事件
//
// 依赖（按 index.html 顺序加载好）：
//   config.js / scene.js / player_model.js / game_effects.js / game_projectiles.js
//   online_core.js / online_game.js / main.js
//   —— loading.js 必须在 main.js 之后加载

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('[loading] THREE 未加载，跳过');
        return;
    }

    // ============================================================
    // DOM 引用
    // ============================================================
    const overlay   = document.getElementById('loadingOverlay');
    const barEl     = document.getElementById('loadingBar');
    const percentEl = document.getElementById('loadingPercent');
    const statusEl  = document.getElementById('loadingStatus');
    const titleEl   = overlay ? overlay.querySelector('.loading-title') : null;
    const playersEl = document.getElementById('loadingPlayers');

    if (!overlay) {
        console.warn('[loading] 未找到 #loadingOverlay，跳过');
        return;
    }

    // ============================================================
    // 状态
    // ============================================================
    const state = {
        active: false,
        progress: 0,
        status: '',
        online: false,
        players: {},
    };

    // ============================================================
    // 基础 UI
    // ============================================================
    function show(title) {
        state.active = true;
        state.progress = 0;
        state.status = '准备中...';
        overlay.style.display = 'flex';
        if (titleEl && title) titleEl.textContent = title;
        renderAll();
    }

    function hide() {
        state.active = false;
        state.online = false;
        state.players = {};
        overlay.style.display = 'none';
        if (playersEl) playersEl.style.display = 'none';
    }

    function setProgress(p) {
        state.progress = Math.max(0, Math.min(1, p));
        renderAll();
    }

    function setStatus(text) {
        state.status = text || '';
        renderAll();
    }

    function getProgress() {
        return state.progress;
    }

    function renderAll() {
        const pct = Math.round(state.progress * 100);
        if (barEl)     barEl.style.width = pct + '%';
        if (percentEl) percentEl.textContent = pct + '%';
        if (statusEl)  statusEl.textContent = state.status || '';
        renderPlayerList();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // ============================================================
    // 联机玩家列表
    // ============================================================
    function setupPlayers(players) {
        state.online = true;
        state.players = {};
        players.forEach(p => {
            state.players[p.id] = {
                name: p.name || '玩家',
                isSelf: !!p.isSelf,
                progress: 0,
            };
        });
        if (playersEl) playersEl.style.display = 'flex';
        renderPlayerList();
    }

    function setPlayerProgress(peerId, progress) {
        if (!state.players[peerId]) {
            state.players[peerId] = { name: '玩家', isSelf: false, progress: 0 };
        }
        state.players[peerId].progress = Math.max(0, Math.min(1, progress));
        renderPlayerList();
    }

    function renderPlayerList() {
        if (!playersEl) return;
        if (!state.online) {
            playersEl.style.display = 'none';
            return;
        }
        let html = '';
        for (const id in state.players) {
            const p = state.players[id];
            const pct = Math.round((p.progress || 0) * 100);
            const doneCls = pct >= 100 ? ' done' : '';
            html += '<div class="loading-player-row' + doneCls + '">' +
                        '<span class="lp-name">' + escapeHtml(p.name) +
                            (p.isSelf ? '（你）' : '') +
                        '</span>' +
                        '<span class="lp-pct">' + pct + '%</span>' +
                    '</div>';
        }
        playersEl.innerHTML = html;
    }

    // ============================================================
    // 任务执行
    // ============================================================
    function nextFrame() {
        return new Promise(r => requestAnimationFrame(() => r()));
    }

    async function runTasks(tasks, onProgress) {
        const totalWeight = tasks.reduce((s, t) => s + (t.weight || 1), 0) || 1;
        let doneWeight = 0;

        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            state.status = t.name || '加载中';
            state.progress = doneWeight / totalWeight;
            renderAll();

            await nextFrame();

            try {
                if (t.fn) await Promise.resolve(t.fn());
            } catch (e) {
                console.warn('[loading] 任务失败:', t.name, e);
            }

            doneWeight += (t.weight || 1);
            state.progress = doneWeight / totalWeight;
            renderAll();

            if (onProgress) {
                try { onProgress(state.progress); } catch (e) {}
            }

            await nextFrame();
        }

        state.progress = 1;
        state.status = '完成';
        renderAll();
        if (onProgress) {
            try { onProgress(1); } catch (e) {}
        }
    }

    // ============================================================
    // 预热相机：加载期间主循环不更新 p1.cam，可以临时挪走
    // ============================================================
    function withWarmupCamera(fn) {
        if (typeof p1 === 'undefined' || !p1 || !p1.cam) {
            try { fn(); } catch (e) {}
            return;
        }
        const cam = p1.cam;
        const origPos    = cam.position.clone();
        const origRotX   = cam.rotation.x;
        const origRotY   = cam.rotation.y;
        const origRotZ   = cam.rotation.z;
        const origFov    = cam.fov;
        const origAspect = cam.aspect;
        const origNear   = cam.near;
        const origFar    = cam.far;

        cam.position.set(0, 55, 0);
        cam.rotation.set(-Math.PI / 2, 0, 0);
        cam.fov = 100;
        cam.aspect = 1;
        cam.near = 0.1;
        cam.far = 500;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);

        try {
            fn();
        } finally {
            cam.position.copy(origPos);
            cam.rotation.set(origRotX, origRotY, origRotZ);
            cam.fov = origFov;
            cam.aspect = origAspect;
            cam.near = origNear;
            cam.far = origFar;
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld(true);
        }
    }

    // ============================================================
    // ★ 真实场景整体 shader 编译（覆盖地图 + 阴影 pass）
    // ============================================================
    function compileSceneShaders() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof scene === 'undefined' || !scene) return;

        withWarmupCamera(() => {
            const attached = [];
            ['rifle', 'sniper', 'shotgun', 'odin', 'knife'].forEach(type => {
                try {
                    const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                    const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                    [w, v].forEach(tpl => {
                        if (!tpl) return;
                        if (tpl.parent) tpl.parent.remove(tpl);
                        tpl.position.set(0, 0.5, 0);
                        tpl.visible = true;
                        tpl.traverse(o => { o.visible = true; });
                        scene.add(tpl);
                        attached.push(tpl);
                    });
                } catch (e) {}
            });

            scene.updateMatrixWorld(true);

            try {
                renderer.compile(scene, p1.cam);
            } catch (e) {
                console.warn('[loading] scene compile failed:', e);
            }

            try {
                const prevAuto  = renderer.shadowMap.autoUpdate;
                const prevNeeds = renderer.shadowMap.needsUpdate;
                renderer.shadowMap.autoUpdate = false;
                renderer.shadowMap.needsUpdate = true;
                renderer.render(scene, p1.cam);
                renderer.shadowMap.autoUpdate = prevAuto;
                renderer.shadowMap.needsUpdate = true;
            } catch (e) {
                console.warn('[loading] scene render failed:', e);
            }

            attached.forEach(o => {
                if (o.parent === scene) scene.remove(o);
            });
        });
    }

    // ============================================================
    // ★ 武器多角度 shader 编译（本轮新增，解决换枪后跳跃卡）
    //
    //   为什么需要单独做一遍：
    //     场景整体编译只从"俯瞰"一个角度看武器，枪身的侧面 /
    //     底面 / 内部结构（镜筒、弹链）从没被渲染过 → 那些部位
    //     的纹理 / VBO 首次上传就发生在跳跃 / 击杀的那一刻。
    //
    //   做法：
    //     · 用一个独立小场景，只放武器模板 + 灯光 + fog
    //     · 相机绕武器转 8 个水平角 × 3 个仰角 = 24 个视角
    //     · 每个视角 compile + render 一帧，把材质 / 纹理 / VBO
    //       全部上传 GPU
    //     · 最后再从"枪口方向"渲染一帧，模拟玩家视角
    //     · 全程只渲染武器（几十个 mesh），单帧 < 5ms
    // ============================================================
    function compileWeaponShadersAllAngles() {
        if (typeof renderer === 'undefined' || !renderer) return;

        const ws = new THREE.Scene();
        ws.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
        const wsSun = new THREE.DirectionalLight(0xfff2dd, 0.85);
        wsSun.position.set(35, 55, 20);
        ws.add(wsSun);

        // 加一份和主场景一样的 fog，让 fog 变体的 shader 也一起编译
        if (typeof scene !== 'undefined' && scene.fog) {
            ws.fog = scene.fog.clone();
        }

        const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 20);

        // 挂载所有武器模板
        const attached = [];
        ['rifle', 'sniper', 'shotgun', 'odin', 'knife'].forEach(type => {
            try {
                const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                [w, v].forEach(tpl => {
                    if (!tpl) return;
                    if (tpl.parent) tpl.parent.remove(tpl);
                    tpl.position.set(0, 0, 0);
                    tpl.visible = true;
                    tpl.traverse(o => { o.visible = true; });
                    ws.add(tpl);
                    attached.push(tpl);
                });
            } catch (e) {}
        });

        ws.updateMatrixWorld(true);

        const HORIZONTAL_STEPS = 8;
        const VERTICAL_ANGLES = [-0.5, 0, 0.5];
        const R = 2.5;

        // 24 个绕圈视角
        for (let vi = 0; vi < VERTICAL_ANGLES.length; vi++) {
            const vAng = VERTICAL_ANGLES[vi];
            for (let i = 0; i < HORIZONTAL_STEPS; i++) {
                const a = (i / HORIZONTAL_STEPS) * Math.PI * 2;
                cam.position.set(
                    Math.sin(a) * R * Math.cos(vAng),
                    Math.sin(vAng) * R,
                    Math.cos(a) * R * Math.cos(vAng)
                );
                cam.lookAt(0, 0, 0);
                cam.updateMatrixWorld(true);
                try {
                    renderer.compile(ws, cam);
                    renderer.render(ws, cam);
                } catch (e) {}
            }
        }

        // 从枪口方向看（模拟第一人称视角）
        cam.position.set(0, 0.3, 2);
        cam.lookAt(0, 0.1, -2);
        cam.updateMatrixWorld(true);
        try { renderer.compile(ws, cam); renderer.render(ws, cam); } catch (e) {}

        // 正上方 + 正下方
        cam.position.set(0, 3, 0);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld(true);
        try { renderer.compile(ws, cam); renderer.render(ws, cam); } catch (e) {}

        cam.position.set(0, -3, 0);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld(true);
        try { renderer.compile(ws, cam); renderer.render(ws, cam); } catch (e) {}

        // 摘掉模板
        attached.forEach(o => {
            if (o.parent === ws) ws.remove(o);
        });
    }

    // ============================================================
    // ★ 运行时特效预热
    // ============================================================
    const WARMUP_OBJ_POS = new THREE.Vector3(0, 54.5, 0);

    function warmupSparks(color) {
        if (typeof window.spawnSparks !== 'function') {
            console.warn('[loading] spawnSparks 未暴露，跳过预热');
            return;
        }
        withWarmupCamera(() => {
            window.spawnSparks(WARMUP_OBJ_POS.clone(), color);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupBulletHole() {
        if (typeof window.spawnBulletHole !== 'function') {
            console.warn('[loading] spawnBulletHole 未暴露，跳过预热');
            return;
        }
        withWarmupCamera(() => {
            const pos = WARMUP_OBJ_POS.clone();
            const normal = new THREE.Vector3(0, 1, 0);
            window.spawnBulletHole(pos, normal);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupTracer() {
        if (typeof window.spawnTracer !== 'function') {
            console.warn('[loading] spawnTracer 未暴露，跳过预热');
            return;
        }
        withWarmupCamera(() => {
            const from = WARMUP_OBJ_POS.clone();
            const to = from.clone().add(new THREE.Vector3(3, 0, 0));
            window.spawnTracer(from, to);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    // ============================================================
    // 构建加载任务列表
    // ============================================================
    const WEAPON_NAMES = {
        rifle: '狂徒', sniper: '冥驹', shotgun: '判官',
        odin: '奥丁', knife: '军刀',
    };

    function buildGameLoadTasks(mapId) {
        const tasks = [];

        // 1) 地图
        tasks.push({
            name: '构建地图',
            weight: 4,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        // 2) 5 把武器：只构建模板，不编译
        ['rifle', 'sniper', 'shotgun', 'odin', 'knife'].forEach(type => {
            tasks.push({
                name: '载入武器：' + (WEAPON_NAMES[type] || type),
                weight: 2,
                fn: () => {
                    if (typeof _getWorldTemplate === 'function') _getWorldTemplate(type);
                    if (typeof _getViewTemplate  === 'function') _getViewTemplate(type);
                },
            });
        });

        // 3) 真实场景整体编译（覆盖地图 + 阴影 pass）
        tasks.push({
            name: '编译场景着色器',
            weight: 10,
            fn: () => compileSceneShaders(),
        });

        // 4) ★ 武器多角度编译（覆盖枪身所有角度的材质 / 纹理 / VBO）
        tasks.push({
            name: '编译武器多角度着色器',
            weight: 6,
            fn: () => compileWeaponShadersAllAngles(),
        });

        // 5) 运行时特效预热
        tasks.push({
            name: '预热特效：火花',
            weight: 1,
            fn: () => warmupSparks(0xff5040),
        });
        tasks.push({
            name: '预热特效：火花',
            weight: 1,
            fn: () => warmupSparks(0xffd28a),
        });
        tasks.push({
            name: '预热特效：弹痕',
            weight: 1,
            fn: () => warmupBulletHole(),
        });
        tasks.push({
            name: '预热特效：曳光弹',
            weight: 1,
            fn: () => warmupTracer(),
        });

        return tasks;
    }

    // ============================================================
    // 单机入口
    // ============================================================
    async function beginSinglePlayerLoading(mode) {
        if (typeof audio === 'function') audio();

        const ll = document.getElementById('lobbyOverlay');
        if (ll) ll.style.display = 'none';

        show(mode === 'range' ? '正在载入靶场' : '正在载入人机对战');

        const mapId = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
        const tasks = buildGameLoadTasks(mapId);
        await runTasks(tasks);

        await nextFrame();
        await nextFrame();

        hide();

        if (typeof window.enterGame === 'function') {
            window.enterGame(mode);
        }
    }

    // ============================================================
    // 联机入口
    // ============================================================
    async function beginOnlineLoading(mapId, isHost) {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingInProgress) return;
        NET.loadingInProgress = true;
        NET.loadingAllDone = false;
        NET.loadingState = {};

        const ol = document.getElementById('onlineLobbyOverlay');
        const ll = document.getElementById('lobbyOverlay');
        if (ol) ol.style.display = 'none';
        if (ll) ll.style.display = 'none';

        const players = [];
        if (isHost) {
            players.push({ id: NET.myPeerId, name: NET.myName, isSelf: true });
            NET.members.forEach((m, id) => {
                if (id !== NET.myPeerId) {
                    players.push({ id, name: m.name, isSelf: false });
                }
            });
            NET.loadingState[NET.myPeerId] = 0;
        } else {
            const hostId = NET.roomId;
            const hostMember = NET.members.get(hostId);
            players.push({
                id: hostId,
                name: (hostMember && hostMember.name) || '房主',
                isSelf: false,
            });
            players.push({ id: NET.myPeerId, name: NET.myName || '你', isSelf: true });
        }

        show('正在载入战场');
        setupPlayers(players);

        startOnlineLoadingReport(isHost);

        const tasks = buildGameLoadTasks(mapId || (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield');
        await runTasks(tasks);

        stopOnlineLoadingReport();

        if (isHost) {
            NET.loadingState[NET.myPeerId] = 1;
            broadcastLoadingStatus();
            checkAllLoaded();
        } else {
            if (typeof window.NET_sendToHost === 'function') {
                window.NET_sendToHost({ type: 'loadingProgress', progress: 1 });
            }
            setStatus('等待其他玩家...');
        }
    }

    function startOnlineLoadingReport(isHost) {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingReportTimer) clearInterval(NET.loadingReportTimer);

        NET.loadingReportTimer = setInterval(() => {
            const p = getProgress();
            if (isHost) {
                NET.loadingState[NET.myPeerId] = p;
                broadcastLoadingStatus();
            } else {
                if (typeof window.NET_sendToHost === 'function') {
                    window.NET_sendToHost({ type: 'loadingProgress', progress: p });
                }
            }
        }, 200);
    }

    function stopOnlineLoadingReport() {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingReportTimer) {
            clearInterval(NET.loadingReportTimer);
            NET.loadingReportTimer = null;
        }
    }

    function broadcastLoadingStatus() {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        if (typeof window.NET_broadcast === 'function') {
            window.NET_broadcast({ type: 'loadingStatus', state: NET.loadingState });
        }
    }

    function handleClientLoadingProgress(fromId, progress) {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        NET.loadingState[fromId] = progress;
        setPlayerProgress(fromId, progress);
        broadcastLoadingStatus();
        checkAllLoaded();
    }

    function handleLoadingStatus(stateMap) {
        const NET = window.NET;
        if (!NET || NET.isHost) return;
        if (!stateMap) return;
        for (const id in stateMap) {
            setPlayerProgress(id, stateMap[id]);
        }
    }

    function handleLoadingComplete() {
        const NET = window.NET;
        if (!NET || NET.isHost) return;
        finishOnlineLoading();
    }

    function checkAllLoaded() {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        if (NET.loadingAllDone) return;
        for (const id in NET.loadingState) {
            if (NET.loadingState[id] < 1) return;
        }
        NET.loadingAllDone = true;
        if (typeof window.NET_broadcast === 'function') {
            window.NET_broadcast({ type: 'loadingComplete' });
        }
        finishOnlineLoading();
    }

    function finishOnlineLoading() {
        stopOnlineLoadingReport();
        setStatus('全员就绪');
        setProgress(1);

        setTimeout(() => {
            hide();
            if (typeof window.NET_enterOnlineGame === 'function') {
                window.NET_enterOnlineGame();
            }
            const NET = window.NET;
            if (NET) {
                NET.loadingInProgress = false;
                NET.loadingAllDone = false;
                NET.loadingState = {};
            }
        }, 260);
    }

    // ============================================================
    // 覆盖：onlineStartGame
    // ============================================================
    function installOnlineStartHook() {
        window.onlineStartGame = function () {
            const NET = window.NET;
            if (!NET || !NET.isHost) return;
            if (!NET.seats.blue || !NET.seats.red) {
                if (typeof toast === 'function') toast('双方入场后才能开始');
                return;
            }
            NET.started = true;

            const mapId = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
            if (typeof window.NET_broadcast === 'function') {
                window.NET_broadcast({ type: 'gameStart', mapId: mapId });
            }

            beginOnlineLoading(mapId, true);
        };
    }

    // ============================================================
    // 覆盖：lobbyRangeBtn / lobbyAiBtn
    // ============================================================
    function hijackClick(id, handler) {
        const old = document.getElementById(id);
        if (!old) return;
        const clone = old.cloneNode(true);
        old.parentNode.replaceChild(clone, old);
        clone.addEventListener('click', handler);
    }

    function installLobbyHooks() {
        hijackClick('lobbyRangeBtn', () => beginSinglePlayerLoading('range'));
        hijackClick('lobbyAiBtn',    () => beginSinglePlayerLoading('ai'));
    }

    // ============================================================
    // 暴露
    // ============================================================
    window.LoadingManager = {
        show,
        hide,
        setProgress,
        setStatus,
        getProgress,
        setupPlayers,
        setPlayerProgress,
        runTasks,
        isActive: () => state.active,
    };

    window.beginSinglePlayerLoading    = beginSinglePlayerLoading;
    window.beginOnlineLoading          = beginOnlineLoading;
    window.handleClientLoadingProgress = handleClientLoadingProgress;
    window.handleLoadingStatus         = handleLoadingStatus;
    window.handleLoadingComplete       = handleLoadingComplete;
    window.finishOnlineLoading         = finishOnlineLoading;

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        installLobbyHooks();
        installOnlineStartHook();
        console.log('[loading] 加载页面已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();