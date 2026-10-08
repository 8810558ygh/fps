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

const SMOKE = {
    key: 'smoke', name: '烟雾弹',
    throwSpeed: 20, throwUpBias: 0.35,
    gravity: GRAV,   // ★ 从 16 改为 GRAV (22)，与 cannon.js 物理世界一致
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
    gravity: GRAV,   // ★ 从 16 改为 GRAV (22)，与 cannon.js 物理世界一致
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

// ===== 武器 =====
// ★ 伤害字段（全部独立写死，不再用倍率）：
//   · dmgHead —— 头部伤害（含面罩）
//   · dmgBody —— 身体伤害（含手臂 / 手 / 背包）
//   · dmgLeg  —— 腿部伤害（含脚）
//
// ★ 距离衰减（可选配置）：
//   · falloffDistance —— 衰减阈值（米），命中距离 > 该值时走"远档"伤害
//   · dmgHeadFar / dmgBodyFar / dmgLegFar —— 远档伤害
//   未配置 falloffDistance 的武器，永远走近档（即原固定伤害逻辑）
const WEAPONS = {
    rifle: {
        key: 'rifle', name: '狂徒',
        dmgBody: 40, dmgHead: 160, dmgLeg: 34,
        fireMs: 203, mag: 25, reserveMax: 75, startReserve: 50, reloadMs: 2500,
        zoomFov: 62, scope: false,
        speedMul: 1.0, adsSpeedMul: 0.76
    },
    sniper: {
        key: 'sniper', name: '冥驹',
        dmgBody: 150, dmgHead: 255, dmgLeg: 120,
        fireMs: 850,
        mag: 5, reserveMax: 10, startReserve: 10, reloadMs: 3700,
        zoomFov: 14, zoomFov2: 6,
        scope: true, boltMs: 850,
        speedMul: 0.72, adsSpeedMul: 0.72
    },
    shotgun: {
        key: 'shotgun', name: '判官',
        dmgBody: 22, dmgHead: 44, dmgLeg: 19,
        fireMs: 350, mag: 5, reserveMax: 15, startReserve: 15, reloadMs: 2400,
        zoomFov: 60, scope: false,
        speedMul: 0.80, adsSpeedMul: 0.78,
        pellets: 10, spread: 0.08
    },
    // ★★★ 奥丁：本次修改重点 ★★★
    odin: {
        key: 'odin', name: '奥丁机枪',

        // ---- 近档伤害（命中距离 ≤ 30m）----
        dmgBody: 38, dmgHead: 95, dmgLeg: 32,
        // ---- 远档伤害（命中距离 > 30m）----
        dmgBodyFar: 31, dmgHeadFar: 77, dmgLegFar: 26,
        // ---- 距离衰减阈值（米）----
        falloffDistance: 30,

        // ---- 射速对齐官方 ----
        //   基础 12  发/秒 → 1000 / 12   ≈ 83.33ms
        //   峰值 15.6发/秒 → 1000 / 15.6 ≈ 64.10ms
        fireMs: 83.3,
        minFireMs: 64.1,
        spinUpMs: 500,

        mag: 100, reserveMax: 200, startReserve: 200, reloadMs: 5000,
        zoomFov: 60, scope: false,
        speedMul: 0.85, adsSpeedMul: 0.7
    }
};