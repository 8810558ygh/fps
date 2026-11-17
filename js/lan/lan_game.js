// ===== js/lan/lan_game.js – 局域网团队战客户端 =====

const LAN = {
    active: false,
    selfId: null,
    selfName: '',
    room: null,
    phase: 'lobby',
    round: 0,
    blueScore: 0,
    redScore: 0,
    mapId: 'battlefield',
    models: new Map(),
    playerStates: new Map(),
    nextRemoteNumericId: 100,
    lastStateSentAt: 0,
    lastRoundKey: null,
    spectateNetId: null,
    lastDeathNoticeAt: 0,
};

window.LAN = LAN;

const LAN_TEAM_COLORS = {
    blue: 0x3a7bd5,
    red: 0xd54a3a,
};

const LAN_SPAWN_OFFSETS = [
    [0, 0],
    [-2.0, 1.7],
    [2.0, 1.7],
    [-2.2, -1.7],
    [2.2, -1.7],
];

function _lanEl(id) {
    return document.getElementById(id);
}

function _lanNameHtml(name) {
    return String(name || '玩家')
        .replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;',
        }[c]));
}

function lanNotify(text, duration = 1800) {
    const el = _lanEl('lanNotice');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

function _lanPlayerName(id) {
    const player = LAN.room && LAN.room.players
        ? LAN.room.players.find(p => p.id === id)
        : null;
    return player ? player.name : (id === LAN.selfId ? LAN.selfName : '玩家');
}

function _lanPlayerByIdFromSnapshot(id) {
    return LAN.playerStates.get(id) || null;
}

function _lanTeamColor(team) {
    return LAN_TEAM_COLORS[team] || 0xffffff;
}

function _lanPrepareHitMeshes(player) {
    if (!player || typeof getPlayerHitMeshes !== 'function') return;
    const meshes = getPlayerHitMeshes(player);
    for (const mesh of meshes) {
        if (mesh) mesh.userData.lanPlayerRef = player;
    }
    player.netId = player.netId || (player === p1 ? LAN.selfId : player.netId);
    player.team = player === p1 ? LAN.playerStates.get(LAN.selfId)?.team : player.team;
}

function _lanRenderLobby(room) {
    LAN.room = room;
    if (!room) return;

    const me = room.players.find(p => p.id === LAN.selfId);
    const isOwner = room.ownerId === LAN.selfId;
    const codeEl = _lanEl('lanRoomCode');
    if (codeEl) codeEl.textContent = room.code;

    const mapNames = {
        battlefield: '战场',
        desert: '沙漠',
        indoor_complex: '设备间',
    };
    const mapEl = _lanEl('lanRoomMap');
    if (mapEl) mapEl.textContent = `地图：${mapNames[room.mapId] || room.mapId}`;

    const owner = room.players.find(p => p.id === room.ownerId);
    const ownerEl = _lanEl('lanRoomOwner');
    if (ownerEl) ownerEl.textContent = `房主：${owner ? owner.name : '-'}`;
    const pingEl = _lanEl('lanRoomPing');
    if (pingEl) pingEl.textContent = `延迟：${LANNET.latency || '-'}ms`;

    for (const team of ['blue', 'red']) {
        const list = _lanEl(team === 'blue' ? 'lanBlueList' : 'lanRedList');
        const count = _lanEl(team === 'blue' ? 'lanBlueCount' : 'lanRedCount');
        const players = room.players.filter(p => p.team === team);
        if (count) count.textContent = `${players.length} / 5`;
        if (!list) continue;
        list.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const player = players[i];
            if (!player) {
                const empty = document.createElement('div');
                empty.className = 'lan-empty-slot';
                empty.textContent = `空位 ${i + 1}`;
                list.appendChild(empty);
                continue;
            }
            const row = document.createElement('div');
            row.className = 'lan-player-row' + (player.id === LAN.selfId ? ' me' : '');
            row.innerHTML = `
                <span>${player.team === 'blue' ? '🔵' : '🔴'}</span>
                <span>${_lanNameHtml(player.name)}</span>
                ${player.owner ? '<span class="owner-tag">房主</span>' : ''}
                ${player.ready ? '<span class="ready-tag">已准备</span>' : ''}
            `;
            list.appendChild(row);
        }
    }

    if (_lanEl('lanReadyBtn')) {
        _lanEl('lanReadyBtn').textContent = me && me.ready ? '取消准备' : '准 备';
    }
    if (_lanEl('lanStartBtn')) {
        const blueCount = room.players.filter(p => p.team === 'blue').length;
        const redCount = room.players.filter(p => p.team === 'red').length;
        const allReady = room.players.length >= 2 && room.players.every(p => p.ready);
        _lanEl('lanStartBtn').style.display = isOwner ? '' : 'none';
        _lanEl('lanStartBtn').disabled = !(blueCount > 0 && redCount > 0 && allReady);
    }
}

function lanShowLobby() {
    if (!LANNET.connected) LANNET.connect();
    const serverHint = _lanEl('lanServerHint');
    if (serverHint) {
        serverHint.textContent = window.electronAPI
            ? '房主点击创建房间后分享房间码；其他玩家在同一局域网内输入房间码即可加入。'
            : '请通过主机启动的局域网地址打开游戏。房间状态与回合由局域网服务器统一管理。';
    }
    if (_lanEl('lobbyOverlay')) _lanEl('lobbyOverlay').style.display = 'none';
    if (_lanEl('lanLobbyOverlay')) _lanEl('lanLobbyOverlay').style.display = 'flex';
    if (_lanEl('lanEntrySection')) _lanEl('lanEntrySection').style.display = LAN.room ? 'none' : 'flex';
    if (_lanEl('lanRoomSection')) _lanEl('lanRoomSection').style.display = LAN.room ? 'block' : 'none';
    if (LAN.room) _lanRenderLobby(LAN.room);
}

function _lanHideLobby() {
    if (_lanEl('lanLobbyOverlay')) _lanEl('lanLobbyOverlay').style.display = 'none';
}

function _lanShowRoom() {
    if (_lanEl('lanEntrySection')) _lanEl('lanEntrySection').style.display = 'none';
    if (_lanEl('lanRoomSection')) _lanEl('lanRoomSection').style.display = 'block';
    if (_lanEl('lanLobbyOverlay')) _lanEl('lanLobbyOverlay').style.display = 'flex';
}

function _lanSetRoomMessage(text) {
    const el = _lanEl('lanRoomMessage');
    if (el) el.textContent = text || '';
}

function _lanCreateRoom() {
    const mapId = typeof getCurrentMapId === 'function' ? getCurrentMapId() : 'battlefield';
    if (!LANNET.send({ type: 'createRoom', mapId })) {
        _lanSetRoomMessage('尚未连接局域网服务器');
    }
}

async function _lanJoinRoom() {
    const input = _lanEl('lanRoomCodeInput');
    const code = input ? input.value.trim().toUpperCase() : '';
    if (!code) {
        _lanSetRoomMessage('请输入房间码');
        return;
    }
    if (window.electronAPI) {
        _lanSetRoomMessage('正在局域网中搜索房间…');
        const resolved = await LANNET.connectToRoom(code);
        if (!resolved) {
            _lanSetRoomMessage('没有找到该房间，请确认房主已创建房间且双方在同一局域网');
            return;
        }
    }
    if (!LANNET.send({ type: 'joinRoom', code })) {
        _lanSetRoomMessage('尚未连接局域网服务器');
    } else {
        _lanSetRoomMessage('');
    }
}

function _lanSelfLobbyPlayer() {
    return LAN.room && LAN.room.players
        ? LAN.room.players.find(p => p.id === LAN.selfId)
        : null;
}

function _lanBindUI() {
    const on = (id, fn) => {
        const el = _lanEl(id);
        if (el) el.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof audio === 'function') audio();
            fn();
        });
    };

    on('lanBackBtn', () => {
        _lanHideLobby();
        if (_lanEl('lobbyOverlay')) _lanEl('lobbyOverlay').style.display = 'flex';
    });
    on('lanCreateBtn', _lanCreateRoom);
    on('lanJoinBtn', _lanJoinRoom);
    on('lanSwitchBlue', () => LANNET.send({ type: 'switchTeam', team: 'blue' }));
    on('lanSwitchRed', () => LANNET.send({ type: 'switchTeam', team: 'red' }));
    on('lanReadyBtn', () => {
        const me = _lanSelfLobbyPlayer();
        if (me) LANNET.send({ type: 'ready', ready: !me.ready });
    });
    on('lanStartBtn', () => LANNET.send({ type: 'startMatch' }));
    on('lanLeaveRoomBtn', () => {
        location.reload();
    });
    on('lanReturnRoomBtn', () => {
        LANNET.send({ type: 'returnLobby' });
        _lanEl('lanEndOverlay').style.display = 'none';
        lanShowLobby();
    });

    const codeInput = _lanEl('lanRoomCodeInput');
    if (codeInput) {
        codeInput.addEventListener('keydown', e => {
            if (e.code === 'Enter') _lanJoinRoom();
        });
    }
}

function _lanGetSpawn(team, slot) {
    const spawns = window.currentMapSpawns || {
        p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
        p2: { x: 21, z: 21, yaw: Math.PI / 4 },
    };
    const base = team === 'blue' ? spawns.p1 : spawns.p2;
    const offset = LAN_SPAWN_OFFSETS[slot % LAN_SPAWN_OFFSETS.length];
    const half = typeof window.currentArenaHalf === 'number' ? window.currentArenaHalf : ARENA;
    const x = Math.max(-half + 1.5, Math.min(half - 1.5, base.x + offset[0]));
    const z = Math.max(-half + 1.5, Math.min(half - 1.5, base.z + offset[1]));
    return { x, z, yaw: base.yaw };
}

function _lanDisposeRemote(player) {
    if (!player) return;
    if (window.PHYSICS && player) {
        try { window.PHYSICS.removePlayerBody(player); } catch {}
    }
    if (player.mesh && player.mesh.parent) player.mesh.parent.remove(player.mesh);
    if (player.cam && player.cam.parent) player.cam.parent.remove(player.cam);
    if (player.mat) player.mat.dispose();
}

function _lanClearRemotes() {
    for (const player of LAN.models.values()) _lanDisposeRemote(player);
    LAN.models.clear();
    LAN.playerStates.clear();
}

function _lanInstallSimpleWeapon(player) {
    if (!player || !player.gunHolder) return;
    while (player.gunHolder.children.length) {
        player.gunHolder.remove(player.gunHolder.children[0]);
    }
    if (player.vm) {
        while (player.vm.children.length) player.vm.remove(player.vm.children[0]);
    }

    const group = new THREE.Group();
    group.name = 'lanSimpleWeapon';
    const dark = new THREE.MeshLambertMaterial({ color: 0x171c22 });
    const accent = new THREE.MeshLambertMaterial({ color: 0x384552 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.48), dark);
    receiver.position.z = -0.10;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.36), accent);
    barrel.position.set(0, 0.01, -0.48);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.10), dark);
    magazine.position.set(0, -0.13, -0.05);
    group.add(receiver, barrel, magazine);
    group.traverse(o => {
        if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
        }
    });
    player.gunHolder.add(group);
    player._lanSimpleWeapon = group;
    player.gunHolder.visible = true;
    if (player.muzzle) player.muzzle.visible = false;
}

function _lanEnsureRemote(state) {
    let player = LAN.models.get(state.id);
    if (player) return player;
    const spawn = _lanGetSpawn(state.team, state.spawnSlot || 0);
    player = makePlayer(
        LAN.nextRemoteNumericId++,
        _lanTeamColor(state.team),
        spawn,
        state.weapon || 'rifle',
        true
    );
    player.netId = state.id;
    player.team = state.team;
    player.name = state.name;
    player._lanRemote = true;
    player._shadowDisabled = true;
    _lanInstallSimpleWeapon(player);
    player.mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    player._netTargetPos = player.pos.clone();
    player._netTargetYaw = player.yaw;
    player._netTargetHeight = HEIGHT_STAND;
    _lanPrepareHitMeshes(player);
    LAN.models.set(state.id, player);
    return player;
}

function _lanApplyRoundSpawn(players) {
    const roundKey = `${LAN.round}:${LAN.phase}`;
    if (LAN.lastRoundKey === roundKey) return;
    LAN.lastRoundKey = roundKey;
    if (LAN.phase !== 'prep') return;

    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (typeof clearDamageNumbers === 'function') clearDamageNumbers();
    if (typeof resetBarrels === 'function') resetBarrels();

    const now = performance.now();
    for (const state of players) {
        const spawn = _lanGetSpawn(state.team, state.spawnSlot || 0);
        if (state.id === LAN.selfId) {
            p1.spawn.x = spawn.x;
            p1.spawn.z = spawn.z;
            p1.spawn.yaw = spawn.yaw;
            resetPlayer(p1, now);
            p1.netId = LAN.selfId;
            p1.team = state.team;
            p1.mat.color.setHex(_lanTeamColor(state.team));
            _lanPrepareHitMeshes(p1);
            LAN.spectateNetId = null;
        } else {
            const remote = _lanEnsureRemote(state);
            remote.pos.set(spawn.x, terrainGroundAt(spawn.x, spawn.z), spawn.z);
            remote.yaw = spawn.yaw;
            remote._netTargetPos.copy(remote.pos);
            remote._netTargetYaw = spawn.yaw;
            remote.deadUntil = 0;
            remote.baseVisible = true;
            remote.mesh.position.copy(remote.pos);
            remote.mesh.rotation.y = remote.yaw;
        }
    }

    gameState = 'prep';
    lanNotify('回合准备');
}

function _lanSyncSelf(state, players) {
    LAN.playerStates.set(state.id, state);
    p1.netId = LAN.selfId;
    p1.team = state.team;
    p1.maxHp = HP_MAX;
    p1.hp = state.hp;
    p1.armor = state.armor;
    p1.mat.color.setHex(_lanTeamColor(state.team));
    _lanPrepareHitMeshes(p1);

    if (state.alive) {
        if (p1.deadUntil === Infinity) {
            p1.deadUntil = 0;
            p1.baseVisible = true;
            p1.hp = state.hp;
        }
    } else {
        if (p1.deadUntil !== Infinity && performance.now() - LAN.lastDeathNoticeAt > 500) {
            LAN.lastDeathNoticeAt = performance.now();
            lanNotify('你已阵亡 · 正在观战队友', 2500);
        }
        p1.hp = 0;
        p1.deadUntil = Infinity;
        p1.baseVisible = false;
        p1.aiming = false;
        p1.aimStage = 0;
        if (p1.input) {
            p1.input.fire = false;
            p1.input.aim = false;
            p1.input.forward = 0;
            p1.input.right = 0;
        }
        if (typeof mouse !== 'undefined') {
            mouse.leftDown = false;
            mouse.aim = false;
        }
    }
}

function _lanSyncRemote(state) {
    LAN.playerStates.set(state.id, state);
    const player = _lanEnsureRemote(state);
    player.team = state.team;
    player.name = state.name;
    player.hp = state.hp;
    player.armor = state.armor;
    const now = performance.now();
    if (player._netLastPacketAt && !player._netVelocity) {
        player._netVelocity = new THREE.Vector3();
    }
    if (player._netLastPacketAt && player._netVelocity) {
        const elapsed = Math.max(0.016, Math.min(0.2, (now - player._netLastPacketAt) / 1000));
        player._netVelocity.set(
            (state.x - player._netTargetPos.x) / elapsed,
            (state.y - player._netTargetPos.y) / elapsed,
            (state.z - player._netTargetPos.z) / elapsed
        );
    }
    player._netLastPacketAt = now;
    player._netTargetPos.set(state.x, state.y, state.z);
    player._netTargetYaw = state.yaw;
    player._netTargetHeight = state.height;
    player.pitch = state.pitch;
    player.aiming = state.weapon !== 'knife';
    player.baseVisible = state.alive;
    player.deadUntil = state.alive ? 0 : Infinity;
    player.mesh.visible = state.alive;

    player.weaponKey = state.weapon || player.weaponKey;
    player.isMelee = state.weapon === 'knife';
    player.isSmoke = state.weapon === 'smoke';
    player.isFlash = state.weapon === 'flash';
    player.isMedkit = state.weapon === 'medkit';
}

function _lanUpdateHUD(msg) {
    LAN.phase = msg.phase;
    LAN.round = msg.round;
    LAN.blueScore = msg.blueScore;
    LAN.redScore = msg.redScore;
    LAN.mapId = msg.mapId || LAN.mapId;

    if (_lanEl('lanBlueScore')) _lanEl('lanBlueScore').textContent = msg.blueScore;
    if (_lanEl('lanRedScore')) _lanEl('lanRedScore').textContent = msg.redScore;
    if (_lanEl('lanRoundNumber')) _lanEl('lanRoundNumber').textContent = `第 ${msg.round} 回合`;

    const players = msg.players || [];
    const blueAlive = players.filter(p => p.team === 'blue' && p.alive).length;
    const redAlive = players.filter(p => p.team === 'red' && p.alive).length;
    if (_lanEl('lanBlueAlive')) _lanEl('lanBlueAlive').textContent = `存活 ${blueAlive}`;
    if (_lanEl('lanRedAlive')) _lanEl('lanRedAlive').textContent = `存活 ${redAlive}`;

    const timer = _lanEl('lanRoundTimer');
    if (timer) {
        const seconds = Math.max(0, msg.phaseRemain / 1000).toFixed(1);
        timer.textContent = msg.phase === 'prep' ? `准备 ${seconds}s`
            : msg.phase === 'round' ? `战斗 ${seconds}s`
            : msg.phase === 'roundEnd' ? '回合结束'
            : '比赛结束';
    }
}

function _lanHandleSnapshot(msg) {
    if (!LAN.active) return;

    const players = Array.isArray(msg.players) ? msg.players : [];
    for (const state of players) {
        if (state.id === LAN.selfId) _lanSyncSelf(state, players);
        else _lanSyncRemote(state);
    }

    const liveIds = new Set(players.map(p => p.id));
    for (const [id, player] of LAN.models) {
        if (!liveIds.has(id)) {
            _lanDisposeRemote(player);
            LAN.models.delete(id);
            LAN.playerStates.delete(id);
        }
    }

    LAN.phase = msg.phase;
    LAN.round = msg.round;
    LAN.lastSnapshotAt = performance.now();
    gameState = msg.phase === 'round' ? 'combat'
        : (msg.phase === 'prep' ? 'prep'
        : (msg.phase === 'roundEnd' ? 'roundEnd' : gameState));
    stateEndTime = performance.now() + Math.max(0, msg.phaseRemain || 0);
    roundNumber = msg.round || roundNumber;
    _lanApplyRoundSpawn(players);
    _lanUpdateHUD(msg);
}

function lanStartMatch(mapId) {
    LAN.active = true;
    LAN.mapId = mapId || LAN.mapId;
    _lanClearRemotes();
    LAN.lastRoundKey = null;
    LAN.nextRemoteNumericId = 100;
    LAN.spectateNetId = null;

    _lanHideLobby();
    if (_lanEl('lanEndOverlay')) _lanEl('lanEndOverlay').style.display = 'none';
    if (_lanEl('lanMatchHud')) _lanEl('lanMatchHud').style.display = 'grid';
    if (_lanEl('timer')) _lanEl('timer').style.display = 'none';
    if (_lanEl('exitBtn')) _lanEl('exitBtn').style.display = 'none';
    if (_lanEl('endOverlay')) _lanEl('endOverlay').style.display = 'none';

    p2.baseVisible = false;
    p2.mesh.visible = false;
    p2.vm.visible = false;
    if (p2.muzzle) p2.muzzle.visible = false;
    if (typeof GAME_setMode === 'function') GAME_setMode('lan');

    if (getCurrentMapId() !== LAN.mapId && typeof loadMap === 'function') {
        loadMap(LAN.mapId);
    }
    if (typeof PERF_ReapplyMapQuality === 'function') PERF_ReapplyMapQuality();
    if (typeof clearAllSmokes === 'function') clearAllSmokes();
    if (typeof clearAllFlashes === 'function') clearAllFlashes();
    if (typeof clearAllBulletHoles === 'function') clearAllBulletHoles();
    if (typeof resetBarrels === 'function') resetBarrels();

    p1.score = 0;
    roundNumber = 1;
    gameState = 'prep';
    running = true;
    matchStart = performance.now();
    document.body.classList.add('in-game');
    if (typeof setOver === 'function') setOver(false);
    if (typeof enterFullscreenAndLock === 'function') enterFullscreenAndLock();
    lanNotify('比赛开始 · 双方准备', 1600);
}

function _lanMatchEnd(msg) {
    running = false;
    gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (typeof setOver === 'function') setOver(true);
    if (_lanEl('lanMatchHud')) _lanEl('lanMatchHud').style.display = 'none';
    if (_lanEl('timer')) _lanEl('timer').style.display = '';

    const title = _lanEl('lanEndTitle');
    if (title) {
        title.textContent = msg.winnerTeam === 'blue' ? '蓝队获胜'
            : msg.winnerTeam === 'red' ? '红队获胜' : '平局';
        title.style.color = msg.winnerTeam === 'blue' ? '#6db3ff'
            : msg.winnerTeam === 'red' ? '#ff7568' : '#ffd24a';
    }
    if (_lanEl('lanEndScore')) _lanEl('lanEndScore').textContent = `${msg.blueScore} : ${msg.redScore}`;
    if (_lanEl('lanReturnRoomBtn')) {
        _lanEl('lanReturnRoomBtn').disabled = !(LAN.room && LAN.room.ownerId === LAN.selfId);
        _lanEl('lanReturnRoomBtn').textContent = _lanEl('lanReturnRoomBtn').disabled
            ? '等待房主返回房间' : '返回房间';
    }
    if (_lanEl('lanEndOverlay')) _lanEl('lanEndOverlay').style.display = 'flex';
    document.body.classList.remove('in-game');
}

function _lanHandleEvent(msg) {
    if (msg.type === 'damage') {
        if (msg.targetId === LAN.selfId) {
            p1.hp = msg.hp;
            p1.armor = msg.armor;
            if (typeof dmgFlash === 'function') dmgFlash(p1);
            if (typeof sHit === 'function') sHit(1);
        }
        if (msg.attackerId === LAN.selfId && msg.targetId !== LAN.selfId) {
            if (typeof hitmark === 'function') hitmark(p1);
            if (typeof sHit === 'function') sHit(1);
        }
        return;
    }

    if (msg.type === 'kill') {
        const attacker = _lanPlayerName(msg.attackerId);
        const target = _lanPlayerName(msg.targetId);
        if (typeof feed === 'function') {
            feed(p1, `<b>${_lanNameHtml(attacker)}</b> 击杀了 <b>${_lanNameHtml(target)}</b>`);
        }
        return;
    }

    if (msg.type === 'barrel') {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if (typeof hideBarrelAt === 'function') hideBarrelAt(x, y, z);
        if (typeof spawnExplosionVisual === 'function') spawnExplosionVisual(x, y, z);
        if (typeof emitWorldSound === 'function') emitWorldSound('explosion', x, y, z, false);
        return;
    }

    if (msg.type === 'fx') {
        const p = msg.payload || {};
        if (msg.kind === 'smoke' && typeof spawnSmokeProjectile === 'function') {
            spawnSmokeProjectile(
                new THREE.Vector3(p.px, p.py, p.pz),
                new THREE.Vector3(p.vx, p.vy, p.vz),
                p.fuseMs, performance.now(), p.id, p.team
            );
        } else if (msg.kind === 'flash' && typeof spawnFlashProjectile === 'function') {
            spawnFlashProjectile(
                new THREE.Vector3(p.px, p.py, p.pz),
                new THREE.Vector3(p.vx, p.vy, p.vz),
                p.fuseMs, performance.now(), p.id
            );
        }
        return;
    }

    if (msg.type === 'shotVisual') {
        const p = msg.payload || {};
        const sound = msg.weapon === 'sniper' ? 'sniper'
            : msg.weapon === 'shotgun' ? 'shotgun'
            : msg.weapon === 'odin' ? 'odin' : 'rifle';
        if (typeof emitWorldSound === 'function') {
            emitWorldSound(sound, p.sx, p.sy, p.sz, false);
        }
        if (Number.isFinite(p.sx) && Number.isFinite(p.ex)
            && typeof spawnTracer === 'function') {
            spawnTracer(
                new THREE.Vector3(p.sx, p.sy, p.sz),
                new THREE.Vector3(p.ex, p.ey, p.ez)
            );
        }
    }
}

window.LAN_handleMessage = function (msg) {
    if (msg.type === 'welcome') {
        LAN.selfId = msg.id;
        return;
    }
    if (msg.type === 'hello') {
        LAN.selfId = msg.id || LAN.selfId;
        LAN.selfName = msg.name || LAN.selfName;
        return;
    }
    if (msg.type === 'error') {
        _lanSetRoomMessage(msg.message || '操作失败');
        return;
    }
    if (msg.type === 'lobby') {
        LAN.room = msg.room;
        if (msg.room && msg.room.phase === 'lobby') {
            LAN.active = false;
            if (running) return;
            if (_lanEl('lanMatchHud')) _lanEl('lanMatchHud').style.display = 'none';
            if (_lanEl('timer')) _lanEl('timer').style.display = '';
            _lanShowRoom();
            _lanRenderLobby(msg.room);
        }
        return;
    }
    if (msg.type === 'matchStart') {
        lanStartMatch(msg.mapId);
        return;
    }
    if (msg.type === 'snapshot') {
        _lanHandleSnapshot(msg);
        return;
    }
    if (msg.type === 'damage' || msg.type === 'kill' || msg.type === 'barrel'
        || msg.type === 'fx' || msg.type === 'shotVisual') {
        _lanHandleEvent(msg);
        return;
    }
    if (msg.type === 'chat') {
        if (typeof addChatMessage === 'function') {
            addChatMessage(2, `${msg.fromName || '玩家'}：${msg.text || ''}`);
        }
        return;
    }
    if (msg.type === 'round') {
        LAN.phase = msg.phase;
        LAN.round = msg.round;
        LAN.blueScore = msg.blueScore ?? LAN.blueScore;
        LAN.redScore = msg.redScore ?? LAN.redScore;
        if (msg.phase === 'prep') lanNotify('新回合准备', 1200);
        if (msg.phase === 'round') lanNotify('开始交战', 900);
        return;
    }
    if (msg.type === 'roundEnd') {
        LAN.phase = 'roundEnd';
        LAN.blueScore = msg.blueScore;
        LAN.redScore = msg.redScore;
        lanNotify(msg.winnerTeam === 'blue' ? '蓝队获得回合分'
            : msg.winnerTeam === 'red' ? '红队获得回合分' : '双方全灭 · 平局', 2300);
        return;
    }
    if (msg.type === 'matchEnd') {
        _lanMatchEnd(msg);
    }
};

function LAN_mainTick(dt, now) {
    if (!LAN.active || !running) return;
    if (now - LAN.lastStateSentAt >= 33) {
        LAN.lastStateSentAt = now;
        LANNET.send({
            type: 'state',
            x: p1.pos.x,
            y: p1.pos.y,
            z: p1.pos.z,
            yaw: p1.yaw,
            pitch: p1.pitch,
            height: p1.height,
            weapon: p1.isMelee ? 'knife'
                : (p1.isSmoke ? 'smoke'
                : (p1.isFlash ? 'flash'
                : (p1.isMedkit ? 'medkit' : p1.weaponKey))),
            crouching: p1.height < HEIGHT_STAND - 0.1,
        });
    }
    LAN_updateSpectatorCamera(dt, now);

    if (p1.deadUntil !== Infinity && typeof LAN_foreachRemote === 'function') {
        LAN_foreachRemote(remote => {
            if (!remote.baseVisible) return;
            const dx = p1.pos.x - remote.pos.x;
            const dz = p1.pos.z - remote.pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < 0.64 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const push = (0.8 - d) * 0.5;
                p1.pos.x += dx / d * push;
                p1.pos.z += dz / d * push;
            }
        });
    }
}

function LAN_foreachRemote(callback) {
    for (const [id, player] of LAN.models) {
        const state = LAN.playerStates.get(id);
        if (!player || !state) continue;
        callback(player, state, id);
    }
}

function LAN_getEnemies(player) {
    const result = [];
    const myTeam = player === p1 ? p1.team : player.team;
    LAN_foreachRemote(remote => {
        if (remote.team !== myTeam && remote.baseVisible) result.push(remote);
    });
    return result;
}

function LAN_getAliveTeammate() {
    const myTeam = p1.team;
    let result = null;
    LAN_foreachRemote(remote => {
        if (!result && remote.team === myTeam && remote.baseVisible && remote.hp > 0) {
            result = remote;
        }
    });
    return result;
}

function LAN_updateSpectatorCamera(dt, now) {
    if (!LAN.active || p1.deadUntil !== Infinity) return;
    const target = LAN_getAliveTeammate();
    if (!target) return;

    const eyeY = target.pos.y + target.eyeH;
    p1.cam.position.set(target.pos.x, eyeY, target.pos.z);
    p1.cam.rotation.y = target.yaw;
    p1.cam.rotation.x = target.pitch;
    if (p1.vm) p1.vm.visible = false;
}

function LAN_onLocalShot(hits, weaponKey, visual) {
    if (!LAN.active) return;
    LANNET.send({
        type: 'shot',
        weapon: weaponKey,
        hits: Array.isArray(hits) ? hits.slice(0, 16) : [],
        visual,
    });
}

function LAN_onLocalMelee(target, damage) {
    if (!target || !target.netId) return;
    LANNET.send({
        type: 'melee',
        targetId: target.netId,
        damage,
    });
}

function LAN_broadcastFx(kind, payload) {
    if (!LAN.active) return;
    LANNET.send({ type: 'fx', kind, payload });
}

function LAN_broadcastBarrel(x, y, z) {
    if (!LAN.active) return;
    LANNET.send({ type: 'barrel', x, y, z });
}

function LAN_renderScoreboard() {
    if (_lanEl('lanBoardBlueScore')) _lanEl('lanBoardBlueScore').textContent = LAN.blueScore;
    if (_lanEl('lanBoardRedScore')) _lanEl('lanBoardRedScore').textContent = LAN.redScore;

    for (const team of ['blue', 'red']) {
        const list = _lanEl(team === 'blue' ? 'lanBoardBlueList' : 'lanBoardRedList');
        if (!list) continue;
        list.innerHTML = '';
        const players = [...LAN.playerStates.values()]
            .filter(p => p.team === team)
            .sort((a, b) => Number(b.alive) - Number(a.alive));
        for (const state of players) {
            const row = document.createElement('div');
            row.className = 'lan-board-row'
                + (state.alive ? '' : ' dead')
                + (state.id === LAN.selfId ? ' self' : '');
            row.innerHTML = `
                <span>${_lanNameHtml(state.name)}</span>
                <span>${state.alive ? `HP ${state.hp}` : '阵亡'}</span>
            `;
            list.appendChild(row);
        }
    }
}

function LAN_showScoreboard() {
    if (gameMode !== 'lan' || !running) return;
    LAN_renderScoreboard();
    if (_lanEl('lanScoreboard')) _lanEl('lanScoreboard').style.display = 'block';
}

function LAN_hideScoreboard() {
    if (_lanEl('lanScoreboard')) _lanEl('lanScoreboard').style.display = 'none';
}

window.LAN_showScoreboard = LAN_showScoreboard;
window.LAN_hideScoreboard = LAN_hideScoreboard;

function LAN_prepareLocalHitRefs() {
    if (LAN.selfId) {
        p1.netId = LAN.selfId;
        p1.team = LAN.playerStates.get(LAN.selfId)?.team || p1.team;
        _lanPrepareHitMeshes(p1);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _lanBindUI);
} else {
    _lanBindUI();
}
