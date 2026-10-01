// ===== js/sound.js – 世界空间化声音系统（HRTF 听声辨位） =====
//
// 核心：
//   · AudioListener 全局唯一，每帧同步到 p1.cam（本地耳朵）
//   · 每个声音事件以世界坐标创建 PannerNode（HRTF）
//   · 距离衰减由 distanceModel='inverse' 原生处理
//   · 前后左右上下由 HRTF 卷积处理
//
// 联机：
//   · 主机权威 → 主机产生声音后广播 → 客户端本地用自己耳朵重放
//

const SOUND_DEFS = {
    //                    maxDist  rolloff  refDist  baseVol
    rifle:        { maxDist: 120, rolloff: 1.6, refDist: 3, baseVol: 1.00 },
    sniper:       { maxDist: 160, rolloff: 1.3, refDist: 3, baseVol: 1.00 },
    shotgun:      { maxDist: 100, rolloff: 1.6, refDist: 3, baseVol: 1.00 },
    odin:         { maxDist: 100, rolloff: 1.6, refDist: 3, baseVol: 0.70 },

    footstep:     { maxDist: 22,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },

    hit:          { maxDist: 25,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },
    kill:         { maxDist: 60,  rolloff: 1.6, refDist: 2, baseVol: 1.00 },
    death:        { maxDist: 80,  rolloff: 1.5, refDist: 2, baseVol: 1.00 },

    reload:       { maxDist: 15,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },
    empty:        { maxDist: 12,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },
    pickup:       { maxDist: 15,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },
    melee:        { maxDist: 20,  rolloff: 2.2, refDist: 1, baseVol: 1.00 },

    smokeThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1, baseVol: 1.00 },
    smokePop:     { maxDist: 45,  rolloff: 1.8, refDist: 2, baseVol: 1.00 },
    flashThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1, baseVol: 1.00 },
    flashDetonate:{ maxDist: 70,  rolloff: 1.6, refDist: 2, baseVol: 1.00 },
    explosion:    { maxDist: 200, rolloff: 1.1, refDist: 5, baseVol: 1.00 },

    win:          { maxDist: 200, rolloff: 1.0, refDist: 5, baseVol: 1.00 },
};

// ============================================================
// 临时向量
// ============================================================
const _lstPos = new THREE.Vector3();
const _lstQ   = new THREE.Quaternion();
const _lstFwd = new THREE.Vector3();
const _lstUp  = new THREE.Vector3();
const _sndTmp = new THREE.Vector3();

// ============================================================
// 每帧同步 AudioListener 到本地玩家的摄像机
// ============================================================
function updateAudioListener() {
    if (typeof AC === 'undefined' || !AC) return;
    if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

    p1.cam.getWorldPosition(_lstPos);
    p1.cam.getWorldQuaternion(_lstQ);

    _lstFwd.set(0, 0, -1).applyQuaternion(_lstQ);
    _lstUp .set(0, 1,  0).applyQuaternion(_lstQ);

    const L = AC.listener;
    const t = AC.currentTime;
    const k = 0.02;   // 平滑时间常数（20ms）

    if (L.positionX) {
        L.positionX.setTargetAtTime(_lstPos.x, t, k);
        L.positionY.setTargetAtTime(_lstPos.y, t, k);
        L.positionZ.setTargetAtTime(_lstPos.z, t, k);

        L.forwardX.setTargetAtTime(_lstFwd.x, t, k);
        L.forwardY.setTargetAtTime(_lstFwd.y, t, k);
        L.forwardZ.setTargetAtTime(_lstFwd.z, t, k);

        L.upX.setTargetAtTime(_lstUp.x, t, k);
        L.upY.setTargetAtTime(_lstUp.y, t, k);
        L.upZ.setTargetAtTime(_lstUp.z, t, k);
    } else {
        // 旧 API 回退（Safari < 14.1）
        L.setPosition(_lstPos.x, _lstPos.y, _lstPos.z);
        L.setOrientation(
            _lstFwd.x, _lstFwd.y, _lstFwd.z,
            _lstUp.x,  _lstUp.y,  _lstUp.z
        );
    }
}
window.updateAudioListener = updateAudioListener;

// ============================================================
// 世界声音发射
// ============================================================
function emitWorldSound(name, x, y, z, isSelf, extra) {
    // 本地播放
    _playWorldSoundLocal(name, x, y, z, isSelf, extra);

    // 联机广播（仅主机）
    if (typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.isHost
        && typeof NET_broadcast === 'function') {

        const sourceSeat = isSelf
            ? NET.mySeat
            : (NET.mySeat === 'blue' ? 'red' : 'blue');

        NET_broadcast({
            type: 'worldSound',
            name: name,
            x: x, y: y, z: z,
            sourceSeat: sourceSeat,
            extra: extra || null,
        });
    }
}
window.emitWorldSound = emitWorldSound;

// ============================================================
// 本地播放（距离粗筛 + PannerNode 创建）
// ============================================================
function _playWorldSoundLocal(name, x, y, z, isSelf, extra) {
    const def = SOUND_DEFS[name];
    if (!def) return;
    if (typeof AC === 'undefined' || !AC) return;
    if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

    // 距离粗筛：避免远距离白创建 PannerNode
    p1.cam.getWorldPosition(_sndTmp);
    const dx = x - _sndTmp.x;
    const dy = y - _sndTmp.y;
    const dz = z - _sndTmp.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > def.maxDist * def.maxDist) return;

    // 自己声音的音量修正
    let selfGain = 1.0;
    if (isSelf) {
        switch (name) {
            case 'footstep':                                     selfGain = 0.25; break;
            case 'rifle': case 'sniper':
            case 'shotgun': case 'odin':                         selfGain = 0.75; break;
            case 'hit': case 'kill':                             selfGain = 0.55; break;
            case 'reload': case 'empty': case 'pickup':          selfGain = 0.85; break;
            case 'melee':
            case 'smokeThrow': case 'flashThrow':                selfGain = 0.80; break;
        }
    }

    const out = _createSpatialOutput(x, y, z, def, selfGain);
    _dispatchSound(name, out, extra);
}

// ============================================================
// 创建 PannerNode + HRTF
// ============================================================
function _createSpatialOutput(x, y, z, def, selfGain) {
    const ac = audio();

    const panner = ac.createPanner();
    panner.panningModel   = 'HRTF';
    panner.distanceModel  = 'inverse';
    panner.refDistance    = def.refDist || 1;
    panner.maxDistance    = def.maxDist;
    panner.rolloffFactor  = def.rolloff;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain  = 1;

    if (panner.positionX) {
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
    } else {
        panner.setPosition(x, y, z);
    }

    const g = ac.createGain();
    g.gain.value = (def.baseVol || 1) * selfGain;

    g.connect(panner);
    panner.connect(masterGain);

    return g;
}

// ============================================================
// 声音分发
// ============================================================
function _dispatchSound(name, out, extra) {
    switch (name) {
        case 'rifle':         sShootRifle(out);                          break;
        case 'sniper':        sShootSniper(out);                         break;
        case 'shotgun':       sShootShotgun(out);                        break;
        case 'odin':          sShootOdin(out);                           break;
        case 'footstep':      sFootstep(out);                            break;
        case 'hit':           sHit(out);                                 break;
        case 'kill':          sKill(out);                                break;
        case 'death':         sDeath(out);                               break;
        case 'reload':        sReload(out);                              break;
        case 'empty':         sEmpty(out);                               break;
        case 'pickup':        sPickup(out);                              break;
        case 'melee':         sMelee(out, extra && extra.isHeavy);       break;
        case 'smokeThrow':    sSmokeThrow(out);                          break;
        case 'smokePop':      sSmokePop(out);                            break;
        case 'flashThrow':    sFlashThrow(out);                          break;
        case 'flashDetonate': sFlashDetonate(out);                       break;
        case 'explosion':     sExplosion(out);                           break;
        case 'win':           sWin(out);                                 break;
    }
}

// ============================================================
// 联机：客户端收到主机广播
// ============================================================
function handleRemoteWorldSound(data) {
    if (!data || !data.name) return;
    if (typeof NET === 'undefined') return;

    // 自己发出的声音已在本地播放过，跳过
    if (data.sourceSeat && data.sourceSeat === NET.mySeat) return;

    // 观战者：只听，不判断 isSelf
    _playWorldSoundLocal(
        data.name,
        data.x, data.y, data.z,
        false,
        data.extra
    );
}
window.handleRemoteWorldSound = handleRemoteWorldSound;