// ===== js/online.js – P2P 联机（房主权威 + 观战完整视角） =====

(function () {
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
        remotePlayerState: {
            x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
            hp: 100, armor: 50, score: 0,
            weapon: 'rifle', ammo: 0, reserve: 0,
            fov: 78, aimStage: 0,
            aiming: false, crouching: false,
            dead: false, visible: true,
            lastUpdate: 0
        },
        ping: 0
    };
    window.NET = NET;

    let heartbeatTimer = null;
    let pingTimer = null;
    let hostBroadcastTimer = null;
    let assignedPeers = new Set();

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
            if (NET.ping <= 0) {
                pingEl.textContent = '-';
                pingEl.classList.remove('warn', 'bad');
            } else {
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
            if (canStart) {
                startBtn.disabled = false;
                startBtn.textContent = '开 始 对 战';
            } else if (!NET.isHost) {
                startBtn.disabled = true;
                startBtn.textContent = '等待房主开始';
            } else {
                startBtn.disabled = true;
                startBtn.textContent = '等待双方入场';
            }
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
        if (seatKey === 'red')  return NET.seats.red;
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

    function handleRoomMessage(fromId, data) {
        switch (data.type) {
            case 'joinRequest': handleJoinRequest(fromId, data); break;
            case 'fullSync': handleFullSync(data); break;
            case 'memberUpdate':
                if (data.peerId === NET.myPeerId) break;
                if (data.seat === null) NET.members.delete(data.peerId);
                else NET.members.set(data.peerId, { name: data.name, seat: data.seat });
                renderRoomUI(); updateOpponentInfo();
                break;
            case 'seatRequest':
                if (NET.isHost) handleSeatRequest(fromId, data.targetSeat);
                break;
            case 'seatUpdate':
                applySeatUpdate(data.seats, data.members);
                updateOpponentInfo();
                break;
            case 'gameStart':
                if (!NET.started) { NET.started = true; enterOnlineGame(); }
                break;
            case 'clientInput':
                if (NET.isHost) handleClientInput(fromId, data);
                break;
            case 'shootRequest':
                if (NET.isHost) handleShootRequest(fromId, data);
                break;
            case 'hostState':
                if (!NET.isHost) handleHostState(data);
                break;
            case 'killEvent':
                if (!NET.isHost) handleKillEvent(data);
                break;
            case 'roundEvent':
                if (!NET.isHost) handleRoundEvent(data);
                break;
            case 'damageEvent':
                if (!NET.isHost) handleDamageEvent(data);
                break;
            case 'shootEvent':
                if (!NET.isHost) handleShootEvent(data);
                break;
            case 'chat':
                if (window.addChatMessage) addChatMessage(fromId === NET.myPeerId ? 1 : 2, data.text);
                break;
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
                if (data.t) {
                    NET.ping = Math.round(performance.now() - data.t);
                    updateOpponentInfo();
                }
                NET.connections.forEach((val, id) => { if (id === fromId) val.lastSeen = Date.now(); });
                break;
        }
    }

    function handleJoinRequest(fromId, data) {
        if (!NET.isHost) return;
        if (assignedPeers.has(fromId)) return;
        assignedPeers.add(fromId);

        NET.members.set(fromId, { name: data.name || '玩家', seat: null });
        const seat = findFirstFreeSeat();
        if (seat) {
            setSeat(seat, fromId);
            NET.members.get(fromId).seat = seat;
        }

        const membersArr = Array.from(NET.members.entries()).map(([id, m]) => ({ id, name: m.name, seat: m.seat }));
        const conn = NET.connections.get(fromId);
        if (conn && conn.conn && conn.conn.open) {
            try {
                conn.conn.send({
                    type: 'fullSync', roomId: NET.roomId, seats: NET.seats,
                    members: membersArr, started: NET.started, yourSeat: seat
                });
            } catch (e) {}
        }

        broadcast({ type: 'seatUpdate', seats: NET.seats, members: membersArr }, fromId);
        renderRoomUI(); updateOpponentInfo();
    }

    function handleFullSync(data) {
        NET.roomId = data.roomId;
        NET.seats = data.seats || { blue: null, red: null, specs: [null, null, null] };
        NET.members = new Map();
        (data.members || []).forEach(m => NET.members.set(m.id, { name: m.name, seat: m.seat }));
        NET.members.set(NET.myPeerId, { name: NET.myName, seat: data.yourSeat });
        NET.mySeat = data.yourSeat;
        NET.started = !!data.started;
        renderRoomUI(); updateOpponentInfo();
        if (NET.started) enterOnlineGame();
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
        assignedPeers.clear();
        assignedPeers.add(NET.myPeerId);
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
                assignedPeers.delete(conn.peer);
                const membersArr = Array.from(NET.members.entries()).map(([id, m]) => ({ id, name: m.name, seat: m.seat }));
                broadcast({ type: 'seatUpdate', seats: NET.seats, members: membersArr });
                renderRoomUI(); updateOpponentInfo();
            });
            conn.on('error', (e) => console.warn('连接错误:', e));
        });

        NET.peer.on('error', (e) => {
            console.error('Peer 错误:', e);
            toast('网络错误，请重试');
        });

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
                metadata: { name: NET.myName },
                reliable: true, serialization: 'json'
            });
            conn.on('open', () => {
                NET.connections.set(NET.roomId, { conn, lastSeen: Date.now() });
                conn.send({ type: 'joinRequest', myId: NET.myPeerId, name: NET.myName });
                startHeartbeat();
                startPingLoop();
            });
            conn.on('data', (d) => handleRoomMessage(NET.roomId, d));
            conn.on('close', () => {
                NET.connections.delete(NET.roomId);
                toast('与房主断开连接');
            });
            conn.on('error', (e) => console.warn('连接错误:', e));
        });

        NET.peer.on('error', (e) => {
            console.error('加入房间失败:', e);
            toast('房间不存在或网络错误');
        });

        renderRoomUI();
    }
    window.NET_joinRoom = joinRoom;

    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
            broadcast({ type: 'ping', t: performance.now(), from: NET.myPeerId });
        }, 8000);
    }

    function startPingLoop() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
            if (!NET.roomId) return;
            const msg = { type: 'ping', t: performance.now() };
            if (NET.isHost) broadcast(msg);
            else sendToHost(msg);
        }, 2000);
    }

    window.onlineStartGame = function () {
        if (!NET.isHost) return;
        if (!NET.seats.blue || !NET.seats.red) { toast('双方入场后才能开始'); return; }
        NET.started = true;
        broadcast({ type: 'gameStart' });
        enterOnlineGame();
    };

    function enterOnlineGame() {
        document.getElementById('onlineLobbyOverlay').style.display = 'none';
        document.getElementById('lobbyOverlay').style.display = 'none';

        if (NET.isHost) NET.role = 'host';
        else if (NET.mySeat === 'blue' || NET.mySeat === 'red') NET.role = 'player';
        else NET.role = 'spectator';

        const myIsBlue = (NET.mySeat === 'blue');

        if (typeof p1 !== 'undefined' && p1) {
            p1.mat.color.setHex(myIsBlue ? 0x3a7bd5 : 0xd54a3a);
        }
        if (typeof p2 !== 'undefined' && p2) {
            p2.mat.color.setHex(myIsBlue ? 0xd54a3a : 0x3a7bd5);
        }

        if (NET.role !== 'spectator' && typeof p1 !== 'undefined' && p1 && p1.spawn) {
            if (myIsBlue) {
                p1.spawn.x = -21; p1.spawn.z = -21; p1.spawn.yaw = -3 * Math.PI / 4;
            } else {
                p1.spawn.x = 21; p1.spawn.z = 21; p1.spawn.yaw = Math.PI / 4;
            }
        }

        if (typeof window.GAME_setMode === 'function') window.GAME_setMode('online');

        if (typeof resetMatch === 'function') {
            if (typeof p2 !== 'undefined' && p2) p2.gunHolder.visible = true;
            resetMatch();
        }

        document.body.classList.add('online-mode');

        // 观战者：仅隐藏操作按钮，HUD 保留（显示被观察者数据）
        if (NET.role === 'spectator') {
            const mc = document.getElementById('mobile-controls');
            if (mc) mc.style.display = 'none';
            window.GAME_setSpectator = true;
            showSpectatorHint();
        } else {
            window.GAME_setSpectator = false;
        }

        updateOpponentInfo();
        if (typeof renderChatMessages === 'function') renderChatMessages();

        if (NET.isHost) startHostBroadcast();
    }
    window.NET_enterOnlineGame = enterOnlineGame;

    // ============================================================
    // 房主广播
    // ============================================================
    function startHostBroadcast() {
        if (hostBroadcastTimer) clearInterval(hostBroadcastTimer);
        hostBroadcastTimer = setInterval(hostBroadcastTick, 40);
    }
    function stopHostBroadcast() {
        if (hostBroadcastTimer) { clearInterval(hostBroadcastTimer); hostBroadcastTimer = null; }
    }

    function hostBroadcastTick() {
        if (!NET.isHost || !NET.roomId) return;
        if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

        const now = performance.now();
        const hostSeat = NET.mySeat;

        // 房主自己（p1）
        const hostData = {
            x: p1.pos.x, y: p1.pos.y, z: p1.pos.z,
            yaw: p1.yaw, pitch: p1.pitch,
            hp: p1.hp, armor: p1.armor, score: p1.score,
            weapon: p1.weapon.key,
            ammo: p1.ammo, reserve: p1.reserve,
            fov: p1.cam.fov,
            aimStage: p1.aimStage || 0,
            aiming: !!p1.aiming,
            crouching: p1.height < HEIGHT_STAND - 0.15,
            dead: p1.hp <= 0,
            visible: p1.baseVisible
        };

        // 客户端（房主端 p2）
        const r = NET.remotePlayerState;
        const clientData = {
            x: r.x, y: r.y, z: r.z,
            yaw: r.yaw, pitch: r.pitch,
            hp: r.hp, armor: r.armor, score: r.score,
            weapon: r.weapon,
            ammo: r.ammo || 0,
            reserve: r.reserve || 0,
            fov: r.fov || BASE_FOV,
            aimStage: r.aimStage || 0,
            aiming: !!r.aiming,
            crouching: !!r.crouching,
            dead: !!r.dead,
            visible: !!r.visible
        };

        const bluePlayer = hostSeat === 'blue' ? hostData : clientData;
        const redPlayer  = hostSeat === 'blue' ? clientData : hostData;

        broadcast({
            type: 'hostState',
            hostSeat,
            bluePlayer,
            redPlayer,
            roundNumber: (typeof roundNumber !== 'undefined') ? roundNumber : 1,
            gameState: (typeof gameState !== 'undefined') ? gameState : 'idle',
            stateEndTimeRemain: (typeof stateEndTime !== 'undefined') ? Math.max(0, stateEndTime - now) : 0,
            timestamp: now
        });
    }

    function handleClientInput(fromId, data) {
        if (!NET.isHost) return;
        const r = NET.remotePlayerState;
        r.x = data.x; r.y = data.y; r.z = data.z;
        r.yaw = data.yaw; r.pitch = data.pitch;
        r.hp = data.hp; r.armor = data.armor; r.score = data.score;
        r.weapon = data.weapon;
        r.ammo = data.ammo || 0;
        r.reserve = data.reserve || 0;
        r.fov = data.fov || BASE_FOV;
        r.aimStage = data.aimStage || 0;
        r.aiming = !!data.aiming;
        r.crouching = !!data.crouching;
        r.dead = !!data.dead;
        r.visible = !!data.visible;
        r.lastUpdate = performance.now();

        if (typeof p2 !== 'undefined' && p2) {
            p2.pos.set(r.x, r.y, r.z);
            p2.yaw = r.yaw; p2.pitch = r.pitch;
            p2.mesh.position.copy(p2.pos);
            p2.mesh.rotation.y = r.yaw;
            p2.hp = r.hp; p2.armor = r.armor; p2.score = r.score;
            p2.baseVisible = r.visible;
            p2.height = r.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
            p2.mesh.scale.y = p2.height / HEIGHT_STAND;

            if (typeof WEAPONS !== 'undefined' && WEAPONS[r.weapon] && p2.weapon.key !== r.weapon) {
                while (p2.gunHolder.children.length) p2.gunHolder.remove(p2.gunHolder.children[0]);
                if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel(r.weapon, p2.mat));
                p2.weapon = WEAPONS[r.weapon];
            }
        }
    }

    // ============================================================
    // 房主：处理客户端开火
    // ============================================================
    function handleShootRequest(fromId, data) {
        if (!NET.isHost) return;
        if (typeof p2 === 'undefined') return;
        if (typeof gameState === 'undefined' || gameState !== 'combat') return;

        const now = performance.now();
        const r = NET.remotePlayerState;
        if (r.dead || !r.visible) return;

        const w = WEAPONS[data.weapon] || p2.weapon;
        if (p2.nextShot === undefined) p2.nextShot = 0;
        if (now < p2.nextShot || p2.reloadEnd > now) return;

        let currentFireMs = w.fireMs;
        if (w.spinUpMs && w.minFireMs) {
            const since = now - (p2.lastShotTime || 0);
            if (since < 200) p2.spinUpProgress = Math.min(1, (p2.spinUpProgress || 0) + since / w.spinUpMs);
            else p2.spinUpProgress = 0;
            currentFireMs = Math.max(w.minFireMs, w.fireMs - (w.fireMs - w.minFireMs) * p2.spinUpProgress);
        }
        p2.nextShot = now + currentFireMs;
        p2.lastShotTime = now;

        switch (w.key) {
            case 'sniper':  sShootSniper(2);  break;
            case 'shotgun': sShootShotgun(2); break;
            case 'odin':    sShootOdin(2);    break;
            default:        sShootRifle(2);   break;
        }
        if (p2.muzzle) p2.muzzle.intensity = 2.2;

        broadcast({ type: 'shootEvent', from: 'p2', weapon: w.key });

        const eyeY = r.y + (r.crouching ? EYE_CROUCH : EYE_STAND);
        const eye = new THREE.Vector3(r.x, eyeY, r.z);
        const euler = new THREE.Euler(r.pitch || 0, r.yaw, 0, 'YXZ');
        const baseDir = new THREE.Vector3(0, 0, -1).applyEuler(euler);

        const pellets = w.pellets || 1;
        const spread = w.spread || 0;
        const targets = wallMeshes.concat(crateMeshes);
        if (now >= p1.deadUntil) targets.push(p1.body, p1.head);

        for (let i = 0; i < pellets; i++) {
            const dir = baseDir.clone();
            if (pellets > 1) {
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
                const up = new THREE.Vector3(0, 1, 0);
                const axis = new THREE.Vector3().crossVectors(dir, up).normalize();
                if (axis.length() < 0.01) axis.set(1, 0, 0);
                const q1 = new THREE.Quaternion().setFromAxisAngle(axis, phi);
                const q2 = new THREE.Quaternion().setFromAxisAngle(dir, theta);
                dir.applyQuaternion(q1).applyQuaternion(q2);
            }
            const rc = new THREE.Raycaster(eye.clone(), dir.clone(), 0, 150);
            const hits = rc.intersectObjects(targets, false);
            let end = eye.clone().add(dir.clone().multiplyScalar(150));
            if (hits.length) {
                const h = hits[0];
                end = h.point;
                if (h.object.userData.part) {
                    const dmg = h.object.userData.part === 'head' ? w.dmgHead : w.dmgBody;

                    // ★ 房主端记录客户端造成的伤害
                    if (!p2.damageDealt[1]) p2.damageDealt[1] = { body: 0, head: 0, total: 0 };
                    if (h.object.userData.part === 'head') p2.damageDealt[1].head += dmg;
                    else p2.damageDealt[1].body += dmg;
                    p2.damageDealt[1].total += dmg;

                    damage(p1, dmg, p2);
                    spawnSparks(h.point, 0xff5040);
                } else {
                    spawnSparks(h.point, 0xffd28a);
                }
            }
            if (i === 0) spawnTracer(eye.clone(), end);
        }
    }

    // ============================================================
    // 客户端/观战者：接收房主状态
    // ============================================================
    function handleHostState(data) {
        if (NET.isHost) return;
        NET.lastHostState = data;

        if (typeof stateEndTime !== 'undefined') {
            stateEndTime = performance.now() + data.stateEndTimeRemain;
        }
        if (typeof roundNumber !== 'undefined' && data.roundNumber) {
            roundNumber = data.roundNumber;
        }

        const blueData = data.bluePlayer;
        const redData  = data.redPlayer;

        if (NET.role === 'player') {
            const mySeat = NET.mySeat;
            const myData = mySeat === 'blue' ? blueData : redData;
            const oppData = mySeat === 'blue' ? redData : blueData;

            if (typeof p1 !== 'undefined' && p1) {
                p1.hp = myData.hp;
                p1.armor = myData.armor;
                p1.score = myData.score;
            }

            if (typeof p2 !== 'undefined' && p2) {
                p2.pos.set(oppData.x, oppData.y, oppData.z);
                p2.yaw = oppData.yaw;
                p2.pitch = oppData.pitch;
                p2.mesh.position.copy(p2.pos);
                p2.mesh.rotation.y = oppData.yaw;
                p2.hp = oppData.hp;
                p2.armor = oppData.armor;
                p2.score = oppData.score;
                p2.baseVisible = oppData.visible;
                p2.height = oppData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
                p2.mesh.scale.y = p2.height / HEIGHT_STAND;

                if (typeof WEAPONS !== 'undefined' && WEAPONS[oppData.weapon] && p2.weapon.key !== oppData.weapon) {
                    while (p2.gunHolder.children.length) p2.gunHolder.remove(p2.gunHolder.children[0]);
                    if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel(oppData.weapon, p2.mat));
                    p2.weapon = WEAPONS[oppData.weapon];
                }
            }
        } else if (NET.role === 'spectator') {
            NET.spectatorBlueData = blueData;
            NET.spectatorRedData = redData;
        }
    }

    // ============================================================
    // 观战者完整视角
    // ============================================================
    function updateSpectatorView(dt) {
        if (NET.role !== 'spectator') return;
        if (!NET.spectatorBlueData || !NET.spectatorRedData) return;
        if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

        const watching = NET.spectatorTarget;
        const watchData = watching === 'blue' ? NET.spectatorBlueData : NET.spectatorRedData;
        const otherData = watching === 'blue' ? NET.spectatorRedData : NET.spectatorBlueData;
        const otherIsBlue = watching !== 'blue';

        // --- p1 完全承载被观察者的状态 ---
        p1.pos.set(watchData.x, watchData.y, watchData.z);
        p1.yaw = watchData.yaw;
        p1.pitch = watchData.pitch;
        p1.height = watchData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
        p1.eyeH = stanceEye(p1.height);
        p1.hp = watchData.hp;
        p1.armor = watchData.armor;
        p1.score = watchData.score;
        p1.ammo = watchData.ammo || 0;
        p1.reserve = watchData.reserve || 0;
        p1.aiming = !!watchData.aiming;
        p1.aimStage = watchData.aimStage || 0;
        p1.baseVisible = watchData.visible;
        p1.deadUntil = watchData.dead ? Infinity : 0;

        // 武器替换（保持弹药/状态，仅替换模型）
        if (watchData.weapon && typeof WEAPONS !== 'undefined' && WEAPONS[watchData.weapon]) {
            if (p1.weapon.key !== watchData.weapon) {
                while (p1.gunHolder.children.length) p1.gunHolder.remove(p1.gunHolder.children[0]);
                if (typeof makeWeaponModel === 'function') p1.gunHolder.add(makeWeaponModel(watchData.weapon, p1.mat));
                while (p1.vm.children.length) p1.vm.remove(p1.vm.children[0]);
                if (typeof makeViewmodel === 'function') p1.vm.add(makeViewmodel(watchData.weapon, p1.mat));
                p1.weapon = WEAPONS[watchData.weapon];
            }
        }

        // 相机位置/朝向
        p1.cam.position.set(watchData.x, watchData.y + p1.eyeH, watchData.z);
        p1.cam.rotation.y = watchData.yaw;
        p1.cam.rotation.x = watchData.pitch;

        // FOV 平滑过渡（含狙击镜二段）
        const targetFov = watchData.fov || BASE_FOV;
        if (Math.abs(p1.cam.fov - targetFov) > 0.05) {
            const k = Math.min(1, (dt || 0.016) * 11);
            p1.cam.fov += (targetFov - p1.cam.fov) * k;
            p1.cam.updateProjectionMatrix();
        }

        // 隐藏自己 mesh
        p1.mesh.visible = false;

        // --- p2 显示另一个玩家 ---
        p2.pos.set(otherData.x, otherData.y, otherData.z);
        p2.yaw = otherData.yaw;
        p2.pitch = otherData.pitch;
        p2.mesh.position.copy(p2.pos);
        p2.mesh.rotation.y = otherData.yaw;
        p2.hp = otherData.hp;
        p2.armor = otherData.armor;
        p2.baseVisible = otherData.visible;
        p2.height = otherData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
        p2.mesh.scale.y = p2.height / HEIGHT_STAND;
        p2.mat.color.setHex(otherIsBlue ? 0x3a7bd5 : 0xd54a3a);

        if (otherData.weapon && typeof WEAPONS !== 'undefined' && WEAPONS[otherData.weapon] && p2.weapon.key !== otherData.weapon) {
            while (p2.gunHolder.children.length) p2.gunHolder.remove(p2.gunHolder.children[0]);
            if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel(otherData.weapon, p2.mat));
            p2.weapon = WEAPONS[otherData.weapon];
        }
    }
    window.NET_updateSpectatorView = updateSpectatorView;

    function showSpectatorHint() {
        let el = document.getElementById('spectatorHint');
        if (!el) {
            el = document.createElement('div');
            el.id = 'spectatorHint';
            el.style.cssText = `
                position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
                z-index: 15; background: rgba(13, 19, 30, 0.9);
                border: 1px solid rgba(255, 210, 74, 0.5); border-radius: 10px;
                padding: 10px 24px; color: #ffd24a; font-size: 14px; letter-spacing: 2px;
                pointer-events: none; box-shadow: 0 6px 24px rgba(0,0,0,0.6);
            `;
            document.body.appendChild(el);
        }
        el.textContent = '👁 观战中 · 左键切换视角 · Enter 聊天';
        el.style.display = 'block';

        let tag = document.getElementById('spectatorTargetTag');
        if (!tag) {
            tag = document.createElement('div');
            tag.id = 'spectatorTargetTag';
            tag.style.cssText = `
                position: fixed; top: 14px; right: 14px; z-index: 15;
                background: rgba(13, 19, 30, 0.85);
                border: 1px solid rgba(107, 179, 255, 0.5); border-radius: 10px;
                padding: 8px 16px; color: #fff; font-size: 14px; pointer-events: none;
            `;
            document.body.appendChild(tag);
        }
        updateSpectatorTag(tag);
    }

    function updateSpectatorTag(tag) {
        if (!tag) tag = document.getElementById('spectatorTargetTag');
        if (!tag) return;
        const t = NET.spectatorTarget;
        const icon = t === 'blue' ? '🔵' : '🔴';
        const label = t === 'blue' ? '蓝方视角' : '红方视角';
        tag.innerHTML = `<span style="color:#9fb2c8;font-size:12px;margin-right:6px;">观战</span><span style="color:${t === 'blue' ? '#6db3ff' : '#ff7a6d'};font-weight:700;">${icon} ${label}</span>`;
    }

    window.NET_spectatorToggle = function () {
        if (NET.role !== 'spectator') return;
        NET.spectatorTarget = NET.spectatorTarget === 'blue' ? 'red' : 'blue';
        updateSpectatorTag();
        toast('切换到' + (NET.spectatorTarget === 'blue' ? '蓝方' : '红方') + '视角');
    };

    // ============================================================
    // 事件处理
    // ============================================================
    function handleShootEvent(data) {
        if (data.from === 'p2' && typeof p2 !== 'undefined') p2.muzzle.intensity = 2.2;
        switch (data.weapon) {
            case 'sniper':  sShootSniper(2);  break;
            case 'shotgun': sShootShotgun(2); break;
            case 'odin':    sShootOdin(2);    break;
            default:        sShootRifle(2);   break;
        }
    }

    // ★ 修复：直接用房主广播的伤害数据组装报告
    function handleKillEvent(data) {
        if (typeof sKill === 'function') sKill(1);
        if (typeof sDeath === 'function') sDeath();

        // data.killerSide: 'host' | 'client'
        // data.victimSide: 'host' | 'client'
        // 客户端视角：p1 = 自己（client），p2 = 房主（host）
        let attacker, victim;
        if (data.killerSide === 'client') {
            attacker = p1; victim = p2;
        } else {
            attacker = p2; victim = p1;
        }

        if (typeof feed === 'function' && typeof p1 !== 'undefined') {
            const attackerName = (attacker === p1) ? '你' : NET.getOpponentName();
            const victimName = (victim === p1) ? '你' : NET.getOpponentName();
            feed(p1, `<b style="color:#ffd24a">${attackerName}</b> 击杀了 <b style="color:#ff7a6d">${victimName}</b>`);
        }

        if (typeof showRoundReport === 'function' && data.dmgByKiller && data.dmgByVictim) {
            window.showRoundReport(
                data.roundNumber || 1,
                attacker, victim,
                data.dmgByKiller,
                data.dmgByVictim
            );
        }
    }

    function handleRoundEvent(data) {
        if (typeof gameState !== 'undefined') gameState = data.gameState;
        if (typeof stateEndTime !== 'undefined') stateEndTime = performance.now() + data.remain;
        if (typeof roundNumber !== 'undefined' && data.roundNumber) roundNumber = data.roundNumber;

        if (data.reset) {
            if (NET.role === 'player' && typeof resetPlayer === 'function' && typeof p1 !== 'undefined') {
                resetPlayer(p1, performance.now());
            } else if (NET.role === 'spectator') {
                if (typeof p1 !== 'undefined') resetPlayer(p1, performance.now());
                if (typeof p2 !== 'undefined') resetPlayer(p2, performance.now());
            }
        }
    }

    function handleDamageEvent(data) {
        // data.target 是房主视角：'p1'=房主, 'p2'=客户端
        // 客户端自己的 p1 对应房主的 p2
        if (data.target === 'p2' && NET.role === 'player') {
            if (typeof p1 !== 'undefined' && typeof dmgFlash === 'function') dmgFlash(p1);
            if (typeof sHit === 'function') sHit(1);
        }
    }

    window.NET_sendDamageEvent = function (target, dmg) {
        if (!NET.isHost) return;
        broadcast({ type: 'damageEvent', target, dmg });
    };

    // ★ 房主发 kill 事件时，带上双方伤害统计
    window.NET_sendKillEvent = function (killerSide, victimSide, round, dmgByKiller, dmgByVictim) {
        if (!NET.isHost) return;
        broadcast({
            type: 'killEvent',
            killerSide,
            victimSide,
            roundNumber: round,
            dmgByKiller: dmgByKiller || { body: 0, head: 0, total: 0 },
            dmgByVictim: dmgByVictim || { body: 0, head: 0, total: 0 }
        });
    };

    window.NET_sendRoundEvent = function (gameStateStr, remain, reset, roundNum) {
        if (!NET.isHost) return;
        broadcast({ type: 'roundEvent', gameState: gameStateStr, remain, reset, roundNumber: roundNum });
    };

    window.NET_sendShootRequest = function (weaponKey) {
        if (NET.isHost || NET.role !== 'player') return;
        if (!NET.roomId) return;
        sendToHost({ type: 'shootRequest', weapon: weaponKey });
    };

    window.NET_sendClientInput = function () {
        if (NET.isHost || NET.role !== 'player') return;
        if (!NET.roomId) return;
        if (typeof p1 === 'undefined' || !p1) return;

        sendToHost({
            type: 'clientInput',
            x: p1.pos.x, y: p1.pos.y, z: p1.pos.z,
            yaw: p1.yaw, pitch: p1.pitch,
            hp: p1.hp, armor: p1.armor, score: p1.score,
            weapon: p1.weapon.key,
            ammo: p1.ammo,
            reserve: p1.reserve,
            fov: p1.cam.fov,
            aimStage: p1.aimStage || 0,
            aiming: !!p1.aiming,
            crouching: p1.height < HEIGHT_STAND - 0.15,
            dead: p1.hp <= 0,
            visible: p1.baseVisible
        });
    };

    window.NET_sendChat = function (text) {
        if (!NET.roomId) return;
        if (NET.isHost) broadcast({ type: 'chat', text: text });
        else sendToHost({ type: 'chat', text: text });
    };

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
        assignedPeers.clear();
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        stopHostBroadcast();

        document.body.classList.remove('online-mode');
        const hint = document.getElementById('spectatorHint');
        if (hint) hint.remove();
        const tag = document.getElementById('spectatorTargetTag');
        if (tag) tag.remove();

        document.getElementById('onlineLobbyOverlay').style.display = 'none';
        document.getElementById('lobbyOverlay').style.display = 'flex';
    };

    function bindUI() {
        const createBtn = document.getElementById('onlineCreateBtn');
        const joinBtn = document.getElementById('onlineJoinBtn');
        const joinInput = document.getElementById('onlineJoinInput');
        const backBtn = document.getElementById('onlineBackBtn');
        const startBtn = document.getElementById('onlineStartBtn');
        const leaveBtn = document.getElementById('onlineLeaveBtn');

        if (createBtn) createBtn.addEventListener('click', () => createRoom());

        if (joinBtn) joinBtn.addEventListener('click', () => {
            const code = (joinInput?.value || '').trim().toUpperCase();
            if (!code || code.length < 4) { toast('请输入正确的房间码'); return; }
            joinRoom(code);
        });

        if (joinInput) {
            joinInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = joinInput.value.trim().toUpperCase();
                    if (!code || code.length < 4) { toast('请输入正确的房间码'); return; }
                    joinRoom(code);
                }
            });
            joinInput.addEventListener('input', () => {
                joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
        }

        if (backBtn) backBtn.addEventListener('click', () => {
            document.getElementById('onlineLobbyOverlay').style.display = 'none';
            document.getElementById('lobbyOverlay').style.display = 'flex';
        });

        if (startBtn) startBtn.addEventListener('click', () => window.onlineStartGame());
        if (leaveBtn) leaveBtn.addEventListener('click', () => window.leaveOnlineRoom());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
    else bindUI();
})();