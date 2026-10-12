// ===== js/main_entry.js – 大厅入口 / enterGame / 退出 / 地图选择 =====

// ============================================================
// 退出到大厅
// ============================================================
function exitToLobby() {
    audio();

    running = false;
    gameState = 'idle';
    if (typeof setOver === 'function') setOver(true);

    if (typeof gameMode !== 'undefined' && gameMode === 'survival'
        && typeof stopSurvivalMode === 'function') {
        stopSurvivalMode();
    }

    if (document.pointerLockElement) document.exitPointerLock();

    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'none';

    document.body.classList.remove('in-game');

    document.getElementById('lobbyOverlay').style.display = 'flex';

    console.log('[game] 已退出到大厅');
}
window.exitToLobby = exitToLobby;

// ============================================================
// 返回联机房间
// ============================================================
function returnToOnlineRoom(isRemote) {
    audio();

    running = false;
    gameState = 'idle';
    if (typeof setOver === 'function') setOver(true);

    if (document.pointerLockElement) document.exitPointerLock();

    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'none';

    document.body.classList.remove('in-game');
    document.body.classList.remove('online-mode');

    if (typeof NET !== 'undefined') {
        NET.started = false;
        NET.role = null;
        NET.pendingWeaponSwitch = null;
        NET.pendingReload = false;
        NET.pendingFuseStart = null;
        NET.pendingFuseRelease = false;
        NET.pendingMelee = false;
        NET.pendingMeleeHeavy = false;

        if (NET.isHost && !isRemote && typeof NET_broadcast === 'function') {
            NET_broadcast({ type: 'returnToRoom' });
        }
    }

    document.getElementById('onlineLobbyOverlay').style.display = 'flex';
    if (typeof renderOnlineRoomUI === 'function') renderOnlineRoomUI();

    console.log('[game] 已返回联机房间', isRemote ? '(远端触发)' : '');
}
window.returnToOnlineRoom = returnToOnlineRoom;

// ============================================================
// 退出按钮
// ============================================================
document.getElementById('exitBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    exitToLobby();
});

// ============================================================
// 开始游戏
// ============================================================
function enterGame(mode) {
    audio();

    if (typeof window.SETTINGS_Close === 'function') window.SETTINGS_Close();

    if (!window.getCurrentMapId() && window.loadMap) {
        window.loadMap('battlefield');
    }
    window.GAME_setMode(mode);

    if (mode === 'ai') aiEnabled = true;

    p2.gunHolder.visible = (mode === 'ai' || mode === 'online');
    document.getElementById('lobbyOverlay').style.display = 'none';

    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) exitBtn.style.display = (mode !== 'online') ? 'block' : 'none';

    resetMatch();
    enterFullscreenAndLock();
}
window.enterGame = enterGame;

// ============================================================
// ★ 生存模式入口
//   —— loading 已加载战场图，这里只负责切模式 + 开始
// ============================================================
function enterSurvival() {
    audio();
    if (typeof window.SETTINGS_Close === 'function') window.SETTINGS_Close();

    // ★ 不再判断 getCurrentMapId / loadMap —— loading 已经强制加载了 battlefield
    window.GAME_setMode('survival');

    document.getElementById('lobbyOverlay').style.display = 'none';

    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) exitBtn.style.display = 'block';

    resetMatch();   // startRound → startSurvivalMode
    enterFullscreenAndLock();
}
window.enterSurvival = enterSurvival;

// ============================================================
// Lobby 按钮
//   · lobbyAiBtn / lobbySurvivalBtn：由 loading.js 的 installLobbyHooks() 劫持
//   · lobbyOnlineBtn：走自己的逻辑
// ============================================================
document.getElementById('lobbyOnlineBtn').addEventListener('click', () => {
    audio();
    document.getElementById('lobbyOverlay').style.display = 'none';
    document.getElementById('onlineLobbyOverlay').style.display = 'flex';
    if (typeof NET !== 'undefined' && NET.roomId) {
        if (typeof renderOnlineRoomUI === 'function') renderOnlineRoomUI();
    } else {
        const entry = document.getElementById('onlineEntrySection');
        const room = document.getElementById('onlineRoomSection');
        const codeWrap = document.getElementById('onlineRoomCode');
        const badge = document.getElementById('onlineMyRole');
        if (entry) entry.style.display = 'block';
        if (room) room.style.display = 'none';
        if (codeWrap) codeWrap.style.display = 'none';
        if (badge) badge.style.display = 'none';
    }
});

document.getElementById('againBtn').addEventListener('click', () => {
    audio();
    if (gameMode === 'online') {
        returnToOnlineRoom(false);
    } else {
        resetMatch();
        enterFullscreenAndLock();
    }
});

// ============================================================
// 游戏模式切换
// ============================================================
window.GAME_setMode = function (mode) {
    const wasOnline = (gameMode === 'online');
    gameMode = mode;
    const isOnline = (mode === 'online');
    if (wasOnline !== isOnline && typeof renderer !== 'undefined' && renderer) {
        renderer.setPixelRatio(getDesiredPixelRatio());
        console.log('[perf] pixelRatio →', renderer.getPixelRatio(), '(mode:', mode + ')');
    }
};

// ============================================================
// 地图选择器
// ============================================================
function buildMapSelect() {
    const row = document.getElementById('mapSelectRow');
    if (!row) return;

    const maps = (window.getAvailableMaps && window.getAvailableMaps()) || [];
    row.innerHTML = '';

    const container = row.closest('.lobby-map-select');
    if (maps.length <= 1) {
        if (container) container.style.display = 'none';
        const only = maps[0];
        if (only && window.loadMap) {
            const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
            if (cur !== only.id) window.loadMap(only.id);
        }
        return;
    }
    if (container) container.style.display = '';

    maps.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        btn.dataset.mapId = m.id;
        btn.textContent = m.name;
        btn.addEventListener('click', () => {
            if (typeof running !== 'undefined' && running) return;
            audio();
            if (window.loadMap && window.loadMap(m.id)) {
                row.querySelectorAll('.map-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.mapId === m.id);
                });
            }
        });
        row.appendChild(btn);
    });

    const cur = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
    row.querySelectorAll('.map-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mapId === cur);
    });
}

// ============================================================
// 初始化
// ============================================================
(function init() {
    if (window.loadMap) window.loadMap('battlefield');
    buildMapSelect();
})();