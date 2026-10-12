// ===== js/loading_online.js – 联机加载同步 + onlineStartGame hook =====
// 从 loading.js 拆出，不改变任何对外接口
// 依赖：window.LoadingManager（UI 层，loading.js 提供）、window.buildGameLoadTasks

(function () {
    'use strict';

    function LM() { return window.LoadingManager; }

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

        const lm = LM();
        if (!lm) { console.warn('[loading_online] LoadingManager 未就绪'); return; }

        lm.show('正在载入战场');
        lm.setupPlayers(players);

        startOnlineLoadingReport(isHost);

        const tasks = (typeof window.buildGameLoadTasks === 'function')
            ? window.buildGameLoadTasks(mapId || (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield')
            : [];
        await lm.runTasks(tasks);

        stopOnlineLoadingReport();

        if (isHost) {
            NET.loadingState[NET.myPeerId] = 1;
            broadcastLoadingStatus();
            checkAllLoaded();
        } else {
            if (typeof window.NET_sendToHost === 'function') {
                window.NET_sendToHost({ type: 'loadingProgress', progress: 1 });
            }
            lm.setStatus('等待其他玩家...');
        }
    }

    function startOnlineLoadingReport(isHost) {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingReportTimer) clearInterval(NET.loadingReportTimer);

        NET.loadingReportTimer = setInterval(() => {
            const lm = LM();
            const p = lm ? lm.getProgress() : 0;
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
        const lm = LM();
        if (lm) lm.setPlayerProgress(fromId, progress);
        broadcastLoadingStatus();
        checkAllLoaded();
    }

    function handleLoadingStatus(stateMap) {
        const NET = window.NET;
        if (!NET || NET.isHost) return;
        if (!stateMap) return;
        const lm = LM();
        if (!lm) return;
        for (const id in stateMap) {
            lm.setPlayerProgress(id, stateMap[id]);
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
        const lm = LM();
        if (lm) {
            lm.setStatus('全员就绪');
            lm.setProgress(1);
        }

        setTimeout(() => {
            if (lm) lm.hide();
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
    // 覆写 onlineStartGame（房主点击"开始对战"时走 loading 流程）
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
    // 对外暴露
    // ============================================================
    window.beginOnlineLoading          = beginOnlineLoading;
    window.handleClientLoadingProgress = handleClientLoadingProgress;
    window.handleLoadingStatus         = handleLoadingStatus;
    window.handleLoadingComplete       = handleLoadingComplete;
    window.finishOnlineLoading         = finishOnlineLoading;

    function init() {
        installOnlineStartHook();
        console.log('[loading_online] 联机加载同步模块已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();