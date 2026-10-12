// ===== js/online_serialize.js – 字段表 / 对象池 / 序列化 / 增量构建 =====
// 从 online_game.js 拆出，不改变任何对外接口

const HIGH_FREQ_FIELDS = [
    'x', 'y', 'z',
    'yaw', 'pitch', 'fov',
    'aiming', 'aimStage',
    'reloadRemain', 'boltRemain', 'equipRemain',
    'meleeEndRemain', 'meleeRecoveryRemain',
    'throwFuseActive', 'throwFuseEndRemain',
    'flashRemain'
];

const LOW_FREQ_FIELDS = [
    'hp', 'armor', 'score',
    'ammo', 'reserve', 'weapon',
    'isMelee', 'isSmoke', 'isFlash',
    'meleeIsHeavy',
    'smokeCharges', 'flashCharges',
    'crouching', 'dead', 'visible',
    'throwFuseType', 'throwFuseInHand',
    'onGround',
    'ziplineActive',
    'ziplineLineIdx',
    'ziplineT',
    'ziplineDir'
];

// ============================================================
// ★ 对象池
// ============================================================
const _playerStateP1 = {};
const _playerStateP2 = {};

const _deltaBlue = {};
const _deltaRed  = {};

const _payloadBlue = { full: false, data: _deltaBlue };
const _payloadRed  = { full: false, data: _deltaRed  };

const _hostStatePacket = {
    type: 'hostState',
    tick: 0,
    timestamp: 0,
    hostSeat: null,
    mapId: null,
    roundNumber: 0,
    gameState: 'idle',
    stateEndTimeRemain: 0,
    bluePlayer: null,
    redPlayer: null,
};

const _lastLowFreqBlue = { _init: false };
const _lastLowFreqRed  = { _init: false };

(function _prewarmDeltaShape() {
    const all = HIGH_FREQ_FIELDS.concat(LOW_FREQ_FIELDS);
    for (let i = 0; i < all.length; i++) {
        _deltaBlue[all[i]] = undefined;
        _deltaRed[all[i]]  = undefined;
    }
})();

let _forceFullCounter = 0;
let _lastRoundNumber = -1;
let _lastConnCount = -1;

const _clientPlayerState = {
    blue: null,
    red: null
};

// ============================================================
// ★ 构建增量包
// ============================================================
function _buildPlayerPayload(full, lastLowFreq, forceFull, out) {
    if (forceFull || !lastLowFreq._init) {
        out.full = true;
        out.data = full;

        for (let i = 0; i < LOW_FREQ_FIELDS.length; i++) {
            const k = LOW_FREQ_FIELDS[i];
            lastLowFreq[k] = full[k];
        }
        lastLowFreq._init = true;
        return out;
    }

    out.full = false;
    const delta = out.data;

    for (let i = 0; i < HIGH_FREQ_FIELDS.length; i++) {
        const k = HIGH_FREQ_FIELDS[i];
        delta[k] = full[k];
    }

    for (let i = 0; i < LOW_FREQ_FIELDS.length; i++) {
        const k = LOW_FREQ_FIELDS[i];
        const v = full[k];
        if (v !== lastLowFreq[k]) {
            delta[k] = v;
            lastLowFreq[k] = v;
        } else {
            delta[k] = undefined;
        }
    }

    return out;
}

function _mergeDelta(side, payload) {
    if (!payload) return null;

    if (payload.full) {
        _clientPlayerState[side] = payload.data;
        return payload.data;
    }

    if (!_clientPlayerState[side]) {
        return null;
    }

    const merged = _clientPlayerState[side];
    const d = payload.data;
    for (const k in d) {
        const v = d[k];
        if (v !== undefined) {
            merged[k] = v;
        }
    }
    return merged;
}

// ============================================================
// ★ 序列化玩家状态
// ============================================================
function serializePlayer(p, out) {
    const now = performance.now();
    out.x = p.pos.x;
    out.y = p.pos.y;
    out.z = p.pos.z;
    out.yaw = p.yaw;
    out.pitch = p.pitch;
    out.hp = p.hp;
    out.armor = p.armor;
    out.score = p.score;
    out.weapon = p.isMelee ? 'knife' : (p.isSmoke ? 'smoke' : (p.isFlash ? 'flash' : p.weapon.key));
    out.ammo = p.ammo;
    out.reserve = p.reserve;
    out.fov = p.cam.fov;
    out.crouching = p.height < HEIGHT_STAND - 0.15;
    out.dead = p.hp <= 0 || p.deadUntil > now;
    out.visible = p.baseVisible;
    out.onGround = !!p.onGround;
    out.aiming = !!p.aiming;
    out.aimStage = p.aimStage || 0;
    out.isMelee = !!p.isMelee;
    out.isSmoke = !!p.isSmoke;
    out.isFlash = !!p.isFlash;
    out.meleeIsHeavy = !!p.meleeIsHeavy;
    out.smokeCharges = p.smokeCharges || 0;
    out.flashCharges = p.flashCharges || 0;
    out.reloadRemain = Math.max(0, p.reloadEnd - now);
    out.boltRemain = Math.max(0, p.boltEnd - now);
    out.equipRemain = Math.max(0, p.equipEnd - now);
    out.meleeEndRemain = Math.max(0, p.meleeEnd - now);
    out.meleeRecoveryRemain = Math.max(0, p.meleeRecovery - now);
    out.throwFuseActive = !!p.throwFuseActive;
    out.throwFuseType = p.throwFuseType || null;
    out.throwFuseEndRemain = p.throwFuseActive ? Math.max(0, p.throwFuseEnd - now) : 0;
    out.throwFuseInHand = !!p.throwFuseInHand;
    out.flashRemain = p.flashUntil > now ? (p.flashUntil - now) : 0;

    const zip = p.zipline;
    out.ziplineActive  = !!(zip && zip.active);
    out.ziplineLineIdx = (zip && zip.active) ? zip.lineIdx : -1;
    out.ziplineT       = (zip && zip.active) ? zip.t       : 0;
    out.ziplineDir     = (zip && zip.active) ? zip.dir     : 1;

    return out;
}