// ===== js/zipline.js – 滑索系统（沙漠地图专用） =====

const ZIPLINES = [];
const _ziplineTowers = [];

const ZIPLINE_MOUNT_RADIUS  = 4.5;    // 水平挂载半径
const ZIPLINE_SPEED         = 12;     // 滑行速度 m/s
const ZIPLINE_DROP          = 2.2;    // 玩家在绳索下方的偏移
const ZIPLINE_ROPE_RADIUS   = 0.04;   // 绳索视觉半径

let _ziplinePromptEl   = null;
let _ziplinePromptText = '';

// ============================================================
// 注册
// ============================================================
function registerZipline(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    ZIPLINES.push({
        ax, ay, az,
        bx, by, bz,
        length,
        dx: dx / length,
        dy: dy / length,
        dz: dz / length,
        mesh: null,
    });
}

// ============================================================
// 建塔
// ============================================================
function buildZiplineTower(parent, x, topY, z, baseY) {
    if (typeof THREE === 'undefined') return null;

    const group = new THREE.Group();
    group.userData.isZiplineTower = true;

    if (baseY === undefined) baseY = topY - 15;
    const towerH = Math.max(2, topY - baseY);

    // 主柱
    const poleGeo = new THREE.CylinderGeometry(0.35, 0.55, towerH, 10);
    const poleMat = new THREE.MeshStandardMaterial({
        color: 0x4a4f56, metalness: 0.75, roughness: 0.55,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, baseY + towerH / 2, z);
    pole.castShadow = true;
    pole.receiveShadow = true;
    group.add(pole);

    // 顶部平台
    const topGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.35, 12);
    const topMat = new THREE.MeshStandardMaterial({
        color: 0x666b72, metalness: 0.85, roughness: 0.4,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(x, topY, z);
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // 警示灯球体
    const lightGeo = new THREE.SphereGeometry(0.28, 12, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const lightBall = new THREE.Mesh(lightGeo, lightMat);
    lightBall.position.set(x, topY + 0.8, z);
    group.add(lightBall);
    group.userData.warningLight = lightBall;

    // ★ 已移除 PointLight（原来塔顶 4 个 PointLight 会参与全局 shader 光照循环，
    //   即使 distance=12 且远离玩家，片元仍会为它算一遍）
    // ★ 视觉上的红色警示灯由上方 MeshBasicMaterial 红球保留，效果不变

    parent.add(group);
    _ziplineTowers.push(group);
    return group;
}

// ============================================================
// 建绳索
// ============================================================
function buildZiplineRope(parent, line) {
    if (typeof THREE === 'undefined') return null;

    const start = new THREE.Vector3(line.ax, line.ay, line.az);
    const end   = new THREE.Vector3(line.bx, line.by, line.bz);
    const curve = new THREE.LineCurve3(start, end);

    const segs = Math.max(12, Math.floor(line.length / 2));
    const tubeGeo = new THREE.TubeGeometry(curve, segs, ZIPLINE_ROPE_RADIUS, 6, false);
    const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x2a2e33,
        metalness: 0.9,
        roughness: 0.35,
        emissive: 0x0a0c10,
        emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    line.mesh = mesh;
    return mesh;
}

// ============================================================
// 每帧更新滑索移动
// ============================================================
function updateZiplineMovement(p, dt, now) {
    if (!p) return false;

    // lazy init
    if (!p.zipline) {
        p.zipline = { active: false, lineIdx: -1, t: 0, dir: 1 };
        return false;
    }

    // 非战斗状态自动脱离
    if (typeof gameState !== 'undefined' && gameState !== 'combat') {
        if (p.zipline.active) p.zipline.active = false;
        return false;
    }
    if (typeof running !== 'undefined' && !running) {
        if (p.zipline.active) p.zipline.active = false;
        return false;
    }
    if (p.deadUntil > now) {
        if (p.zipline.active) p.zipline.active = false;
        return false;
    }

    if (!p.zipline.active) return false;

    const line = ZIPLINES[p.zipline.lineIdx];
    if (!line) {
        p.zipline.active = false;
        return false;
    }

    // 沿绳索推进
    const dtT = (ZIPLINE_SPEED * dt) / line.length;
    p.zipline.t += dtT * p.zipline.dir;

    // 到达端点 → 自动脱落（无硬直）
    if (p.zipline.t >= 1 || p.zipline.t <= 0) {
        const atB = p.zipline.t >= 1;
        p.zipline.t = atB ? 1 : 0;
        p.zipline.active = false;

        const endX = atB ? line.bx : line.ax;
        const endY = atB ? line.by : line.ay;
        const endZ = atB ? line.bz : line.az;

        p.pos.set(endX, endY - ZIPLINE_DROP, endZ);
        p.vy = 0;
        p.onGround = false;
        p.prevY = p.pos.y;

        // ★ 自动脱落：清除 pending，不触发硬直
        p._zipStunPending = false;

        if (typeof window.PHYSICS !== 'undefined'
            && window.PHYSICS
            && window.PHYSICS.isReady && window.PHYSICS.isReady()) {
            try { window.PHYSICS.teleportPlayerBody(p); } catch (e) {}
        }
        return false;
    }

    // 计算绳索当前点
    const t = p.zipline.t;
    const cx = line.ax + (line.bx - line.ax) * t;
    const cy = line.ay + (line.by - line.ay) * t;
    const cz = line.az + (line.bz - line.az) * t;

    p.pos.set(cx, cy - ZIPLINE_DROP, cz);
    p.vy = 0;
    p.prevY = p.pos.y;
    p.onGround = false;

    return true;
}

// ============================================================
// 尝试挂载（按 F 调用）
// ============================================================
function tryMountZipline(p) {
    if (!p) return false;
    if (typeof running !== 'undefined' && !running) return false;
    if (typeof isOver === 'function' && isOver()) return false;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return false;
    if (p.deadUntil > performance.now()) return false;
    // ★ 硬直期间禁止挂索
    if (typeof _isPlayerStunned === 'function' && _isPlayerStunned(p)) return false;

    if (!p.zipline) p.zipline = { active: false, lineIdx: -1, t: 0, dir: 1 };
    if (p.zipline.active) return false;

    // 玩家当前水平朝向
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);

    let bestLine  = -1;
    let bestEnd   = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < ZIPLINES.length; i++) {
        const line = ZIPLINES[i];

        const da = Math.hypot(p.pos.x - line.ax, p.pos.z - line.az);
        if (da < ZIPLINE_MOUNT_RADIUS) {
            const dot = fx * line.dx + fz * line.dz;
            const score = dot * 10 - da;
            if (score > bestScore) {
                bestScore = score;
                bestLine  = i;
                bestEnd   = 0;
            }
        }

        const db = Math.hypot(p.pos.x - line.bx, p.pos.z - line.bz);
        if (db < ZIPLINE_MOUNT_RADIUS) {
            const dot = -(fx * line.dx + fz * line.dz);
            const score = dot * 10 - db;
            if (score > bestScore) {
                bestScore = score;
                bestLine  = i;
                bestEnd   = 1;
            }
        }
    }

    if (bestLine < 0) return false;

    p.zipline.active  = true;
    p.zipline.lineIdx = bestLine;
    p.zipline.t       = (bestEnd === 0) ? 0 : 1;
    p.zipline.dir     = (bestEnd === 0) ? 1 : -1;

    // ★ 挂载瞬间把视角对准滑行方向
    const line = ZIPLINES[bestLine];
    const dirX = line.dx * p.zipline.dir;
    const dirZ = line.dz * p.zipline.dir;
    if (Math.abs(dirX) + Math.abs(dirZ) > 0.001) {
        p.yaw = Math.atan2(-dirX, -dirZ);
    }
    p.pitch = 0;

    if (typeof sPickup === 'function') sPickup(1);
    return true;
}

// ============================================================
// 主动脱离（按空格调用）
//   ★ 标记 _zipStunPending，落地时触发 1s 硬直
// ============================================================
function dismountZipline(p) {
    if (!p || !p.zipline || !p.zipline.active) return false;
    p.zipline.active = false;
    p.vy = 0;
    p.onGround = false;
    p.prevY = p.pos.y;

    // ★ 标记：落地时进入硬直
    p._zipStunPending = true;

    return true;
}

// ============================================================
// 获取提示文本
// ============================================================
function getNearestZiplinePrompt(p) {
    if (!p) return null;
    if (typeof running !== 'undefined' && !running) return null;
    if (typeof isOver === 'function' && isOver()) return null;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return null;
    if (p.deadUntil > performance.now()) return null;

    if (p.zipline && p.zipline.active) return '滑索中 · 按 空格 脱离';

    // ★ 硬直期间不提示挂索
    if (typeof _isPlayerStunned === 'function' && _isPlayerStunned(p)) return null;

    for (let i = 0; i < ZIPLINES.length; i++) {
        const line = ZIPLINES[i];
        const da = Math.hypot(p.pos.x - line.ax, p.pos.z - line.az);
        if (da < ZIPLINE_MOUNT_RADIUS) return '按 F 挂载滑索';
        const db = Math.hypot(p.pos.x - line.bx, p.pos.z - line.bz);
        if (db < ZIPLINE_MOUNT_RADIUS) return '按 F 挂载滑索';
    }
    return null;
}

// ============================================================
// 提示元素（懒创建）
// ============================================================
function ensureZiplinePrompt() {
    if (_ziplinePromptEl) return _ziplinePromptEl;
    if (typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'ziplinePrompt';
    el.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:160px',
        'transform:translateX(-50%)',
        'z-index:16',
        'padding:8px 22px',
        'background:rgba(255,210,74,0.92)',
        'color:#08131f',
        'border-radius:8px',
        'font-size:15px',
        'font-weight:700',
        'letter-spacing:2px',
        'pointer-events:none',
        'display:none',
        'box-shadow:0 6px 20px rgba(0,0,0,0.6)',
        'font-family:"Microsoft YaHei",Arial,sans-serif',
    ].join(';');
    document.body.appendChild(el);
    _ziplinePromptEl = el;
    return el;
}

function updateZiplinePrompt(p) {
    const el = ensureZiplinePrompt();
    if (!el) return;

    const text = getNearestZiplinePrompt(p);
    if (text) {
        if (_ziplinePromptText !== text) {
            el.textContent = text;
            _ziplinePromptText = text;
        }
        if (el.style.display !== 'block') el.style.display = 'block';
    } else {
        if (el.style.display !== 'none') el.style.display = 'none';
    }
}

// ============================================================
// 塔警示灯呼吸效果（每帧调用）
// ============================================================
function updateZiplineTowerLights(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    for (let i = 0; i < _ziplineTowers.length; i++) {
        const g = _ziplineTowers[i];
        if (!g.userData) continue;
        const l = g.userData.light;
        if (l) l.intensity = 0.3 + pulse * 0.8;
    }
}

// ============================================================
// 清空（切图时由 scene.js 调用）
// ============================================================
function clearZiplines() {
    for (let i = 0; i < ZIPLINES.length; i++) {
        ZIPLINES[i].mesh = null;
    }
    ZIPLINES.length = 0;
    _ziplineTowers.length = 0;
}

// ============================================================
// 暴露
// ============================================================
window.ZIPLINES                 = ZIPLINES;
window.registerZipline          = registerZipline;
window.buildZiplineTower        = buildZiplineTower;
window.buildZiplineRope         = buildZiplineRope;
window.updateZiplineMovement    = updateZiplineMovement;
window.tryMountZipline          = tryMountZipline;
window.dismountZipline          = dismountZipline;
window.getNearestZiplinePrompt  = getNearestZiplinePrompt;
window.updateZiplinePrompt      = updateZiplinePrompt;
window.updateZiplineTowerLights = updateZiplineTowerLights;
window.clearZiplines            = clearZiplines;

console.log('[zipline] 滑索系统已就绪');