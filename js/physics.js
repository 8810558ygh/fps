// ===== js/physics.js – cannon.js 物理世界（第 3 阶段 + 弹壳支持 + Body 池化） =====

(function () {
    'use strict';
    if (typeof CANNON === 'undefined') {
        console.error('[physics] cannon.js 未加载，物理功能已禁用');
        return;
    }

    // ============================================================
    // 1. 世界
    // ============================================================
    const world = new CANNON.World();
    world.gravity.set(0, -GRAV, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.0;
    world.defaultContactMaterial.restitution = 0.0;
    world.solver.iterations = 6;
    world.solver.tolerance = 0.001;

    // ============================================================
    // 2. 材质
    // ============================================================
    const MAT_GROUND     = new CANNON.Material('ground');
    const MAT_PLAYER     = new CANNON.Material('player');
    const MAT_PROJECTILE = new CANNON.Material('projectile');

    world.addContactMaterial(new CANNON.ContactMaterial(
        MAT_PLAYER, MAT_GROUND, { friction: 0.0, restitution: 0.0 }
    ));
    world.addContactMaterial(new CANNON.ContactMaterial(
        MAT_PROJECTILE, MAT_GROUND, { friction: 0.55, restitution: 0.35 }
    ));
    world.addContactMaterial(new CANNON.ContactMaterial(
        MAT_PROJECTILE, MAT_PLAYER, { friction: 0.4, restitution: 0.4 }
    ));

    // ============================================================
    // 3. 静态世界
    // ============================================================
    const staticBodies = [];

    function rebuildStaticBodies() {
        for (const b of staticBodies) world.removeBody(b);
        staticBodies.length = 0;

        // 隐形地面
        {
            // ★ 修改：动态地面半宽
            const arenaHalf = (typeof window.currentArenaHalf === 'number')
                ? window.currentArenaHalf
                : ((typeof ARENA !== 'undefined') ? ARENA : 26);
            const groundHalf = arenaHalf + 2;

            const groundShape = new CANNON.Box(
                new CANNON.Vec3(groundHalf, 0.5, groundHalf)
            );
            const groundBody = new CANNON.Body({
                mass: 0, shape: groundShape, material: MAT_GROUND
            });
            groundBody.position.set(0, -0.5, 0);
            groundBody.userData = { type: 'ground' };
            world.addBody(groundBody);
            staticBodies.push(groundBody);
        }

        if (typeof colliders === 'undefined' || !Array.isArray(colliders)) {
            console.warn('[physics] colliders 不存在，跳过静态刚体重建');
            return;
        }

        for (const c of colliders) {
            const halfX = (c.x1 - c.x0) / 2;
            const bottom = c.bottom || 0;
            const halfY = (c.top - bottom) / 2;
            const halfZ = (c.z1 - c.z0) / 2;
            if (halfX <= 0.001 || halfY <= 0.001 || halfZ <= 0.001) continue;

            const shape = new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ));
            const body = new CANNON.Body({ mass: 0, shape, material: MAT_GROUND });
            body.position.set((c.x0 + c.x1) / 2, bottom + halfY, (c.z0 + c.z1) / 2);
            body.userData = { type: 'world' };
            world.addBody(body);
            staticBodies.push(body);
        }
        console.log('[physics] 静态刚体重建完成:', staticBodies.length, '（含 1 个地面）');
    }

    // ============================================================
    // 4. 固定时间步进（含"无动态刚体则跳过"优化）
    // ============================================================
    const FIXED_STEP = 1 / 60;
    const MAX_SUBSTEPS = 3;
    let accumulator = 0;

    function stepPhysics(dt) {
        if (dt <= 0) return;

        let hasDynamic = false;
        for (let i = 0; i < world.bodies.length; i++) {
            const b = world.bodies[i];
            if (b.type === CANNON.Body.DYNAMIC && b.mass > 0) {
                hasDynamic = true;
                break;
            }
        }
        if (!hasDynamic) {
            accumulator = 0;
            return;
        }

        if (dt > 0.1) dt = 0.1;
        accumulator += dt;

        let steps = 0;
        while (accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
            world.step(FIXED_STEP);
            accumulator -= FIXED_STEP;
            steps++;
        }
        if (steps >= MAX_SUBSTEPS) accumulator = 0;
    }

    // ============================================================
    // 5. 玩家刚体（KINEMATIC 影子）
    // ============================================================
    const PLAYER_RADIUS  = 0.42;
    const PLAYER_TOTAL_H = (typeof HEIGHT_STAND !== 'undefined') ? HEIGHT_STAND : 1.84;
    const PLAYER_HALF_H  = PLAYER_TOTAL_H / 2;

    const _sphereOffsets = [
        new CANNON.Vec3(0, PLAYER_RADIUS - PLAYER_HALF_H, 0),
        new CANNON.Vec3(0, 0, 0),
        new CANNON.Vec3(0, PLAYER_HALF_H - PLAYER_RADIUS, 0)
    ];

    const playerBodies = new Map();

    function createPlayerBody(p) {
        if (playerBodies.has(p.id)) return playerBodies.get(p.id);

        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            material: MAT_PLAYER,
            fixedRotation: true
        });

        for (const off of _sphereOffsets) {
            const sphere = new CANNON.Sphere(PLAYER_RADIUS);
            sphere.__offset = { x: off.x, y: off.y, z: off.z };
            body.addShape(sphere, off);
        }

        body.position.set(p.pos.x, p.pos.y + PLAYER_HALF_H, p.pos.z);
        body.userData = { type: 'player', playerId: p.id };
        world.addBody(body);
        playerBodies.set(p.id, body);
        console.log('[physics] 玩家刚体已创建, id =', p.id);
        return body;
    }

    function getPlayerBody(p) { return playerBodies.get(p.id); }

    function removePlayerBody(p) {
        const body = playerBodies.get(p.id);
        if (!body) return;
        world.removeBody(body);
        playerBodies.delete(p.id);
    }

    function teleportPlayerBody(p) {
        const body = playerBodies.get(p.id);
        if (!body) return;
        body.position.set(p.pos.x, p.pos.y + PLAYER_HALF_H, p.pos.z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }

    function syncPlayerToBody(p, dt) {
        const body = playerBodies.get(p.id);
        if (!body) return;

        const newX = p.pos.x;
        const newY = p.pos.y + PLAYER_HALF_H;
        const newZ = p.pos.z;

        if (dt && dt > 0) {
            body.velocity.set(
                (newX - body.position.x) / dt,
                (newY - body.position.y) / dt,
                (newZ - body.position.z) / dt
            );
        }

        body.position.set(newX, newY, newZ);
    }

    // ============================================================
    // 6. 投掷物刚体（★ 对象池化）
    // ============================================================
    const PROJECTILE_POOL_SIZE = 6;
    const _projectilePoolSmoke = [];
    const _projectilePoolFlash = [];

    function _makeProjectileBody(kind) {
        const mass = (kind === 'smoke') ? 0.65 : 0.55;
        const shape = new CANNON.Sphere(SMOKE_PROJ_RADIUS);

        const body = new CANNON.Body({
            mass,
            material: MAT_PROJECTILE,
            linearDamping: 0.05,
            angularDamping: 0.85,
            allowSleep: true
        });
        body.addShape(shape);
        body.sleepSpeedLimit = 0.25;
        body.sleepTimeLimit = 0.6;
        body.ccdSpeedThreshold = 8;
        body.ccdIterations = 3;
        body.userData = { type: 'projectile', kind };
        body.sleep();
        return body;
    }

    function _initProjectilePools() {
        if (_projectilePoolSmoke.length > 0) return;
        for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
            _projectilePoolSmoke.push({ body: _makeProjectileBody('smoke'), inUse: false });
            _projectilePoolFlash.push({ body: _makeProjectileBody('flash'), inUse: false });
        }
        console.log('[physics] 投掷物 body 池已初始化:', PROJECTILE_POOL_SIZE, '× 2');
    }

    function _acquireProjectileBody(kind) {
        _initProjectilePools();
        const pool = (kind === 'smoke') ? _projectilePoolSmoke : _projectilePoolFlash;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].inUse) {
                pool[i].inUse = true;
                return pool[i].body;
            }
        }
        console.warn('[physics] 投掷物 body 池已满, kind =', kind);
        return null;
    }

    function _releaseProjectileBody(body) {
        if (!body || !body.userData) return;
        const kind = body.userData.kind;
        const pool = (kind === 'smoke') ? _projectilePoolSmoke : _projectilePoolFlash;

        try { world.removeBody(body); } catch (e) {}

        body.position.set(0, -1000, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);
        body.sleep();

        for (let i = 0; i < pool.length; i++) {
            if (pool[i].body === body) {
                pool[i].inUse = false;
                return;
            }
        }
    }

    function createProjectileBody(pos, vel, kind) {
        const body = _acquireProjectileBody(kind);

        if (!body) {
            const mass = (kind === 'smoke') ? 0.65 : 0.55;
            const shape = new CANNON.Sphere(SMOKE_PROJ_RADIUS);
            const tmp = new CANNON.Body({
                mass, material: MAT_PROJECTILE,
                linearDamping: 0.05, angularDamping: 0.85, allowSleep: true
            });
            tmp.addShape(shape);
            tmp.sleepSpeedLimit = 0.25;
            tmp.sleepTimeLimit = 0.6;
            tmp.ccdSpeedThreshold = 8;
            tmp.ccdIterations = 3;
            tmp.userData = { type: 'projectile', kind, _temp: true };
            tmp.position.set(pos.x, pos.y, pos.z);
            tmp.velocity.set(vel.x, vel.y, vel.z);
            world.addBody(tmp);
            return tmp;
        }

        body.position.set(pos.x, pos.y, pos.z);
        body.velocity.set(vel.x, vel.y, vel.z);
        body.quaternion.set(0, 0, 0, 1);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);

        const vLen = Math.hypot(vel.x, vel.y, vel.z);
        if (vLen > 0.5) {
            const dx = vel.x / vLen;
            const dz = vel.z / vLen;
            let axX = -dz, axY = 0, axZ = dx;
            const axLen = Math.hypot(axX, axY, axZ);
            if (axLen > 0.001) {
                axX /= axLen; axY /= axLen; axZ /= axLen;
                const spin = Math.min(vLen * 0.7, 15);
                body.angularVelocity.set(axX * spin, axY * spin, axZ * spin);
            } else {
                body.angularVelocity.set(0, 0, 0);
            }
        } else {
            body.angularVelocity.set(0, 0, 0);
        }

        world.addBody(body);
        body.wakeUp();
        return body;
    }

    function removeProjectileBody(body) {
        if (!body) return;
        if (body.userData && body.userData._temp) {
            try { world.removeBody(body); } catch (e) {}
            return;
        }
        _releaseProjectileBody(body);
    }

    // ============================================================
    // ★ 弹壳刚体（★ 对象池化）
    // ============================================================
    const SHELL_BODY_POOL_SIZE = 32;
    const _shellBodyPool = [];
    let _shellBodyPoolInited = false;

    function _makeShellBody() {
        const shape = new CANNON.Box(new CANNON.Vec3(0.012, 0.014, 0.012));
        const body = new CANNON.Body({
            mass: 0.008,
            material: MAT_PROJECTILE,
            linearDamping: 0.25,
            angularDamping: 0.35,
            allowSleep: true
        });
        body.addShape(shape);
        body.sleepSpeedLimit = 0.15;
        body.sleepTimeLimit = 0.4;
        body.userData = { type: 'shell' };
        body.sleep();
        return body;
    }

    function _initShellBodyPool() {
        if (_shellBodyPoolInited) return;
        _shellBodyPoolInited = true;
        for (let i = 0; i < SHELL_BODY_POOL_SIZE; i++) {
            _shellBodyPool.push({ body: _makeShellBody(), inUse: false });
        }
        console.log('[physics] 弹壳 body 池已初始化:', SHELL_BODY_POOL_SIZE);
    }

    function _acquireShellBody() {
        _initShellBodyPool();
        for (let i = 0; i < _shellBodyPool.length; i++) {
            if (!_shellBodyPool[i].inUse) {
                _shellBodyPool[i].inUse = true;
                return _shellBodyPool[i].body;
            }
        }
        return null;
    }

    function _releaseShellBody(body) {
        if (!body) return;
        try { world.removeBody(body); } catch (e) {}

        body.position.set(0, -1000, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);
        body.sleep();

        for (let i = 0; i < _shellBodyPool.length; i++) {
            if (_shellBodyPool[i].body === body) {
                _shellBodyPool[i].inUse = false;
                return;
            }
        }
    }

    function createShellBody(pos, vel) {
        const body = _acquireShellBody();
        if (!body) return null;

        body.position.set(pos.x, pos.y, pos.z);
        body.velocity.set(vel.x, vel.y, vel.z);
        body.angularVelocity.set(
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30
        );
        body.quaternion.set(0, 0, 0, 1);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);

        world.addBody(body);
        body.wakeUp();
        return body;
    }

    function removeShellBody(body) {
        if (!body) return;
        _releaseShellBody(body);
    }

    // ============================================================
    // 7. 调试辅助
    // ============================================================
    const _debugGroup = new THREE.Group();
    _debugGroup.visible = false;

    let _debugGroupAdded = false;
    function _ensureDebugGroupInScene() {
        if (_debugGroupAdded) return;
        if (typeof scene === 'undefined' || !scene) return;
        scene.add(_debugGroup);
        _debugGroupAdded = true;
    }
    _ensureDebugGroupInScene();
    setTimeout(_ensureDebugGroupInScene, 0);
    setTimeout(_ensureDebugGroupInScene, 500);

    function toggleDebugWireframe() {
        _ensureDebugGroupInScene();
        _debugGroup.visible = !_debugGroup.visible;
        if (!_debugGroup.visible) {
            console.log('[physics] 调试线框已关闭');
            return;
        }

        while (_debugGroup.children.length) {
            const c = _debugGroup.children.pop();
            c.geometry.dispose();
            c.material.dispose();
        }

        const boxMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88, wireframe: true, depthTest: false,
            transparent: true, opacity: 0.5
        });
        const sphereMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00, wireframe: true, depthTest: false,
            transparent: true, opacity: 0.6
        });

        let count = 0;
        for (const body of world.bodies) {
            for (const shape of body.shapes) {
                if (shape instanceof CANNON.Box) {
                    const he = shape.halfExtents;
                    const geo = new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2);
                    const m = new THREE.Mesh(geo, boxMat);
                    m.position.set(body.position.x, body.position.y, body.position.z);
                    m.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
                    m.renderOrder = 9999;
                    _debugGroup.add(m);
                    count++;
                } else if (shape instanceof CANNON.Sphere) {
                    const geo = new THREE.SphereGeometry(shape.radius, 12, 8);
                    const m = new THREE.Mesh(geo, sphereMat);
                    const off = shape.__offset || { x: 0, y: 0, z: 0 };
                    m.position.set(
                        body.position.x + off.x,
                        body.position.y + off.y,
                        body.position.z + off.z
                    );
                    m.renderOrder = 9999;
                    _debugGroup.add(m);
                    count++;
                }
            }
        }
        console.log('[physics] 调试线框显示:', count, '个形状（刚体数:', world.bodies.length, '）');
    }

    function dumpPhysicsPool() {
        const smokeTotal = _projectilePoolSmoke.length;
        const flashTotal = _projectilePoolFlash.length;
        const shellTotal = _shellBodyPool.length;

        let smokeActive = 0, flashActive = 0, shellActive = 0;
        for (let i = 0; i < smokeTotal; i++) if (_projectilePoolSmoke[i].inUse) smokeActive++;
        for (let i = 0; i < flashTotal; i++) if (_projectilePoolFlash[i].inUse) flashActive++;
        for (let i = 0; i < shellTotal; i++) if (_shellBodyPool[i].inUse) shellActive++;

        console.log(
            `[physics] Body 池状态:\n` +
            `  投掷物 smoke: ${smokeActive} / ${smokeTotal}\n` +
            `  投掷物 flash: ${flashActive} / ${flashTotal}\n` +
            `  弹壳:         ${shellActive} / ${shellTotal}`
        );
        return { smokeActive, flashActive, shellActive,
                 smokeTotal, flashTotal, shellTotal };
    }

    // ============================================================
    // 8. 暴露
    // ============================================================
    window.PHYSICS = {
        world,
        MAT_GROUND, MAT_PLAYER, MAT_PROJECTILE,
        rebuildStaticBodies,
        stepPhysics,
        toggleDebugWireframe,
        dumpPhysicsPool,
        isReady: () => true,
        getPlayerBody,
        createPlayerBody,
        removePlayerBody,
        teleportPlayerBody,
        syncPlayerToBody,
        createProjectileBody,
        removeProjectileBody,
        createShellBody,
        removeShellBody,
        PLAYER_RADIUS, PLAYER_TOTAL_H, PLAYER_HALF_H
    };

    console.log('[physics] 世界已就绪, gravity =', world.gravity.y);
})();