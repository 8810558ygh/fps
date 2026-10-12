// ===== js/projectiles_flash.js – 闪光爆炸池 + 闪光投掷物 + 判定 + 覆盖层 =====
// 从 game_projectiles.js 拆出，不改变任何对外接口

// ============================================================
// 闪光弹爆炸特效池
// ============================================================
const FLASH_BURST_POOL_SIZE = 3;
const FLASH_BURST_LIFE_MS = 380;
const _flashBurstPool = [];
let _flashBurstPoolInited = false;

function initFlashBurstPool() {
    if (_flashBurstPoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _flashBurstPoolInited = true;

    const sharedGeo = new THREE.SphereGeometry(0.5, 20, 14);

    for (let i = 0; i < FLASH_BURST_POOL_SIZE; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const shell = new THREE.Mesh(sharedGeo, mat);
        shell.visible = false;
        shell.renderOrder = 90;
        shell.frustumCulled = false;
        scene.add(shell);

        const light = new THREE.PointLight(0xffffff, 0, 40);
        light.position.set(0, -1000, 0);
        scene.add(light);

        _flashBurstPool.push({
            shell,
            light,
            active: false,
            born: 0,
        });
    }
}

function _acquireFlashBurstSlot() {
    let slot = null;
    for (let i = 0; i < _flashBurstPool.length; i++) {
        if (!_flashBurstPool[i].active) { slot = _flashBurstPool[i]; break; }
    }
    if (!slot) {
        slot = _flashBurstPool[0];
        for (let i = 1; i < _flashBurstPool.length; i++) {
            if (_flashBurstPool[i].born < slot.born) slot = _flashBurstPool[i];
        }
    }
    return slot;
}

function updateFlashBursts(dt, now) {
    for (let i = 0; i < _flashBurstPool.length; i++) {
        const b = _flashBurstPool[i];
        if (!b.active) continue;

        const age = now - b.born;
        const t = age / FLASH_BURST_LIFE_MS;

        if (t >= 1) {
            b.active = false;
            b.shell.visible = false;
            b.shell.material.opacity = 0;
            b.light.intensity = 0;
            b.light.position.set(0, -1000, 0);
            continue;
        }

        const scale = 1 + t * 8;
        b.shell.scale.setScalar(scale);
        b.shell.material.opacity = 1 - t;
        b.light.intensity = 12 * (1 - t);
    }
}

// ============================================================
// 闪光投掷物生成
// ============================================================
function spawnFlashProjectile(pos, vel, fuseMs, now) {
    const mesh = createThrownProjectileMesh('flash');
    mesh.position.copy(pos);
    scene.add(mesh);

    let body = null;
    if (window.PHYSICS && window.PHYSICS.isReady()) {
        body = window.PHYSICS.createProjectileBody(pos, vel, 'flash');
    }

    activeFlashes.push({
        mesh, pos: pos.clone(), vel: vel.clone(),
        fuseEnd: now + fuseMs, state: 'flying',
        body
    });
}
window.spawnFlashProjectile = spawnFlashProjectile;

// ============================================================
// 闪光爆发
// ============================================================
function spawnFlashBurst(pos) {
    initFlashBurstPool();
    const slot = _acquireFlashBurstSlot();
    if (!slot) return;

    slot.active = true;
    slot.born = performance.now();

    slot.shell.position.copy(pos);
    slot.shell.scale.setScalar(1);
    slot.shell.material.opacity = 1;
    slot.shell.visible = true;

    slot.light.position.copy(pos);
    slot.light.intensity = 12;
}

// ============================================================
// 闪光判定
// ============================================================
function checkFlashHit(target, flashPos, now) {
    if (!target) return false;
    if (target.hp <= 0) return false;
    if (target.flashUntil > now) return false;
    if (typeof running !== 'undefined' && !running) return false;
    if (typeof gameState !== 'undefined' && gameState !== 'combat') return false;
    if (target.deadUntil > now) return false;

    const eye = new THREE.Vector3(target.pos.x, target.pos.y + target.eyeH, target.pos.z);
    const toFlash = flashPos.clone().sub(eye);
    const dist = toFlash.length();

    if (dist < 0.6) return true;
    if (dist > FLASH.maxDistance) return false;

    toFlash.normalize();

    let lookDir;
    if (target.id === 1 && target.cam) {
        lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(target.cam.quaternion);
    } else {
        const e = new THREE.Euler(target.pitch || 0, target.yaw || 0, 0, 'YXZ');
        lookDir = new THREE.Vector3(0, 0, -1).applyEuler(e);
    }

    const vFov = (target.id === 1 && target.cam ? target.cam.fov : BASE_FOV) * Math.PI / 180;
    const aspect = (target.id === 1 && target.cam ? target.cam.aspect : 1.6);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const maxHalfAngle = hFov / 2 + FLASH.minFovMargin;
    const cosAngle = toFlash.dot(lookDir);
    if (cosAngle < Math.cos(maxHalfAngle)) return false;

    const ray = new THREE.Raycaster(eye, toFlash, 0, dist - 0.3);
    const targets = wallMeshes.concat(crateMeshes);
    if (typeof activeSmokes !== 'undefined') {
        for (const s of activeSmokes) {
            if (!s.cloudMesh) continue;
            const layers = s.cloudMesh.userData.layers;
            let maxOp = 0;
            for (const m of layers) if (m.material.opacity > maxOp) maxOp = m.material.opacity;
            if (maxOp < 0.5) continue;
            s.cloudMesh.traverse(o => { if (o.isMesh) targets.push(o); });
        }
    }
    const hits = ray.intersectObjects(targets, false);
    if (hits.length > 0) return false;

    return true;
}

function detonateFlash(pos, now) {
    spawnFlashBurst(pos);
    if (typeof emitWorldSound === 'function') {
        emitWorldSound('flashDetonate', pos.x, pos.y, pos.z, false);
    } else if (typeof sFlashDetonate === 'function') {
        sFlashDetonate();
    }

    if (checkFlashHit(p1, pos, now)) {
        p1.flashUntil = now + FLASH.flashDurationMs;
    }
    if (checkFlashHit(p2, pos, now)) {
        p2.flashUntil = now + FLASH.flashDurationMs;
        if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
            if (typeof NET_broadcast === 'function') {
                NET_broadcast({ type: 'flashEvent', durationMs: FLASH.flashDurationMs });
            }
        }
    }
}

// ============================================================
// 更新闪光投掷物
// ============================================================
function updateFlashes(dt, now) {
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
        const s = activeFlashes[i];
        if (s.state === 'flying') {
            if (s.body) {
                s.pos.set(s.body.position.x, s.body.position.y, s.body.position.z);
                s.mesh.position.copy(s.pos);
                _projQuat.set(
                    s.body.quaternion.x, s.body.quaternion.y,
                    s.body.quaternion.z, s.body.quaternion.w
                );
                s.mesh.quaternion.copy(_projQuat);
            }

            if (now >= s.fuseEnd) {
                scene.remove(s.mesh);
                s.mesh = null;

                if (s.body) {
                    window.PHYSICS.removeProjectileBody(s.body);
                    s.body = null;
                }

                const isAuthority = (gameMode !== 'online') || (typeof NET !== 'undefined' && NET.isHost);
                if (isAuthority) {
                    detonateFlash(s.pos.clone(), now);
                } else {
                    spawnFlashBurst(s.pos.clone());
                    if (typeof emitWorldSound === 'function') {
                        emitWorldSound('flashDetonate', s.pos.x, s.pos.y, s.pos.z, false);
                    } else if (typeof sFlashDetonate === 'function') {
                        sFlashDetonate();
                    }
                }
                activeFlashes.splice(i, 1);
            }
        }
    }
}

// ============================================================
// 闪光覆盖层
// ============================================================
let flashOverlayEl = null;
function ensureFlashOverlay() {
    if (flashOverlayEl) return flashOverlayEl;
    const el = document.createElement('div');
    el.id = 'flashOverlay';
    el.style.cssText = `
        position: fixed; inset: 0; z-index: 45;
        background: #ffffff;
        pointer-events: none;
        opacity: 0;
        transition: none;
        will-change: opacity;
    `;
    document.body.appendChild(el);
    flashOverlayEl = el;
    return el;
}

function updateFlashOverlay(now) {
    const el = ensureFlashOverlay();
    if (typeof p1 === 'undefined' || !p1) { el.style.opacity = '0'; return; }
    const remain = p1.flashUntil - now;
    if (remain <= 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        return;
    }
    if (remain > FLASH.flashFadeMs) {
        if (el.style.opacity !== '1') el.style.opacity = '1';
    } else {
        el.style.opacity = String(remain / FLASH.flashFadeMs);
    }
}

// ============================================================
// 投掷闪光弹
// ============================================================
function throwFlash(p, now, fuseMs) {
    if (gameState !== 'combat') return;
    if (!p.isFlash) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    const effectiveFuseMs = (fuseMs !== undefined && fuseMs !== null) ? fuseMs : FLASH.fuseMs;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(FLASH.throwSpeed);
    vel.y += FLASH.throwUpBias * FLASH.throwSpeed;

    spawnFlashProjectile(origin, vel, effectiveFuseMs, now);

    if (typeof emitWorldSound === 'function') {
        emitWorldSound('flashThrow', p.pos.x, p.pos.y + p.eyeH, p.pos.z, p.id === 1);
    } else if (typeof sFlashThrow === 'function') {
        sFlashThrow();
    }

    if (gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.isHost
        && typeof NET_broadcast === 'function') {
        NET_broadcast({
            type: 'flashSpawn',
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}

// ============================================================
// 启动时初始化
// ============================================================
if (typeof scene !== 'undefined' && scene) {
    initFlashBurstPool();
}