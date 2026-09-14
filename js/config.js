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

// ===== 烟雾弹（球状浓密） =====
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

// ===== ★ 闪光弹（5 秒引信 · 视锥内无遮挡即被闪 · 全白 5 秒） =====
const FLASH = {
    key: 'flash', name: '闪光弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: 16, bounces: 0.35, friction: 0.55,
    fuseMs: 5000,               // 5 秒引信
    maxDistance: 45,            // 最大可被闪距离（米）
    minFovMargin: 0.0,          // 视锥边距（0 = 完全按 FOV 判定）
    flashDurationMs: 5000,      // 完全白屏总时长
    flashFadeMs: 800,           // 最后 0.8 秒淡出
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
        fireMs: 1667, mag: 5, reserveMax: 10, startReserve: 10, reloadMs: 3700,
        zoomFov: 14, zoomFov2: 6,
        scope: true, boltMs: 850,
        speedMul: 0.72, adsSpeedMul: 0.72
    },
    shotgun: {
        key: 'shotgun', name: '判官',
        dmgBody: 17, dmgHead: 34,
        fireMs: 286, mag: 5, reserveMax: 15, startReserve: 15, reloadMs: 2200,
        zoomFov: 60, scope: false,
        speedMul: 0.75, adsSpeedMul: 0.75,
        pellets: 12, spread: 0.25
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