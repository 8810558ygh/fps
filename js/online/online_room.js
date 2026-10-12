// ===== js/online_room.js – 座位 / 房间创建 / 加入 / 离开 / 心跳 / 地图同步 =====
// 从 online_core.js 拆出，不改变任何对外接口

// ============================================================
// 座位管理
// ============================================================
function getSeatOccupant(seatKey) {
    if (seatKey === 'blue') return NET.seats.blue;
    if (seatKey === 'red') return NET.seats.red;
    if (seatKey.startsWith('spec')) return NET.seats.specs[parseInt(seatKey.slice(4))] || null;
    return null;
}

function setSeat(seatKey, peerId) {
    clearPeerSeat(peerId);
    if (seatKey === 'blue') NET.seats.blue = peerId;
    else if (seatKey === 'red') NET.seats.red = peerId;
    else if (seatKey.startsWith('spec')) {
        const idx = parseInt(seatKey.slice(4));
        NET.seats.specs[idx] = peerId;
    }
}

function clearPeerSeat(peerId) {
    if (NET.seats.blue === peerId) NET.seats.blue = null;
    if (NET.seats.red === peerId) NET.seats.red = null;
    NET.seats.specs = NET.seats.specs.map(p => p === peerId ? null : p);
}

function findFirstFreeSeat() {
    if (!NET.seats.blue) return 'blue';
    if (!NET.seats.red) return 'red';
    for (let i = 0; i < 3; i++) if (!NET.seats.specs[i]) return 'spec' + i;
    return null;
}

// ============================================================
// 地图同步
// ============================================================
function getLocalMapId() {
    return (typeof window.getCurrentMapId === 'function') ? window.getCurrentMapId() : null;
}

function syncMapToHost(mapId) {
    if (!mapId) return;
    if (typeof window.loadMap !== 'function') return;
    const cur = getLocalMapId();
    if (cur === mapId) return;
    try {
        window.loadMap(mapId);
        console.log('[online] map synced to host:', mapId);
    } catch (e) {
        console.warn('[online] loadMap failed:', mapId, e);
    }
}

// ============================================================
// 创建房间
// ============================================================
function createRoom() {
    if (NET.peer) NET.peer.destroy();
    NET.isHost = true;
    NET.myName = getMyName();
    NET.roomId = genRoomCode();
    NET.myPeerId = NET.roomId;
    NET.members.clear();
    NET.seats = { blue: null, red: null, specs: [null, null, null] };
    NET.mySeat = 'blue';
    NET.members.set(NET.myPeerId, { name: NET.myName, seat: 'blue' });
    NET.seats.blue = NET.myPeerId;
    NET._assignedPeers.clear();
    NET._assignedPeers.add(NET.myPeerId);
    NET.connections.clear();

    NET.peer = new Peer(NET.roomId, {
        host: '0.peerjs.com', port: 443, secure: true,
        config: { iceServers: ICE_SERVERS }
    });

    NET.peer.on('open', () => {
        renderRoomUI();
        startHeartbeat();
        startPingLoop();
        toast('房间已创建：' + NET.roomId);
    });
    NET.peer.on('connection', (conn) => {
        NET.connections.set(conn.peer, { conn, lastSeen: Date.now() });
        conn.on('data', (d) => handleRoomMessage(conn.peer, d));
        conn.on('close', () => {
            NET.connections.delete(conn.peer);
            NET.members.delete(conn.peer);
            clearPeerSeat(conn.peer);
            NET._assignedPeers.delete(conn.peer);
            const membersArr = Array.from(NET.members.entries()).map(([id, m]) => ({ id, name: m.name, seat: m.seat }));
            broadcast({ type: 'seatUpdate', seats: NET.seats, members: membersArr });
            renderRoomUI(); updateOpponentInfo();
        });
        conn.on('error', (e) => console.warn('连接错误:', e));
    });
    NET.peer.on('error', (e) => { console.error('Peer 错误:', e); toast('网络错误，请重试'); });
    renderRoomUI();
    return NET.roomId;
}
window.NET_createRoom = createRoom;

// ============================================================
// 加入房间
// ============================================================
function joinRoom(roomCode) {
    if (NET.peer) NET.peer.destroy();
    NET.isHost = false;
    NET.myName = getMyName();
    NET.roomId = roomCode.toUpperCase();
    NET.myPeerId = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    NET.members.clear();
    NET.seats = { blue: null, red: null, specs: [null, null, null] };
    NET.mySeat = null;
    NET.connections.clear();

    NET.peer = new Peer(NET.myPeerId, {
        host: '0.peerjs.com', port: 443, secure: true,
        config: { iceServers: ICE_SERVERS }
    });
    NET.peer.on('open', () => {
        const conn = NET.peer.connect(NET.roomId, {
            metadata: { name: NET.myName }, reliable: true, serialization: 'json'
        });
        conn.on('open', () => {
            NET.connections.set(NET.roomId, { conn, lastSeen: Date.now() });
            conn.send({ type: 'joinRequest', myId: NET.myPeerId, name: NET.myName });
            startHeartbeat();
            startPingLoop();
        });
        conn.on('data', (d) => handleRoomMessage(NET.roomId, d));
        conn.on('close', () => { NET.connections.delete(NET.roomId); toast('与房主断开连接'); });
        conn.on('error', (e) => console.warn('连接错误:', e));
    });
    NET.peer.on('error', (e) => { console.error('加入房间失败:', e); toast('房间不存在或网络错误'); });
    renderRoomUI();
}
window.NET_joinRoom = joinRoom;

// ============================================================
// 心跳 / Ping
// ============================================================
function startHeartbeat() {
    if (NET._heartbeatTimer) clearInterval(NET._heartbeatTimer);
    NET._heartbeatTimer = setInterval(() => {
        broadcast({ type: 'ping', t: performance.now(), from: NET.myPeerId });
    }, 8000);
}

function startPingLoop() {
    if (NET._pingTimer) clearInterval(NET._pingTimer);
    NET._pingTimer = setInterval(() => {
        if (!NET.roomId) return;
        const msg = { type: 'ping', t: performance.now() };
        if (NET.isHost) broadcast(msg);
        else sendToHost(msg);
    }, 2000);
}

// ============================================================
// 复制房间码
// ============================================================
window.copyOnlineRoomCode = function () {
    if (!NET.roomId) return;
    navigator.clipboard.writeText(NET.roomId).then(() => toast('房间码已复制：' + NET.roomId))
        .catch(() => toast('复制失败，请手动复制：' + NET.roomId));
};

// ============================================================
// 离开房间
// ============================================================
window.leaveOnlineRoom = function () {
    if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} NET.peer = null; }
    NET.connections.forEach(c => { try { c.conn.close(); } catch(e) {} });
    NET.connections.clear();
    NET.members.clear();
    NET.seats = { blue: null, red: null, specs: [null, null, null] };
    NET.mySeat = null; NET.isHost = false; NET.roomId = null;
    NET.myPeerId = null; NET.started = false; NET.role = null;
    NET.lastHostState = null; NET.ping = 0;
    NET.hostSeat = null;
    NET.inputSeq = 0;
    NET.pendingWeaponSwitch = null;
    NET.pendingReload = false;
    NET.pendingFuseStart = null;
    NET.pendingFuseRelease = false;
    NET.pendingMelee = false;
    NET.pendingMeleeHeavy = false;

    // ★ 清理滑索 / 易伤事件
    NET.pendingZiplineMount = null;
    NET.pendingZiplineDismount = false;
    NET.pendingVulnerableStart = null;

    NET.tick = 0;
    NET._assignedPeers.clear();
    NET._lastSentInput = null;
    NET._lastDrift = 0;
    NET._lastHardSyncLogTime = 0;
    NET.connType = null;
    NET._hostBroadcastRaf = null;

    if (NET._heartbeatTimer) { clearInterval(NET._heartbeatTimer); NET._heartbeatTimer = null; }
    if (NET._pingTimer) { clearInterval(NET._pingTimer); NET._pingTimer = null; }
    stopHostBroadcast();

    document.body.classList.remove('online-mode');
    const hint = document.getElementById('spectatorHint');
    if (hint) hint.remove();
    const tag = document.getElementById('spectatorTargetTag');
    if (tag) tag.remove();

    document.getElementById('onlineLobbyOverlay').style.display = 'none';
    document.getElementById('lobbyOverlay').style.display = 'flex';
};

// ============================================================
// 暴露给 online_ui.js 使用的旧别名
// ============================================================
window._NET_createRoom = createRoom;
window._NET_joinRoom = joinRoom;