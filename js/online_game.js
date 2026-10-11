// ===== js/online_game.js – 房主权威同步、客户端输入、观战视角 =====

const HIGH_FREQ_FIELDS = [
    'x', 'y', 'z',
    'yaw', 'pitch', 'fov',
    'aiming', 'aimStage',
    'reloadRemain', 'boltRemain', 'equipRemain',
    'meleeEndRemain', 'meleeRecoveryRemain',
    'throwFuseActive', 'throwFuseEndRemain',
    'flashRemain'
];

const LOW_FREQ_FIELDS = [
    'hp', 'armor', 'score',
    'ammo', 'reserve', 'weapon',
    'isMelee', 'isSmoke', 'isFlash',
    'meleeIsHeavy',
    'smokeCharges', 'flashCharges',
    'crouching', 'dead', 'visible',
    'throwFuseType', 'throwFuseInHand',
    'onGround',
    'ziplineActive',
    'ziplineLineIdx',
    'ziplineT',
    'ziplineDir'
];

// ============================================================
// ★ 对象池
// ============================================================
const _playerStateP1 = {};
const _playerStateP2 = {};

const _deltaBlue = {};
const _deltaRed  = {};

const _payloadBlue = { full: false, data: _deltaBlue };
const _payloadRed  = { full: false, data: _deltaRed  };

const _hostStatePacket = {
    type: 'hostState',
    tick: 0,
    timestamp: 0,
    hostSeat: null,
    mapId: null,
    roundNumber: 0,
    gameState: 'idle',
    stateEndTimeRemain: 0,
    bluePlayer: null,
    redPlayer: null,
};

const _lastLowFreqBlue = { _init: false };
const _lastLowFreqRed  = { _init: false };

(function _prewarmDeltaShape() {
    const all = HIGH_FREQ_FIELDS.concat(LOW_FREQ_FIELDS);
    for (let i = 0; i < all.length; i++) {
        _deltaBlue[all[i]] = undefined;
        _deltaRed[all[i]]  = undefined;
    }
})();

let _forceFullCounter = 0;
let _lastRoundNumber = -1;
let _lastConnCount = -1;

const _clientPlayerState = {
    blue: null,
    red: null
};

// ============================================================
// ★ 构建增量包
// ============================================================
function _buildPlayerPayload(full, lastLowFreq, forceFull, out) {
    if (forceFull || !lastLowFreq._init) {
        out.full = true;
        out.data = full;

        for (let i = 0; i < LOW_FREQ_FIELDS.length; i++) {
            const k = LOW_FREQ_FIELDS[i];
            lastLowFreq[k] = full[k];
        }
        lastLowFreq._init = true;
        return out;
    }

    out.full = false;
    const delta = out.data;

    for (let i = 0; i < HIGH_FREQ_FIELDS.length; i++) {
        const k = HIGH_FREQ_FIELDS[i];
        delta[k] = full[k];
    }

    for (let i = 0; i < LOW_FREQ_FIELDS.length; i++) {
        const k = LOW_FREQ_FIELDS[i];
        const v = full[k];
        if (v !== lastLowFreq[k]) {
            delta[k] = v;
            lastLowFreq[k] = v;
        } else {
            delta[k] = undefined;
        }
    }

    return out;
}

function _mergeDelta(side, payload) {
    if (!payload) return null;

    if (payload.full) {
        _clientPlayerState[side] = payload.data;
        return payload.data;
    }

    if (!_clientPlayerState[side]) {
        return null;
    }

    const merged = _clientPlayerState[side];
    const d = payload.data;
    for (const k in d) {
        const v = d[k];
        if (v !== undefined) {
            merged[k] = v;
        }
    }
    return merged;
}

// ============================================================
// 座位 / 房间
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

// ============================================================
// ★ 房主广播
// ============================================================
const HOST_BROADCAST_INTERVAL = 16;

function startHostBroadcast() {
    stopHostBroadcast();

    let lastTick = 0;

    function tick() {
        if (!NET.isHost || !NET.roomId) {
            NET._hostBroadcastRaf = null;
            return;
        }
        const now = performance.now();
        if (now - lastTick >= HOST_BROADCAST_INTERVAL) {
            lastTick = now;
            hostBroadcastTick();
        }
        NET._hostBroadcastRaf = requestAnimationFrame(tick);
    }

    NET._hostBroadcastRaf = requestAnimationFrame(tick);
}

function stopHostBroadcast() {
    if (NET._hostBroadcastRaf) {
        cancelAnimationFrame(NET._hostBroadcastRaf);
        NET._hostBroadcastRaf = null;
    }
    if (NET._hostBroadcastTimer) {
        clearInterval(NET._hostBroadcastTimer);
        NET._hostBroadcastTimer = null;
    }
}

// ============================================================
// ★ 序列化玩家状态
// ============================================================
function serializePlayer(p, out) {
    const now = performance.now();
    out.x = p.pos.x;
    out.y = p.pos.y;
    out.z = p.pos.z;
    out.yaw = p.yaw;
    out.pitch = p.pitch;
    out.hp = p.hp;
    out.armor = p.armor;
    out.score = p.score;
    out.weapon = p.isMelee ? 'knife' : (p.isSmoke ? 'smoke' : (p.isFlash ? 'flash' : p.weapon.key));
    out.ammo = p.ammo;
    out.reserve = p.reserve;
    out.fov = p.cam.fov;
    out.crouching = p.height < HEIGHT_STAND - 0.15;
    out.dead = p.hp <= 0 || p.deadUntil > now;
    out.visible = p.baseVisible;
    out.onGround = !!p.onGround;
    out.aiming = !!p.aiming;
    out.aimStage = p.aimStage || 0;
    out.isMelee = !!p.isMelee;
    out.isSmoke = !!p.isSmoke;
    out.isFlash = !!p.isFlash;
    out.meleeIsHeavy = !!p.meleeIsHeavy;
    out.smokeCharges = p.smokeCharges || 0;
    out.flashCharges = p.flashCharges || 0;
    out.reloadRemain = Math.max(0, p.reloadEnd - now);
    out.boltRemain = Math.max(0, p.boltEnd - now);
    out.equipRemain = Math.max(0, p.equipEnd - now);
    out.meleeEndRemain = Math.max(0, p.meleeEnd - now);
    out.meleeRecoveryRemain = Math.max(0, p.meleeRecovery - now);
    out.throwFuseActive = !!p.throwFuseActive;
    out.throwFuseType = p.throwFuseType || null;
    out.throwFuseEndRemain = p.throwFuseActive ? Math.max(0, p.throwFuseEnd - now) : 0;
    out.throwFuseInHand = !!p.throwFuseInHand;
    out.flashRemain = p.flashUntil > now ? (p.flashUntil - now) : 0;

    const zip = p.zipline;
    out.ziplineActive  = !!(zip && zip.active);
    out.ziplineLineIdx = (zip && zip.active) ? zip.lineIdx : -1;
    out.ziplineT       = (zip && zip.active) ? zip.t       : 0;
    out.ziplineDir     = (zip && zip.active) ? zip.dir     : 1;

    return out;
}

// ============================================================
// ★ 房主广播
// ============================================================
function hostBroadcastTick() {
    if (!NET.isHost || !NET.roomId) return;
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;
    const now = performance.now();
    const hostSeat = NET.mySeat;

    serializePlayer(p1, _playerStateP1);
    serializePlayer(p2, _playerStateP2);

    const hostData = _playerStateP1;
    const clientData = _playerStateP2;

    const bluePlayer = hostSeat === 'blue' ? hostData : clientData;
    const redPlayer  = hostSeat === 'blue' ? clientData : hostData;

    _forceFullCounter++;
    let forceFull = false;
    if (_forceFullCounter >= 60) {
        _forceFullCounter = 0;
        forceFull = true;
    }
    if (typeof roundNumber !== 'undefined' && roundNumber !== _lastRoundNumber) {
        _lastRoundNumber = roundNumber;
        forceFull = true;
    }
    if (NET.connections.size !== _lastConnCount) {
        _lastConnCount = NET.connections.size;
        forceFull = true;
    }

    _buildPlayerPayload(bluePlayer, _lastLowFreqBlue, forceFull, _payloadBlue);
    _buildPlayerPayload(redPlayer,  _lastLowFreqRed,  forceFull, _payloadRed);

    const packet = _hostStatePacket;
    packet.tick = NET.tick++;
    packet.timestamp = now;
    packet.hostSeat = hostSeat;
    packet.mapId = getLocalMapId();
    packet.roundNumber = (typeof roundNumber !== 'undefined') ? roundNumber : 1;
    packet.gameState = (typeof gameState !== 'undefined') ? gameState : 'idle';
    packet.stateEndTimeRemain = (typeof stateEndTime !== 'undefined') ? Math.max(0, stateEndTime - now) : 0;
    packet.bluePlayer = _payloadBlue;
    packet.redPlayer = _payloadRed;

    broadcast(packet);
}

// ============================================================
// ★ 房主端：处理客户端输入
//
//   ★ ziplineDismount：只清滑索状态（客户端脱索瞬间上报）
//   ★ vulnerableStart：设置硬直/易伤（客户端落地瞬间上报）
// ============================================================
function handleClientInput(fromId, data) {
    if (!NET.isHost) return;
    if (typeof p2 === 'undefined' || !p2) return;

    // ============================================================
    // ★ 滑索挂载：直接接管 p2.zipline 状态
    // ============================================================
    if (data.ziplineMount) {
        if (!p2.zipline) p2.zipline = { active: false, lineIdx: -1, t: 0, dir: 1 };
        p2.zipline.active  = true;
        p2.zipline.lineIdx = data.ziplineMount.lineIdx;
        p2.zipline.t       = data.ziplineMount.t;
        p2.zipline.dir     = data.ziplineMount.dir;

        if (typeof ZIPLINES !== 'undefined'
            && Array.isArray(ZIPLINES)
            && ZIPLINES[data.ziplineMount.lineIdx]) {
            const line = ZIPLINES[data.ziplineMount.lineIdx];
            const dirX = line.dx * data.ziplineMount.dir;
            const dirZ = line.dz * data.ziplineMount.dir;
            if (Math.abs(dirX) + Math.abs(dirZ) > 0.001) {
                p2.yaw = Math.atan2(-dirX, -dirZ);
            }
            p2.pitch = 0;
        }

        if (p2.input) {
            p2.input.forward = 0;
            p2.input.right   = 0;
            p2.input.jump    = false;
            p2.input.crouch  = false;
            p2.input.fire    = false;
            p2.input.aim     = false;
        }
    }

    // ============================================================
    // ★ 滑索脱离：清滑索状态（清输入）
    //   （硬直/易伤由下面的 vulnerableStart 单独处理）
    // ============================================================
    if (data.ziplineDismount) {
        if (p2.zipline) p2.zipline.active = false;
        if (p2.input) {
            p2.input.forward = 0;
            p2.input.right   = 0;
            p2.input.jump    = false;
            p2.input.crouch  = false;
            p2.input.fire    = false;
            p2.input.aim     = false;
        }
    }

    // ============================================================
    // ★ 硬直 / 易伤开始：落地时设置 p2.stunUntil / p2.vulnerableUntil
    //   这保证房主端伤害计算（damage(p2,...)）能正确翻倍
    // ============================================================
    if (data.vulnerableStart) {
        const now = performance.now();
        if (data.vulnerableStart.stunDuration > 0) {
            p2.stunUntil = now + data.vulnerableStart.stunDuration;
        }
        if (data.vulnerableStart.vulnDuration > 0) {
            p2.vulnerableUntil = now + data.vulnerableStart.vulnDuration;
        }
    }

    // ---- 常规输入 ----
    if (data.input) {
        p2.input.forward = data.input.forward || 0;
        p2.input.right   = data.input.right || 0;
        p2.input.jump    = !!data.input.jump;
        p2.input.crouch  = !!data.input.crouch;
        p2.input.fire    = !!data.input.fire;
        p2.input.aim     = !!data.input.aim;
    }

    p2.yaw = data.yaw;
    p2.pitch = data.pitch;
    if (data.aimStage !== undefined) p2.aimStage = data.aimStage;

    if (data.weaponSwitch) {
        const key = data.weaponSwitch;
        if (key === 'knife' || key === 'smoke' || key === 'flash' || WEAPONS[key]) {
            setWeapon(p2, key);
        }
    }
    if (data.reload) {
        startReload(p2, performance.now());
    }

    if (data.fuseStart) {
        const key = data.fuseStart;
        if (key === 'smoke') {
            if (!p2.isSmoke) setWeapon(p2, 'smoke');
            startThrowFuse(p2, 'smoke');
        } else if (key === 'flash') {
            if (!p2.isFlash) setWeapon(p2, 'flash');
            startThrowFuse(p2, 'flash');
        }
    }
    if (data.fuseRelease) {
        if (p2.throwFuseActive && p2.throwFuseInHand) {
            releaseThrowFuse(p2);
        }
    }

    if (data.melee) {
        if (!p2.isMelee) setWeapon(p2, 'knife');
        p2.meleeIsHeavy = !!data.meleeHeavy;
        tryMelee(p2, performance.now(), !!data.meleeHeavy);
    }

    p2.lastRemoteInputAt = performance.now();
}

// ============================================================
// ★ 客户端处理房主状态
// ============================================================
function handleHostState(data) {
    if (NET.isHost) return;
    NET.lastHostState = data;
    if (data.hostSeat) NET.hostSeat = data.hostSeat;
    if (typeof stateEndTime !== 'undefined') stateEndTime = performance.now() + data.stateEndTimeRemain;
    if (typeof roundNumber !== 'undefined' && data.roundNumber) roundNumber = data.roundNumber;

    const bluePlayer = _mergeDelta('blue', data.bluePlayer);
    const redPlayer  = _mergeDelta('red',  data.redPlayer);

    if (!bluePlayer || !redPlayer) return;

    if (NET.role === 'player') {
        const mySeat = NET.mySeat;
        const myData  = mySeat === 'blue' ? bluePlayer : redPlayer;
        const oppData = mySeat === 'blue' ? redPlayer  : bluePlayer;

        const now = performance.now();

        if (typeof p1 !== 'undefined' && p1) {
            const targetKey = myData.isMelee ? 'knife' : (myData.isSmoke ? 'smoke' : (myData.isFlash ? 'flash' : myData.weapon));
            const currentKey = p1.isMelee ? 'knife' : (p1.isSmoke ? 'smoke' : (p1.isFlash ? 'flash' : p1.weaponKey));
            if (targetKey !== currentKey) {
                applyWeaponToPlayer(p1, targetKey, true);
            }

            const authX = myData.x, authY = myData.y, authZ = myData.z;
            const dx = authX - p1.pos.x;
            const dy = authY - p1.pos.y;
            const dz = authZ - p1.pos.z;
            const errSq = dx * dx + dy * dy + dz * dz;

            const HARD_RESYNC_SQ = 1.0;
            NET._lastDrift = Math.sqrt(errSq);

            const localZipActive = !!(p1.zipline && p1.zipline.active);
            if (errSq > HARD_RESYNC_SQ && !localZipActive) {
                p1.pos.set(authX, authY, authZ);
                p1.vy = 0;
                p1.prevY = authY;
                if (p1._netTargetPos) p1._netTargetPos.set(authX, authY, authZ);

                if (typeof console !== 'undefined') {
                    const nowLog = performance.now();
                    if (!NET._lastHardSyncLogTime || nowLog - NET._lastHardSyncLogTime > 2000) {
                        NET._lastHardSyncLogTime = nowLog;
                        console.log('[net] 客户端位置硬同步，漂移:', NET._lastDrift.toFixed(2), 'm');
                    }
                }
            }

            p1.hp = myData.hp;
            p1.armor = myData.armor;
            p1.score = myData.score;
            p1.ammo = myData.ammo;
            p1.reserve = myData.reserve;
            p1.smokeCharges = myData.smokeCharges;
            p1.flashCharges = myData.flashCharges;
            p1.height = myData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
            p1.eyeH = stanceEye(p1.height);
            p1.meleeIsHeavy = !!myData.meleeIsHeavy;

            p1.reloadEnd     = myData.reloadRemain > 0     ? now + myData.reloadRemain     : 0;
            p1.boltEnd       = myData.boltRemain > 0       ? now + myData.boltRemain       : 0;
            p1.equipEnd      = myData.equipRemain > 0      ? now + myData.equipRemain      : 0;
            p1.meleeEnd      = myData.meleeEndRemain > 0   ? now + myData.meleeEndRemain   : 0;
            p1.meleeRecovery = myData.meleeRecoveryRemain > 0 ? now + myData.meleeRecoveryRemain : 0;

            if (myData.dead) {
                p1.deadUntil = Infinity;
                p1.baseVisible = false;
                p1.aiming = false;
                p1.input.aim = false;
                p1.aimStage = 0;
            } else {
                if (p1.deadUntil === Infinity) p1.deadUntil = 0;
                p1.baseVisible = true;
            }

            p1.throwFuseActive = !!myData.throwFuseActive;
            p1.throwFuseType = myData.throwFuseType || null;
            p1.throwFuseInHand = !!myData.throwFuseInHand;
            if (myData.throwFuseActive && myData.throwFuseEndRemain > 0) {
                p1.throwFuseEnd = now + myData.throwFuseEndRemain;
            } else {
                p1.throwFuseEnd = 0;
            }

            if (myData.flashRemain > 0) {
                p1.flashUntil = now + myData.flashRemain;
            } else {
                p1.flashUntil = 0;
            }
        }

        if (typeof p2 !== 'undefined' && p2) {
            const p2WasOnZipline = !!(p2.zipline && p2.zipline.active);
            const p2IsOnZipline  = !!oppData.ziplineActive;

            if (p2IsOnZipline) {
                if (!p2.zipline) p2.zipline = { active: false, lineIdx: -1, t: 0, dir: 1 };
                p2.zipline.active  = true;
                p2.zipline.lineIdx = oppData.ziplineLineIdx;
                p2.zipline.t       = oppData.ziplineT;
                p2.zipline.dir     = oppData.ziplineDir;

                if (p2._netTargetPos) {
                    p2._netTargetPos.set(oppData.x, oppData.y, oppData.z);
                    p2._netTargetYaw = oppData.yaw;
                }
                p2.pos.set(oppData.x, oppData.y, oppData.z);
                p2.yaw = oppData.yaw;
            } else {
                if (p2WasOnZipline) {
                    if (p2.zipline) p2.zipline.active = false;
                    p2.pos.set(oppData.x, oppData.y, oppData.z);
                    p2.yaw = oppData.yaw;
                    if (p2._netTargetPos) {
                        p2._netTargetPos.set(oppData.x, oppData.y, oppData.z);
                        p2._netTargetYaw = oppData.yaw;
                    }
                }

                if (p2._netTargetPos) {
                    p2._netTargetPos.set(oppData.x, oppData.y, oppData.z);
                    p2._netTargetYaw = oppData.yaw;
                } else {
                    p2.pos.set(oppData.x, oppData.y, oppData.z);
                    p2.yaw = oppData.yaw;
                }
            }

            {
                const snapDx = oppData.x - p2.pos.x;
                const snapDy = oppData.y - p2.pos.y;
                const snapDz = oppData.z - p2.pos.z;
                const snapSq = snapDx * snapDx + snapDy * snapDy + snapDz * snapDz;
                if (snapSq > 25 && !p2IsOnZipline) {
                    p2.pos.set(oppData.x, oppData.y, oppData.z);
                    if (p2._netTargetPos) p2._netTargetPos.set(oppData.x, oppData.y, oppData.z);
                    if (p2._netTargetYaw !== undefined) p2._netTargetYaw = oppData.yaw;

                    p2._prevStepX = p2.pos.x;
                    p2._prevStepZ = p2.pos.z;
                    p2._stepAccum = 0;
                    p2._prevOnGround = true;
                    p2._vyBeforeLand = 0;
                }
            }

            p2.pitch = oppData.pitch;

            if (oppData.onGround !== undefined) {
                p2.onGround = !!oppData.onGround;
            }

            p2.hp = oppData.hp;
            p2.armor = oppData.armor;
            p2.score = oppData.score;
            p2.baseVisible = oppData.visible;
            p2.height = oppData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
            p2.aiming = !!oppData.aiming;
            p2.aimStage = oppData.aimStage || 0;
            p2.meleeIsHeavy = !!oppData.meleeIsHeavy;

            if (oppData.flashRemain > 0) {
                p2.flashUntil = now + oppData.flashRemain;
            } else {
                p2.flashUntil = 0;
            }

            p2.reloadEnd = oppData.reloadRemain > 0 ? now + oppData.reloadRemain : 0;
            p2.boltEnd   = oppData.boltRemain > 0   ? now + oppData.boltRemain   : 0;
            p2.meleeEnd  = oppData.meleeEndRemain > 0 ? now + oppData.meleeEndRemain : 0;
            p2.meleeRecovery = oppData.meleeRecoveryRemain > 0 ? now + oppData.meleeRecoveryRemain : 0;

            if (oppData.dead) {
                p2.deadUntil = Infinity;
                p2.mesh.visible = false;
            } else {
                p2.deadUntil = 0;
                p2.mesh.visible = true;
            }

            const targetKey = oppData.isMelee ? 'knife' : (oppData.isSmoke ? 'smoke' : (oppData.isFlash ? 'flash' : oppData.weapon));
            const currentKey = p2.isMelee ? 'knife' : (p2.isSmoke ? 'smoke' : (p2.isFlash ? 'flash' : p2.weaponKey));
            if (targetKey !== currentKey) {
                applyWeaponToPlayer(p2, targetKey, false);
            }
        }
    } else if (NET.role === 'spectator') {
        NET.spectatorBlueData = bluePlayer;
        NET.spectatorRedData  = redPlayer;
    }
}

function updateSpectatorView(dt) {
    if (NET.role !== 'spectator') return;
    if (!NET.spectatorBlueData || !NET.spectatorRedData) return;
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

    const watching = NET.spectatorTarget;
    const watchData = watching === 'blue' ? NET.spectatorBlueData : NET.spectatorRedData;
    const otherData = watching === 'blue' ? NET.spectatorRedData : NET.spectatorBlueData;
    const otherIsBlue = watching !== 'blue';

    p1.pos.set(watchData.x, watchData.y, watchData.z);
    p1.yaw = watchData.yaw; p1.pitch = watchData.pitch;
    p1.height = watchData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
    p1.eyeH = stanceEye(p1.height);
    p1.hp = watchData.hp; p1.armor = watchData.armor; p1.score = watchData.score;
    p1.ammo = watchData.ammo || 0; p1.reserve = watchData.reserve || 0;
    p1.aiming = !!watchData.aiming; p1.aimStage = watchData.aimStage || 0;
    p1.baseVisible = watchData.visible;
    p1.deadUntil = watchData.dead ? Infinity : 0;
    p1.smokeCharges = watchData.smokeCharges || 0;
    p1.flashCharges = watchData.flashCharges || 0;
    p1.meleeIsHeavy = !!watchData.meleeIsHeavy;
    p1.reloadEnd = watchData.reloadRemain > 0 ? performance.now() + watchData.reloadRemain : 0;
    p1.boltEnd = watchData.boltRemain > 0 ? performance.now() + watchData.boltRemain : 0;
    p1.meleeEnd = watchData.meleeEndRemain > 0 ? performance.now() + watchData.meleeEndRemain : 0;
    p1.flashUntil = watchData.flashRemain > 0 ? performance.now() + watchData.flashRemain : 0;

    const wantKey = watchData.isMelee ? 'knife' : (watchData.isSmoke ? 'smoke' : (watchData.isFlash ? 'flash' : watchData.weapon));
    const curKey = p1.isMelee ? 'knife' : (p1.isSmoke ? 'smoke' : (p1.isFlash ? 'flash' : p1.weaponKey));
    if (wantKey !== curKey) {
        applyWeaponToPlayer(p1, wantKey, true);
    }

    p1.cam.position.set(watchData.x, watchData.y + p1.eyeH, watchData.z);
    p1.cam.rotation.y = watchData.yaw;
    p1.cam.rotation.x = watchData.pitch;

    const targetFov = watchData.fov || BASE_FOV;
    if (Math.abs(p1.cam.fov - targetFov) > 0.05) {
        const k = Math.min(1, (dt || 0.016) * 11);
        p1.cam.fov += (targetFov - p1.cam.fov) * k;
        p1.cam.updateProjectionMatrix();
    }

    p1.mesh.visible = false;

    p2.pos.set(otherData.x, otherData.y, otherData.z);
    p2.yaw = otherData.yaw; p2.pitch = otherData.pitch;
    p2.mesh.position.copy(p2.pos);
    p2.mesh.rotation.y = otherData.yaw;
    p2.hp = otherData.hp;
    p2.armor = otherData.armor;
    p2.score = otherData.score;
    p2.baseVisible = otherData.visible;
    p2.height = otherData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
    p2.mesh.scale.y = p2.height / HEIGHT_STAND;
    p2.mat.color.setHex(otherIsBlue ? 0x3a7bd5 : 0xd54a3a);
    p2.meleeIsHeavy = !!otherData.meleeIsHeavy;
    p2.reloadEnd = otherData.reloadRemain > 0 ? performance.now() + otherData.reloadRemain : 0;
    p2.boltEnd = otherData.boltRemain > 0 ? performance.now() + otherData.boltRemain : 0;
    p2.meleeEnd = otherData.meleeEndRemain > 0 ? performance.now() + otherData.meleeEndRemain : 0;
    p2.flashUntil = otherData.flashRemain > 0 ? performance.now() + otherData.flashRemain : 0;

    const otherKey = otherData.isMelee ? 'knife' : (otherData.isSmoke ? 'smoke' : (otherData.isFlash ? 'flash' : otherData.weapon));
    const p2Key = p2.isMelee ? 'knife' : (p2.isSmoke ? 'smoke' : (p2.isFlash ? 'flash' : p2.weaponKey));
    if (otherKey !== p2Key) {
        applyWeaponToPlayer(p2, otherKey, false);
    }

    if (typeof updateThirdPersonWeapon === 'function') {
        updateThirdPersonWeapon(p1, dt, performance.now());
        updateThirdPersonWeapon(p2, dt, performance.now());
    }

    if (typeof updateSniperViewmodel === 'function') {
        updateSniperViewmodel(p1, dt, performance.now());
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

function handleShootEvent(data) {
    if (data.weapon === 'knife_light' || data.weapon === 'knife_heavy') {
        const isHeavy = data.weapon === 'knife_heavy';
        if (typeof sMelee === 'function') sMelee(isHeavy);
        if (typeof p2 !== 'undefined' && p2) {
            const now = performance.now();
            p2.meleeEnd = now + (isHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs);
            p2.meleeIsHeavy = isHeavy;
        }
        return;
    }

    if (typeof p2 !== 'undefined' && p2) {
        if (p2.muzzle) p2.muzzle.intensity = 2.2;
        if (typeof spawnTracer === 'function'
            && data.sx !== undefined && data.ex !== undefined) {
            spawnTracer(
                new THREE.Vector3(data.sx, data.sy, data.sz),
                new THREE.Vector3(data.ex, data.ey, data.ez)
            );
        }
    }

    switch (data.weapon) {
        case 'sniper': sShootSniper(2); break;
        case 'shotgun': sShootShotgun(2); break;
        case 'odin': sShootOdin(2); break;
        default: sShootRifle(2); break;
    }
}

function getPlayerNameBySeat(seat) {
    if (!seat) return '未知';
    const peerId = seat === 'blue' ? NET.seats.blue
                 : seat === 'red'  ? NET.seats.red
                 : null;
    if (!peerId) return seat === 'blue' ? '蓝方' : '红方';
    if (peerId === NET.myPeerId) return '你';
    const m = NET.members.get(peerId);
    return (m && m.name) || (seat === 'blue' ? '蓝方' : '红方');
}

function handleKillEvent(data) {
    if (typeof sKill  === 'function') sKill(1);
    if (typeof sDeath === 'function') sDeath();

    const mySeat     = NET.mySeat;
    const isMePlayer = (mySeat === 'blue' || mySeat === 'red');
    const isSuicide  = (data.killerSeat && data.killerSeat === data.victimSeat);
    const iAmKiller  = isMePlayer && !isSuicide && (data.killerSeat === mySeat);
    const iAmVictim  = isMePlayer && (data.victimSeat === mySeat);

    if (NET.role === 'spectator') {
        if (data.victimSeat === NET.spectatorTarget) {
            if (typeof p1 !== 'undefined' && p1) {
                p1.hp = 0;
                p1.deadUntil = Infinity;
                p1.baseVisible = false;
            }
        } else if (typeof p2 !== 'undefined' && p2) {
            p2.hp = 0;
            p2.deadUntil = Infinity;
            p2.baseVisible = false;
            p2.mesh.visible = false;
        }
    } else if (iAmVictim && typeof p1 !== 'undefined' && p1) {
        p1.hp = 0;
        p1.deadUntil = Infinity;
        p1.baseVisible = false;
        p1.aiming = false;
        if (p1.input) p1.input.aim = false;
        p1.flashUntil = 0;
    } else if (iAmKiller && typeof p2 !== 'undefined' && p2) {
        p2.hp = 0;
        p2.deadUntil = Infinity;
        p2.baseVisible = false;
        p2.mesh.visible = false;
        p2.flashUntil = 0;
    } else if (typeof p2 !== 'undefined' && p2) {
        p2.hp = 0;
        p2.deadUntil = Infinity;
        p2.baseVisible = false;
        p2.mesh.visible = false;
        p2.flashUntil = 0;
    }

    if (isSuicide) {
        const victimName = getPlayerNameBySeat(data.victimSeat);
        if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
            feed(p1, `<b style="color:#ff7a6d">${victimName}</b> 自我击杀（自爆）`);
        }
    } else {
        const killerName = getPlayerNameBySeat(data.killerSeat);
        const victimName = getPlayerNameBySeat(data.victimSeat);
        const kc = data.killerSeat === 'blue' ? '#6db3ff' : '#ff7a6d';
        const vc = data.victimSeat === 'blue' ? '#6db3ff' : '#ff7a6d';
        const html = `<b style="color:${kc}">${killerName}</b> 击杀了 <b style="color:${vc}">${victimName}</b>`;
        if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
            feed(p1, html);
        }
    }

    if (typeof showRoundReport === 'function'
        && data.dmgByKiller && data.dmgByVictim) {

        let attacker, victim;
        if (NET.role === 'spectator') {
            if (data.killerSeat === NET.spectatorTarget) {
                attacker = p1; victim = p2;
            } else {
                attacker = p2; victim = p1;
            }
        } else if (isMePlayer) {
            if (iAmKiller) { attacker = p1; victim = p2; }
            else           { attacker = p2; victim = p1; }
        } else {
            attacker = p1; victim = p2;
        }

        window.showRoundReport(
            data.roundNumber || 1,
            attacker, victim,
            data.dmgByKiller, data.dmgByVictim,
            data.killerSeat, data.victimSeat
        );
    }
}

function handleRoundEvent(data) {
    const prevState = (typeof gameState !== 'undefined') ? gameState : null;

    if (typeof gameState !== 'undefined') gameState = data.gameState;
    if (typeof stateEndTime !== 'undefined') stateEndTime = performance.now() + data.remain;
    if (typeof roundNumber !== 'undefined' && data.roundNumber) roundNumber = data.roundNumber;

    if (data.gameState === 'combat' && prevState === 'prep') {
        if (window.closeCombatReport) window.closeCombatReport();
        const panel = document.getElementById('weaponPanel');
        if (panel) panel.style.display = 'none';
        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice
            && typeof renderer !== 'undefined' && running) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            if (NET.role === 'spectator') return;
            if (document.pointerLockElement !== renderer.domElement) {
                renderer.domElement.requestPointerLock();
            }
        }
    }

    if (data.gameState === 'idle' && prevState !== 'idle') {
        if (typeof running !== 'undefined' && running
            && typeof endMatch === 'function') {

            if (data.blueScore !== undefined && data.redScore !== undefined
                && typeof NET !== 'undefined') {

                if (NET.role === 'spectator') {
                    const p1IsBlue = (NET.spectatorTarget === 'blue');
                    if (p1IsBlue) {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.blueScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.redScore;
                    } else {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.redScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.blueScore;
                    }
                } else {
                    if (NET.mySeat === 'blue') {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.blueScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.redScore;
                    } else {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.redScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.blueScore;
                    }
                }
            }

            let winner = null;
            if (typeof p1 !== 'undefined' && typeof p2 !== 'undefined') {
                if (p1.score > p2.score) winner = p1;
                else if (p2.score > p1.score) winner = p2;
            }

            endMatch(winner);
        }
        return;
    }

    if (data.reset) {
        if (typeof clearAllSmokes === 'function') clearAllSmokes();
        if (typeof clearAllFlashes === 'function') clearAllFlashes();
        if (typeof clearAllBulletHoles === 'function') clearAllBulletHoles();

        if (typeof window.resetBarrels === 'function') window.resetBarrels();
        if (typeof clearAllShellCasings === 'function') clearAllShellCasings();

        if (typeof p1 !== 'undefined' && p1) p1.flashUntil = 0;
        if (typeof p2 !== 'undefined' && p2) p2.flashUntil = 0;

        if (typeof resetPlayer === 'function') {
            if (typeof p1 !== 'undefined' && p1) resetPlayer(p1, performance.now());
            if (typeof p2 !== 'undefined' && p2) resetPlayer(p2, performance.now());
        } else {
            if (typeof p1 !== 'undefined' && p1) { p1.deadUntil = 0; p1.hp = 100; p1.baseVisible = true; }
            if (typeof p2 !== 'undefined' && p2) { p2.deadUntil = 0; p2.hp = 100; p2.baseVisible = true; }
        }

        _clientPlayerState.blue = null;
        _clientPlayerState.red  = null;
        _lastLowFreqBlue._init = false;
        _lastLowFreqRed._init = false;
        NET._lastSentInput = null;

        NET.pendingZiplineMount = null;
        NET.pendingZiplineDismount = false;
        NET.pendingVulnerableStart = null;
    }
}

function handleDamageEvent(data) {
    if (data.target === 'p2' && NET.role === 'player') {
        if (typeof p1 !== 'undefined' && typeof dmgFlash === 'function') dmgFlash(p1);
        if (typeof sHit === 'function') sHit(1);
    }
}

window.NET_sendDamageEvent = function (target, dmg) {
    if (!NET.isHost) return;
    broadcast({ type: 'damageEvent', target, dmg });
};

window.NET_sendKillEvent = function (killerSeat, victimSeat, round, dmgByKiller, dmgByVictim) {
    if (!NET.isHost) return;
    broadcast({
        type: 'killEvent',
        killerSeat: killerSeat || null,
        victimSeat: victimSeat || null,
        roundNumber: round,
        dmgByKiller: dmgByKiller || { body: 0, head: 0, leg: 0, total: 0 },
        dmgByVictim: dmgByVictim || { body: 0, head: 0, leg: 0, total: 0 }
    });
};

window.NET_sendRoundEvent = function (gameStateStr, remain, reset, roundNum, extra) {
    if (!NET.isHost) return;
    const packet = {
        type: 'roundEvent',
        gameState: gameStateStr,
        remain,
        reset,
        roundNumber: roundNum,
    };
    if (extra) {
        if (extra.blueScore !== undefined) packet.blueScore = extra.blueScore;
        if (extra.redScore  !== undefined) packet.redScore  = extra.redScore;
    }
    broadcast(packet);
};

// ============================================================
// ★ 客户端上报
// ============================================================
window.NET_sendClientInput = function () {
    if (NET.isHost || NET.role !== 'player') return;
    if (!NET.roomId) return;
    if (typeof p1 === 'undefined' || !p1) return;

    const inp = p1.input;

    const hasPending = NET.pendingWeaponSwitch || NET.pendingReload
        || NET.pendingFuseStart || NET.pendingFuseRelease
        || NET.pendingMelee
        || NET.pendingZiplineMount || NET.pendingZiplineDismount
        || NET.pendingVulnerableStart;

    const last = NET._lastSentInput;
    const changed = !last
        || last.f !== inp.forward || last.r !== inp.right
        || last.j !== inp.jump || last.c !== inp.crouch
        || last.fire !== inp.fire || last.aim !== inp.aim
        || Math.abs(last.yaw   - p1.yaw)   > 0.0008
        || Math.abs(last.pitch - p1.pitch) > 0.0008
        || last.aimStage !== p1.aimStage
        || hasPending;

    if (!changed) return;

    NET._lastSentInput = {
        f: inp.forward, r: inp.right,
        j: inp.jump,    c: inp.crouch,
        fire: inp.fire, aim: inp.aim,
        yaw: p1.yaw, pitch: p1.pitch,
        aimStage: p1.aimStage
    };

    sendToHost({
        type: 'clientInput',
        seq: NET.inputSeq++,
        input: {
            forward: inp.forward,
            right: inp.right,
            jump: inp.jump,
            crouch: inp.crouch,
            fire: inp.fire,
            aim: inp.aim
        },
        yaw: p1.yaw,
        pitch: p1.pitch,
        aimStage: p1.aimStage,

        weaponSwitch: NET.pendingWeaponSwitch,
        reload: NET.pendingReload,
        fuseStart: NET.pendingFuseStart,
        fuseRelease: NET.pendingFuseRelease,
        melee: NET.pendingMelee,
        meleeHeavy: NET.pendingMeleeHeavy,

        ziplineMount: NET.pendingZiplineMount,
        ziplineDismount: NET.pendingZiplineDismount,
        vulnerableStart: NET.pendingVulnerableStart
    });

    NET.pendingWeaponSwitch = null;
    NET.pendingReload = false;
    NET.pendingFuseStart = null;
    NET.pendingFuseRelease = false;
    NET.pendingMelee = false;
    NET.pendingMeleeHeavy = false;

    NET.pendingZiplineMount = null;
    NET.pendingZiplineDismount = false;
    NET.pendingVulnerableStart = null;
};

window.NET_sendChat = function (text) {
    if (!NET.roomId) return;
    if (NET.isHost) broadcast({ type: 'chat', text: text });
    else sendToHost({ type: 'chat', text: text });
};