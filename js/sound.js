// ===== js/sound.js – 世界空间化声音系统（HRTF 听声辨位 · 原生 PannerNode） =====
//
// 依赖：
//   · audio.js（音效合成函数需支持 dest 参数）
//   · 全局 AC / masterGain
//   · p1.cam（本地相机，作为"耳朵"）
//
// 调用：
//   emitWorldSound('rifle', x, y, z, isSelf, extra)
//
// 需要在 main.js 的 loop() 里每帧调用 updateAudioListener()

// ============================================================
// ★ 全局世界音量增益
//   HRTF 卷积会损耗约 -6~-10dB 的能量，
//   统一在这里补回来。想整体调大/调小，只改这一个数就行。
// ============================================================
const WORLD_GAIN = 2.2;

// ============================================================
// 1. 声音定义表
//   ★ 本次调整：
//     · 枪声 baseVol 从 1.6~1.8 提到 3.6~4.0（再叠加 WORLD_GAIN）
//     · 保持 footstep / landing 参数不变（之前已调好）
// ============================================================
const SOUND_DEFS = {
    //                 maxDist  rolloff  refDist  baseVol
    rifle:        { maxDist: 45,  rolloff: 3.2, refDist: 5,   baseVol: 3.60 },
    sniper:       { maxDist: 60,  rolloff: 2.8, refDist: 5,   baseVol: 4.00 },
    shotgun:      { maxDist: 42,  rolloff: 3.2, refDist: 5,   baseVol: 3.60 },
    odin:         { maxDist: 45,  rolloff: 3.2, refDist: 5,   baseVol: 2.60 },

    // 脚步：中距离可闻
    footstep:     { maxDist: 25,  rolloff: 1.2, refDist: 2.5, baseVol: 4.50 },

    // 落地：音量比脚步再大 33%，且近距离更冲
    landing:      { maxDist: 30,  rolloff: 1.3, refDist: 1.8, baseVol: 6.00 },

    hit:          { maxDist: 25,  rolloff: 2.2, refDist: 1,   baseVol: 1.00 },
    kill:         { maxDist: 60,  rolloff: 1.6, refDist: 2,   baseVol: 1.00 },
    death:        { maxDist: 80,  rolloff: 1.5, refDist: 2,   baseVol: 1.00 },

    reload:       { maxDist: 15,  rolloff: 2.2, refDist: 1,   baseVol: 1.00 },
    empty:        { maxDist: 12,  rolloff: 2.2, refDist: 1,   baseVol: 1.00 },
    pickup:       { maxDist: 15,  rolloff: 2.2, refDist: 1,   baseVol: 1.00 },
    melee:        { maxDist: 20,  rolloff: 2.2, refDist: 1,   baseVol: 1.00 },

    smokeThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1,   baseVol: 1.00 },
    smokePop:     { maxDist: 45,  rolloff: 1.8, refDist: 2,   baseVol: 1.00 },
    flashThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1,   baseVol: 1.00 },
    flashDetonate:{ maxDist: 70,  rolloff: 1.6, refDist: 2,   baseVol: 1.00 },
    explosion:    { maxDist: 200, rolloff: 1.1, refDist: 5,   baseVol: 1.00 },

    win:          { maxDist: 200, rolloff: 1.0, refDist: 5,   baseVol: 1.00 },
};

// 自己发出的声音的音量修正系数
//   ★ 本次调整：枪声系数从 0.75 降到 0.50，
//     避免 WORLD_GAIN 提升后自己的枪声太震耳
const SELF_GAIN = {
    footstep: 0.22,
    landing:  0.40,
    rifle: 0.50, sniper: 0.50, shotgun: 0.50, odin: 0.50,
    hit: 0.55, kill: 0.55,
    reload: 0.85, empty: 0.85, pickup: 0.85,
    melee: 0.80, smokeThrow: 0.80, flashThrow: 0.80,
};

// ============================================================
// 2. 临时向量（复用）
// ============================================================
const _lstPos = new THREE.Vector3();
const _lstQ   = new THREE.Quaternion();
const _lstFwd = new THREE.Vector3();
const _lstUp  = new THREE.Vector3();
const _sndTmp = new THREE.Vector3();

// ============================================================
// 3. 每帧同步 AudioListener 到 p1.cam
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
    const k = 0.02;

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
        L.setPosition(_lstPos.x, _lstPos.y, _lstPos.z);
        L.setOrientation(
            _lstFwd.x, _lstFwd.y, _lstFwd.z,
            _lstUp.x,  _lstUp.y,  _lstUp.z
        );
    }
}
window.updateAudioListener = updateAudioListener;

// ============================================================
// 4. 播放世界声音
// ============================================================
function emitWorldSound(name, x, y, z, isSelf, extra) {
    _playWorldSoundLocal(name, x, y, z, isSelf, extra);

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
// 5. 本地播放
// ============================================================
function _playWorldSoundLocal(name, x, y, z, isSelf, extra) {
    const def = SOUND_DEFS[name];
    if (!def) return;
    if (typeof AC === 'undefined' || !AC) return;
    if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

    // 距离粗筛：超过 maxDist 直接跳过，避免白创建 PannerNode
    p1.cam.getWorldPosition(_sndTmp);
    const dx = x - _sndTmp.x;
    const dy = y - _sndTmp.y;
    const dz = z - _sndTmp.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > def.maxDist * def.maxDist) return;

    const selfGain = isSelf ? (SELF_GAIN[name] || 1.0) : 1.0;

    const out = _createSpatialOutput(x, y, z, def, selfGain);

    _dispatchSound(name, out, extra);
}

// ============================================================
// 6. 创建 PannerNode（含全局增益）
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
    // ★ 三层增益：基础音量 × 自己/对手系数 × 全局增益
    g.gain.value = (def.baseVol || 1) * selfGain * WORLD_GAIN;

    g.connect(panner);
    panner.connect(ac.destination);

    return g;
}

// ============================================================
// 7. 声音分发
// ============================================================
function _dispatchSound(name, out, extra) {
    switch (name) {
        case 'rifle':         sShootRifle(out);                          break;
        case 'sniper':        sShootSniper(out);                         break;
        case 'shotgun':       sShootShotgun(out);                        break;
        case 'odin':          sShootOdin(out);                           break;
        case 'footstep':      sFootstep(out);                            break;
        case 'landing':       sLanding(out, extra && extra.impactNorm);  break;
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
// 8. 联机：客户端收到主机广播
// ============================================================
function handleRemoteWorldSound(data) {
    if (!data || !data.name) return;
    if (typeof NET === 'undefined') return;
    if (data.sourceSeat && data.sourceSeat === NET.mySeat) return;

    _playWorldSoundLocal(
        data.name,
        data.x, data.y, data.z,
        false,
        data.extra
    );
}
window.handleRemoteWorldSound = handleRemoteWorldSound;