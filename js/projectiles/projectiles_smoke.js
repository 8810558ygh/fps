// ===== js/projectiles_smoke.js – 烟雾云 + 烟雾投掷物 =====
// 从 game_projectiles.js 拆出，不改变任何对外接口

// ============================================================
// 烟雾云
// ============================================================
function createSmokeCloud(pos, radius, verticalRadius, centerHeight) {
    const group = new THREE.Group();
    group.position.set(pos.x, centerHeight, pos.z);

    const meshList = [];
    const layers = [
        { scale: 1.18, opacity: 0.22, color: 0xd0dad0, order: 1 },
        { scale: 1.00, opacity: 0.52, color: 0xb6c4b6, order: 2 },
        { scale: 0.84, opacity: 0.80, color: 0x9aa89a, order: 3 },
        { scale: 0.62, opacity: 0.97, color: 0x84928a, order: 4 },
    ];
    const vScale = verticalRadius / radius;

    for (const L of layers) {
        const geo = new THREE.SphereGeometry(radius * L.scale, 24, 18);
        const mat = new THREE.MeshLambertMaterial({
            color: L.color, transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            emissive: 0x4a5a4a, emissiveIntensity: 0.22
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.y = vScale;
        mesh.renderOrder = L.order;
        mesh.userData.baseOpacity = L.opacity;
        group.add(mesh);
        meshList.push(mesh);
    }

    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
        const rFactor = 0.25 + Math.random() * 0.45;
        const dist = radius * rFactor;
        const subR = radius * (0.28 + Math.random() * 0.22);
        const geo = new THREE.SphereGeometry(subR, 14, 10);
        const mat = new THREE.MeshLambertMaterial({
            color: 0x8c9a8e, transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            emissive: 0x4a5a4a, emissiveIntensity: 0.2
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
            Math.cos(a) * dist,
            (Math.random() - 0.5) * verticalRadius * 0.85,
            Math.sin(a) * dist
        );
        m.scale.set(0.85 + Math.random() * 0.3, 0.9 + Math.random() * 0.35, 0.85 + Math.random() * 0.3);
        m.renderOrder = 10 + i;
        m.userData.baseOpacity = 0.55 + Math.random() * 0.25;
        group.add(m);
        meshList.push(m);
    }

    group.userData.layers = meshList;
    return group;
}

// ============================================================
// 烟雾投掷物生成
// ============================================================
function spawnSmokeProjectile(pos, vel, fuseMs, now) {
    const mesh = createThrownProjectileMesh('smoke');
    mesh.position.copy(pos);
    scene.add(mesh);

    let body = null;
    if (window.PHYSICS && window.PHYSICS.isReady()) {
        body = window.PHYSICS.createProjectileBody(pos, vel, 'smoke');
    }

    activeSmokes.push({
        mesh, pos: pos.clone(), vel: vel.clone(),
        fuseEnd: now + fuseMs, state: 'flying',
        expandStart: 0, doneAt: 0, cloudMesh: null,
        body
    });
}
window.spawnSmokeProjectile = spawnSmokeProjectile;

// ============================================================
// 更新烟雾投掷物
// ============================================================
function updateSmokes(dt, now) {
    for (let i = activeSmokes.length - 1; i >= 0; i--) {
        const s = activeSmokes[i];

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

                const cloud = createSmokeCloud(s.pos, SMOKE.radius, SMOKE.verticalRadius, SMOKE.centerHeight);
                cloud.scale.set(0.04, 0.04, 0.04);
                cloud.position.y = SMOKE.radius * 0.3;
                scene.add(cloud);
                s.cloudMesh = cloud;
                s.state = 'expanding';
                s.expandStart = now;

                // ★ 空间化：烟雾弹起烟音效
                if (typeof emitWorldSound === 'function') {
                    emitWorldSound('smokePop', s.pos.x, s.pos.y, s.pos.z, false);
                } else if (typeof sSmokePop === 'function') {
                    sSmokePop();
                }
            }
        } else if (s.state === 'expanding') {
            const t = Math.min(1, (now - s.expandStart) / SMOKE.growMs);
            const e = 1 - Math.pow(1 - t, 3);
            const scale = 0.04 + e * 0.96;
            s.cloudMesh.scale.set(scale, scale, scale);
            const startY = SMOKE.radius * 0.3;
            const endY = SMOKE.centerHeight;
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
                s.cloudMesh.position.y = SMOKE.centerHeight;
            }
        } else if (s.state === 'active') {
            const pulse = 1 + Math.sin(now * 0.0013) * 0.018;
            s.cloudMesh.scale.set(pulse, pulse * 1.005, pulse);
            s.cloudMesh.position.y = SMOKE.centerHeight + Math.sin(now * 0.0009) * 0.18;
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
// 投掷烟雾弹
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

    spawnSmokeProjectile(origin, vel, effectiveFuseMs, now);

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
            px: origin.x, py: origin.y, pz: origin.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            fuseMs: effectiveFuseMs
        });
    }

    setWeapon(p, p.primaryWeaponKey || 'rifle');
}