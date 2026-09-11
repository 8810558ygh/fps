// ===== js/config.js – 游戏常量（狂徒、冥驹、判官、奥丁） =====
const ARENA = 26;            // 地图半径：26（地图 52×52）
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

// ===== 回合制新增 =====
const PREP_MS = 5000;
const ROUND_END_MS = 2500;

// 触摸设备检测
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;

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
        zoomFov: 14,           // ★ 一段开镜
        zoomFov2: 6,           // ★ 二段开镜（更放大）
        scope: true,
        boltMs: 850,           // ★ 拉栓时长
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