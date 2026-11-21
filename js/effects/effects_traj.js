// ===== js/effects_traj.js – 投掷轨迹预测 + 闪光指示器 =====
// 从 game_effects.js 拆出，不改变任何对外接口

let smokeTrajLine = null;
let flashTrajLine = null;

const SMOKE_TRAJ_STEPS = 300;
const SMOKE_TRAJ_DT = 1 / 60;
const TRAJ_RENDER_POINTS = 180;
const TRAJ_MAX_CONTACTS = 2;

// ============================================================
// 投掷轨迹 Vector3 对象池
// ============================================================
const TRAJ_POOL_SIZE = 320;
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
const _trajTmpPrev = new THREE.Vector3();
const _trajTmpNormal = new THREE.Vector3();
const _trajTmpCamera = new THREE.Vector3();
const _trajTmpDir = new THREE.Vector3();
const _trajTmpColor = new THREE.Color();
const _trajMarkerAxisZ = new THREE.Vector3(0, 0, 1);

const TRAJ_GRID_CELL = 4;
const TRAJ_GRID_OFFSET = 64;
const TRAJ_GRID_STRIDE = 256;
const _trajEmptyColliderList = [];
let _trajGridSource = null;
let _trajGridMapKey = '';
let _trajGridLength = -1;
const _trajColliderGrid = new Map();

function _trajGridKey(ix, iz) {
    return (ix + TRAJ_GRID_OFFSET) * TRAJ_GRID_STRIDE
        + (iz + TRAJ_GRID_OFFSET);
}

function _trajMapKey() {
    return (typeof window.getCurrentMapId === 'function' && window.getCurrentMapId())
        || (typeof currentMapId !== 'undefined' ? currentMapId : '')
        || '';
}

function _refreshTrajColliderGrid() {
    const source = (typeof colliders !== 'undefined' && Array.isArray(colliders))
        ? colliders
        : _trajEmptyColliderList;
    const mapKey = _trajMapKey();
    if (_trajGridSource === source
        && _trajGridMapKey === mapKey
        && _trajGridLength === source.length) {
        return;
    }

    _trajGridSource = source;
    _trajGridMapKey = mapKey;
    _trajGridLength = source.length;
    _trajColliderGrid.clear();

    const radius = (typeof SMOKE_PROJ_RADIUS !== 'undefined') ? SMOKE_PROJ_RADIUS : 0.09;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (!c
            || !Number.isFinite(c.x0) || !Number.isFinite(c.x1)
            || !Number.isFinite(c.z0) || !Number.isFinite(c.z1)) {
            continue;
        }
        const ix0 = Math.floor((Math.min(c.x0, c.x1) - radius) / TRAJ_GRID_CELL);
        const ix1 = Math.floor((Math.max(c.x0, c.x1) + radius) / TRAJ_GRID_CELL);
        const iz0 = Math.floor((Math.min(c.z0, c.z1) - radius) / TRAJ_GRID_CELL);
        const iz1 = Math.floor((Math.max(c.z0, c.z1) + radius) / TRAJ_GRID_CELL);
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                const key = _trajGridKey(ix, iz);
                let list = _trajColliderGrid.get(key);
                if (!list) {
                    list = [];
                    _trajColliderGrid.set(key, list);
                }
                list.push(c);
            }
        }
    }
}

function _trajNearbyColliders(x, z) {
    _refreshTrajColliderGrid();
    const ix = Math.floor(x / TRAJ_GRID_CELL);
    const iz = Math.floor(z / TRAJ_GRID_CELL);
    return _trajColliderGrid.get(_trajGridKey(ix, iz)) || _trajEmptyColliderList;
}

function _pushTrajPoint(pts, levels, x, y, z, bounceLevel) {
    const v = _acquireTrajVec();
    v.set(x, y, z);
    pts.push(v);
    levels.push(bounceLevel);
}

function _trajectoryWorldCollision(prev, pos, vel, radius) {
    const nearby = _trajNearbyColliders(pos.x, pos.z);
    for (let i = 0; i < nearby.length; i++) {
        const c = nearby[i];
        const x0 = Math.min(c.x0, c.x1) - radius;
        const x1 = Math.max(c.x0, c.x1) + radius;
        const z0 = Math.min(c.z0, c.z1) - radius;
        const z1 = Math.max(c.z0, c.z1) + radius;
        const bottom = (Number.isFinite(c.bottom) ? c.bottom : 0) - radius;
        const top = c.top + radius;

        if (pos.x < x0 || pos.x > x1
            || pos.z < z0 || pos.z > z1
            || pos.y < bottom || pos.y > top) {
            continue;
        }

        if (vel.y <= 0 && prev.y >= top) {
            pos.y = top;
            return { nx: 0, ny: 1, nz: 0, kind: 'world' };
        }
        if (vel.y > 0 && prev.y <= bottom) {
            pos.y = bottom;
            return { nx: 0, ny: -1, nz: 0, kind: 'world' };
        }
        if (vel.x > 0 && prev.x <= x0) {
            pos.x = x0;
            return { nx: -1, ny: 0, nz: 0, kind: 'world' };
        }
        if (vel.x < 0 && prev.x >= x1) {
            pos.x = x1;
            return { nx: 1, ny: 0, nz: 0, kind: 'world' };
        }
        if (vel.z > 0 && prev.z <= z0) {
            pos.z = z0;
            return { nx: 0, ny: 0, nz: -1, kind: 'world' };
        }
        if (vel.z < 0 && prev.z >= z1) {
            pos.z = z1;
            return { nx: 0, ny: 0, nz: 1, kind: 'world' };
        }

        // 从物体内部重新出现时，推到最近表面，避免预测线卡在碰撞盒中。
        const dMinX = pos.x - x0;
        const dMaxX = x1 - pos.x;
        const dMinY = pos.y - bottom;
        const dMaxY = top - pos.y;
        const dMinZ = pos.z - z0;
        const dMaxZ = z1 - pos.z;
        const minD = Math.min(dMinX, dMaxX, dMinY, dMaxY, dMinZ, dMaxZ);
        if (minD === dMaxY) {
            pos.y = top;
            return { nx: 0, ny: 1, nz: 0, kind: 'world' };
        }
        if (minD === dMinY) {
            pos.y = bottom;
            return { nx: 0, ny: -1, nz: 0, kind: 'world' };
        }
        if (minD === dMinX) {
            pos.x = x0;
            return { nx: -1, ny: 0, nz: 0, kind: 'world' };
        }
        if (minD === dMaxX) {
            pos.x = x1;
            return { nx: 1, ny: 0, nz: 0, kind: 'world' };
        }
        if (minD === dMinZ) {
            pos.z = z0;
            return { nx: 0, ny: 0, nz: -1, kind: 'world' };
        }
        pos.z = z1;
        return { nx: 0, ny: 0, nz: 1, kind: 'world' };
    }
    return null;
}

function _terrainNormalAt(x, z, terrainFn) {
    if (!terrainFn) return { nx: 0, ny: 1, nz: 0 };
    const e = 0.18;
    const dx = (terrainFn(x + e, z) - terrainFn(x - e, z)) / (2 * e);
    const dz = (terrainFn(x, z + e) - terrainFn(x, z - e)) / (2 * e);
    const len = Math.hypot(dx, 1, dz) || 1;
    return { nx: -dx / len, ny: 1 / len, nz: -dz / len };
}

function _bounceTrajectoryVelocity(vel, impact, restitution, friction) {
    _trajTmpNormal.set(impact.nx, impact.ny, impact.nz);
    const enteringSpeed = vel.dot(_trajTmpNormal);
    if (enteringSpeed >= 0) return;

    const bounce = Math.max(0, Math.min(1, Number(restitution) || 0));
    vel.addScaledVector(_trajTmpNormal, -(1 + bounce) * enteringSpeed);

    const normalSpeed = vel.dot(_trajTmpNormal);
    const tangentRetain = Math.max(0.52, 1 - Math.max(0, Number(friction) || 0) * 0.82);
    vel.x = _trajTmpNormal.x * normalSpeed
        + (vel.x - _trajTmpNormal.x * normalSpeed) * tangentRetain;
    vel.y = _trajTmpNormal.y * normalSpeed
        + (vel.y - _trajTmpNormal.y * normalSpeed) * tangentRetain;
    vel.z = _trajTmpNormal.z * normalSpeed
        + (vel.z - _trajTmpNormal.z * normalSpeed) * tangentRetain;
}

function simulateThrowTrajectory(
    origin, dir, throwSpeed, upBias, gravity, restitution,
    friction, steps, dt, fuseSeconds
) {
    _trajPoolIdx = 0;

    const pts = [];
    const levels = [];
    pts.impacts = [];
    pts.bounceLevels = levels;
    const vel = _trajTmpVel.copy(dir).multiplyScalar(throwSpeed);
    vel.y += upBias * throwSpeed;
    const pos = _trajTmpPos.copy(origin);
    const prev = _trajTmpPrev.copy(origin);

    const LINEAR_DAMPING = 0.05;
    const PROJ_RADIUS = (typeof SMOKE_PROJ_RADIUS !== 'undefined') ? SMOKE_PROJ_RADIUS : 0.09;
    const dampFactor = Math.pow(1 - LINEAR_DAMPING, dt);

    const terrainFn = (typeof window.terrainHeightFn === 'function') ? window.terrainHeightFn : null;
    const maxSteps = Math.max(1, Math.min(
        steps,
        Number.isFinite(fuseSeconds) ? Math.ceil(fuseSeconds / dt) : steps
    ));
    const arenaHalf = (typeof window.currentArenaHalf === 'number')
        ? window.currentArenaHalf
        : ((typeof ARENA !== 'undefined') ? ARENA : 26);
    const worldLimit = arenaHalf + 2;

    _pushTrajPoint(pts, levels, pos.x, pos.y, pos.z, 0);
    let contactCount = 0;
    let bounceLevel = 0;

    for (let i = 0; i < maxSteps; i++) {
        prev.copy(pos);

        vel.multiplyScalar(dampFactor);
        vel.y -= gravity * dt;
        pos.addScaledVector(vel, dt);

        const worldImpact = _trajectoryWorldCollision(prev, pos, vel, PROJ_RADIUS);
        const groundY = (terrainFn ? terrainFn(pos.x, pos.z) : 0) + PROJ_RADIUS;
        const hitTerrain = !worldImpact && pos.y <= groundY && vel.y <= 0;

        if (worldImpact || hitTerrain) {
            const impact = worldImpact
                || {
                    ..._terrainNormalAt(pos.x, pos.z, terrainFn),
                    kind: 'ground',
                };
            if (hitTerrain) pos.y = groundY;

            _pushTrajPoint(pts, levels, pos.x, pos.y, pos.z, bounceLevel);
            pts.impacts.push({
                x: pos.x, y: pos.y, z: pos.z,
                nx: impact.nx, ny: impact.ny, nz: impact.nz,
                kind: impact.kind,
            });
            _bounceTrajectoryVelocity(vel, impact, restitution, friction);
            contactCount++;

            if (contactCount >= TRAJ_MAX_CONTACTS
                || vel.lengthSq() < 0.36) {
                break;
            }
            bounceLevel++;
            continue;
        }

        if (Math.abs(pos.x) > worldLimit) {
            pos.x = Math.sign(pos.x) * worldLimit;
            vel.x *= -0.3;
        }
        if (Math.abs(pos.z) > worldLimit) {
            pos.z = Math.sign(pos.z) * worldLimit;
            vel.z *= -0.3;
        }

        _pushTrajPoint(pts, levels, pos.x, pos.y, pos.z, bounceLevel);
    }

    const visibleCount = pts.length;
    const finalPoint = pts[visibleCount - 1];
    if (!pts.impacts.length && finalPoint) {
        pts.impacts.push({
            x: finalPoint.x, y: finalPoint.y, z: finalPoint.z,
            nx: 0, ny: 1, nz: 0,
            kind: 'fuse',
        });
    }

    while (pts.length < steps && finalPoint) {
        _pushTrajPoint(
            pts, levels,
            finalPoint.x, finalPoint.y, finalPoint.z,
            levels[levels.length - 1] || 0
        );
    }
    pts.visibleCount = visibleCount;
    return pts;
}

let _trajDotTexture = null;

function _getTrajDotTexture() {
    if (_trajDotTexture) return _trajDotTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.52, 'rgba(255,255,255,0.92)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    _trajDotTexture = new THREE.CanvasTexture(canvas);
    _trajDotTexture.minFilter = THREE.LinearFilter;
    _trajDotTexture.magFilter = THREE.LinearFilter;
    if ('colorSpace' in _trajDotTexture && THREE.SRGBColorSpace) {
        _trajDotTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return _trajDotTexture;
}

function ensureTrajLine(existingVar, color) {
    const positions = new Float32Array(TRAJ_RENDER_POINTS * 3);
    const colors = new Float32Array(TRAJ_RENDER_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.PointsMaterial({
        size: 0.11,
        map: _getTrajDotTexture(),
        transparent: true,
        opacity: 0.98,
        alphaTest: 0.02,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 21;

    const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.19, 0.30, 32),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false,
        })
    );
    marker.renderOrder = 22;
    marker.frustumCulled = false;
    marker.visible = false;

    const group = new THREE.Group();
    group.add(points, marker);
    group.userData.points = points;
    group.userData.marker = marker;
    group.userData.baseColor = new THREE.Color(color);
    group.frustumCulled = false;
    group.renderOrder = 20;
    scene.add(group);
    return group;
}

function updateTrajLine(line, pts, now, camera) {
    const points = line.userData.points;
    const marker = line.userData.marker;
    const baseColor = line.userData.baseColor;
    const positionAttr = points.geometry.attributes.position;
    const colorAttr = points.geometry.attributes.color;
    const positions = positionAttr.array;
    const colors = colorAttr.array;
    const visibleCount = Math.max(2, Math.min(
        Number(pts.visibleCount) || pts.length,
        pts.length
    ));
    const drawCount = Math.min(TRAJ_RENDER_POINTS, visibleCount);
    const stride = drawCount > 1 ? (visibleCount - 1) / (drawCount - 1) : 0;

    for (let i = 0; i < drawCount; i++) {
        const sourceIndex = Math.min(visibleCount - 1, Math.round(i * stride));
        const p = pts[sourceIndex] || pts[visibleCount - 1];
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;

        const t = drawCount > 1 ? i / (drawCount - 1) : 0;
        const bounce = (pts.bounceLevels && pts.bounceLevels[sourceIndex]) || 0;
        const dim = (1 - t * 0.34) * (bounce > 0 ? 0.58 : 1);
        _trajTmpColor.copy(baseColor).multiplyScalar(dim);
        colors[i * 3] = _trajTmpColor.r;
        colors[i * 3 + 1] = _trajTmpColor.g;
        colors[i * 3 + 2] = _trajTmpColor.b;
    }

    points.geometry.setDrawRange(0, drawCount);
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    const impact = pts.impacts && pts.impacts[0];
    if (impact) {
        marker.visible = true;
        marker.position.set(impact.x, impact.y, impact.z);
        if (impact.kind === 'fuse') {
            _trajTmpCamera.copy(camera.position);
            _trajTmpCamera.sub(marker.position);
            if (_trajTmpCamera.lengthSq() < 1e-6) _trajTmpCamera.set(0, 1, 0);
            _trajTmpCamera.normalize();
            _trajTmpNormal.copy(_trajTmpCamera);
        } else {
            _trajTmpNormal.set(impact.nx, impact.ny, impact.nz);
        }
        marker.quaternion.setFromUnitVectors(
            _trajMarkerAxisZ,
            _trajTmpNormal
        );
        const pulse = 1 + Math.sin(now * 0.011) * 0.09;
        marker.scale.setScalar(pulse);
    } else {
        marker.visible = false;
    }
    line.visible = true;
}

function _updateGrenadeTrajectory(now, kind) {
    const p = (typeof p1 !== 'undefined') ? p1 : null;
    const isSmoke = kind === 'smoke';
    const selected = p && (isSmoke ? p.isSmoke : p.isFlash);
    const charges = p ? (isSmoke ? p.smokeCharges : p.flashCharges) : 0;
    const fuseInHand = p && p.throwFuseActive
        && p.throwFuseType === kind
        && p.throwFuseInHand;
    const show = selected
        && (charges > 0 || fuseInHand)
        && running && gameState === 'combat'
        && !isOver() && now >= p.deadUntil;

    let visual = isSmoke ? smokeTrajLine : flashTrajLine;
    if (!show) {
        if (visual) visual.visible = false;
        return;
    }
    if (!visual) {
        visual = ensureTrajLine(null, isSmoke ? 0x7ee08a : 0xffe066);
        if (isSmoke) smokeTrajLine = visual;
        else flashTrajLine = visual;
    }

    const origin = p.cam.getWorldPosition(_trajTmpCamera);
    const dir = _trajTmpDir.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const cfg = isSmoke ? SMOKE : FLASH;
    const fuseSeconds = fuseInHand
        ? Math.max(0, p.throwFuseEnd - now) / 1000
        : cfg.fuseMs / 1000;
    const pts = simulateThrowTrajectory(
        origin, dir, cfg.throwSpeed, cfg.throwUpBias,
        cfg.gravity, cfg.bounces, cfg.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT, fuseSeconds
    );
    updateTrajLine(visual, pts, now, p.cam);
}

function updateSmokeTrajectory(now) {
    _updateGrenadeTrajectory(now, 'smoke');
}

function updateFlashTrajectory(now) {
    _updateGrenadeTrajectory(now, 'flash');
}

window.warmupTrajectoryPreview = function () {
    if (typeof p1 === 'undefined' || !p1 || !p1.cam) return false;

    const now = performance.now();
    const origin = p1.cam.getWorldPosition(_trajTmpCamera);
    const dir = _trajTmpDir.set(0, 0, -1).applyQuaternion(p1.cam.quaternion);
    const smokePts = simulateThrowTrajectory(
        origin, dir, SMOKE.throwSpeed, SMOKE.throwUpBias,
        SMOKE.gravity, SMOKE.bounces, SMOKE.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT, 0.35
    );
    const flashPts = simulateThrowTrajectory(
        origin, dir, FLASH.throwSpeed, FLASH.throwUpBias,
        FLASH.gravity, FLASH.bounces, FLASH.friction,
        SMOKE_TRAJ_STEPS, SMOKE_TRAJ_DT, 0.35
    );

    if (!smokeTrajLine) smokeTrajLine = ensureTrajLine(null, 0x7ee08a);
    if (!flashTrajLine) flashTrajLine = ensureTrajLine(null, 0xffe066);
    updateTrajLine(smokeTrajLine, smokePts, now, p1.cam);
    updateTrajLine(flashTrajLine, flashPts, now, p1.cam);

    try {
        renderer.compile(scene, p1.cam);
        renderer.render(scene, p1.cam);
    } catch (e) {}

    smokeTrajLine.visible = false;
    flashTrajLine.visible = false;
    return true;
};

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
