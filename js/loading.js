// ===== js/loading.js – 加载页面完整实现 =====
//
// 职责：
//   1. 显示/隐藏加载遮罩层，管理进度条与百分比
//   2. 按顺序执行任务列表（构建地图 / 构建武器模板 / 编译 shader）
//   3. 单机模式：点击靶场/人机按钮 → 走加载 → 进入游戏
//   4. 联机模式：房主开始 → 双方进入加载 → 全员 100% → 同时进入游戏
//   5. 覆盖 onlineStartGame / lobbyRangeBtn / lobbyAiBtn 的事件
//
// 依赖（按 index.html 顺序加载好）：
//   config.js / scene.js / player_model.js / online_core.js / online_game.js / main.js
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
        players: {},   // peerId -> { name, isSelf, progress }
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
    // Shader 编译（每把武器单独编译，分帧进行）
    // ============================================================
    // 创建一个"与主场景配置一致"的临时场景（fog + 灯光），
    // 把某个武器的世界/视图模板挂进去，调 renderer.compile 强制编译
    // 编译结束后从临时场景移除，模板本身保留供游戏使用。
    //
    // 关键：material.name 必须唯一，否则 renderer.compile 内部会
    //      按 name 去重，大量材质被误判为同一个而跳过编译。
    let _warmScene = null;
    let _warmCam = null;
    let _matCounter = 0;
    const _seenMats = new Set();

    function ensureWarmScene() {
        if (_warmScene) return;
        _warmScene = new THREE.Scene();
        if (typeof scene !== 'undefined' && scene.fog) {
            _warmScene.fog = scene.fog.clone();
        }
        _warmScene.add(new THREE.HemisphereLight(0xdfe9f2, 0x51503f, 0.8));
        const sun = new THREE.DirectionalLight(0xfff2dd, 0.85);
        sun.position.set(35, 55, 20);
        sun.castShadow = true;
        _warmScene.add(sun);
        _warmCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        _warmCam.position.set(0, 0, 2.5);
        _warmCam.lookAt(0, 0, 0);
    }

    function assignUniqueMaterialNames(root) {
        root.traverse(o => {
            if (!o.isMesh || !o.material) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
                if (!m || _seenMats.has(m)) continue;
                _seenMats.add(m);
                m.name = '__warmup_' + (_matCounter++);
            }
        });
    }

    function compileWeaponShader(type) {
        if (typeof renderer === 'undefined' || !renderer || !renderer.compile) return;

        ensureWarmScene();

        const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
        const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;

        const added = [];
        [w, v].forEach(tpl => {
            if (!tpl) return;
            if (tpl.parent) tpl.parent.remove(tpl);
            _warmScene.add(tpl);
            added.push(tpl);
        });

        assignUniqueMaterialNames(_warmScene);

        try {
            renderer.compile(_warmScene, _warmCam);
        } catch (e) {
            console.warn('[loading] shader 编译失败:', type, e);
        }

        added.forEach(o => {
            if (o.parent === _warmScene) _warmScene.remove(o);
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
                if (cur !== mapId && mapId) {
                    window.loadMap(mapId);
                }
            },
        });

        // 2) 每把武器：构建模板 + 编译这一把的 shader（分 5 个任务）
        ['rifle', 'sniper', 'shotgun', 'odin', 'knife'].forEach(type => {
            tasks.push({
                name: '载入武器：' + (WEAPON_NAMES[type] || type),
                weight: 2,
                fn: () => {
                    if (typeof _getWorldTemplate === 'function') _getWorldTemplate(type);
                    if (typeof _getViewTemplate  === 'function') _getViewTemplate(type);
                    compileWeaponShader(type);
                },
            });
        });

        return tasks;
    }

    // ============================================================
    // 单机入口：靶场 / 人机
    // ============================================================
    async function beginSinglePlayerLoading(mode) {
        if (typeof audio === 'function') audio();

        // 隐藏大厅
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

        // 隐藏所有大厅
        const ol = document.getElementById('onlineLobbyOverlay');
        const ll = document.getElementById('lobbyOverlay');
        if (ol) ol.style.display = 'none';
        if (ll) ll.style.display = 'none';

        // 收集玩家列表（含观战）
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

    // 由 online_core.js 的 handleRoomMessage 调用
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

        // 让进度条动画画完再切场景
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
    //   —— 不直接进入游戏，而是走加载流程
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
    //   —— 用 cloneNode 移除 main.js 里原有的监听器
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
    // 暴露给 online_core.js / online_game.js 使用
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

    window.beginSinglePlayerLoading   = beginSinglePlayerLoading;
    window.beginOnlineLoading         = beginOnlineLoading;
    window.handleClientLoadingProgress = handleClientLoadingProgress;
    window.handleLoadingStatus        = handleLoadingStatus;
    window.handleLoadingComplete      = handleLoadingComplete;
    window.finishOnlineLoading        = finishOnlineLoading;

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