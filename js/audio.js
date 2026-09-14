// ===== js/audio.js – 程序化音效（含四种武器射击声 + 脚步声 + 近战挥刀） =====
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

function env(g, t, peak, dur) {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
}

// ---- 四种武器射击音效 ----

function sShootRifle(id) {
    const ac = audio(), t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = ac.createGain();
    env(g, t, 0.5, 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[id]);
    src.start(t);
    src.stop(t + 0.13);

    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
    const g2 = ac.createGain();
    env(g2, t, 0.2, 0.08);
    o.connect(g2);
    g2.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.08);
}

function sShootSniper(id) {
    const ac = audio(), t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3000;
    f.Q.value = 0.4;
    const g = ac.createGain();
    env(g, t, 0.85, 0.25);
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[id]);
    src.start(t);
    src.stop(t + 0.26);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g2 = ac.createGain();
    env(g2, t, 0.4, 0.3);
    o.connect(g2);
    g2.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.31);
}

function sShootShotgun(id) {
    const ac = audio(), t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 1.2;
    const g = ac.createGain();
    env(g, t, 0.45, 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[id]);
    src.start(t);
    src.stop(t + 0.19);

    for (let i = 0; i < 3; i++) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 150 + Math.random() * 200;
        const g2 = ac.createGain();
        env(g2, t + i * 0.02, 0.08, 0.05);
        o.connect(g2);
        g2.connect(masterGain[id]);
        o.start(t + i * 0.02);
        o.stop(t + i * 0.02 + 0.06);
    }
}

function sShootOdin(id) {
    const ac = audio(), t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2000;
    f.Q.value = 1.5;
    const g = ac.createGain();
    env(g, t, 0.3, 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[id]);
    src.start(t);
    src.stop(t + 0.06);

    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.04);
    const g2 = ac.createGain();
    env(g2, t, 0.15, 0.04);
    o.connect(g2);
    g2.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.05);
}

function sShoot(id) {
    const ac = audio(), t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 0.7;
    const g = ac.createGain();
    env(g, t, 0.5, 0.14);
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[id]);
    src.start(t);
    src.stop(t + 0.15);
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    const g2 = ac.createGain();
    env(g2, t, 0.22, 0.09);
    o.connect(g2);
    g2.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.1);
}

// ★ 近战挥刀音效
function sMelee(isHeavy) {
    const ac = audio();
    const t = ac.currentTime;

    // 挥空的风声（带通噪声）
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
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[1]);
    src.start(t);
    src.stop(t + 0.25);

    // 金属质感（重击更低沉、更重）
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(isHeavy ? 1400 : 2200, t);
    o.frequency.exponentialRampToValueAtTime(isHeavy ? 250 : 500, t + (isHeavy ? 0.12 : 0.08));
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(isHeavy ? 0.12 : 0.07, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + (isHeavy ? 0.15 : 0.1));
    o.connect(g2);
    g2.connect(masterGain[1]);
    o.start(t);
    o.stop(t + (isHeavy ? 0.18 : 0.12));
}

// ---- 其他音效 ----
function sHit(id) {
    const ac = audio(), t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1300;
    const g = ac.createGain();
    env(g, t, 0.3, 0.07);
    o.connect(g);
    g.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.08);
}

function sKill(id) {
    const ac = audio(), t = ac.currentTime;
    [880, 1320].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.07, 0.25, 0.12);
        o.connect(g);
        g.connect(masterGain[id]);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.13);
    });
}

function sDeath() {
    const ac = audio(), t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.5);
    const g = ac.createGain();
    env(g, t, 0.35, 0.5);
    o.connect(g);
    g.connect(masterGain[1]);
    g.connect(masterGain[2]);
    o.start(t);
    o.stop(t + 0.5);
}

function sReload(id) {
    const ac = audio(), t = ac.currentTime;
    [0, 0.16].forEach(dt => {
        const o = ac.createOscillator();
        o.type = 'square';
        o.frequency.value = 420;
        const g = ac.createGain();
        env(g, t + dt, 0.15, 0.04);
        o.connect(g);
        g.connect(masterGain[id]);
        o.start(t + dt);
        o.stop(t + dt + 0.05);
    });
}

function sEmpty(id) {
    const ac = audio(), t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = 240;
    const g = ac.createGain();
    env(g, t, 0.12, 0.04);
    o.connect(g);
    g.connect(masterGain[id]);
    o.start(t);
    o.stop(t + 0.05);
}

function sPickup(id) {
    const ac = audio(), t = ac.currentTime;
    [520, 780].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.06, 0.2, 0.1);
        o.connect(g);
        g.connect(masterGain[id]);
        o.start(t + i * 0.06);
        o.stop(t + i * 0.06 + 0.11);
    });
}

function sWin() {
    const ac = audio(), t = ac.currentTime;
    [523, 659, 784, 1047].forEach((fr, i) => {
        const o = ac.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        const g = ac.createGain();
        env(g, t + i * 0.13, 0.3, 0.22);
        o.connect(g);
        g.connect(masterGain[1]);
        g.connect(masterGain[2]);
        o.start(t + i * 0.13);
        o.stop(t + i * 0.13 + 0.24);
    });
}

// ============================================================
// 脚步声
// ============================================================
function sFootstepSelf() {
    const ac = audio();
    const t = ac.currentTime;

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130 + Math.random() * 30, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.075, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g);
    g.connect(masterGain[1]);
    o.start(t);
    o.stop(t + 0.11);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 1.2;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.035, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f);
    f.connect(g2);
    g2.connect(masterGain[1]);
    src.start(t);
    src.stop(t + 0.05);
}

function sFootstepEnemy(volume, pan) {
    if (volume <= 0.005) return;
    const ac = audio();
    const t = ac.currentTime;

    const panner = ac.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(AC.destination);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(125 + Math.random() * 35, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.32 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g);
    g.connect(panner);
    o.start(t);
    o.stop(t + 0.11);

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 1.4;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.12 * volume, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f);
    f.connect(g2);
    g2.connect(panner);
    src.start(t);
    src.stop(t + 0.05);
}

// 烟雾弹投掷音效（短促的"咻"声）
function sSmokeThrow() {
    const ac = audio();
    const t = ac.currentTime;

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
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[1]);
    src.start(t);
    src.stop(t + 0.2);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g2);
    g2.connect(masterGain[1]);
    o.start(t);
    o.stop(t + 0.15);
}

// 烟雾弹展开音效（低沉的"呼"声）
function sSmokePop() {
    const ac = audio();
    const t = ac.currentTime;

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
    src.connect(f);
    f.connect(g);
    g.connect(masterGain[1]);
    src.start(t);
    src.stop(t + 0.65);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g2);
    g2.connect(masterGain[1]);
    o.start(t);
    o.stop(t + 0.55);
}

// ===== 追加到 js/audio.js 末尾 =====

// ★ 闪光弹投掷（与烟雾弹类似，稍尖锐）
function sFlashThrow() {
    const ac = audio();
    const t = ac.currentTime;
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
    src.connect(f); f.connect(g); g.connect(masterGain[1]);
    src.start(t); src.stop(t + 0.18);

    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.07, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g2); g2.connect(masterGain[1]);
    o.start(t); o.stop(t + 0.13);
}

// ★ 闪光弹爆炸（短促爆音 + 高频"闪"感）
function sFlashDetonate() {
    const ac = audio();
    const t = ac.currentTime;

    // 爆音：白噪声短促
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
    src.connect(f); f.connect(g); g.connect(masterGain[1]);
    src.start(t); src.stop(t + 0.28);

    // 高频"啾"
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(4500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g2); g2.connect(masterGain[1]);
    o.start(t); o.stop(t + 0.24);

    // 低频冲击
    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(160, t);
    o2.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g3 = ac.createGain();
    g3.gain.setValueAtTime(0.22, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o2.connect(g3); g3.connect(masterGain[1]);
    o2.start(t); o2.stop(t + 0.4);
}