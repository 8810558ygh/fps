// ===== js/game_state.js – 游戏状态、碰撞、脚步、通用辅助 =====

// ===== 游戏状态 =====
let running = false;
let matchStart = 0;
let gameMode = 'range';

let gameState = 'idle';
let stateEndTime = 0;
let roundNumber = 0;
let lastKillReport = null;

// ===== 复用的临时向量 =====
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ===== 联机客户端判断 =====
function isOnlineClientPlayer() {
    return typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.role === 'player'
        && !NET.isHost;
}

// ===== 是否结算画面 =====
function isOver() { return document.getElementById('endOverlay').style.display === 'flex'; }

// ===== 地形高度查询 =====
function terrainGroundAt(x, z) {
    if (typeof window.terrainHeightFn === 'function') {
        return window.terrainHeightFn(x, z);
    }
    return 0;
}
window.terrainGroundAt = terrainGroundAt;

// ===== 蹲下/站立眼睛高度 =====
function stanceEye(h) { return h <= HEIGHT_CROUCH + 0.01 ? EYE_CROUCH : EYE_STAND; }

// ===== 碰撞 =====
function canFit(p, h) {
    const r = 0.42;
    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        if (p.pos.y < top - 0.001 && p.pos.y + h > bot + 0.001) return false;
    }
    return true;
}

function collideWorld(p) {
    const lim = ARENA - 0.6;
    p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
    p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));
    const r = 0.42;
    const h = p.height;

    for (const c of colliders) {
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.vy <= 0 && p.pos.y < top && p.prevY >= top - 0.35 && p.pos.y >= bot - 0.01) {
            p.pos.y = top; p.vy = 0; p.onGround = true;
        }
        if (p.vy > 0 && p.pos.y < bot && p.pos.y + h >= bot && p.prevY + h <= bot + 0.001) {
            p.pos.y = bot - h; p.vy = 0;
        }
    }

    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;
        if (p.onGround && top > p.pos.y + 0.001 && top - p.pos.y <= STEP_UP) {
            p.pos.y = top; continue;
        }
        if (p.pos.y >= top - 0.001) continue;
        if (p.pos.y + h <= bot + 0.001) continue;
        const cx = Math.max(c.x0, Math.min(p.pos.x, c.x1));
        const cz = Math.max(c.z0, Math.min(p.pos.z, c.z1));
        const dx = p.pos.x - cx, dz = p.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
            if (d2 > 1e-6) {
                const d = Math.sqrt(d2), push = r - d;
                p.pos.x += dx / d * push;
                p.pos.z += dz / d * push;
            } else { p.pos.x += r; }
        }
    }

    // ★ 地形高度吸附（让玩家站在起伏沙丘上）
    const gh = terrainGroundAt(p.pos.x, p.pos.z);
    if (p.pos.y < gh) {
        p.pos.y = gh;
        if (p.vy < 0) p.vy = 0;
        p.onGround = true;
    }
}

function collidePlayers() {
    if (gameMode === 'online') return;
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.8 - d) / 2;
        const nx = dx / d, nz = dz / d;
        p1.pos.x -= nx * push; p1.pos.z -= nz * push;
        p2.pos.x += nx * push; p2.pos.z += nz * push;
    }
}

// ===== 脚步声 =====
const STRIDE_LENGTH = 2.0;
const STEP_MAX_AUDIBLE = 22;

function updateFootsteps(p, dt, now) {
    if (!running || gameState !== 'combat') { p._stepAccum = 0; return; }
    if (now < p.deadUntil) { p._stepAccum = 0; return; }
    const crouched = p.height < HEIGHT_STAND - 0.15;
    if (crouched) {
        p._stepAccum = 0;
        p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
        return;
    }
    if (p._prevStepX === undefined || p._prevStepZ === undefined) {
        p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
        p._stepAccum = 0; return;
    }
    const dx = p.pos.x - p._prevStepX;
    const dz = p.pos.z - p._prevStepZ;
    p._prevStepX = p.pos.x; p._prevStepZ = p.pos.z;
    if (!p.onGround) { p._stepAccum = Math.min(p._stepAccum || 0, STRIDE_LENGTH * 0.5); return; }
    const dist = Math.hypot(dx, dz);
    p._stepAccum = (p._stepAccum || 0) + dist;
    if (p._stepAccum >= STRIDE_LENGTH) {
        p._stepAccum -= STRIDE_LENGTH;
        if (p.id === 1) {
            sFootstepSelf();
        } else {
            const ex = p.pos.x - p1.pos.x;
            const ez = p.pos.z - p1.pos.z;
            const d = Math.hypot(ex, ez);
            if (d >= STEP_MAX_AUDIBLE) return;
            const t = 1 - d / STEP_MAX_AUDIBLE;
            const vol = t * t;
            const yaw = p1.yaw;
            const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
            const dotRight = ex * rightX + ez * rightZ;
            const pan = d > 0.3 ? Math.max(-1, Math.min(1, dotRight / d)) : 0;
            sFootstepEnemy(vol, pan);
        }
    }
}

// ===== 背刺判定 =====
function isBackAttack(attacker, victim) {
    if (!victim || !victim.mesh) return false;
    const toVictim = new THREE.Vector3().subVectors(victim.pos, attacker.pos);
    toVictim.y = 0;
    if (toVictim.lengthSq() < 1e-6) return false;
    toVictim.normalize();
    const victimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(victim.mesh.quaternion);
    victimDir.y = 0;
    if (victimDir.lengthSq() < 1e-6) return false;
    victimDir.normalize();
    return toVictim.dot(victimDir) > 0.3;
}

// ===== 换弹 =====
function startReload(p, now) {
    if (!running || gameState !== 'combat') return;
    if (p.isMelee || p.isSmoke || p.isFlash) return;
    const w = p.weapon;
    if (now < p.deadUntil || p.reloadEnd > now || p.ammo === w.mag || p.reserve <= 0) return;
    if (now < p.boltEnd) return;
    p.reloadEnd = now + w.reloadMs;
    p.aimStage = 0; p.aiming = false;
    if (p.input) p.input.aim = false;
    if (p.id === 1) mouse.aim = false;
    sReload(p.id);
}

// ===== 开镜切换 =====
function toggleAim() {
    if (!running || isOver() || gameState !== 'combat') return;
    if (p1.isMelee || p1.isSmoke || p1.isFlash) return;
    const now = performance.now();
    const p = p1;
    if (now < p.boltEnd || p.reloadEnd > now || now < p.deadUntil) return;
    const w = p.weapon;
    if (w.key === 'sniper') p.aimStage = (p.aimStage + 1) % 3;
    else p.aimStage = p.aimStage > 0 ? 0 : 1;
    p.input.aim = p.aimStage > 0;
    mouse.aim = p.input.aim;
}