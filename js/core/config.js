// ===== js/config.js – 游戏常量（枪 + 刀 + 烟雾弹 + 闪光弹 + 医疗包） =====
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

// ===== 后坐力恢复参数 =====
const RECOIL_RECOVER_DELAY_MS = 100;
const RECOIL_RECOVER_RATE     = 2.2;
const RECOIL_MIN_THRESHOLD    = 0.0006;

// ===== 近战武器 =====
const MELEE = {
    key: 'knife', name: '军刀',
    range: 2.0,
    dmgLight: 50, dmgHeavy: 75,
    backMultiplier: 2.0,
    lightFireMs: 400, heavyFireMs: 900,
    lightRecovery: 250, heavyRecovery: 550,
    equipMs: 500,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

const SMOKE = {
    key: 'smoke', name: '烟雾弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: GRAV,
    bounces: 0.35, friction: 0.55,
    fuseMs: 5000, growMs: 1500, durationMs: 15000,
    radius: 4.2, verticalRadius: 4.6, centerHeight: 3.8,
    cooldownMs: 800, maxPerRound: 1,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

const FLASH = {
    key: 'flash', name: '闪光弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: GRAV,
    bounces: 0.35, friction: 0.55,
    fuseMs: 5000,
    maxDistance: 45,
    minFovMargin: 0.0,
    flashDurationMs: 5000,
    flashFadeMs: 800,
    cooldownMs: 800, maxPerRound: 1,
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

// ===== 医疗包 =====
const MEDKIT = {
    key: 'medkit', name: '医疗包',
    healAmount: 50,          // ★ 回血量 50
    useTimeMs: 1500,         // 使用耗时
    maxPerRound: 1,          // ★ 携带上限 1 个
    shopPrice: 30,           // ★ 商店价格 30 金币
    speedMul: 1.0, scope: false, adsSpeedMul: 1.0,
    mag: 0, startReserve: 0, reloadMs: 0
};

// ===== 武器 =====
const WEAPONS = {
    rifle: {
        key: 'rifle', name: '狂徒',
        dmgBody: 40, dmgHead: 160, dmgLeg: 34,
        fireMs: 102.6,
        adsFireRateMul: 0.9,
        mag: 25, reserveMax: 75, startReserve: 50, reloadMs: 2500,
        zoomFov: 62, scope: false,
        speedMul: 1.0, adsSpeedMul: 0.76,

        spread: 0,
        moveSpread: 0.012,
        airSpread: 0.055,

        recoil: {
            vertFirst: 0.012,
            vertPerShot: 0.0035,
            vertMax: 0.028,

            horizStart: 3,
            horizMax: 0.012,
            horizSwitchRate: 0.12,

            crouchMul: 0.85,
            adsMul: 0.90,
            moveMul: 1.15,

            maxOffsetPitch: 0.32,
            maxOffsetYaw: 0.22,
        },
    },

    sniper: {
        key: 'sniper', name: '冥驹',
        dmgBody: 150, dmgHead: 255, dmgLeg: 120,
        fireMs: 850,
        mag: 5, reserveMax: 10, startReserve: 10, reloadMs: 3700,
        zoomFov: 14, zoomFov2: 6,
        scope: true, boltMs: 850,
        speedMul: 0.72, adsSpeedMul: 0.72,

        spread: 0,
        moveSpread: 0.025,
        airSpread: 0.110,
    },

    shotgun: {
        key: 'shotgun', name: '判官',
        dmgBody: 22, dmgHead: 44, dmgLeg: 19,
        fireMs: 350, mag: 5, reserveMax: 15, startReserve: 15, reloadMs: 2400,
        zoomFov: 60, scope: false,
        speedMul: 0.80, adsSpeedMul: 0.78,
        pellets: 12, spread: 0.08,

        moveSpread: 0.000,
        airSpread: 0.010,
    },

    odin: {
        key: 'odin', name: '奥丁机枪',
        dmgBody: 38, dmgHead: 95, dmgLeg: 32,
        dmgBodyFar: 31, dmgHeadFar: 77, dmgLegFar: 26,
        falloffDistance: 30,

        fireMs: 83.3,
        minFireMs: 64.1,
        spinUpMs: 500,

        mag: 100, reserveMax: 200, startReserve: 200, reloadMs: 5000,
        zoomFov: 60, scope: false,
        speedMul: 0.85, adsSpeedMul: 0.7,

        spread: 0,
        moveSpread: 0.020,
        airSpread: 0.090,

        recoil: {
            vertFirst: 0.009,
            vertPerShot: 0.0011,
            vertMax: 0.016,

            horizStart: 8,
            horizMax: 0.0050,
            horizSwitchRate: 0.06,

            crouchMul: 0.55,
            adsMul: 0.65,
            moveMul: 1.90,

            maxOffsetPitch: 0.24,
            maxOffsetYaw: 0.11,
        },
    }
};