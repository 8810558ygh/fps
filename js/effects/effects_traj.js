// ===== js/effects_traj.js – 投掷轨迹线 + 闪光指示器 =====
// 从 game_effects.js 拆出，不改变任何对外接口

let smokeTrajLine = null;
let flashTrajLine = null;

const SMOKE_TRAJ_STEPS = 144;
const SMOKE_TRAJ_DT = 1 / 60;

// ============================================================
// 投掷轨迹 Vector3 对象池
// ============================================================
const TRAJ_POOL_SIZE = 288;
const _trajPool = [];
for (let i = 0; i < TRAJ_POOL_SIZE; i++) {
    _trajPool.push(new THREE.Vector3());
}
let _trajPoolIdx = 0;

function _acquireTrajVec() {
    const v = _trajPool[_trajPoolIdx];
    _trajPoolIdx = (_trajPoolIdx + 1) % TRAJ_POOL_SIZE;
    return v;
}

const _trajTmpVel = new THREE.Vector3();
const _trajTmpPos = new THREE.Vector3();

function simulateThrowTrajectory(origin, dir, throwSpeed, upBias, gravity, bounces, friction, steps, dt) {
    _trajPoolIdx = 0;

    const pts = [];
    const vel = _trajTmpVel.copy(dir).multiplyScalar(throwSpeed);
    vel.y += upBias * throwSpeed;
    const pos = _trajTmpPos.copy(origin);

    let stopped = false;
    let restX = pos.x, restY = pos.y, restZ = pos.z;

    const LINEAR_DAMPING = 0.05;
    const GROUND_Y = (typeof SMOKE_PROJ_RADIUS !== 'undefined') ? SMOKE_PROJ_RADIUS : 0.09;
    const dampFactor = Math.pow(1 - LINEAR_DAMPING, dt);

    for (let i = 0; i < steps; i++) {
        if (stopped) {
            const v = _acquireTrajVec();
            v.set(restX, restY, restZ);
            pts.push(v);
            continue;
        }

        const v = _acquireTrajVec();
        v.copy(pos);
        pts.push(v);

        vel.multiplyScalar(dampFactor);

        vel.y -= gravity * dt;
        pos.addScaledVector(vel, dt);

        if (pos.y <= GROUND_Y) {
            pos.y = GROUND_Y;
            if (Math.abs(vel.y) > 0.8) {
                vel.y = -vel.y * bounces;
                vel.x *= friction;
                vel.z *= friction;
            } else {
                vel.y = 0;
                vel.x *= 0.2; vel.z *= 0.2;
                if (vel.lengthSq() < 0.05) {
                    stopped = true;
                    restX = pos.x; restY = pos.y; restZ = pos.z;
                }
            }
        }
        if (Math.abs(pos.x) > ARENA - 0.5) {
            pos.x = Math.sign(pos.x) * (ARENA - 0.5);
            vel.x *= -0.3;
        }
        if (Math.abs(pos.z) > ARENA - 0.5) {
            pos.z = Math.sign(pos.z) * (ARENA - 0.5);
            vel.z *= -0.3;
        }
    }
    return pts;
}

function ensureTrajLine(existingVar, color) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SMOKE_TRAJ_STEPS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.9, depthTest: false
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 20;
    scene.add(line);
    return line;
}

function updateTrajLine(line, pts) {
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i < SMOKE_TRAJ_STEPS; i++) {
        const p = pts[i] || pts[pts.length - 1];
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.visible = true;
}

function updateSmokeTrajectory(now) {
    const p = (typeof p1 !== 'undefined') ? p1 : null;
    const inHand = p && p.isSmoke
        && (p.smokeCharges > 0
            || (p.throwFuseActive && p.throwFuseType === 'smoke' && p.throwFuseInHand));

    const show = inHand
        && running && gameState === 'combat'
        && !isOver() && now >= p.deadUntil;

    if (!show) { if (smokeTrajLine) smokeTrajLine.visible = false; return; }
    if (!smokeTrajLine) smokeTrajLine = ensureTrajLine(null, 0x7ee08a);

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, SMOKE.throwSpeed, SMOKE.throwUpBias,
        SMOKE.gravity, SMOKE.bounces, SMOKE.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(smokeTrajLine, pts);
}

function updateFlashTrajectory(now) {
    const p = (typeof p1 !== 'undefined') ? p1 : null;
    const inHand = p && p.isFlash
        && (p.flashCharges > 0
            || (p.throwFuseActive && p.throwFuseType === 'flash' && p.throwFuseInHand));

    const show = inHand
        && running && gameState === 'combat'
        && !isOver() && now >= p.deadUntil;

    if (!show) { if (flashTrajLine) flashTrajLine.visible = false; return; }
    if (!flashTrajLine) flashTrajLine = ensureTrajLine(null, 0xffe066);

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pts = simulateThrowTrajectory(
        origin, dir, FLASH.throwSpeed, FLASH.throwUpBias,
        FLASH.gravity, FLASH.bounces, FLASH.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT
    );
    updateTrajLine(flashTrajLine, pts);
}

// ============================================================
// 闪光指示器
// ============================================================
function updateFlashIndicators(now) {
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

    for (const p of [p1, p2]) {
        if (!p || !p.flashIndicator) continue;

        const isFlashed = p.flashUntil > now
            && p.baseVisible
            && p.hp > 0
            && p.deadUntil <= now;

        if (isFlashed) {
            const remain = p.flashUntil - now;
            const total = FLASH.flashDurationMs;
            const t = Math.max(0, Math.min(1, remain / total));

            p.flashIndicator.visible = true;

            const pulse = 1 + Math.sin(now * 0.012) * 0.12;
            p.flashIndicator.scale.setScalar(pulse);

            const sphere = p.flashIndicator.userData.sphere;
            const halo   = p.flashIndicator.userData.halo;
            const light  = p.flashIndicator.userData.light;

            if (sphere) sphere.material.opacity = 0.85 * t;
            if (halo)   halo.material.opacity   = 0.45 * t;
            if (light)  light.intensity = 5.0 * t;
        } else if (p.flashIndicator.visible) {
            p.flashIndicator.visible = false;
            const light = p.flashIndicator.userData.light;
            if (light) light.intensity = 0;
        }
    }
}
window.updateFlashIndicators = updateFlashIndicators;

window.dumpTrajPool = function () {
    console.log(
        `[effects] 投掷轨迹池: 容量 ${TRAJ_POOL_SIZE} / 当前索引 ${_trajPoolIdx}`
    );
    return {
        size: TRAJ_POOL_SIZE,
        idx: _trajPoolIdx,
    };
};