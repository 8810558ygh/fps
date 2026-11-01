// ===== js/projectiles/projectiles_smoke.js – 烟雾云 + 烟雾投掷物 =====
// 从 game_projectiles.js 拆出，不改变任何对外接口
//
// ★ 投掷物同步改造：
//   · 每个投掷物有唯一 id（房主自增分配）
//   · 客户端不做物理模拟，位置完全由房主 projectilesUpdate 广播驱动
//   · 客户端位置用指数插值、旋转直接赋值
//   · 客户端 fuseEnd 时进入 waiting，等房主 smokePop 广播后再生成烟雾云

// ============================================================
// ★ id 计数器（房主 / 单机使用；客户端只用房主给的 id）
// ============================================================
let _smokeIdCounter = 0;

// ============================================================
// 工具：是否是联机客户端（含观战）
// ============================================================
function _isOnlineNonHostSmoke() {
    return typeof gameMode !== 'undefined'
        && gameMode === 'online'
        && typeof NET !== 'undefined'
        && !NET.isHost;
}

// ============================================================
// 工具：按 id 查找
// ============================================================
function _findSmokeById(id) {
    if (id == null) return null;
    for (let i = 0; i < activeSmokes.length; i++) {
        if (activeSmokes[i].id === id) return activeSmokes[i];
    }
    return null;
}

// ============================================================
// 烟雾云
// ============================================================
function createSmokeCloud(pos, radius, verticalRadius, centerHeight) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + centerHeight, pos.z);

    const meshList = [];
    
    // ★ 1. 把所有层级的不透明度大幅拉高，颜色加深，让透光率降到极低
    const layers = [
        { scale: 1.24, opacity: 0.65, color: 0x8c968c, order: 1 }, // 从 0.28 拉到 0.65
        { scale: 1.06, opacity: 0.88, color: 0x768076, order: 2 }, // 从 0.58 拉到 0.88
        { scale: 0.90, opacity: 0.96, color: 0x626c62, order: 3 }, // 从 0.82 拉到 0.96
        { scale: 0.72, opacity: 0.99, color: 0x4e564e, order: 4 },
        { scale: 0.52, opacity: 1.00, color: 0x404840, order: 5 }, // 最内层完全不透光
    ];
    const vScale = verticalRadius / radius;

    function createSmokeMat(color) {
        return new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }

    // 1. 外层球壳
    for (const L of layers) {
        const geo = new THREE.SphereGeometry(radius * L.scale, 24, 18);
        const mat = createSmokeMat(L.color);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.y = vScale;
        mesh.renderOrder = L.order;
        mesh.userData.baseOpacity = L.opacity;
        group.add(mesh);
        meshList.push(mesh);
    }

    // 2. 外围凸起（★ 不透明度从 0.72 拉高到 0.90 以上，确保边缘缝隙不漏人）
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.random() * 0.5;
        const rFactor = 0.30 + Math.random() * 0.55;
        const dist = radius * rFactor;
        const subR = radius * (0.32 + Math.random() * 0.28);
        const geo = new THREE.SphereGeometry(subR, 14, 10);
        const mat = createSmokeMat(0x6a746a);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
            Math.cos(a) * dist,
            (Math.random() - 0.5) * verticalRadius * 0.9,
            Math.sin(a) * dist
        );
        m.scale.set(0.8 + Math.random() * 0.45, 0.85 + Math.random() * 0.5, 0.8 + Math.random() * 0.45);
        m.renderOrder = 10 + i;
        m.userData.baseOpacity = 0.90 + Math.random() * 0.10; // ★ 拉满
        group.add(m);
        meshList.push(m);
    }

    // ★ 3. 内部填充（数量从 16 增加到 24，把球心彻底塞满）
    for (let i = 0; i < 24; i++) {
        const r = radius * (Math.random() * 0.75);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi) * vScale;
        const z = r * Math.sin(phi) * Math.sin(theta);
        
        const subR = radius * (0.3 + Math.random() * 0.25);
        const geo = new THREE.SphereGeometry(subR, 12, 8);
        const mat = createSmokeMat(0x4e564e);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.renderOrder = 30 + i;
        m.userData.baseOpacity = 0.95 + Math.random() * 0.05; // ★ 拉满
        group.add(m);
        meshList.push(m);
    }

    group.userData.allSmokeMats = []; // 用于统一的显隐管理
    group.userData.layers = meshList;
    return group;
}

// ============================================================
// 烟雾投掷物生成
//   serverId：客户端从广播里拿到的 id；房主 / 单机不传（自动分配）
//   返回：创建的投掷物对象（供房主广播时取 id）
// ============================================================
function spawnSmokeProjectile(pos, vel, fuseMs, now, serverId) {
    const id = (serverId != null) ? serverId : (++_smokeIdCounter);
    const isClientSide = _isOnlineNonHostSmoke();

    const mesh = createThrownProjectileMesh('smoke');
    mesh.position.copy(pos);
    scene.add(mesh);

    // 客户端不创建物理 body
    let body = null;
    if (!isClientSide && window.PHYSICS && window.PHYSICS.isReady()) {
        body = window.PHYSICS.createProjectileBody(pos, vel, 'smoke');
    }

    const proj = {
        id,
        mesh,
        pos: pos.clone(),
        vel: vel.clone(),
        fuseEnd: now + fuseMs,
        state: 'flying',
        expandStart: 0,
        doneAt: 0,
        cloudMesh: null,
        body,
        _waitUntil: 0,
        _clientSide: isClientSide,
        // ★ 客户端插值目标（由 projectilesUpdate 写入）
        _targetX: 0, _targetY: 0, _targetZ: 0,
        _hasTarget: false,
    };

    activeSmokes.push(proj);
    return proj;
}
window.spawnSmokeProjectile = spawnSmokeProjectile;

// ============================================================
// 更新烟雾投掷物
// ============================================================
function updateSmokes(dt, now) {
    for (let i = activeSmokes.length - 1; i >= 0; i--) {
        const s = activeSmokes[i];

        if (s.state === 'flying') {
            if (s._clientSide) {
                // ============================================================
                // ★ 客户端：完全信任房主广播
                //   · 位置：指数插值逼近 _targetX/Y/Z
                //   · 旋转：由 handleProjectilesUpdateSmokes 直接写入
                // ============================================================
                if (s._hasTarget) {
                    const k = 1 - Math.exp(-25 * dt);
                    const m = s.mesh.position;
                    m.x += (s._targetX - m.x) * k;
                    m.y += (s._targetY - m.y) * k;
                    m.z += (s._targetZ - m.z) * k;
                    s.pos.copy(m);
                }
            } else if (s.body) {
                // 房主 / 单机：物理驱动（含旋转）
                s.pos.set(s.body.position.x, s.body.position.y, s.body.position.z);
                s.mesh.position.copy(s.pos);
                _projQuat.set(
                    s.body.quaternion.x, s.body.quaternion.y,
                    s.body.quaternion.z, s.body.quaternion.w
                );
                s.mesh.quaternion.copy(_projQuat);

                // ★ 新增：地形穿模修正
                if (typeof resolveProjectileTerrain === 'function') {
                    resolveProjectileTerrain(s);
                    s.pos.set(s.body.position.x, s.body.position.y, s.body.position.z);
                    s.mesh.position.copy(s.pos);
                }
            }

            if (now >= s.fuseEnd) {
                if (s.body) {
                    window.PHYSICS.removeProjectileBody(s.body);
                    s.body = null;
                }

                // ★ 客户端：不 pop，保留 mesh 进入 waiting，等房主广播
                if (s._clientSide) {
                    s.state = 'waiting';
                    s._waitUntil = now + 5000;
                    continue;
                }

                // ---- 房主 / 单机：正常生成烟雾云 ----
                scene.remove(s.mesh);
                s.mesh = null;

                const cloud = createSmokeCloud(s.pos, SMOKE.radius, SMOKE.verticalRadius, SMOKE.centerHeight);
                cloud.scale.set(0.04, 0.04, 0.04);
                // ★ 修改：加上起爆点高度
                cloud.position.y = s.pos.y + SMOKE.radius * 0.3;
                scene.add(cloud);
                s.cloudMesh = cloud;
                s.state = 'expanding';
                s.expandStart = now;

                // 房主广播 pop，携带 id + 真实落点
                if (typeof gameMode !== 'undefined' && gameMode === 'online'
                    && typeof NET !== 'undefined' && NET.isHost
                    && typeof NET_broadcast === 'function') {
                    NET_broadcast({
                        type: 'smokePop',
                        id: s.id,
                        px: s.pos.x, py: s.pos.y, pz: s.pos.z,
                    });
                }

                if (typeof emitWorldSound === 'function') {
                    emitWorldSound('smokePop', s.pos.x, s.pos.y, s.pos.z, false);
                } else if (typeof sSmokePop === 'function') {
                    sSmokePop();
                }
            }
        } else if (s.state === 'waiting') {
            // 客户端等待房主广播；超时清理
            if (now > s._waitUntil) {
                if (s.mesh) {
                    scene.remove(s.mesh);
                    s.mesh = null;
                }
                activeSmokes.splice(i, 1);
            }
        } else if (s.state === 'expanding') {
            const t = Math.min(1, (now - s.expandStart) / SMOKE.growMs);
            const e = 1 - Math.pow(1 - t, 3);
            const scale = 0.04 + e * 0.96;
            s.cloudMesh.scale.set(scale, scale, scale);
            
            // ★ 修改：高度基于起爆点 s.pos.y 计算
            const startY = s.pos.y + SMOKE.radius * 0.3;
            const endY = s.pos.y + SMOKE.centerHeight;
            s.cloudMesh.position.y = startY + (endY - startY) * e;
            
            if (s.cloudMesh.userData.layers) {
                for (const m of s.cloudMesh.userData.layers) {
                    m.material.opacity = m.userData.baseOpacity * e;
                }
            }
            if (t >= 1) {
                s.state = 'active';
                s.doneAt = now + SMOKE.durationMs;
                s.cloudMesh.scale.set(1, 1, 1);
                // ★ 修改：加上起爆点高度
                s.cloudMesh.position.y = s.pos.y + SMOKE.centerHeight;
            }
        } else if (s.state === 'active') {
            const pulse = 1 + Math.sin(now * 0.0013) * 0.018;
            s.cloudMesh.scale.set(pulse, pulse * 1.005, pulse);
            // ★ 修改：加上起爆点高度
            s.cloudMesh.position.y = s.pos.y + SMOKE.centerHeight + Math.sin(now * 0.0009) * 0.18;
            
            const remain = s.doneAt - now;
            if (remain < 2200) {
                const fade = Math.max(0, remain / 2200);
                if (s.cloudMesh.userData.layers) {
                    for (const m of s.cloudMesh.userData.layers) {
                        m.material.opacity = m.userData.baseOpacity * fade;
                    }
                }
            }
            if (now >= s.doneAt) {
                scene.remove(s.cloudMesh);
                s.cloudMesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                activeSmokes.splice(i, 1);
            }
        }
    }
}

// ============================================================
// ★ 客户端：处理房主广播的投掷物位置 + 旋转更新
// ============================================================
function handleProjectilesUpdateSmokes(list) {
    if (!list || list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
        const d = list[i];
        const s = _findSmokeById(d.id);
        if (!s) continue;

        // ---- 位置：写入插值目标，下一帧由 updateSmokes 平滑逼近 ----
        s._targetX = d.x;
        s._targetY = d.y;
        s._targetZ = d.z;
        s._hasTarget = true;

        // ★ 新增旋转同步：直接赋值（30Hz 广播下肉眼看不出跳变）
        if (d.qw !== undefined && s.mesh) {
            s.mesh.quaternion.set(d.qx, d.qy, d.qz, d.qw);
        }
    }
}
window.handleProjectilesUpdateSmokes = handleProjectilesUpdateSmokes;

// ============================================================
// ★ 客户端：收到房主 smokePop 广播
// ============================================================
function handleRemoteSmokePop(data) {
    if (typeof scene === 'undefined' || !scene) return;

    const now = performance.now();
    const pos = new THREE.Vector3(data.px, data.py, data.pz);

    let target = null;
    if (data.id != null) {
        target = _findSmokeById(data.id);
    }
    // 兜底：没有 id 或没找到 → 找第一个 waiting
    if (!target) {
        for (let i = 0; i < activeSmokes.length; i++) {
            if (activeSmokes[i].state === 'waiting') {
                target = activeSmokes[i];
                break;
            }
        }
    }

    if (target) {
        if (target.mesh) {
            scene.remove(target.mesh);
            target.mesh = null;
        }
        const cloud = createSmokeCloud(pos, SMOKE.radius, SMOKE.verticalRadius, SMOKE.centerHeight);
        cloud.scale.set(0.04, 0.04, 0.04);
        // ★ 修改：加上 pos.y
        cloud.position.y = pos.y + SMOKE.radius * 0.3;
        scene.add(cloud);
        target.cloudMesh = cloud;
        target.state = 'expanding';
        target.expandStart = now;
    } else {
        // 没有 waiting 的 → 直接新建
        const cloud = createSmokeCloud(pos, SMOKE.radius, SMOKE.verticalRadius, SMOKE.centerHeight);
        cloud.scale.set(0.04, 0.04, 0.04);
        // ★ 修改：加上 pos.y
        cloud.position.y = pos.y + SMOKE.radius * 0.3;
        scene.add(cloud);
        activeSmokes.push({
            id: data.id,
            mesh: null, pos: pos.clone(), vel: null,
            fuseEnd: 0, state: 'expanding',
            expandStart: now, doneAt: 0,
            cloudMesh: cloud, body: null,
            _waitUntil: 0, _clientSide: false,
            _targetX: 0, _targetY: 0, _targetZ: 0, _hasTarget: false,
        });
    }

    if (typeof emitWorldSound === 'function') {
        emitWorldSound('smokePop', pos.x, pos.y, pos.z, false);
    } else if (typeof sSmokePop === 'function') {
        sSmokePop();
    }
}
window.handleRemoteSmokePop = handleRemoteSmokePop;

// ============================================================
// 投掷烟雾弹（房主 / 单机调用）
// ============================================================
function throwSmoke(p, now, fuseMs) {
    if (gameState !== 'combat') return;
    if (!p.isSmoke) return;
    if (now < p.deadUntil || now < p.equipEnd) return;

    const effectiveFuseMs = (fuseMs !== undefined && fuseMs !== null) ? fuseMs : SMOKE.fuseMs;

    const origin = p.cam.getWorldPosition(new THREE.Vector3()).clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const vel = dir.clone().multiplyScalar(SMOKE.throwSpeed);
    vel.y += SMOKE.throwUpBias * SMOKE.throwSpeed;

    const proj = spawnSmokeProjectile(origin, vel, effectiveFuseMs, now);

    if (typeof emitWorldSound === 'function') {
        emitWorldSound('smokeThrow', p.pos.x, p.pos.y + p.eyeH, p.pos.z, p.id === 1);
    } else if (typeof sSmokeThrow === 'function') {
        sSmokeThrow();
    }

    if (gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.isHost
        && typeof NET_broadcast === 'function') {
        NET_broadcast({
            type: 'smokeSpawn',
            id: proj ? proj.id : null,
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}