// ===== js/loading.js – 加载页面（含真实 Viewmodel 预热） =====

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('[loading] THREE 未加载，跳过');
        return;
    }

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

    function getProgress() { return state.progress; }

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
    // 预热相机
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
    // 真实场景整体 shader 编译
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
    // ★ 真实 Viewmodel 预热
    //   直接模拟一次真实换枪：
    //     · clone 模板 → 挂到 p1.vm → 主相机渲染一帧 → 卸下
    //   覆盖：新 mesh 实例 + 相机局部空间 + 主场景光照
    // ============================================================
    function warmupViewmodelsReal() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof p1 === 'undefined' || !p1 || !p1.vm) return;
        if (typeof window.makeViewmodel !== 'function') {
            console.warn('[loading] makeViewmodel 未暴露，跳过 viewmodel 预热');
            return;
        }

        withWarmupCamera(() => {
            const allTypes = ['rifle', 'sniper', 'shotgun', 'odin', 'knife'];

            for (const type of allTypes) {
                let vmClone = null;
                try {
                    vmClone = window.makeViewmodel(type, p1.mat);
                } catch (e) {
                    console.warn('[loading] makeViewmodel 失败:', type, e);
                    continue;
                }
                if (!vmClone) continue;

                // 挂到玩家自己的 viewmodel（相机局部空间）
                p1.vm.add(vmClone);

                // 渲染一帧（用主相机、主场景、主光照）
                try { renderer.render(scene, p1.cam); } catch (e) {}

                // 卸下并清理（共享材质/几何不 dispose）
                p1.vm.remove(vmClone);
                vmClone.traverse(o => {
                    // 只清理不是共享的：这里不 dispose，因为 clone 共享几何/材质
                });
            }

            // 也预热一下第三人称模型（p2.gunHolder）
            if (typeof window.makeWeaponModel === 'function' &&
                typeof p2 !== 'undefined' && p2 && p2.gunHolder) {

                for (const type of allTypes) {
                    let worldClone = null;
                    try {
                        worldClone = window.makeWeaponModel(type, p2.mat);
                    } catch (e) {
                        continue;
                    }
                    if (!worldClone) continue;

                    p2.gunHolder.add(worldClone);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                    p2.gunHolder.remove(worldClone);
                }
            }
        });
    }

    // ============================================================
    // 运行时特效预热
    // ============================================================
    const WARMUP_OBJ_POS = new THREE.Vector3(0, 54.5, 0);

    function warmupSparks(color) {
        if (typeof window.spawnSparks !== 'function') return;
        withWarmupCamera(() => {
            window.spawnSparks(WARMUP_OBJ_POS.clone(), color);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupBulletHole() {
        if (typeof window.spawnBulletHole !== 'function') return;
        withWarmupCamera(() => {
            const pos = WARMUP_OBJ_POS.clone();
            const normal = new THREE.Vector3(0, 1, 0);
            window.spawnBulletHole(pos, normal);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupTracer() {
        if (typeof window.spawnTracer !== 'function') return;
        withWarmupCamera(() => {
            const from = WARMUP_OBJ_POS.clone();
            const to = from.clone().add(new THREE.Vector3(3, 0, 0));
            window.spawnTracer(from, to);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupShells() {
        if (typeof window.spawnShellCasing !== 'function') return;
        if (typeof updateShellCasings !== 'function') return;

        withWarmupCamera(() => {
            const fakeNow = performance.now();
            if (typeof p1 !== 'undefined' && p1) {
                window.spawnShellCasing(p1, fakeNow);
            }
            updateShellCasings(0.016, fakeNow + 16);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            updateShellCasings(1.0, fakeNow + 5000);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupExplosion() {
        if (typeof window.spawnExplosionVisual !== 'function') return;
        if (typeof window.updateExplosionVisuals !== 'function') return;

        withWarmupCamera(() => {
            const fakeNow = performance.now();
            window.spawnExplosionVisual(WARMUP_OBJ_POS.x, WARMUP_OBJ_POS.y, WARMUP_OBJ_POS.z);
            window.updateExplosionVisuals(0.016, fakeNow + 250);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            window.updateExplosionVisuals(1.0, fakeNow + 1000);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupSmokeCloud() {
        const buildFn = (typeof window.createSmokeCloud === 'function')
            ? window.createSmokeCloud
            : (typeof createSmokeCloud === 'function' ? createSmokeCloud : null);
        if (!buildFn) return;

        withWarmupCamera(() => {
            let cloud = null;
            try {
                cloud = buildFn(
                    new THREE.Vector3(WARMUP_OBJ_POS.x, 0, WARMUP_OBJ_POS.z),
                    4.0, 4.5, 3.5
                );
            } catch (e) { return; }
            if (!cloud) return;

            if (cloud.userData && cloud.userData.layers) {
                for (const m of cloud.userData.layers) {
                    m.material.opacity = m.userData.baseOpacity || 0.5;
                }
            }
            cloud.position.set(WARMUP_OBJ_POS.x, WARMUP_OBJ_POS.y, WARMUP_OBJ_POS.z);

            scene.add(cloud);
            try { renderer.render(scene, p1.cam); } catch (e) {}

            scene.remove(cloud);
            cloud.traverse(o => {
                if (o.isMesh) {
                    o.geometry.dispose();
                    o.material.dispose();
                }
            });
        });
    }

    function warmupFlashBurst() {
        if (typeof window.spawnFlashBurst !== 'function') return;
        if (typeof window.updateFlashBursts !== 'function') return;

        withWarmupCamera(() => {
            const fakeNow = performance.now();
            window.spawnFlashBurst(WARMUP_OBJ_POS.clone());
            window.updateFlashBursts(0.016, fakeNow + 200);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            window.updateFlashBursts(1.0, fakeNow + 1000);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupFlashIndicator() {
        if (typeof p1 === 'undefined' || !p1 || !p1.flashIndicator) return;

        withWarmupCamera(() => {
            const fi = p1.flashIndicator;
            const ud = fi.userData || {};

            const origVisible  = fi.visible;
            const origSphereOp = ud.sphere ? ud.sphere.material.opacity : 0;
            const origHaloOp   = ud.halo   ? ud.halo.material.opacity   : 0;
            const origLightI   = ud.light  ? ud.light.intensity         : 0;

            fi.visible = true;
            if (ud.sphere) ud.sphere.material.opacity = 0.85;
            if (ud.halo)   ud.halo.material.opacity   = 0.45;
            if (ud.light)  ud.light.intensity         = 5;

            try { renderer.render(scene, p1.cam); } catch (e) {}

            fi.visible = origVisible;
            if (ud.sphere) ud.sphere.material.opacity = origSphereOp;
            if (ud.halo)   ud.halo.material.opacity   = origHaloOp;
            if (ud.light)  ud.light.intensity         = origLightI;
        });
    }

    function warmupScopePip() {
        if (typeof window.warmupScopePip !== 'function') return;
        try {
            window.warmupScopePip();
        } catch (e) {}
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

        tasks.push({
            name: '构建地图',
            weight: 4,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        // 只构建模板
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

        tasks.push({
            name: '编译场景着色器',
            weight: 10,
            fn: () => compileSceneShaders(),
        });

        // ★ 改为真实 viewmodel 预热
        tasks.push({
            name: '预热武器视图模型',
            weight: 8,
            fn: () => warmupViewmodelsReal(),
        });

        // 特效预热
        tasks.push({ name: '预热特效：火花', weight: 1, fn: () => warmupSparks(0xff5040) });
        tasks.push({ name: '预热特效：火花', weight: 1, fn: () => warmupSparks(0xffd28a) });
        tasks.push({ name: '预热特效：弹痕', weight: 1, fn: () => warmupBulletHole() });
        tasks.push({ name: '预热特效：曳光弹', weight: 1, fn: () => warmupTracer() });
        tasks.push({ name: '预热特效：弹壳', weight: 1, fn: () => warmupShells() });
        tasks.push({ name: '预热特效：爆炸', weight: 1, fn: () => warmupExplosion() });
        tasks.push({ name: '预热特效：烟雾云', weight: 2, fn: () => warmupSmokeCloud() });
        tasks.push({ name: '预热特效：闪光爆发', weight: 1, fn: () => warmupFlashBurst() });
        tasks.push({ name: '预热特效：闪光指示器', weight: 1, fn: () => warmupFlashIndicator() });
        tasks.push({ name: '预热特效：瞄准镜PiP', weight: 1, fn: () => warmupScopePip() });

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