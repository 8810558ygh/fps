// ===== js/loading.js – 深度预加载（UI 层 + 单机入口 + 切地图加载） =====

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

    // ---------- UI 基础 ----------
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
    // 单机入口
    //   · mode 'ai'       → 用大厅选的地图
    //   · mode 'survival' → 强制 battlefield（不受大厅地图选择影响）
    // ============================================================
    async function beginSinglePlayerLoading(mode) {
        if (typeof audio === 'function') audio();

        const ll = document.getElementById('lobbyOverlay');
        if (ll) ll.style.display = 'none';

        const isSurvival = (mode === 'survival');
        show(isSurvival ? '正在载入生存模式' : '正在载入人机对战');

        // ★ 生存模式强制从战场图开始
        let mapId;
        if (isSurvival) {
            mapId = 'battlefield';
        } else {
            mapId = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
        }

        const tasks = (typeof window.buildGameLoadTasks === 'function')
            ? window.buildGameLoadTasks(mapId, mode)
            : [];
        await runTasks(tasks);

        await nextFrame();
        await nextFrame();

        hide();

        if (isSurvival) {
            if (typeof window.enterSurvival === 'function') {
                window.enterSurvival();
            } else {
                console.warn('[loading] enterSurvival 未定义');
            }
        } else {
            if (typeof window.enterGame === 'function') {
                window.enterGame(mode);
            }
        }
    }

    // ============================================================
    // ★ 切地图加载（生存模式传送门 → 按 F → 切下一张图）
    //
    //   · 弹出 loading 页
    //   · 只跑轻量任务：清理 + 加载新地图 + 上传纹理 + 编译 shader
    //   · 完成后调用 onComplete()
    // ============================================================
    async function beginMapSwitchLoading(mapId, onComplete) {
        if (typeof audio === 'function') audio();

        show('正在进入下一区域');

        const tasks = (typeof window.buildMapSwitchTasks === 'function')
            ? window.buildMapSwitchTasks(mapId)
            : [];
        await runTasks(tasks);

        await nextFrame();
        await nextFrame();

        hide();

        if (typeof onComplete === 'function') {
            try { onComplete(); } catch (e) {
                console.warn('[loading] onComplete 出错:', e);
            }
        }
    }

    // ---------- Lobby 按钮劫持 ----------
    function hijackClick(id, handler) {
        const old = document.getElementById(id);
        if (!old) return;
        const clone = old.cloneNode(true);
        old.parentNode.replaceChild(clone, old);
        clone.addEventListener('click', handler);
    }

    function installLobbyHooks() {
        hijackClick('lobbyAiBtn', () => beginSinglePlayerLoading('ai'));
        hijackClick('lobbySurvivalBtn', () => beginSinglePlayerLoading('survival'));
    }

    // ---------- 对外暴露 ----------
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

    window.beginSinglePlayerLoading = beginSinglePlayerLoading;
    window.beginMapSwitchLoading = beginMapSwitchLoading;   // ★ 新增

    function init() {
        installLobbyHooks();
        console.log('[loading] UI 层 + 单机入口 + 切地图入口已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();