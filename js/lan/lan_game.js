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
    spectateWeaponKey: null,
    spectateViewWeapon: null,
    lastDeathNoticeAt: 0,
    lastSavedMatchId: null,
    roundReportCache: null,
    roundReportVisible: false,
    localInfo: null,
    inviteUrl: '',
    reconnectPending: false,
    hostExitHandled: false,
    connectionLostTimer: 0,
};

window.LAN = LAN;

const LAN_TEAM_COLORS = {
    blue: 0x3a7bd5,
    red: 0xd54a3a,
};

const LAN_MAP_NAMES = Object.freeze({
    battlefield: '战场',
    desert: '沙漠',
    indoor_complex: '设备间',
});

const LAN_ROOM_MODE_NAMES = Object.freeze({
    team: '团队作战',
    survival: '生存模式',
});

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

async function _lanUpdateRoomInvite(room, isOwner) {
    const panel = _lanEl('lanShareInvite');
    const input = _lanEl('lanInviteUrl');
    const alternate = _lanEl('lanAlternateUrls');
    const copyButton = _lanEl('lanCopyInviteBtn');
    if (!panel || !input) return;

    if (!isOwner) {
        LAN.inviteUrl = '';
        panel.style.display = 'none';
        return;
    }

    let urls = [];
    try {
        if (window.electronAPI && typeof window.electronAPI.getLocalInfo === 'function') {
            if (!LAN.localInfo) LAN.localInfo = await window.electronAPI.getLocalInfo();
            urls = (LAN.localInfo?.httpUrls || [])
                .map(item => item.url)
                .filter(Boolean);
        } else if (/^https?:$/.test(location.protocol)
            && !['127.0.0.1', 'localhost'].includes(location.hostname)) {
            urls = [location.origin];
        }
    } catch (error) {
        console.warn('[lan] 获取局域网地址失败', error);
    }

    urls = [...new Set(urls)];
    panel.style.display = 'block';
    if (urls.length === 0) {
        LAN.inviteUrl = '';
        input.value = '未检测到可用的局域网地址';
        if (copyButton) copyButton.disabled = true;
        if (alternate) alternate.textContent = '请确认电脑已连接 Wi-Fi 或网线';
        return;
    }

    LAN.inviteUrl = `${urls[0]}/?lanRoom=${encodeURIComponent(room.code)}`;
    input.value = LAN.inviteUrl;
    if (copyButton) copyButton.disabled = false;
    if (alternate) {
        alternate.textContent = urls.length > 1
            ? `备用地址：${urls.slice(1).map(url => `${url}/?lanRoom=${encodeURIComponent(room.code)}`).join('  ·  ')}`
            : '朋友需要和房主连接到同一个局域网';
    }
}

async function _lanCopyInviteUrl() {
    const input = _lanEl('lanInviteUrl');
    if (!input || !LAN.inviteUrl) {
        lanNotify('当前没有可复制的局域网网址');
        return;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(LAN.inviteUrl);
        } else {
            input.select();
            document.execCommand('copy');
        }
        lanNotify('邀请网址已复制，发给同一局域网内的朋友');
    } catch {
        input.select();
        document.execCommand('copy');
        lanNotify('邀请网址已选中，请按 Ctrl+C 复制');
    }
}

function _lanReturnToMainAfterHostExit(message) {
    if (LAN.hostExitHandled) return;
    LAN.hostExitHandled = true;
    clearTimeout(LAN.connectionLostTimer);
    LAN.connectionLostTimer = 0;
    LAN.reconnectPending = false;
    LAN.active = false;
    LAN.room = null;
    running = false;
    gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (typeof LANNET.disconnect === 'function') LANNET.disconnect();
    LANNET.currentUrl = null;
    if (typeof window.closeCombatReport === 'function') window.closeCombatReport();
    if (typeof SETTINGS_CancelPerformanceMode === 'function') SETTINGS_CancelPerformanceMode();

    if (_lanEl('lanLobbyOverlay')) _lanEl('lanLobbyOverlay').style.display = 'none';
    if (_lanEl('lanMatchHud')) _lanEl('lanMatchHud').style.display = 'none';
    if (_lanEl('lanEndOverlay')) _lanEl('lanEndOverlay').style.display = 'none';
    if (_lanEl('lanScoreboard')) _lanEl('lanScoreboard').style.display = 'none';
    if (_lanEl('lobbyOverlay')) _lanEl('lobbyOverlay').style.display = 'flex';
    document.body.classList.remove('in-game');
    history.replaceState(null, '', location.pathname + location.hash);

    if (typeof window.toast === 'function') {
        window.toast(message || '房主已退出游戏，房间已关闭');
    } else {
        lanNotify(message || '房主已退出游戏，房间已关闭', 4000);
    }
}

function _lanHandleConnectionLost() {
    if (!LAN.room || LAN.hostExitHandled) return;
    LAN.active = false;
    LAN.reconnectPending = true;
    lanNotify('与房主连接中断，正在尝试重连…', 4000);
    if (LAN.connectionLostTimer) return;
    LAN.connectionLostTimer = setTimeout(() => {
        LAN.connectionLostTimer = 0;
        if (!LANNET.connected && LAN.reconnectPending) {
            _lanReturnToMainAfterHostExit('无法重新连接房主，已退出房间');
        }
    }, 6000);
}

function _lanHandleReconnected(msg) {
    clearTimeout(LAN.connectionLostTimer);
    LAN.connectionLostTimer = 0;
    LAN.reconnectPending = false;
    LAN.hostExitHandled = false;
    LAN.active = true;
    LAN.selfId = msg.id || LAN.selfId;
    if (msg.room) {
        LAN.room = msg.room;
        LAN.phase = msg.room.phase || LAN.phase;
    }
    if (_lanEl('lanLobbyOverlay')) _lanEl('lanLobbyOverlay').style.display = 'none';
    lanNotify('已重新连接本局游戏', 1800);
}

function _lanSyncRoomMap(room, isOwner) {
    const picker = _lanEl('lanRoomMap');
    const select = _lanEl('lanRoomMapSelect');
    if (!picker || !select) return;

    const canEdit = isOwner && room.phase === 'lobby';
    picker.classList.toggle('readonly', !canEdit);
    picker.setAttribute('aria-label', `当前地图：${LAN_MAP_NAMES[room.mapId] || room.mapId}`);
    select.value = room.mapId;
    select.disabled = !canEdit;
    select.title = canEdit ? '选择地图，所有成员会实时同步' : '地图由房主设置';
}

function _lanSyncRoomMode(room, isOwner) {
    const picker = _lanEl('lanRoomMode');
    const select = _lanEl('lanRoomModeSelect');
    if (!picker || !select) return;

    const canEdit = isOwner && room.phase === 'lobby';
    const mode = room.mode || 'team';
    picker.classList.toggle('readonly', !canEdit);
    picker.setAttribute('aria-label', `当前模式：${LAN_ROOM_MODE_NAMES[mode] || mode}`);
    select.value = mode;
    select.disabled = !canEdit;
    select.title = canEdit ? '选择房间模式，所有成员会实时同步' : '模式由房主设置';
}

function _lanRenderLobby(room) {
    LAN.room = room;
    if (!room) return;

    const me = room.players.find(p => p.id === LAN.selfId);
    const isOwner = room.ownerId === LAN.selfId;
    const codeEl = _lanEl('lanRoomCode');
    if (codeEl) codeEl.textContent = room.code;

    _lanSyncRoomMap(room, isOwner);
    _lanSyncRoomMode(room, isOwner);
    const pingEl = _lanEl('lanRoomPing');
    if (pingEl) pingEl.textContent = `延迟：${LANNET.latency || '-'}ms`;
    _lanUpdateRoomInvite(room, isOwner);

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
                empty.innerHTML = `
                    <span class="lan-seat-number">${i + 1}</span>
                    <span class="lan-empty-icon">+</span>
                    <span>等待玩家加入</span>
                `;
                list.appendChild(empty);
                continue;
            }
            const row = document.createElement('div');
            row.className = 'lan-player-row'
                + (player.id === LAN.selfId ? ' me' : '')
                + (player.ready ? ' is-ready' : ' is-waiting');
            const avatar = Array.from(player.name || '玩')[0] || '玩';
            row.innerHTML = `
                <span class="lan-seat-number">${i + 1}</span>
                <span class="lan-player-avatar">${_lanNameHtml(avatar)}</span>
                <span class="lan-player-main">
                    <strong>${_lanNameHtml(player.name)}</strong>
                    <small>${player.id === LAN.selfId ? '本机玩家' : '联机玩家'}</small>
                </span>
                <span class="lan-player-tags">
                    ${player.owner ? '<span class="owner-tag">房主</span>' : ''}
                    <span class="${player.ready ? 'ready-tag' : 'waiting-tag'}">${player.ready ? '已准备' : '未准备'}</span>
                </span>
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
        const modeSupported = (room.mode || 'team') === 'team';
        _lanEl('lanStartBtn').style.display = isOwner ? '' : 'none';
        _lanEl('lanStartBtn').disabled = !(blueCount > 0 && redCount > 0 && allReady && modeSupported);
        _lanEl('lanStartBtn').title = modeSupported ? '' : '生存模式暂未开放';
    }
}

function lanShowLobby() {
    if (!LAN.room) LAN.hostExitHandled = false;
    if (!LANNET.connected) LANNET.connect();
    if (typeof SETTINGS_PrepareLanMatch === 'function') SETTINGS_PrepareLanMatch();
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

function _lanShowRoundReport(report) {
    if (!report || typeof window.showLANRoundReport !== 'function') return;
    LAN.roundReportCache = report;
    LAN.roundReportVisible = true;
    window.showLANRoundReport(report);
}

function _lanHideRoundReport(clearCache = false) {
    LAN.roundReportVisible = false;
    if (clearCache) LAN.roundReportCache = null;
    if (typeof window.closeCombatReport === 'function') window.closeCombatReport();
}

function _lanCreateRoom() {
    const mapId = typeof getCurrentMapId === 'function' ? getCurrentMapId() : 'battlefield';
    if (!LANNET.send({ type: 'createRoom', mapId })) {
        _lanSetRoomMessage('尚未连接局域网服务器');
    }
}

function _lanSetRoomMap(mapId) {
    const room = LAN.room;
    if (!room || room.ownerId !== LAN.selfId || room.phase !== 'lobby') return;
    if (!LAN_MAP_NAMES[mapId] || room.mapId === mapId) return;
    if (!LANNET.send({ type: 'setMap', mapId })) {
        _lanSetRoomMessage('地图修改失败：尚未连接局域网服务器');
        _lanSyncRoomMap(room, true);
    }
}

function _lanSetRoomMode(mode) {
    const room = LAN.room;
    if (!room || room.ownerId !== LAN.selfId || room.phase !== 'lobby') return;
    if (!LAN_ROOM_MODE_NAMES[mode] || (room.mode || 'team') === mode) return;
    if (!LANNET.send({ type: 'setMode', mode })) {
        _lanSetRoomMessage('模式修改失败：尚未连接局域网服务器');
        _lanSyncRoomMode(room, true);
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
        if (typeof SETTINGS_CancelLanPreload === 'function') SETTINGS_CancelLanPreload();
        _lanHideLobby();
        if (_lanEl('lobbyOverlay')) _lanEl('lobbyOverlay').style.display = 'flex';
    });
    on('lanCreateBtn', _lanCreateRoom);
    on('lanJoinBtn', _lanJoinRoom);
    on('lanCopyInviteBtn', _lanCopyInviteUrl);
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

    const mapSelect = _lanEl('lanRoomMapSelect');
    mapSelect?.addEventListener('change', () => {
        if (typeof audio === 'function') audio();
        _lanSetRoomMap(mapSelect.value);
    });

    const modeSelect = _lanEl('lanRoomModeSelect');
    modeSelect?.addEventListener('change', () => {
        if (typeof audio === 'function') audio();
        _lanSetRoomMode(modeSelect.value);
        if (modeSelect.value === 'survival') {
            _lanSetRoomMessage('生存模式暂未开放，切回团队作战后可开始比赛');
        } else {
            _lanSetRoomMessage('');
        }
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
    if (player.mesh) {
        player.mesh.traverse(object => {
            if (!object.isMesh) return;
            if (object.geometry) object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (material
                    && material !== player.mat
                    && material !== (typeof DARK_MAT !== 'undefined' ? DARK_MAT : null)) {
                    material.dispose();
                }
            }
        });
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

function _lanDisposeWeaponModel(root, player) {
    if (!root) return;
    root.traverse(object => {
        if (!object.isMesh) return;
        if (object.geometry) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (material
                && material !== player.mat
                && material !== (typeof DARK_MAT !== 'undefined' ? DARK_MAT : null)) {
                material.dispose();
            }
        }
    });
}

function _lanInstallSimpleWeapon(player, weaponKey = 'rifle') {
    if (!player || !player.gunHolder) return;
    while (player.gunHolder.children.length) {
        const child = player.gunHolder.children[0];
        player.gunHolder.remove(child);
        _lanDisposeWeaponModel(child, player);
    }
    if (player.vm) {
        while (player.vm.children.length) {
            const child = player.vm.children[0];
            player.vm.remove(child);
            _lanDisposeWeaponModel(child, player);
        }
    }

    const weapon = makeWeaponModel(weaponKey, player.mat, { useHd: false });
    if (!weapon) return;
    weapon.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
    });
    player.gunHolder.add(weapon);
    player._lanSimpleWeapon = weapon;
    player._lanSimpleWeaponKey = weaponKey;
    player.gunHolder.visible = true;
    if (player._lanRemote && player.muzzle) player.muzzle.visible = false;
}
window.LAN_installSimpleWeapon = _lanInstallSimpleWeapon;

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
    _lanInstallSimpleWeapon(player, state.weapon || 'rifle');
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
            _lanClearSpectatorViewModel();
            setWeapon(p1, p1.primaryWeaponKey || 'rifle');
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
    const connected = state.connected !== false;
    player.baseVisible = !!state.alive && connected;
    player.deadUntil = player.baseVisible ? 0 : Infinity;
    player.mesh.visible = player.baseVisible;

    const weaponKey = state.weapon || player.weaponKey || 'rifle';
    if (player._lanSimpleWeaponKey !== weaponKey) {
        _lanInstallSimpleWeapon(player, weaponKey);
    }
    player.weaponKey = weaponKey;
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
        const totalSeconds = Math.max(0, Math.ceil((msg.phaseRemain || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const countdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        timer.textContent = msg.phase === 'prep' ? `准备 ${countdown}`
            : msg.phase === 'round' ? `战斗 ${countdown}`
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
    if (p1.deadUntil === Infinity) _lanEnsureSpectateTarget();

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
    LAN.lastSavedMatchId = null;
    LAN.reconnectPending = false;
    LAN.hostExitHandled = false;
    _lanHideRoundReport(true);

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
    if (typeof SETTINGS_ApplyGraphics === 'function') SETTINGS_ApplyGraphics(true);
    document.body.classList.add('in-game');
    if (typeof setOver === 'function') setOver(false);
    if (typeof enterFullscreenAndLock === 'function') enterFullscreenAndLock();
    lanNotify('比赛开始 · 双方准备', 1600);
}

function _lanSaveMatchResult(msg) {
    if (!msg.matchId || LAN.lastSavedMatchId === msg.matchId) return;
    LAN.lastSavedMatchId = msg.matchId;

    const players = Array.isArray(msg.players) ? msg.players : [];
    const self = players.find(player => player.id === LAN.selfId)
        || LAN.playerStates.get(LAN.selfId);
    if (!self) return;

    const result = !msg.winnerTeam ? 'draw'
        : (msg.winnerTeam === self.team ? 'win' : 'loss');
    const record = {
        matchId: msg.matchId,
        playedAt: msg.playedAt,
        playerId: typeof window.PROFILE_GetId === 'function' ? window.PROFILE_GetId() : LAN.selfName,
        mapId: msg.mapId || LAN.mapId,
        team: self.team,
        result,
        blueScore: msg.blueScore,
        redScore: msg.redScore,
        rounds: msg.rounds,
        kills: self.kills || 0,
        deaths: self.deaths || 0,
        damage: self.damage || 0,
        durationSeconds: Math.max(0, Math.round((msg.durationMs || 0) / 1000)),
    };

    if (typeof window.PROFILE_AddMatch === 'function') {
        window.PROFILE_AddMatch(record).then(result => {
            if (!result || !result.ok) console.warn('[profile] 战绩保存失败', result && result.message);
        });
    }
}

function _lanMatchEnd(msg) {
    _lanSaveMatchResult(msg);
    _lanHideRoundReport(true);
    running = false;
    gameState = 'idle';
    if (typeof SETTINGS_ApplyGraphics === 'function') SETTINGS_ApplyGraphics(true);
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
        if (LAN.reconnectPending && LAN.room?.code) {
            LANNET.send({ type: 'joinRoom', code: LAN.room.code });
        }
        return;
    }
    if (msg.type === 'hostLeft') {
        _lanReturnToMainAfterHostExit(msg.message);
        return;
    }
    if (msg.type === 'reconnected') {
        _lanHandleReconnected(msg);
        return;
    }
    if (msg.type === 'error') {
        _lanSetRoomMessage(msg.message || '操作失败');
        return;
    }
    if (msg.type === 'lobby') {
        clearTimeout(LAN.connectionLostTimer);
        LAN.connectionLostTimer = 0;
        LAN.reconnectPending = false;
        LAN.hostExitHandled = false;
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
        if (msg.phase === 'prep') {
            lanNotify('新回合准备', 1200);
            if (LAN.roundReportCache) _lanShowRoundReport(LAN.roundReportCache);
        }
        if (msg.phase === 'round') {
            lanNotify('开始交战', 900);
            _lanHideRoundReport(true);
        }
        return;
    }
    if (msg.type === 'roundReport') {
        LAN.roundReportCache = msg.report;
        if (msg.trigger === 'death'
            || LAN.roundReportVisible
            || LAN.phase === 'prep') {
            _lanShowRoundReport(msg.report);
        }
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
            aiming: !!p1.aiming,
            reloadRemain: Math.max(0, p1.reloadEnd - now),
            boltRemain: Math.max(0, p1.boltEnd - now),
            meleeRemain: Math.max(0, p1.meleeEnd - now),
            meleeHeavy: !!p1.meleeIsHeavy,
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

function LAN_getAliveTeammates() {
    const myTeam = p1.team;
    const result = [];
    LAN_foreachRemote(remote => {
        const state = LAN.playerStates.get(remote.netId);
        if (remote.team === myTeam
            && state?.alive
            && state.connected !== false
            && remote.baseVisible
            && remote.hp > 0) {
            result.push(remote);
        }
    });
    return result;
}

function _lanBuildSpectatorViewModel(weaponKey) {
    if (!p1.vm || typeof makeViewmodel !== 'function') return;
    if (LAN.spectateWeaponKey === weaponKey && LAN.spectateViewWeapon) return;
    while (p1.vm.children.length) {
        const child = p1.vm.children[0];
        p1.vm.remove(child);
    }
    const weapon = makeViewmodel(weaponKey, p1.mat);
    if (!weapon) return;
    p1.vm.add(weapon);
    LAN.spectateViewWeapon = weapon;
    LAN.spectateWeaponKey = weaponKey;
}

function _lanClearSpectatorViewModel() {
    if (p1.vm) {
        while (p1.vm.children.length) {
            const child = p1.vm.children[0];
            p1.vm.remove(child);
        }
    }
    LAN.spectateViewWeapon = null;
    LAN.spectateWeaponKey = null;
}

function _lanChooseRandomSpectateTarget(excludeId = null) {
    const teammates = LAN_getAliveTeammates();
    if (teammates.length === 0) return null;
    const alternatives = teammates.filter(player => player.netId !== excludeId);
    const pool = alternatives.length > 0 ? alternatives : teammates;
    return pool[Math.floor(Math.random() * pool.length)] || pool[0];
}

function _lanEnsureSpectateTarget(notify = true) {
    if (!LAN.active || p1.deadUntil !== Infinity) return null;
    const teammates = LAN_getAliveTeammates();
    if (teammates.length === 0) {
        LAN.spectateNetId = null;
        p1.vm.visible = false;
        return null;
    }
    let target = teammates.find(player => player.netId === LAN.spectateNetId);
    if (!target) {
        target = _lanChooseRandomSpectateTarget();
        LAN.spectateNetId = target ? target.netId : null;
        LAN.spectateWeaponKey = null;
        if (target && notify) {
            lanNotify(`正在观战：${target.name || '队友'} · 左键切换`, 1800);
        }
    }
    return target;
}

function LAN_cycleSpectateTarget() {
    if (!LAN.active || p1.deadUntil !== Infinity) return;
    const next = _lanChooseRandomSpectateTarget(LAN.spectateNetId);
    if (!next) {
        lanNotify('没有仍存活的队友');
        return;
    }
    LAN.spectateNetId = next.netId;
    LAN.spectateWeaponKey = null;
    lanNotify(`观战目标：${next.name || '队友'}`, 1300);
}

function LAN_updateSpectatorCamera(dt, now) {
    if (!LAN.active || p1.deadUntil !== Infinity) return;
    const target = _lanEnsureSpectateTarget();
    if (!target) return;
    const state = LAN.playerStates.get(target.netId);
    if (!state) return;

    const eyeY = target.pos.y + target.eyeH;
    p1.cam.position.set(target.pos.x, eyeY, target.pos.z);
    p1.cam.rotation.y = target.yaw;
    p1.cam.rotation.x = target.pitch;

    const weaponKey = state.weapon || 'rifle';
    _lanBuildSpectatorViewModel(weaponKey);
    p1.weaponKey = weaponKey;
    p1.weapon = weaponKey === 'knife' ? MELEE
        : weaponKey === 'smoke' ? SMOKE
        : weaponKey === 'flash' ? FLASH
        : weaponKey === 'medkit' ? MEDKIT
        : (getWeaponConfig(weaponKey) || getWeaponConfig('rifle'));
    p1.isMelee = weaponKey === 'knife';
    p1.isSmoke = weaponKey === 'smoke';
    p1.isFlash = weaponKey === 'flash';
    p1.isMedkit = weaponKey === 'medkit';
    p1.aiming = !!state.aiming && !p1.isMelee && !p1.isSmoke && !p1.isFlash;
    p1.reloadEnd = now + (state.reloadRemain || 0);
    p1.boltEnd = now + (state.boltRemain || 0);
    p1.meleeEnd = now + (state.meleeRemain || 0);
    p1.meleeIsHeavy = !!state.meleeHeavy;
    if (p1.vm) p1.vm.visible = true;
    if (typeof updateSniperViewmodel === 'function') {
        updateSniperViewmodel(p1, dt, now);
    }
}

window.LAN_cycleSpectateTarget = LAN_cycleSpectateTarget;

function LAN_onLocalShot(hits, weaponKey, visual) {
    if (!LAN.active) return;
    LANNET.send({
        type: 'shot',
        weapon: weaponKey,
        hits: Array.isArray(hits) ? hits.slice(0, 16) : [],
        visual,
    });
}

function LAN_onLocalMelee(targetsOrTarget, damage) {
    const targets = Array.isArray(targetsOrTarget)
        ? targetsOrTarget
        : (targetsOrTarget && targetsOrTarget.netId
            ? [{ targetId: targetsOrTarget.netId, damage }]
            : []);
    if (!LAN.active || targets.length === 0) return;
    LANNET.send({
        type: 'melee',
        targets: targets.slice(0, 5),
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
                + (state.alive && state.connected !== false ? '' : ' dead')
                + (state.id === LAN.selfId ? ' self' : '');
            row.innerHTML = `
                <span>${_lanNameHtml(state.name)}</span>
                <span>${state.alive ? `HP ${state.hp}` : '阵亡'} · ${state.kills || 0}/${state.deaths || 0}</span>
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

async function _lanHandleInviteQuery() {
    const params = new URLSearchParams(location.search);
    const code = String(params.get('lanRoom') || '').trim().toUpperCase();
    if (!code) return;

    const input = _lanEl('lanRoomCodeInput');
    if (input) input.value = code;
    const connected = await LANNET.connect();
    lanShowLobby();
    if (!connected) {
        _lanSetRoomMessage('无法连接房主服务器，请确认双方在同一局域网');
        return;
    }
    await _lanJoinRoom();
}

function _lanScheduleInviteQuery() {
    if (!new URLSearchParams(location.search).get('lanRoom')) return;
    setTimeout(() => {
        _lanHandleInviteQuery().catch(error => {
            console.warn('[lan] 邀请网址自动加入失败', error);
            _lanSetRoomMessage('邀请网址自动加入失败，请手动输入房间码');
        });
    }, 100);
}

window.addEventListener('lan-connection-lost', _lanHandleConnectionLost);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        _lanBindUI();
        _lanScheduleInviteQuery();
    });
} else {
    _lanBindUI();
    _lanScheduleInviteQuery();
}
