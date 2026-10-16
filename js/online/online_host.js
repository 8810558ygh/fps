// ===== js/online/online_host.js – 房主广播 + 客户端输入处理 =====
// 从 online_game.js 拆出，不改变任何对外接口
// 依赖：online_serialize.js 提供 serializePlayer / _buildPlayerPayload / _payloadBlue / _payloadRed
//
// ★ 投掷物同步改造：
//   · 房主每 2 次 hostBroadcastTick（约 32ms ≈ 30Hz）广播一次飞行中投掷物的实时位置 + 旋转
//   · 客户端用这个位置做指数插值（不做任何物理模拟），旋转直接赋值
//   · 保证客户端看到的投掷物位置 / 旋转 = 房主位置 / 旋转（滞后 30~60ms）

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
// ★ 房主广播
// ============================================================
let _projectileBroadcastCounter = 0;

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

    // ★ 投掷物位置 + 旋转广播（30Hz，每 2 次 tick 一次）
    _projectileBroadcastCounter++;
    if (_projectileBroadcastCounter >= 2) {
        _projectileBroadcastCounter = 0;
        _broadcastProjectiles();
    }
}

// ============================================================
// ★ 房主广播：飞行中投掷物的实时位置 + 旋转
//
//   目的：
//     · 客户端不做投掷物物理模拟
//     · 完全相信房主的位置 + 旋转广播
//     · 位置用指数插值平滑显示，旋转直接赋值
// ============================================================
function _broadcastProjectiles() {
    const hasSmokes  = (typeof activeSmokes  !== 'undefined') && activeSmokes.length  > 0;
    const hasFlashes = (typeof activeFlashes !== 'undefined') && activeFlashes.length > 0;
    if (!hasSmokes && !hasFlashes) return;

    let smokes = null;
    if (hasSmokes) {
        for (let i = 0; i < activeSmokes.length; i++) {
            const s = activeSmokes[i];
            if (s.state !== 'flying') continue;
            if (s.id == null) continue;
            if (!s.mesh) continue;
            if (!smokes) smokes = [];
            // ★ 新增旋转同步：附上 mesh 的四元数
            smokes.push({
                id: s.id,
                x: s.pos.x, y: s.pos.y, z: s.pos.z,
                qx: s.mesh.quaternion.x,
                qy: s.mesh.quaternion.y,
                qz: s.mesh.quaternion.z,
                qw: s.mesh.quaternion.w,
            });
        }
    }

    let flashes = null;
    if (hasFlashes) {
        for (let i = 0; i < activeFlashes.length; i++) {
            const s = activeFlashes[i];
            if (s.state !== 'flying') continue;
            if (s.id == null) continue;
            if (!s.mesh) continue;
            if (!flashes) flashes = [];
            // ★ 新增旋转同步：附上 mesh 的四元数
            flashes.push({
                id: s.id,
                x: s.pos.x, y: s.pos.y, z: s.pos.z,
                qx: s.mesh.quaternion.x,
                qy: s.mesh.quaternion.y,
                qz: s.mesh.quaternion.z,
                qw: s.mesh.quaternion.w,
            });
        }
    }

    if (!smokes && !flashes) return;

    broadcast({
        type: 'projectilesUpdate',
        smokes: smokes || [],
        flashes: flashes || [],
    });
}

// ============================================================
// ★ 房主端：处理客户端输入
//
//   ★ ziplineDismount：只清滑索状态（客户端脱索瞬间上报）
//   ★ vulnerableStart：设置硬直/易伤（客户端落地瞬间上报）
//   ★ fuseRelease：客户端上报完整投掷参数（origin/vel/fuseMs），
//                  房主直接用它 spawn，避免两端 origin 不一致
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
            p2.equipEnd = 0;   // ★ 清除切枪硬直，避免 startThrowFuse 被吞
            startThrowFuse(p2, 'smoke');
        } else if (key === 'flash') {
            if (!p2.isFlash) setWeapon(p2, 'flash');
            p2.equipEnd = 0;
            startThrowFuse(p2, 'flash');
        }
    }

    // ============================================================
    // ★ 客户端上报完整投掷参数（对象），房主直接用它 spawn
    //   并用 spawn 返回的 id 广播给所有客户端
    // ============================================================
    if (data.fuseRelease) {
        const fr = data.fuseRelease;

        if (typeof fr === 'object' && fr && fr.type) {
            const now = performance.now();

            if (fr.type === 'smoke') {
                const proj = spawnSmokeProjectile(
                    new THREE.Vector3(fr.px, fr.py, fr.pz),
                    new THREE.Vector3(fr.vx, fr.vy, fr.vz),
                    fr.fuseMs, now
                );
                if (typeof sSmokeThrow === 'function') sSmokeThrow();
                if (typeof NET_broadcast === 'function') {
                    NET_broadcast({
                        type: 'smokeSpawn',
                        id: proj ? proj.id : null,
                        px: fr.px, py: fr.py, pz: fr.pz,
                        vx: fr.vx, vy: fr.vy, vz: fr.vz,
                        fuseMs: fr.fuseMs,
                    });
                }
            } else if (fr.type === 'flash') {
                const proj = spawnFlashProjectile(
                    new THREE.Vector3(fr.px, fr.py, fr.pz),
                    new THREE.Vector3(fr.vx, fr.vy, fr.vz),
                    fr.fuseMs, now
                );
                if (typeof sFlashThrow === 'function') sFlashThrow();
                if (typeof NET_broadcast === 'function') {
                    NET_broadcast({
                        type: 'flashSpawn',
                        id: proj ? proj.id : null,
                        px: fr.px, py: fr.py, pz: fr.pz,
                        vx: fr.vx, vy: fr.vy, vz: fr.vz,
                        fuseMs: fr.fuseMs,
                    });
                }
            }

            // 清掉房主端 p2 的引信状态，切回主武器
            if (p2) {
                p2.throwFuseActive = false;
                p2.throwFuseType = null;
                p2.throwFuseInHand = false;
                const backKey = p2.primaryWeaponKey || 'rifle';
                setWeapon(p2, backKey);
            }
        } else {
            // 兼容旧格式：客户端只上报了 true
            if (p2.throwFuseActive && p2.throwFuseInHand) {
                releaseThrowFuse(p2);
            }
        }
    }

    if (data.melee) {
        if (!p2.isMelee) setWeapon(p2, 'knife');
        p2.meleeIsHeavy = !!data.meleeHeavy;
        tryMelee(p2, performance.now(), !!data.meleeHeavy);
    }

    p2.lastRemoteInputAt = performance.now();
}