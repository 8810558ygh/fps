// ===== js/online_client.js – 客户端接收房主状态 + 输入上报 =====
// 从 online_game.js 拆出，不改变任何对外接口
// 依赖：online_serialize.js 提供 _mergeDelta / _clientPlayerState

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
        fuseRelease: NET.pendingFuseRelease,   // ★ 现在可以是对象
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