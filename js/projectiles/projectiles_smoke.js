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
const SMOKE_SHELL_COLORS = {
    blue: 0x287dff,
    red: 0xff3048,
};

function getSmokeTeamForPlayer(p) {
    if (typeof gameMode !== 'undefined' && gameMode === 'lan') {
        return p && p.team === 'red' ? 'red' : 'blue';
    }
    if (typeof gameMode !== 'undefined'
        && gameMode === 'online'
        && typeof NET !== 'undefined'
        && NET.mySeat) {
        if (p === p1) return NET.mySeat;
        return NET.mySeat === 'blue' ? 'red' : 'blue';
    }
    return p && p.id === 2 ? 'red' : 'blue';
}
window.getSmokeTeamForPlayer = getSmokeTeamForPlayer;

function createSmokeCloud(pos, radius, verticalRadius, centerHeight, team) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + centerHeight, pos.z);

    team = (team === 'red') ? 'red' : 'blue';
    const vScale = verticalRadius / radius;
    const color = SMOKE_SHELL_COLORS[team];

    // 单层空心球壳：完全不透明，避免透明混合、排序和颜色发灰。
    // DoubleSide 保证从球壳外部和内部都能看到实体内壁。
    const geometry = new THREE.SphereGeometry(radius, 20, 14);
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: true,
        toneMapped: false,
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.scale.y = vScale;
    shell.renderOrder = 2;
    shell.userData.baseOpacity = 1;
    group.add(shell);

    group.userData.team = team;
    group.userData.layers = [shell];
    group.userData.shell = shell;
    return group;
}

// ============================================================
// 烟雾投掷物生成
//   serverId：客户端从广播里拿到的 id；房主 / 单机不传（自动分配）
//   返回：创建的投掷物对象（供房主广播时取 id）
// ============================================================
function spawnSmokeProjectile(pos, vel, fuseMs, now, serverId, team, waitForLanResult = false) {
    const nextLocalId = ++_smokeIdCounter;
    const id = (serverId != null)
        ? serverId
        : (gameMode === 'lan' && typeof LAN !== 'undefined' && LAN.selfId
            ? `${LAN.selfId}:smoke:${nextLocalId}`
            : nextLocalId);
    const isClientSide = _isOnlineNonHostSmoke();
    const waitForResult = gameMode === 'lan' && !!waitForLanResult;

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
        team: (team === 'red') ? 'red' : 'blue',
        body,
        _waitUntil: 0,
        _clientSide: isClientSide,
        _waitForLanResult: waitForResult,
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
                if (s._clientSide || s._waitForLanResult) {
                    s.state = 'waiting';
                    s._waitUntil = now + (s._waitForLanResult ? 8000 : 5000);
                    continue;
                }

                // ---- 房主 / 单机：正常生成烟雾云 ----
                scene.remove(s.mesh);
                s.mesh = null;

                const cloud = createSmokeCloud(
                    s.pos, SMOKE.radius, SMOKE.verticalRadius,
                    SMOKE.centerHeight, s.team
                );
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
                        team: s.team,
                        px: s.pos.x, py: s.pos.y, pz: s.pos.z,
                    });
                }
                if (typeof gameMode !== 'undefined' && gameMode === 'lan'
                    && typeof LAN_broadcastFx === 'function') {
                    LAN_broadcastFx('smokePop', {
                        id: s.id,
                        team: s.team,
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
                    if (m.material.transparent) {
                        m.material.opacity = m.userData.baseOpacity * e;
                    }
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
                        if (m.material.transparent) {
                            m.material.opacity = m.userData.baseOpacity * fade;
                        }
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
        if (target.body && typeof window.PHYSICS?.removeProjectileBody === 'function') {
            window.PHYSICS.removeProjectileBody(target.body);
            target.body = null;
        }
        if (target.mesh) {
            scene.remove(target.mesh);
            target.mesh = null;
        }
        const team = data.team || (target && target.team) || 'blue';
        const cloud = createSmokeCloud(
            pos, SMOKE.radius, SMOKE.verticalRadius,
            SMOKE.centerHeight, team
        );
        cloud.scale.set(0.04, 0.04, 0.04);
        // ★ 修改：加上 pos.y
        cloud.position.y = pos.y + SMOKE.radius * 0.3;
        scene.add(cloud);
        target.pos.copy(pos);
        target.cloudMesh = cloud;
        target.state = 'expanding';
        target.expandStart = now;
        target._waitForLanResult = false;
    } else {
        // 没有 waiting 的 → 直接新建
        const team = data.team || 'blue';
        const cloud = createSmokeCloud(
            pos, SMOKE.radius, SMOKE.verticalRadius,
            SMOKE.centerHeight, team
        );
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
            team,
            _waitUntil: 0, _clientSide: false,
            _waitForLanResult: false,
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

    const team = getSmokeTeamForPlayer(p);
    const proj = spawnSmokeProjectile(origin, vel, effectiveFuseMs, now, undefined, team);

    if (gameMode === 'lan' && typeof LAN_broadcastFx === 'function') {
        LAN_broadcastFx('smoke', {
            id: proj ? proj.id : null,
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs, team,
        });
    }

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
            fuseMs: effectiveFuseMs,
            team,
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}
