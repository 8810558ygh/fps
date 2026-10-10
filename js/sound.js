// ===== js/sound.js – 世界空间化声音系统（HRTF 听声辨位 · PannerNode 对象池 + 统计） =====
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
// ============================================================
const WORLD_GAIN = 2.2;

// ============================================================
// 1. 声音定义表
//   ★ life 字段：音效估算寿命（毫秒）
//      PannerNode 池靠它判断何时归还
//      依据：audio.js 里每个音效的"最后节点停止时间 + 50ms 余量"
// ============================================================
const SOUND_DEFS = {
    //                 maxDist  rolloff  refDist  baseVol  life
    rifle:        { maxDist: 45,  rolloff: 3.2, refDist: 5,   baseVol: 3.60, life: 200 },
    sniper:       { maxDist: 60,  rolloff: 2.8, refDist: 5,   baseVol: 4.00, life: 450 },
    shotgun:      { maxDist: 42,  rolloff: 3.2, refDist: 5,   baseVol: 3.60, life: 320 },
    odin:         { maxDist: 45,  rolloff: 3.2, refDist: 5,   baseVol: 2.60, life: 150 },

    footstep:     { maxDist: 25,  rolloff: 1.2, refDist: 2.5, baseVol: 4.50, life: 180 },
    landing:      { maxDist: 30,  rolloff: 1.3, refDist: 1.8, baseVol: 6.00, life: 380 },

    hit:          { maxDist: 25,  rolloff: 2.2, refDist: 1,   baseVol: 1.00, life: 150 },
    kill:         { maxDist: 60,  rolloff: 1.6, refDist: 2,   baseVol: 1.00, life: 300 },
    death:        { maxDist: 80,  rolloff: 1.5, refDist: 2,   baseVol: 1.00, life: 600 },

    reload:       { maxDist: 15,  rolloff: 2.2, refDist: 1,   baseVol: 1.00, life: 300 },
    empty:        { maxDist: 12,  rolloff: 2.2, refDist: 1,   baseVol: 1.00, life: 150 },
    pickup:       { maxDist: 15,  rolloff: 2.2, refDist: 1,   baseVol: 1.00, life: 300 },
    melee:        { maxDist: 20,  rolloff: 2.2, refDist: 1,   baseVol: 1.00, life: 320 },

    smokeThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1,   baseVol: 1.00, life: 260 },
    smokePop:     { maxDist: 45,  rolloff: 1.8, refDist: 2,   baseVol: 1.00, life: 700 },
    flashThrow:   { maxDist: 30,  rolloff: 2.0, refDist: 1,   baseVol: 1.00, life: 250 },
    flashDetonate:{ maxDist: 70,  rolloff: 1.6, refDist: 2,   baseVol: 1.00, life: 500 },
    explosion:    { maxDist: 200, rolloff: 1.1, refDist: 5,   baseVol: 1.00, life: 900 },

    win:          { maxDist: 200, rolloff: 1.0, refDist: 5,   baseVol: 1.00, life: 800 },
};

// 自己发出的声音的音量修正系数
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
// 3. ★★★ PannerNode 对象池（含统计） ★★★
//
//   设计要点：
//     · 每个 slot = { panner, gain, busy, freeAt, token, id }
//     · 创建时一次性 gain.connect(panner); panner.connect(dest)
//       → 之后只改 gain.gain.value 和 panner.positionX/Y/Z
//     · 归还 = gain.gain.value = 0 + busy = false
//     · 归还靠 setTimeout，token 防止"超时回调晚了"导致误回收
//     · 池满时强回收 freeAt 最早的 slot
//
//   收益：
//     · 奥丁满射速时不再每秒创建 30 个 Panner / Gain
//     · HRTF 卷积路径复用，首帧初始化只发生 32 次（一次性）
// ============================================================
const PANNER_POOL_SIZE = 32;
const _pannerPool = [];
let _pannerPoolInitialized = false;

// ★ 统计计数器
const _poolStats = {
    initCount:       0,   // 初始化时一次性创建了几个（= PANNER_POOL_SIZE）
    borrowCount:     0,   // 累计借出次数（= 播放了多少次空间音效）
    hitFromIdle:     0,   // 从空闲槽借到的次数
    forcedRecycle:   0,   // 池满、被迫强回收的次数
    releaseCount:    0,   // 累计归还次数
    staleRelease:    0,   // 因 token 不符被跳过的归还
    currentBusy:     0,   // 当前使用中
    maxBusy:         0,   // 历史峰值并发
};

function _initPannerPool() {
    if (_pannerPoolInitialized) return;
    if (typeof AC === 'undefined' || !AC) return;
    _pannerPoolInitialized = true;

    for (let i = 0; i < PANNER_POOL_SIZE; i++) {
        const panner = AC.createPanner();
        panner.panningModel   = 'HRTF';
        panner.distanceModel  = 'inverse';
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain  = 1;

        const gain = AC.createGain();
        gain.gain.value = 0;

        gain.connect(panner);
        panner.connect(AC.destination);

        _pannerPool.push({
            panner,
            gain,
            busy: false,
            freeAt: 0,
            token: 0,
            id: i,
        });
    }
    _poolStats.initCount = PANNER_POOL_SIZE;

    // ★ 铁证：暴露给控制台查询的全局 Set
    window.__allPanners = new Set(_pannerPool.map(s => s.panner));

    console.log('[sound] PannerNode 池已初始化:', PANNER_POOL_SIZE);
}

function _acquireSlot() {
    _initPannerPool();
    _poolStats.borrowCount++;

    // 1. 优先找空闲 slot
    for (let i = 0; i < _pannerPool.length; i++) {
        if (!_pannerPool[i].busy) {
            _poolStats.hitFromIdle++;
            return _pannerPool[i];
        }
    }

    // 2. 全忙 → 强回收 freeAt 最早的
    _poolStats.forcedRecycle++;
    let oldest = _pannerPool[0];
    for (let i = 1; i < _pannerPool.length; i++) {
        if (_pannerPool[i].freeAt < oldest.freeAt) oldest = _pannerPool[i];
    }
    return oldest;
}

function _releaseSlot(slot, token) {
    if (slot.token !== token) {
        _poolStats.staleRelease++;
        return;
    }
    slot.busy = false;
    slot.gain.gain.value = 0;
    _poolStats.releaseCount++;
    _poolStats.currentBusy--;
}

// ============================================================
// 4. 每帧同步 AudioListener 到 p1.cam
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
// 5. 播放世界声音
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
// 6. 本地播放
// ============================================================
function _playWorldSoundLocal(name, x, y, z, isSelf, extra) {
    const def = SOUND_DEFS[name];
    if (!def) return;
    if (typeof AC === 'undefined' || !AC) return;
    if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

    // 距离粗筛：超过 maxDist 直接跳过，避免白占一个 slot
    p1.cam.getWorldPosition(_sndTmp);
    const dx = x - _sndTmp.x;
    const dy = y - _sndTmp.y;
    const dz = z - _sndTmp.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > def.maxDist * def.maxDist) return;

    const selfGain = isSelf ? (SELF_GAIN[name] || 1.0) : 1.0;

    // ★ 传入 name，让 _createSpatialOutput 知道该借用多久
    const out = _createSpatialOutput(x, y, z, def, selfGain, name);

    _dispatchSound(name, out, extra);
}

// ============================================================
// 7. 借用池中的 Panner/Gain（替代原先的每次 createPanner）
// ============================================================
function _createSpatialOutput(x, y, z, def, selfGain, soundName) {
    const slot = _acquireSlot();
    const panner = slot.panner;
    const gain   = slot.gain;

    // 占用 + 生成新 token
    slot.busy = true;
    slot.token++;
    const token = slot.token;

    // ★ 统计更新
    _poolStats.currentBusy++;
    if (_poolStats.currentBusy > _poolStats.maxBusy) {
        _poolStats.maxBusy = _poolStats.currentBusy;
    }

    const lifeMs = def.life || 300;
    slot.freeAt = performance.now() + lifeMs;

    // ---- 重设 Panner 参数 ----
    panner.refDistance   = def.refDist || 1;
    panner.maxDistance   = def.maxDist;
    panner.rolloffFactor = def.rolloff;

    if (panner.positionX) {
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
    } else {
        panner.setPosition(x, y, z);
    }

    // ---- 重设音量（三层增益）----
    //   ★ 直接赋值，不用 setTargetAtTime，
    //     否则上一次归还的 0 会有滑动残留
    gain.gain.value = (def.baseVol || 1) * selfGain * WORLD_GAIN;

    // ---- 定时归还 ----
    setTimeout(() => _releaseSlot(slot, token), lifeMs + 30);

    return gain;
}

// ============================================================
// 8. 声音分发
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
// 9. 联机：客户端收到主机广播
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

// ============================================================
// 10. 调试：查看池的实时 + 累计统计
// ============================================================
window.dumpPannerPool = function () {
    const s = _poolStats;
    const reuseRate = s.borrowCount > 0
        ? ((s.hitFromIdle / s.borrowCount) * 100).toFixed(1)
        : '—';

    console.group('%c[sound] PannerNode 池统计',
        'color:#6ee7b7;font-weight:bold;font-size:13px;');

    console.log(
        `池容量：       ${s.initCount}\n` +
        `当前使用：     ${s.currentBusy} / ${s.initCount}\n` +
        `历史峰值：     ${s.maxBusy}\n` +
        `─────\n` +
        `累计借出：     ${s.borrowCount} 次\n` +
        `  从空闲借：   ${s.hitFromIdle} 次（${reuseRate}%）\n` +
        `  强制回收：   ${s.forcedRecycle} 次\n` +
        `累计归还：     ${s.releaseCount} 次\n` +
        `过期归还跳过： ${s.staleRelease} 次`
    );

    if (s.borrowCount === 0) {
        console.log('%c还没播放过任何空间音效',
            'color:#9fb2c8;');
    } else if (s.forcedRecycle / s.borrowCount > 0.1) {
        console.log('%c⚠️ 强回收占比 > 10%，池可能偏小',
            'color:#ffd24a;font-weight:bold;');
    } else if (s.borrowCount > 100) {
        console.log(
            `%c✅ 池工作正常：已复用 ${s.borrowCount} 次，` +
            `仅创建过 ${s.initCount} 个 PannerNode`,
            'color:#6ee7b7;font-weight:bold;'
        );
    }

    console.groupEnd();

    return Object.assign({}, s);
};

// ============================================================
// 11. 调试：一键对比"没有池"会创建多少（仅用于说明，不改变实际行为）
// ============================================================
window.explainPannerPool = function () {
    const s = _poolStats;
    if (s.borrowCount === 0) {
        console.log('[sound] 还没有数据，先玩一会再来');
        return;
    }
    console.log(
        `%c【PannerNode 池化效果对比】\n` +
        `  修改前（每次 new）：  ${s.borrowCount} 个 PannerNode\n` +
        `  修改后（池化）：      ${s.initCount} 个 PannerNode\n` +
        `  节省：                ${s.borrowCount - s.initCount} 个\n` +
        `  复用率：              ${(((s.borrowCount - s.initCount) / s.borrowCount) * 100).toFixed(1)}%`,
        'color:#6ee7b7;font-weight:bold;font-size:12px;'
    );
};