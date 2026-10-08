// ===== js/audio.js – 程序化音效（支持空间音频输出） =====
let AC = null;
let noiseBuf = null;
const masterGain = {};
const masterPan = { 1: -0.6, 2: 0.6 };

function audio() {
    if (!AC) {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        [1, 2].forEach(id => {
            const g = AC.createGain();
            g.gain.value = 0.9;
            const p = AC.createStereoPanner();
            p.pan.value = masterPan[id];
            g.connect(p);
            p.connect(AC.destination);
            masterGain[id] = g;
        });
        noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
}

// ★ 核心：解析输出目标
//   dest 可以是：
//     · 数字 1 / 2 → 输出到对应的 masterGain（旧行为）
//     · 音频节点   → 直接输出到该节点（空间音频）
//     · undefined  → 默认 masterGain[1]
function _resolveAudioDest(dest) {
    if (typeof dest === 'number') return masterGain[dest] || masterGain[1];
    if (dest && typeof dest.connect === 'function') return dest;
    return masterGain[1];
}

function env(g, t, peak, dur) {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
}

// ---- 四种武器射击音效 ----
function sShootRifle(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = ac.createGain();
    env(g, t, 0.5, 0.12);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.13);

    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
    const g2 = ac.createGain();
    env(g2, t, 0.2, 0.08);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.08);
}

function sShootSniper(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3000;
    f.Q.value = 0.4;
    const g = ac.createGain();
    env(g, t, 0.85, 0.25);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.26);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g2 = ac.createGain();
    env(g2, t, 0.4, 0.3);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.31);
}

function sShootShotgun(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 1.2;
    const g = ac.createGain();
    env(g, t, 0.45, 0.18);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.19);

    for (let i = 0; i < 3; i++) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 150 + Math.random() * 200;
        const g2 = ac.createGain();
        env(g2, t + i * 0.02, 0.08, 0.05);
        o.connect(g2); g2.connect(dst);
        o.start(t + i * 0.02);
        o.stop(t + i * 0.02 + 0.06);
    }
}

function sShootOdin(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2000;
    f.Q.value = 1.5;
    const g = ac.createGain();
    env(g, t, 0.3, 0.05);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.06);

    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.04);
    const g2 = ac.createGain();
    env(g2, t, 0.15, 0.04);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.05);
}

// ★ 近战挥刀音效（兼容旧 sMelee(isHeavy) 与新 sMelee(dest, isHeavy)）
function sMelee(destOrHeavy, isHeavy) {
    let dest = 1;
    if (typeof destOrHeavy === 'boolean') {
        isHeavy = destOrHeavy;
    } else {
        dest = destOrHeavy;
    }

    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(isHeavy ? 500 : 900, t);
    f.frequency.exponentialRampToValueAtTime(isHeavy ? 1800 : 2400, t + 0.08);
    f.Q.value = isHeavy ? 1.8 : 2.4;
    const g = ac.createGain();
    const vol = isHeavy ? 0.32 : 0.20;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isHeavy ? 0.22 : 0.14));
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.25);

    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(isHeavy ? 1400 : 2200, t);
    o.frequency.exponentialRampToValueAtTime(isHeavy ? 250 : 500, t + (isHeavy ? 0.12 : 0.08));
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(isHeavy ? 0.12 : 0.07, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + (isHeavy ? 0.15 : 0.1));
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + (isHeavy ? 0.18 : 0.12));
}

// ---- 其他音效 ----
function sHit(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1300;
    const g = ac.createGain();
    env(g, t, 0.3, 0.07);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.08);
}

function sKill(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    [880, 1320].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.07, 0.25, 0.12);
        o.connect(g); g.connect(dst);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.13);
    });
}

function sDeath(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.5);
    const g = ac.createGain();
    env(g, t, 0.35, 0.5);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.5);
}

function sReload(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    [0, 0.16].forEach(dt => {
        const o = ac.createOscillator();
        o.type = 'square';
        o.frequency.value = 420;
        const g = ac.createGain();
        env(g, t + dt, 0.15, 0.04);
        o.connect(g); g.connect(dst);
        o.start(t + dt); o.stop(t + dt + 0.05);
    });
}

function sEmpty(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = 240;
    const g = ac.createGain();
    env(g, t, 0.12, 0.04);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.05);
}

function sPickup(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    [520, 780].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.06, 0.2, 0.1);
        o.connect(g); g.connect(dst);
        o.start(t + i * 0.06);
        o.stop(t + i * 0.06 + 0.11);
    });
}

function sWin(dest) {
    const ac = audio(), t = ac.currentTime;
    const dst = _resolveAudioDest(dest);
    [523, 659, 784, 1047].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.13, 0.3, 0.22);
        o.connect(g); g.connect(dst);
        o.start(t + i * 0.13);
        o.stop(t + i * 0.13 + 0.24);
    });
}

// ---- 脚步（空间化版本 · 高频提升版） ----
function sFootstep(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    // 低频"咚"
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130 + Math.random() * 30, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.075, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.11);

    // 高频"啪"：增益提升，衰减稍长，让脚步更清晰、定位更准
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 1.2;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.065, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f); f.connect(g2); g2.connect(dst);
    src.start(t); src.stop(t + 0.06);
}

// 本地自己的脚步声（旧的调用入口，保留）
function sFootstepSelf() { sFootstep(1); }

// ---- 落地（空间化 · 冲击感加强版） ----
//   impactNorm 允许 > 1.0：
//     1.0  ≈ 平地跳到落
//     1.3  ≈ 从 2.5m 高台落下
//     1.8  ≈ 从 5m 高台落下
function sLanding(dest, impactNorm) {
    impactNorm = Math.max(0, impactNorm || 0);
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    // ★ 核心：冲击系数从 0.22 起步，最大 0.57
    const v = 0.22 + impactNorm * 0.22;

    // 低频"砰"：主冲击
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70 + impactNorm * 40, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.16);
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.2);

    // 高频"沙"：鞋底/碎屑摩擦
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 0.9;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(v * 0.6, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g2); g2.connect(dst);
    src.start(t); src.stop(t + 0.1);

    // ★ 中频"啪"瞬态：落地瞬间"踩实"的感觉
    const src2 = ac.createBufferSource();
    src2.buffer = noiseBuf;
    const f2 = ac.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(3000, t);
    f2.frequency.exponentialRampToValueAtTime(1800, t + 0.04);
    f2.Q.value = 1.5;
    const g3 = ac.createGain();
    g3.gain.setValueAtTime(v * 0.55, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src2.connect(f2); f2.connect(g3); g3.connect(dst);
    src2.start(t); src2.stop(t + 0.05);
}

// 本地自己的落地声（旧的调用入口，保留）
function sLandingSelf(impactNorm) { sLanding(1, impactNorm); }

// ★ 旧的 sFootstepEnemy / sLandingEnemy —— 保留签名，避免老代码报错
function sFootstepEnemy(volume, pan) {
    if (volume <= 0.005) return;
    sFootstep(1);
}
function sLandingEnemy(volume, pan, impactNorm) {
    if (volume <= 0.005) return;
    sLanding(1, impactNorm);
}

// ---- 投掷物音效 ----
function sSmokeThrow(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    f.Q.value = 1.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.2);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.15);
}

function sSmokePop(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.4);
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.65);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.55);
}

function sFlashThrow(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    f.Q.value = 1.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.18);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.07, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.13);
}

function sFlashDetonate(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    f.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.28);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(4500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g2); g2.connect(dst);
    o.start(t); o.stop(t + 0.24);

    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(160, t);
    o2.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g3 = ac.createGain();
    g3.gain.setValueAtTime(0.22, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o2.connect(g3); g3.connect(dst);
    o2.start(t); o2.stop(t + 0.4);
}

function sExplosion(dest) {
    const ac = audio();
    const t = ac.currentTime;
    const dst = _resolveAudioDest(dest);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.8);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    f.Q.value = 1.2;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.4, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g2); g2.connect(dst);
    src.start(t); src.stop(t + 0.7);

    const src2 = ac.createBufferSource();
    src2.buffer = noiseBuf;
    const f2 = ac.createBiquadFilter();
    f2.type = 'highpass';
    f2.frequency.value = 3000;
    const g3 = ac.createGain();
    g3.gain.setValueAtTime(0.2, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src2.connect(f2); f2.connect(g3); g3.connect(dst);
    src2.start(t); src2.stop(t + 0.3);
}