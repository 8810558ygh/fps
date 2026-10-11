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

// ===== 后坐力恢复参数（全局，每帧更新） =====
const RECOIL_RECOVER_DELAY_MS = 100;
const RECOIL_RECOVER_RATE     = 2.2;
const RECOIL_MIN_THRESHOLD    = 0.0006;

// ===== 近战武器 =====
const MELEE = {
    key: 'knife', name: '军刀',
    range: 1.6,
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
//
// ★ 开镜射速倍率（可选配置）：
//   · adsFireRateMul —— 开镜后射速 = 腰射射速 × 该系数
//     例如 0.9 表示开镜后射速为腰射的 90%
//     未配置的武器开镜不影响射速
//
// ★ 后坐力（可选配置）：
//   · 未配置 recoil 字段的武器无后坐力
//   · 数值单位为弧度（1 rad ≈ 57.3°）
//
// ★ 移动/跳跃散布（可选配置）：
//   · spread     —— 基础散布（静止时也生效，一般 0 或霰弹枪自身散）
//   · moveSpread —— 地面移动时额外叠加的散布（弧度）
//   · airSpread  —— 空中时额外叠加的散布（弧度）
//   未配置的字段视为 0，即不惩罚
const WEAPONS = {
    // ============================================================
    // 狂徒（对齐《无畏契约》Vandal）
    // ============================================================
    rifle: {
        key: 'rifle', name: '狂徒',
        dmgBody: 40, dmgHead: 160, dmgLeg: 34,
        // 射速：9.75 发/秒 → 1000 / 9.75 ≈ 102.6ms
        fireMs: 102.6,
        // 开镜射速 = 腰射 × 0.9 = 8.775 发/秒
        adsFireRateMul: 0.9,
        mag: 25, reserveMax: 75, startReserve: 50, reloadMs: 2500,
        zoomFov: 62, scope: false,
        speedMul: 1.0, adsSpeedMul: 0.76,

        // ★ 新增：移动 / 跳跃散布
        spread: 0,            // 静止时 0（保留第一发绝对精准）
        moveSpread: 0.012,    // 地面移动：轻微飘
        airSpread: 0.055,     // 空中：中远距离基本打空

        // ============================================================
        // ★★★ 后坐力配置（对齐无畏契约狂徒的"前几发精准"特性）★★★
        // ============================================================
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

    // ============================================================
    // 冥驹（狙击枪，无后坐力配置）
    // ============================================================
    sniper: {
        key: 'sniper', name: '冥驹',
        dmgBody: 150, dmgHead: 255, dmgLeg: 120,
        fireMs: 850,
        mag: 5, reserveMax: 10, startReserve: 10, reloadMs: 3700,
        zoomFov: 14, zoomFov2: 6,
        scope: true, boltMs: 850,
        speedMul: 0.72, adsSpeedMul: 0.72,

        // ★ 新增：移动 / 跳跃散布
        spread: 0,
        moveSpread: 0.025,    // 跑狙飘得明显
        airSpread: 0.110,     // ★ 跳狙几乎必空
    },

    // ============================================================
    // 判官（霰弹枪，无后坐力配置）
    // ============================================================
    shotgun: {
        key: 'shotgun', name: '判官',
        dmgBody: 22, dmgHead: 44, dmgLeg: 19,
        fireMs: 350, mag: 5, reserveMax: 15, startReserve: 15, reloadMs: 2400,
        zoomFov: 60, scope: false,
        speedMul: 0.80, adsSpeedMul: 0.78,
        pellets: 12, spread: 0.08,

        // ★ 新增：移动 / 跳跃散布（霰弹本来就散，这两项几乎为 0）
        moveSpread: 0.000,    // 走位不影响喷射
        airSpread: 0.010,     // ★ 跳喷照旧
    },

    // ============================================================
    // 奥丁（重机枪）
    // ============================================================
    odin: {
        key: 'odin', name: '奥丁机枪',
        dmgBody: 38, dmgHead: 95, dmgLeg: 32,
        dmgBodyFar: 31, dmgHeadFar: 77, dmgLegFar: 26,
        falloffDistance: 30,

        // 基础 12 发/秒 ≈ 83.33ms；峰值 15.6 发/秒 ≈ 64.10ms
        fireMs: 83.3,
        minFireMs: 64.1,
        spinUpMs: 500,

        mag: 100, reserveMax: 200, startReserve: 200, reloadMs: 5000,
        zoomFov: 60, scope: false,
        speedMul: 0.85, adsSpeedMul: 0.7,

        // ★ 新增：移动 / 跳跃散布（站桩武器，惩罚重）
        spread: 0,
        moveSpread: 0.020,    // 重机枪移动更飘
        airSpread: 0.090,     // ★ 跳起来扫射 = 浪费子弹

        // ============================================================
        // ★★★ 奥丁后坐力配置（站撸激光 · 跑打惩罚重）★★★
        // ============================================================
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