// ===== js/online_game.js – 对局生命周期：座位 / 开始 / 进入 / 投掷物 spawn =====
//
// 已拆分出去的模块：
//   · online_serialize.js  —— 字段表 / 对象池 / serializePlayer / 增量
//   · online_host.js       —— 房主广播 / handleClientInput
//   · online_client.js     —— handleHostState / 客户端输入上报
//   · online_spectator.js  —— 观战视角 / 提示 UI / 切换
//   · online_events.js     —— 射击 / 击杀 / 回合 / 伤害 事件
//
// 本文件保留"对局本身"的核心流程：入座 → 开始 → 进入游戏 → 投掷物 spawn。

// ============================================================
// 座位事件
// ============================================================
function handleJoinRequest(fromId, data) {
    if (!NET.isHost) return;
    if (NET._assignedPeers.has(fromId)) return;
    NET._assignedPeers.add(fromId);
    NET.members.set(fromId, { name: data.name || '玩家', seat: null });
    const seat = findFirstFreeSeat();
    if (seat) { setSeat(seat, fromId); NET.members.get(fromId).seat = seat; }
    const membersArr = Array.from(NET.members.entries()).map(([id, m]) => ({ id, name: m.name, seat: m.seat }));
    const conn = NET.connections.get(fromId);
    if (conn && conn.conn && conn.conn.open) {
        try {
            conn.conn.send({
                type: 'fullSync',
                roomId: NET.roomId,
                seats: NET.seats,
                members: membersArr,
                started: NET.started,
                yourSeat: seat,
                mapId: getLocalMapId()
            });
        } catch (e) {}
    }
    broadcast({ type: 'seatUpdate', seats: NET.seats, members: membersArr }, fromId);
    renderRoomUI(); updateOpponentInfo();

    _forceFullCounter = 9999;
}

function handleFullSync(data) {
    NET.roomId = data.roomId;
    NET.seats = data.seats || { blue: null, red: null, specs: [null, null, null] };
    NET.members = new Map();
    (data.members || []).forEach(m => NET.members.set(m.id, { name: m.name, seat: m.seat }));
    NET.members.set(NET.myPeerId, { name: NET.myName, seat: data.yourSeat });
    NET.mySeat = data.yourSeat;
    NET.started = !!data.started;

    syncMapToHost(data.mapId);

    renderRoomUI(); updateOpponentInfo();
    if (NET.started) {
        if (typeof window.beginOnlineLoading === 'function') {
            window.beginOnlineLoading(data.mapId || getLocalMapId(), false);
        } else {
            enterOnlineGame();
        }
    }
}

function applySeatUpdate(seats, membersArr) {
    NET.seats = seats || NET.seats;
    (membersArr || []).forEach(m => NET.members.set(m.id, { name: m.name, seat: m.seat }));
    const my = NET.members.get(NET.myPeerId);
    if (my) NET.mySeat = my.seat;
    renderRoomUI();
}

function handleSeatRequest(fromId, targetSeat) {
    if (!NET.isHost) return;
    const occupant = getSeatOccupant(targetSeat);
    if (occupant && occupant !== fromId) return;
    setSeat(targetSeat, fromId);
    const m = NET.members.get(fromId) || { name: '玩家' };
    m.seat = targetSeat;
    NET.members.set(fromId, m);
    const membersArr = Array.from(NET.members.entries()).map(([id, m]) => ({ id, name: m.name, seat: m.seat }));
    applySeatUpdate(NET.seats, membersArr);
    broadcast({ type: 'seatUpdate', seats: NET.seats, members: membersArr });
    updateOpponentInfo();
}

window.chooseOnlineSeat = function (seatKey) {
    if (!NET.roomId) return;
    if (NET.mySeat === seatKey) return;
    const occupant = getSeatOccupant(seatKey);
    if (occupant && occupant !== NET.myPeerId) { toast('该位置已有人'); return; }
    if (!NET.isHost) {
        if (!sendToHost({ type: 'seatRequest', targetSeat: seatKey })) toast('与房主断开连接');
    } else {
        handleSeatRequest(NET.myPeerId, seatKey);
    }
};

// ============================================================
// 客户端收到房主广播的投掷物 spawn
// ============================================================
function handleSmokeSpawn(data) {
    if (NET.isHost) return;
    if (typeof spawnSmokeProjectile !== 'function') return;
    const now = performance.now();
    spawnSmokeProjectile(
        new THREE.Vector3(data.px, data.py, data.pz),
        new THREE.Vector3(data.vx, data.vy, data.vz),
        data.fuseMs !== undefined ? data.fuseMs : SMOKE.fuseMs,
        now
    );
    if (typeof sSmokeThrow === 'function') sSmokeThrow();
}

function handleFlashSpawn(data) {
    if (NET.isHost) return;
    if (typeof spawnFlashProjectile !== 'function') return;
    const now = performance.now();
    spawnFlashProjectile(
        new THREE.Vector3(data.px, data.py, data.pz),
        new THREE.Vector3(data.vx, data.vy, data.vz),
        data.fuseMs !== undefined ? data.fuseMs : FLASH.fuseMs,
        now
    );
    if (typeof sFlashThrow === 'function') sFlashThrow();
}

// ============================================================
// 开始对战 / 进入游戏
// ============================================================
window.onlineStartGame = function () {
    if (!NET.isHost) return;
    if (!NET.seats.blue || !NET.seats.red) { toast('双方入场后才能开始'); return; }
    NET.started = true;
    broadcast({ type: 'gameStart', mapId: getLocalMapId() });
    enterOnlineGame();
};

function enterOnlineGame() {
    document.getElementById('onlineLobbyOverlay').style.display = 'none';
    document.getElementById('lobbyOverlay').style.display = 'none';

    if (NET.isHost) NET.role = 'host';
    else if (NET.mySeat === 'blue' || NET.mySeat === 'red') NET.role = 'player';
    else NET.role = 'spectator';

    NET.hostSeat = NET.isHost ? NET.mySeat : (NET.hostSeat || 'blue');

    const myIsBlue = (NET.mySeat === 'blue');
    if (typeof p1 !== 'undefined' && p1) p1.mat.color.setHex(myIsBlue ? 0x3a7bd5 : 0xd54a3a);
    if (typeof p2 !== 'undefined' && p2) p2.mat.color.setHex(myIsBlue ? 0xd54a3a : 0x3a7bd5);

    if (NET.role !== 'spectator') {
        const spawns = window.currentMapSpawns || {
            p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
            p2: { x: 21, z: 21, yaw: Math.PI / 4 }
        };

        const mySpawn  = myIsBlue ? spawns.p1 : spawns.p2;
        const oppSpawn = myIsBlue ? spawns.p2 : spawns.p1;

        if (typeof p1 !== 'undefined' && p1 && p1.spawn) {
            p1.spawn.x = mySpawn.x;
            p1.spawn.z = mySpawn.z;
            p1.spawn.yaw = mySpawn.yaw;
        }
        if (typeof p2 !== 'undefined' && p2 && p2.spawn) {
            p2.spawn.x = oppSpawn.x;
            p2.spawn.z = oppSpawn.z;
            p2.spawn.yaw = oppSpawn.yaw;
        }
    }

    if (typeof window.GAME_setMode === 'function') window.GAME_setMode('online');
    if (typeof resetMatch === 'function') {
        if (typeof p2 !== 'undefined' && p2) p2.gunHolder.visible = true;
        resetMatch();
    }
    document.body.classList.add('online-mode');

    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) exitBtn.style.display = 'none';

    if (NET.role === 'spectator') {
        const mc = document.getElementById('mobile-controls');
        if (mc) mc.style.display = 'none';
        showSpectatorHint();
    }

    updateOpponentInfo();
    if (typeof renderChatMessages === 'function') renderChatMessages();

    _clientPlayerState.blue = null;
    _clientPlayerState.red = null;
    _lastLowFreqBlue._init = false;
    _lastLowFreqRed._init = false;
    _forceFullCounter = 0;
    _lastRoundNumber = -1;
    _lastConnCount = -1;

    NET._lastSentInput = null;
    NET._lastDrift = 0;

    if (NET.isHost) startHostBroadcast();
}
window.NET_enterOnlineGame = enterOnlineGame;