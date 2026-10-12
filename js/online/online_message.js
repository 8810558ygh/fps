// ===== js/online_message.js – 广播 / 发送 / 消息路由 =====
// 从 online_core.js 拆出，不改变任何对外接口

// ============================================================
// 广播 / 发送
// ============================================================
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

// ============================================================
// 消息路由
// ============================================================
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
                if (typeof window.beginOnlineLoading === 'function') {
                    window.beginOnlineLoading(data.mapId, false);
                } else {
                    enterOnlineGame();
                }
            }
            break;

        case 'returnToRoom':
            if (!NET.isHost && typeof window.returnToOnlineRoom === 'function') {
                window.returnToOnlineRoom(true);
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

        case 'slashMark':
            if (!NET.isHost && typeof spawnSlashMark === 'function') {
                spawnSlashMark(
                    new THREE.Vector3(data.x, data.y, data.z),
                    new THREE.Vector3(data.nx, data.ny, data.nz),
                    data.yaw || 0,
                    !!data.isVertical
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

        case 'barrelExplode':
            if (!NET.isHost && typeof window.hideBarrelAt === 'function') {
                window.hideBarrelAt(data.x, data.y, data.z);
            }
            break;

        case 'hitmarkForClient':
            if (!NET.isHost
                && typeof hitmark === 'function'
                && typeof p1 !== 'undefined' && p1) {
                hitmark(p1);
                if (typeof sHit === 'function') sHit(1);
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

        case 'worldSound':
            if (!NET.isHost && typeof handleRemoteWorldSound === 'function') {
                handleRemoteWorldSound(data);
            }
            break;

        case 'loadingProgress':
            if (typeof window.handleClientLoadingProgress === 'function') {
                window.handleClientLoadingProgress(fromId, data.progress);
            }
            break;
        case 'loadingStatus':
            if (typeof window.handleLoadingStatus === 'function') {
                window.handleLoadingStatus(data.state);
            }
            break;
        case 'loadingComplete':
            if (typeof window.handleLoadingComplete === 'function') {
                window.handleLoadingComplete();
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