// ===== js/online_game.js – 房主权威同步、客户端输入、观战视角 =====

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

function startHostBroadcast() {
    if (NET._hostBroadcastTimer) clearInterval(NET._hostBroadcastTimer);
    NET._hostBroadcastTimer = setInterval(hostBroadcastTick, 20);
}
function stopHostBroadcast() {
    if (NET._hostBroadcastTimer) { clearInterval(NET._hostBroadcastTimer); NET._hostBroadcastTimer = null; }
}

function serializePlayer(p) {
    const now = performance.now();
    return {
        x: p.pos.x, y: p.pos.y, z: p.pos.z,
        yaw: p.yaw, pitch: p.pitch,
        hp: p.hp, armor: p.armor, score: p.score,
        weapon: p.isMelee ? 'knife' : (p.isSmoke ? 'smoke' : (p.isFlash ? 'flash' : p.weapon.key)),
        ammo: p.ammo, reserve: p.reserve,
        fov: p.cam.fov,
        crouching: p.height < HEIGHT_STAND - 0.15,
        dead: p.hp <= 0 || p.deadUntil > now,
        visible: p.baseVisible,
        aiming: !!p.aiming,
        aimStage: p.aimStage || 0,
        isMelee: !!p.isMelee,
        isSmoke: !!p.isSmoke,
        isFlash: !!p.isFlash,
        meleeIsHeavy: !!p.meleeIsHeavy,
        smokeCharges: p.smokeCharges || 0,
        flashCharges: p.flashCharges || 0,
        reloadRemain: Math.max(0, p.reloadEnd - now),
        boltRemain: Math.max(0, p.boltEnd - now),
        equipRemain: Math.max(0, p.equipEnd - now),
        meleeEndRemain: Math.max(0, p.meleeEnd - now),
        meleeRecoveryRemain: Math.max(0, p.meleeRecovery - now),
        throwFuseActive: !!p.throwFuseActive,
        throwFuseType: p.throwFuseType || null,
        throwFuseEndRemain: p.throwFuseActive ? Math.max(0, p.throwFuseEnd - now) : 0,
        throwFuseInHand: !!p.throwFuseInHand,
        flashRemain: p.flashUntil > now ? (p.flashUntil - now) : 0
    };
}

function hostBroadcastTick() {
    if (!NET.isHost || !NET.roomId) return;
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;
    const now = performance.now();
    const hostSeat = NET.mySeat;

    const hostData   = serializePlayer(p1);
    const clientData = serializePlayer(p2);

    const bluePlayer = hostSeat === 'blue' ? hostData : clientData;
    const redPlayer  = hostSeat === 'blue' ? clientData : hostData;

    broadcast({
        type: 'hostState',
        tick: NET.tick++,
        timestamp: now,
        hostSeat,
        mapId: getLocalMapId(),
        roundNumber: (typeof roundNumber !== 'undefined') ? roundNumber : 1,
        gameState: (typeof gameState !== 'undefined') ? gameState : 'idle',
        stateEndTimeRemain: (typeof stateEndTime !== 'undefined') ? Math.max(0, stateEndTime - now) : 0,
        bluePlayer,
        redPlayer
    });
}

function handleClientInput(fromId, data) {
    if (!NET.isHost) return;
    if (typeof p2 === 'undefined' || !p2) return;

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

function handleHostState(data) {
    if (NET.isHost) return;
    NET.lastHostState = data;
    if (data.hostSeat) NET.hostSeat = data.hostSeat;
    if (typeof stateEndTime !== 'undefined') stateEndTime = performance.now() + data.stateEndTimeRemain;
    if (typeof roundNumber !== 'undefined' && data.roundNumber) roundNumber = data.roundNumber;

    if (NET.role === 'player') {
        const mySeat = NET.mySeat;
        const myData  = mySeat === 'blue' ? data.bluePlayer : data.redPlayer;
        const oppData = mySeat === 'blue' ? data.redPlayer  : data.bluePlayer;

        const now = performance.now();

        if (typeof p1 !== 'undefined' && p1) {
            const targetKey = myData.isMelee ? 'knife' : (myData.isSmoke ? 'smoke' : (myData.isFlash ? 'flash' : myData.weapon));
            const currentKey = p1.isMelee ? 'knife' : (p1.isSmoke ? 'smoke' : (p1.isFlash ? 'flash' : p1.weaponKey));
            if (targetKey !== currentKey) setWeapon(p1, targetKey);

            p1.pos.set(myData.x, myData.y, myData.z);
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
            p2.pos.set(oppData.x, oppData.y, oppData.z);
            p2.yaw = oppData.yaw;
            p2.pitch = oppData.pitch;
            p2.hp = oppData.hp;
            p2.armor = oppData.armor;
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

            p2.mesh.position.copy(p2.pos);
            p2.mesh.rotation.y = p2.yaw;
            p2.mesh.scale.y = p2.height / HEIGHT_STAND;

            const targetKey = oppData.isMelee ? 'knife' : (oppData.isSmoke ? 'smoke' : (oppData.isFlash ? 'flash' : oppData.weapon));
            const currentKey = p2.isMelee ? 'knife' : (p2.isSmoke ? 'smoke' : (p2.isFlash ? 'flash' : p2.weaponKey));
            if (targetKey !== currentKey) {
                while (p2.gunHolder.children.length) p2.gunHolder.remove(p2.gunHolder.children[0]);
                if (targetKey === 'knife') {
                    if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('knife', p2.mat));
                    p2.isMelee = true; p2.isSmoke = false; p2.isFlash = false;
                    p2.weaponKey = 'knife'; p2.weapon = MELEE;
                } else if (targetKey === 'smoke') {
                    if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('smoke', p2.mat));
                    p2.isMelee = false; p2.isSmoke = true; p2.isFlash = false;
                    p2.weaponKey = 'smoke'; p2.weapon = SMOKE;
                } else if (targetKey === 'flash') {
                    if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('flash', p2.mat));
                    p2.isMelee = false; p2.isSmoke = false; p2.isFlash = true;
                    p2.weaponKey = 'flash'; p2.weapon = FLASH;
                } else if (WEAPONS[targetKey]) {
                    if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel(targetKey, p2.mat));
                    p2.isMelee = false; p2.isSmoke = false; p2.isFlash = false;
                    p2.weaponKey = targetKey; p2.weapon = WEAPONS[targetKey];
                }
            }
        }
    } else if (NET.role === 'spectator') {
        NET.spectatorBlueData = data.bluePlayer;
        NET.spectatorRedData  = data.redPlayer;
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
        while (p1.gunHolder.children.length) p1.gunHolder.remove(p1.gunHolder.children[0]);
        while (p1.vm.children.length) p1.vm.remove(p1.vm.children[0]);
        if (wantKey === 'knife') {
            if (typeof makeWeaponModel === 'function') p1.gunHolder.add(makeWeaponModel('knife', p1.mat));
            if (typeof makeViewmodel === 'function') p1.vm.add(makeViewmodel('knife', p1.mat));
            p1.isMelee = true; p1.isSmoke = false; p1.isFlash = false;
            p1.weaponKey = 'knife'; p1.weapon = MELEE;
        } else if (wantKey === 'smoke') {
            if (typeof makeWeaponModel === 'function') p1.gunHolder.add(makeWeaponModel('smoke', p1.mat));
            if (typeof makeViewmodel === 'function') p1.vm.add(makeViewmodel('smoke', p1.mat));
            p1.isMelee = false; p1.isSmoke = true; p1.isFlash = false;
            p1.weaponKey = 'smoke'; p1.weapon = SMOKE;
        } else if (wantKey === 'flash') {
            if (typeof makeWeaponModel === 'function') p1.gunHolder.add(makeWeaponModel('flash', p1.mat));
            if (typeof makeViewmodel === 'function') p1.vm.add(makeViewmodel('flash', p1.mat));
            p1.isMelee = false; p1.isSmoke = false; p1.isFlash = true;
            p1.weaponKey = 'flash'; p1.weapon = FLASH;
        } else if (WEAPONS[wantKey]) {
            if (typeof makeWeaponModel === 'function') p1.gunHolder.add(makeWeaponModel(wantKey, p1.mat));
            if (typeof makeViewmodel === 'function') p1.vm.add(makeViewmodel(wantKey, p1.mat));
            p1.isMelee = false; p1.isSmoke = false; p1.isFlash = false;
            p1.weaponKey = wantKey; p1.weapon = WEAPONS[wantKey];
        }
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
    p2.hp = otherData.hp; p2.armor = otherData.armor;
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
        while (p2.gunHolder.children.length) p2.gunHolder.remove(p2.gunHolder.children[0]);
        if (otherKey === 'knife') {
            if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('knife', p2.mat));
            p2.isMelee = true; p2.isSmoke = false; p2.isFlash = false;
            p2.weaponKey = 'knife'; p2.weapon = MELEE;
        } else if (otherKey === 'smoke') {
            if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('smoke', p2.mat));
            p2.isMelee = false; p2.isSmoke = true; p2.isFlash = false;
            p2.weaponKey = 'smoke'; p2.weapon = SMOKE;
        } else if (otherKey === 'flash') {
            if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel('flash', p2.mat));
            p2.isMelee = false; p2.isSmoke = false; p2.isFlash = true;
            p2.weaponKey = 'flash'; p2.weapon = FLASH;
        } else if (WEAPONS[otherKey]) {
            if (typeof makeWeaponModel === 'function') p2.gunHolder.add(makeWeaponModel(otherKey, p2.mat));
            p2.isMelee = false; p2.isSmoke = false; p2.isFlash = false;
            p2.weaponKey = otherKey; p2.weapon = WEAPONS[otherKey];
        }
    }

    if (typeof updateThirdPersonWeapon === 'function') {
        updateThirdPersonWeapon(p1, dt, performance.now());
        updateThirdPersonWeapon(p2, dt, performance.now());
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

function handleKillEvent(data) {
    if (typeof sKill === 'function') sKill(1);
    if (typeof sDeath === 'function') sDeath();

    const hostSeat = NET.hostSeat || 'blue';
    const iAmPlayer = (NET.mySeat === 'blue' || NET.mySeat === 'red');
    const mySide = (NET.mySeat === hostSeat) ? 'host' : 'client';
    const iAmVictim = iAmPlayer && (data.victimSide === mySide);
    const iAmKiller = iAmPlayer && (data.killerSide === mySide);

    if (iAmVictim && typeof p1 !== 'undefined' && p1) {
        p1.hp = 0;
        p1.deadUntil = Infinity;
        p1.baseVisible = false;
        p1.aiming = false;
        p1.input.aim = false;
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

    let attacker, victim;
    if (data.killerSide === 'client') { attacker = p1; victim = p2; }
    else { attacker = p2; victim = p1; }
    if (typeof feed === 'function' && typeof p1 !== 'undefined') {
        const attackerName = (attacker === p1) ? '你' : NET.getOpponentName();
        const victimName = (victim === p1) ? '你' : NET.getOpponentName();
        feed(p1, `<b style="color:#ffd24a">${attackerName}</b> 击杀了 <b style="color:#ff7a6d">${victimName}</b>`);
    }
    if (typeof showRoundReport === 'function' && data.dmgByKiller && data.dmgByVictim) {
        window.showRoundReport(data.roundNumber || 1, attacker, victim, data.dmgByKiller, data.dmgByVictim);
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

    if (data.reset) {
        if (typeof clearAllSmokes === 'function') clearAllSmokes();
        if (typeof clearAllFlashes === 'function') clearAllFlashes();
        if (typeof clearAllBulletHoles === 'function') clearAllBulletHoles();
        if (typeof p1 !== 'undefined' && p1) p1.flashUntil = 0;
        if (typeof p2 !== 'undefined' && p2) p2.flashUntil = 0;

        if (typeof resetPlayer === 'function') {
            if (typeof p1 !== 'undefined' && p1) resetPlayer(p1, performance.now());
            if (typeof p2 !== 'undefined' && p2) resetPlayer(p2, performance.now());
        } else {
            if (typeof p1 !== 'undefined' && p1) { p1.deadUntil = 0; p1.hp = 100; p1.baseVisible = true; }
            if (typeof p2 !== 'undefined' && p2) { p2.deadUntil = 0; p2.hp = 100; p2.baseVisible = true; }
        }
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
window.NET_sendKillEvent = function (killerSide, victimSide, round, dmgByKiller, dmgByVictim) {
    if (!NET.isHost) return;
    broadcast({
        type: 'killEvent', killerSide, victimSide, roundNumber: round,
        dmgByKiller: dmgByKiller || { body: 0, head: 0, total: 0 },
        dmgByVictim: dmgByVictim || { body: 0, head: 0, total: 0 }
    });
};
window.NET_sendRoundEvent = function (gameStateStr, remain, reset, roundNum) {
    if (!NET.isHost) return;
    broadcast({ type: 'roundEvent', gameState: gameStateStr, remain, reset, roundNumber: roundNum });
};

window.NET_sendClientInput = function () {
    if (NET.isHost || NET.role !== 'player') return;
    if (!NET.roomId) return;
    if (typeof p1 === 'undefined' || !p1) return;

    sendToHost({
        type: 'clientInput',
        seq: NET.inputSeq++,
        input: {
            forward: p1.input.forward,
            right: p1.input.right,
            jump: p1.input.jump,
            crouch: p1.input.crouch,
            fire: p1.input.fire,
            aim: p1.input.aim
        },
        yaw: p1.yaw,
        pitch: p1.pitch,
        aimStage: p1.aimStage,

        weaponSwitch: NET.pendingWeaponSwitch,
        reload: NET.pendingReload,
        fuseStart: NET.pendingFuseStart,
        fuseRelease: NET.pendingFuseRelease,
        melee: NET.pendingMelee,
        meleeHeavy: NET.pendingMeleeHeavy
    });

    NET.pendingWeaponSwitch = null;
    NET.pendingReload = false;
    NET.pendingFuseStart = null;
    NET.pendingFuseRelease = false;
    NET.pendingMelee = false;
    NET.pendingMeleeHeavy = false;
};

window.NET_sendChat = function (text) {
    if (!NET.roomId) return;
    if (NET.isHost) broadcast({ type: 'chat', text: text });
    else sendToHost({ type: 'chat', text: text });
};