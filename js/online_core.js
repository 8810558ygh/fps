// ===== js/online_core.js – P2P 联机核心（NET + 座位 + 房间 + 路由 + UI） =====

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const NET = {
    peer: null, isHost: false, myPeerId: null, roomId: null,
    mySeat: null, myName: null, members: new Map(),
    seats: { blue: null, red: null, specs: [null, null, null] },
    connections: new Map(), started: false,
    role: null,
    spectatorTarget: 'blue',
    lastHostState: null,
    hostSeat: null,

    inputSeq: 0,
    pendingWeaponSwitch: null,
    pendingReload: false,
    pendingFuseStart: null,
    pendingFuseRelease: false,
    pendingMelee: false,
    pendingMeleeHeavy: false,
    tick: 0,

    remotePlayerState: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
        hp: 100, armor: 50, score: 0,
        weapon: 'rifle', ammo: 0, reserve: 0,
        fov: 78, aimStage: 0,
        aiming: false, crouching: false,
        dead: false, visible: true,
        isMelee: false, isSmoke: false, isFlash: false,
        lastUpdate: 0
    },
    ping: 0,

    // 内部计时器与集合
    _heartbeatTimer: null,
    _pingTimer: null,
    _hostBroadcastTimer: null,
    _assignedPeers: new Set()
};
window.NET = NET;

function getMyName() {
    let n = localStorage.getItem('pvp_nick');
    if (!n) {
        const animals = ['猛虎', '狂狮', '猎鹰', '苍狼', '赤蛇', '暴熊', '冰狐', '雷豹', '疾风', '夜枭'];
        const a = animals[Math.floor(Math.random() * animals.length)];
        n = a + '_' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('pvp_nick', n);
    }
    return n;
}

NET.getOpponentName = function () {
    let oppId = null;
    if (NET.mySeat === 'blue') oppId = NET.seats.red;
    else if (NET.mySeat === 'red') oppId = NET.seats.blue;
    else oppId = (NET.seats.blue && NET.seats.blue !== NET.myPeerId) ? NET.seats.blue : NET.seats.red;
    if (!oppId) return '对手';
    const m = NET.members.get(oppId);
    return m ? m.name : '对手';
};
NET.getMyName = function () { return NET.myName || '我'; };

function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function toast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    let t = document.getElementById('onlineToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'onlineToast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px;pointer-events:none;transition:opacity .3s';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

function updateOpponentInfo() {
    const nameEl = document.getElementById('opponentName');
    const pingEl = document.getElementById('opponentPing');
    if (nameEl) nameEl.textContent = NET.getOpponentName();
    if (pingEl) {
        if (NET.ping <= 0) { pingEl.textContent = '-'; pingEl.classList.remove('warn', 'bad'); }
        else {
            pingEl.textContent = NET.ping + 'ms';
            pingEl.classList.remove('warn', 'bad');
            if (NET.ping > 150) pingEl.classList.add('bad');
            else if (NET.ping > 80) pingEl.classList.add('warn');
        }
    }
}
window.NET_updateOpponentInfo = updateOpponentInfo;

function setSeatYouTag(elId, show) {
    const el = document.getElementById(elId);
    if (el) el.style.display = show ? 'block' : 'none';
}

function updateMyRoleBadge() {
    const badge = document.getElementById('onlineMyRole');
    const val = document.getElementById('onlineMyRoleValue');
    if (!badge || !val) return;
    if (!NET.roomId) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-flex';
    const seat = NET.mySeat;
    let text = '观战';
    if (seat === 'blue') text = '🔵 蓝方';
    else if (seat === 'red') text = '🔴 红方';
    else if (seat && seat.startsWith('spec')) text = `👁 观众 #${parseInt(seat.slice(4)) + 1}`;
    else text = '未入座（观战）';
    val.textContent = text;
}

function renderRoomUI() {
    const codeText = document.getElementById('onlineRoomCodeText');
    const codeWrap = document.getElementById('onlineRoomCode');
    if (codeText) codeText.textContent = NET.roomId || '----';
    if (codeWrap) codeWrap.style.display = NET.roomId ? 'inline-block' : 'none';

    const entrySec = document.getElementById('onlineEntrySection');
    const roomSec = document.getElementById('onlineRoomSection');
    if (NET.roomId) {
        if (entrySec) entrySec.style.display = 'none';
        if (roomSec) roomSec.style.display = 'block';
    } else {
        if (entrySec) entrySec.style.display = 'block';
        if (roomSec) roomSec.style.display = 'none';
    }

    updateMyRoleBadge();

    const blue = NET.seats.blue;
    const blueCard = document.getElementById('onlineSeatBlue');
    const blueAvatar = document.getElementById('onlineAvatarBlue');
    const blueName = document.getElementById('onlineNameBlue');
    if (blue) {
        const m = NET.members.get(blue) || { name: '玩家' };
        blueCard.classList.add('occupied');
        blueAvatar.textContent = m.name.charAt(0).toUpperCase();
        blueName.textContent = m.name;
        setSeatYouTag('onlineYouBlue', blue === NET.myPeerId);
        if (blue === NET.myPeerId) blueCard.classList.add('is-me');
        else blueCard.classList.remove('is-me');
    } else {
        blueCard.classList.remove('occupied', 'is-me');
        blueAvatar.textContent = '+';
        blueName.textContent = '空位';
        setSeatYouTag('onlineYouBlue', false);
    }

    const red = NET.seats.red;
    const redCard = document.getElementById('onlineSeatRed');
    const redAvatar = document.getElementById('onlineAvatarRed');
    const redName = document.getElementById('onlineNameRed');
    if (red) {
        const m = NET.members.get(red) || { name: '玩家' };
        redCard.classList.add('occupied');
        redAvatar.textContent = m.name.charAt(0).toUpperCase();
        redName.textContent = m.name;
        setSeatYouTag('onlineYouRed', red === NET.myPeerId);
        if (red === NET.myPeerId) redCard.classList.add('is-me');
        else redCard.classList.remove('is-me');
    } else {
        redCard.classList.remove('occupied', 'is-me');
        redAvatar.textContent = '+';
        redName.textContent = '空位';
        setSeatYouTag('onlineYouRed', false);
    }

    for (let i = 0; i < 3; i++) {
        const seatEl = document.getElementById('specSeat' + i);
        const nameEl = document.getElementById('specName' + i);
        const pid = NET.seats.specs[i];
        if (pid) {
            const m = NET.members.get(pid) || { name: '观众' };
            seatEl.classList.add('occupied');
            nameEl.textContent = m.name;
            setSeatYouTag('onlineYouSpec' + i, pid === NET.myPeerId);
            if (pid === NET.myPeerId) seatEl.classList.add('is-me');
            else seatEl.classList.remove('is-me');
        } else {
            seatEl.classList.remove('occupied', 'is-me');
            nameEl.textContent = '空位';
            setSeatYouTag('onlineYouSpec' + i, false);
        }
    }

    const startBtn = document.getElementById('onlineStartBtn');
    if (startBtn) {
        const canStart = NET.isHost && NET.seats.blue && NET.seats.red;
        if (canStart) { startBtn.disabled = false; startBtn.textContent = '开 始 对 战'; }
        else if (!NET.isHost) { startBtn.disabled = true; startBtn.textContent = '等待房主开始'; }
        else { startBtn.disabled = true; startBtn.textContent = '等待双方入场'; }
    }

    const hint = document.getElementById('onlineHint');
    if (hint) {
        if (!NET.isHost) hint.textContent = '你已加入房间，等待房主开始';
        else if (!NET.seats.blue || !NET.seats.red) hint.textContent = '把房间码分享给好友，双方入座后可开始';
        else hint.textContent = '双方就位，点击"开始对战"';
    }
}
window.renderOnlineRoomUI = renderRoomUI;

function broadcast(msg, exceptId) {
    NET.connections.forEach((val, id) => {
        if (id !== exceptId && val.conn && val.conn.open) {
            try { val.conn.send(msg); } catch (e) {}
        }
    });
}
window.NET_broadcast = broadcast;

function sendToHost(msg) {
    const hostConn = NET.connections.get(NET.roomId);
    if (hostConn && hostConn.conn && hostConn.conn.open) {
        try { hostConn.conn.send(msg); } catch (e) {}
        return true;
    }
    return false;
}
window.NET_sendToHost = sendToHost;

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

function handleRoomMessage(fromId, data) {
    switch (data.type) {
        case 'joinRequest': handleJoinRequest(fromId, data); break;
        case 'fullSync': handleFullSync(data); break;
        case 'memberUpdate':
            if (data.peerId === NET.myPeerId) break;
            if (data.seat === null) NET.members.delete(data.peerId);
            else NET.members.set(data.peerId, { name: data.name, seat: data.seat });
            renderRoomUI(); updateOpponentInfo(); break;
        case 'seatRequest':
            if (NET.isHost) handleSeatRequest(fromId, data.targetSeat); break;
        case 'seatUpdate':
            applySeatUpdate(data.seats, data.members); updateOpponentInfo(); break;
        case 'gameStart':
            if (!NET.started) {
                NET.started = true;
                syncMapToHost(data.mapId);
                enterOnlineGame();
            }
            break;
        case 'clientInput':
            if (NET.isHost) handleClientInput(fromId, data); break;
        case 'hostState':
            if (!NET.isHost) handleHostState(data); break;
        case 'killEvent':
            if (!NET.isHost) handleKillEvent(data); break;
        case 'roundEvent':
            if (!NET.isHost) handleRoundEvent(data); break;
        case 'damageEvent':
            if (!NET.isHost) handleDamageEvent(data); break;
        case 'shootEvent':
            if (!NET.isHost) handleShootEvent(data); break;
        case 'bulletHole':
            if (!NET.isHost && typeof spawnBulletHole === 'function') {
                spawnBulletHole(
                    new THREE.Vector3(data.x, data.y, data.z),
                    new THREE.Vector3(data.nx, data.ny, data.nz)
                );
            }
            break;
        case 'spark':
            if (!NET.isHost && typeof spawnSparks === 'function') {
                spawnSparks(
                    new THREE.Vector3(data.x, data.y, data.z),
                    data.color || 0xffd28a
                );
            }
            break;
        case 'smokeSpawn':
            if (!NET.isHost) handleSmokeSpawn(data); break;
        case 'flashSpawn':
            if (!NET.isHost) handleFlashSpawn(data); break;
        case 'flashEvent':
            if (!NET.isHost && typeof p1 !== 'undefined' && p1) {
                p1.flashUntil = performance.now() + (data.durationMs || FLASH.flashDurationMs);
            }
            break;
        case 'chat':
            if (window.addChatMessage) addChatMessage(fromId === NET.myPeerId ? 1 : 2, data.text); break;
        case 'ping':
            NET.connections.forEach((val, id) => { if (id === fromId) val.lastSeen = Date.now(); });
            if (fromId !== NET.myPeerId) {
                const c = NET.connections.get(fromId);
                if (c && c.conn && c.conn.open) {
                    try { c.conn.send({ type: 'pong', t: data.t }); } catch (e) {}
                }
            }
            break;
        case 'pong':
            if (data.t) { NET.ping = Math.round(performance.now() - data.t); updateOpponentInfo(); }
            NET.connections.forEach((val, id) => { if (id === fromId) val.lastSeen = Date.now(); });
            break;
    }
}

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

window.copyOnlineRoomCode = function () {
    if (!NET.roomId) return;
    navigator.clipboard.writeText(NET.roomId).then(() => toast('房间码已复制：' + NET.roomId))
        .catch(() => toast('复制失败，请手动复制：' + NET.roomId));
};

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
    NET.tick = 0;
    NET._assignedPeers.clear();
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

// 核心函数暴露给 UI 使用
window._NET_createRoom = createRoom;
window._NET_joinRoom = joinRoom;