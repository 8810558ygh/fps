// ===== js/config.js – 游戏常量（枪 + 刀 + 烟雾弹 + 闪光弹） =====
const ARENA = 26;
const EYE_STAND = 1.6;
const EYE_CROUCH = 1.02;
const HEIGHT_STAND = 1.84;
const HEIGHT_CROUCH = 1.25;
const STEP_UP = 0.55;
const GRAV = 22;
const SPEED = 6.2;
const SPEED_CROUCH = 3.4;
const JUMP_V = 9.0;
const RELOAD_MS = 2000;
const FIRE_MS = 125;
const HP_MAX = 100;
const ARMOR_MAX = 50;
const ARMOR_ABSORB = 0.66;
const TARGET_KILLS = 10;
const MATCH_MS = 300000;
const RESPAWN_MS = 3000;
const INVULN_MS = 3000;
const BASE_FOV = 78;

const PREP_MS = 5000;
const ROUND_END_MS = 2500;

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;

// ===== 近战武器 =====
const MELEE = {
    key: 'knife', name: '军刀',
    range: 8.0,
    dmgLight: 50, dmgHeavy: 75,
    backMultiplier: 2.0,
    lightFireMs: 400, heavyFireMs: 900,
    lightRecovery: 250, heavyRecovery: 550,
    equipMs: 500,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

// ===== 烟雾弹 =====
const SMOKE = {
    key: 'smoke', name: '烟雾弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: 16, bounces: 0.35, friction: 0.55,
    fuseMs: 5000, growMs: 1500, durationMs: 15000,
    radius: 4.2, verticalRadius: 4.6, centerHeight: 3.8,
    cooldownMs: 800, maxPerRound: 1,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

// ===== 闪光弹 =====
const FLASH = {
    key: 'flash', name: '闪光弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: 16, bounces: 0.35, friction: 0.55,
    fuseMs: 5000,
    maxDistance: 45,
    minFovMargin: 0.0,
    flashDurationMs: 5000,
    flashFadeMs: 800,
    cooldownMs: 800, maxPerRound: 1,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

const WEAPONS = {
    rifle: {
        key: 'rifle', name: '狂徒',
        dmgBody: 40, dmgHead: 160,
        fireMs: 203, mag: 25, reserveMax: 75, startReserve: 50, reloadMs: 2500,
        zoomFov: 62, scope: false,
        speedMul: 1.0, adsSpeedMul: 0.76
    },
    sniper: {
        key: 'sniper', name: '冥驹',
        dmgBody: 150, dmgHead: 255,
        fireMs: 850,
        mag: 5, reserveMax: 10, startReserve: 10, reloadMs: 3700,
        zoomFov: 14, zoomFov2: 6,
        scope: true, boltMs: 850,
        speedMul: 0.72, adsSpeedMul: 0.72
    },

    // ===== ★ 判官（霰弹枪）：本次重点调整 =====
    //   1. spread 0.25 → 0.08（约 4.6° 半角）
    //      对应真实 00 号弹 10m 直径约 0.35m，接近现实散布
    //   2. pellets 12 → 10（贴近真实 12GA 00 号 9 颗铅弹）
    //   3. dmgBody 17 → 22（单颗弹丸更致命，近距离一枪秒杀）
    //   4. dmgHead 34 → 44
    //   5. fireMs 286 → 350（模拟泵动 0.35 秒/发，熟练射手节奏）
    //   6. reloadMs 2200 → 2400（管式弹仓一发一发压）
    //   7. speedMul 0.75 → 0.80（霰弹枪不算很重）
    shotgun: {
        key: 'shotgun', name: '判官',
        dmgBody: 22, dmgHead: 44,
        fireMs: 350, mag: 5, reserveMax: 15, startReserve: 15, reloadMs: 2400,
        zoomFov: 60, scope: false,
        speedMul: 0.80, adsSpeedMul: 0.78,
        pellets: 10, spread: 0.08
    },

    odin: {
        key: 'odin', name: '奥丁机枪',
        dmgBody: 38, dmgHead: 95,
        fireMs: 70, minFireMs: 55, spinUpMs: 500,
        mag: 100, reserveMax: 200, startReserve: 200, reloadMs: 5000,
        zoomFov: 60, scope: false,
        speedMul: 0.85, adsSpeedMul: 0.7
    }
};