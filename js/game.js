// ===== js/game.js – 核心游戏逻辑（含伤害记录、奥丁预热、击杀报告） =====
let running = false;
let matchStart = 0;

const pickups = [];

function addPickup(x, z, kind) {
    const color = kind === 'hp' ? 0x37c46a : 0xf0c020;
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 0.12, 20),
        new THREE.MeshLambertMaterial({ color: 0x333a44 })
    );
    base.position.set(x, 0.06, z);
    base.receiveShadow = true;
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
    );
    box.position.set(x, 0.9, z);
    box.castShadow = true;
    scene.add(base, box);
    pickups.push({ x, z, kind, box, active: true, respawnAt: 0 });
}
addPickup(-8, 8, 'hp');
addPickup(8, -8, 'hp');
addPickup(-8, -8, 'ammo');
addPickup(8, 8, 'ammo');

const tracers = [];
const sparks = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true });
const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

function muzzleWorld(p, out) {
    return out.set(0.28, -0.2, -1.25).applyMatrix4(p.cam.matrixWorld);
}

function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, until: performance.now() + 90 });
}

function spawnSparks(point, color) {
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color }));
        m.position.copy(point);
        scene.add(m);
        sparks.push({
            mesh: m,
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4),
            life: 0.4
        });
    }
}

function updateEffects(dt, now) {
    for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.line.material.opacity = Math.max(0, (t.until - now) / 90);
        if (now > t.until) { scene.remove(t.line); t.line.geometry.dispose(); tracers.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) { scene.remove(s.mesh); s.mesh.material.dispose(); sparks.splice(i, 1); }
    }
    if (p1.muzzle.intensity > 0) p1.muzzle.intensity = Math.max(0, p1.muzzle.intensity - 14 * dt);
    if (p1.vmMuzzle.intensity > 0) p1.vmMuzzle.intensity = Math.max(0, p1.vmMuzzle.intensity - 14 * dt);
}

function isOver() { return document.getElementById('endOverlay').style.display !== 'none'; }

function startReload(p, now) {
    if (p.id !== 1) return; // 只有玩家1能换弹
    const w = p.weapon;
    if (!running || now < p.deadUntil || p.reloadEnd > now || p.ammo === w.mag || p.reserve <= 0) return;
    p.reloadEnd = now + w.reloadMs;
    sReload(p.id);
}

// ---- 姿态 ---- (仅玩家1)
function stanceEye(h) {
    if (h <= HEIGHT_PRONE + 0.01) return EYE_PRONE;
    if (h <= HEIGHT_CROUCH + 0.01) return EYE_CROUCH;
    return EYE_STAND;
}

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

// ---- 物理碰撞（仅玩家1） ----
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
            p.pos.y = top;
            p.vy = 0;
            p.onGround = true;
        }
        if (p.vy > 0 && p.pos.y < bot && p.pos.y + h >= bot && p.prevY + h <= bot + 0.001) {
            p.pos.y = bot - h;
            p.vy = 0;
        }
    }

    for (const c of colliders) {
        const top = c.top !== undefined ? c.top : 0;
        const bot = c.bottom || 0;
        if (p.pos.x + r <= c.x0 || p.pos.x - r >= c.x1 ||
            p.pos.z + r <= c.z0 || p.pos.z - r >= c.z1) continue;

        if (p.onGround && top > p.pos.y + 0.001 && top - p.pos.y <= STEP_UP) {
            p.pos.y = top;
            continue;
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
            } else {
                p.pos.x += r;
            }
        }
    }
}

function collidePlayers() {
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.8 - d) / 2;
        const nx = dx / d, nz = dz / d;
        p1.pos.x -= nx * push;
        p1.pos.z -= nz * push;
    }
}

// ---- 射击（仅玩家1） ----
function tryFire(p, now) {
    if (p.id !== 1) return;
    const w = p.weapon;
    if (now < p.nextShot || now < p.deadUntil || p.reloadEnd > now) return;
    if (p.ammo <= 0) { sEmpty(p.id); p.nextShot = now + 300; startReload(p, now); return; }
    p.ammo--;

    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        const timeSinceLastShot = now - (p.lastShotTime || 0);
        if (timeSinceLastShot < 200) {
            p.spinUpProgress = Math.min(1, (p.spinUpProgress || 0) + (timeSinceLastShot / w.spinUpMs));
        } else {
            p.spinUpProgress = 0;
        }
        currentFireMs = w.fireMs - (w.fireMs - w.minFireMs) * (p.spinUpProgress || 0);
        currentFireMs = Math.max(w.minFireMs, currentFireMs);
    }
    p.nextShot = now + currentFireMs;
    p.lastShotTime = now;

    // ----- 根据武器类型播放不同射击音效 -----
    switch (w.key) {
        case 'sniper':
            sShootSniper(p.id);
            break;
        case 'shotgun':
            sShootShotgun(p.id);
            break;
        case 'odin':
            sShootOdin(p.id);
            break;
        default:
            sShootRifle(p.id);
            break;
    }

    p.muzzle.intensity = 2.2;
    p.vmMuzzle.intensity = 2.2;

    const origin = p.cam.getWorldPosition(_v1);
    const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const pellets = w.pellets || 1;
    const spread = w.spread || 0;

    const targets = wallMeshes.concat(crateMeshes);
    const o = other(p);
    if (now >= o.deadUntil) targets.push(o.body, o.head);

    for (let i = 0; i < pellets; i++) {
        const randDir = dir.clone();
        if (pellets > 1) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
            const up = new THREE.Vector3(0, 1, 0);
            const axis = new THREE.Vector3().crossVectors(dir, up).normalize();
            if (axis.length() < 0.01) axis.set(1, 0, 0);
            const quat = new THREE.Quaternion().setFromAxisAngle(axis, phi);
            const quat2 = new THREE.Quaternion().setFromAxisAngle(dir, theta);
            randDir.applyQuaternion(quat).applyQuaternion(quat2);
        }
        const rc = new THREE.Raycaster(origin.clone(), randDir.clone(), 0, 120);
        const hits = rc.intersectObjects(targets, false);
        let end = origin.clone().add(randDir.multiplyScalar(120));
        if (hits.length) {
            const h = hits[0];
            end = h.point;
            if (h.object.userData.part) {
                const dmg = h.object.userData.part === 'head' ? w.dmgHead : w.dmgBody;
                const targetId = o.id;
                if (!p.damageDealt[targetId]) {
                    p.damageDealt[targetId] = { body: 0, head: 0, total: 0 };
                }
                if (h.object.userData.part === 'head') {
                    p.damageDealt[targetId].head += dmg;
                } else {
                    p.damageDealt[targetId].body += dmg;
                }
                p.damageDealt[targetId].total += dmg;
                spawnSparks(h.point, 0xff5040);
                damage(o, dmg, p);
                hitmark(p);
                sHit(p.id);
            } else {
                spawnSparks(h.point, 0xffd28a);
            }
        }
        if (i === 0) spawnTracer(muzzleWorld(p, _v1), end);
    }
}

function damage(victim, dmg, from) {
    const now = performance.now();
    if (victim.hp <= 0) return;
    if (now < victim.invulnUntil) { sEmpty(from.id); return; }
    victim.hp -= dmg;
    dmgFlash(from); // 攻击者闪红（玩家1）
    if (victim.hp <= 0) kill(victim, from, now);
}

function kill(victim, from, now) {
    from.score++;
    victim.hp = 0;
    victim.deadUntil = now + RESPAWN_MS;
    feed(victim, `被 <b style="color:${from.id===1?'#6db3ff':'#ff7a6d'}">玩家${from.id}</b> 击杀`);
    feed(from, `<b style="color:#ffd24a">击杀 玩家${victim.id}！</b>  +1`);
    sDeath();
    sKill(from.id);

    const damageInfo = from.damageDealt[victim.id];
    if (damageInfo && damageInfo.total > 0) {
        if (window.showCombatReport) {
            window.showCombatReport(from, victim, damageInfo);
        }
    }
    delete from.damageDealt[victim.id];

    if (from.score >= TARGET_KILLS) endMatch(from);
}

// 重置玩家1（不含靶子）
function resetPlayer(p, now) {
    if (p.id !== 1) return;
    p.pos.set(p.spawn.x, 0, p.spawn.z);
    p.yaw = p.spawn.yaw;
    p.pitch = 0;
    p.vy = 0;
    p.prevY = 0;
    p.onGround = true;
    p.height = HEIGHT_STAND;
    p.eyeH = EYE_STAND;
    p.mesh.scale.y = 1;
    p.hp = HP_MAX;
    p.ammo = p.weapon.mag;
    p.reserve = Math.max(p.reserve, Math.ceil(p.weapon.reserveMax * 2 / 3));
    p.reloadEnd = 0;
    p.aiming = false;
    p.cam.fov = BASE_FOV;
    p.cam.updateProjectionMatrix();
    p.invulnUntil = now + INVULN_MS;
    p.spinUpProgress = 0;
    p.lastShotTime = 0;
    p.damageDealt = {};
}

// 重置靶子
function resetTarget(t, now) {
    t.pos.set(t.spawn.x, 0, t.spawn.z);
    t.yaw = t.spawn.yaw;
    t.pitch = 0;
    t.mesh.scale.y = 1;
    t.hp = HP_MAX;
    t.deadUntil = 0;
    t.invulnUntil = now + INVULN_MS;
    t.baseVisible = true;
}

function endMatch(winner) {
    running = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const el = document.getElementById('endOverlay');
    document.getElementById('endTitle').innerHTML = winner ?
        `<span class="${winner.id===1?'b':'r'}">${winner.id===1?'蓝色':'红色'}</span>玩家获胜！` :
        '平局！';
    document.getElementById('endScore').textContent = `${p1.score} : ${p2.score}`;
    el.style.display = 'flex';
    sWin();

    // 结束游戏时隐藏横屏提示
    document.body.classList.remove('in-game');
    const rot = document.getElementById('rotateOverlay');
    if (rot) rot.style.display = 'none';
}

function resetMatch() {
    const now = performance.now();
    resetPlayer(p1, now);
    resetTarget(p2, now);
    p1.score = 0;
    p2.score = 0;
    matchStart = now;
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('startOverlay').style.display = 'none';
    running = true;

    // 进入游戏：让竖屏时显示横屏提示（仅在手机触发）
    document.body.classList.add('in-game');
    if (typeof checkOrientation === 'function') checkOrientation();
}

// ---- 更新玩家1 ----
function updatePlayer(p, dt, now) {
    if (p.id !== 1) return;
    if (now < p.deadUntil) {
        p.baseVisible = false;
        p.aiming = false;
        const left = ((p.deadUntil - now) / 1000).toFixed(1);
        centerMsg(p, `阵亡！${left} 秒后重生`);
        return;
    }
    if (p.baseVisible === false) { p.baseVisible = true; centerMsg(p, ''); }
    centerMsg(p, now < p.invulnUntil ? '重生保护中…' : '');

    if (p.reloadEnd > 0 && now >= p.reloadEnd) {
        const w = p.weapon, need = w.mag - p.ammo, take = Math.min(need, p.reserve);
        p.ammo += take;
        p.reserve -= take;
        p.reloadEnd = 0;
    }

    const wantAim = mouse.aim;
    p.aiming = wantAim;
    const targetFov = p.aiming ? p.weapon.zoomFov : BASE_FOV;
    if (Math.abs(p.cam.fov - targetFov) > 0.05) {
        p.cam.fov += (targetFov - p.cam.fov) * Math.min(1, dt * 11);
        p.cam.updateProjectionMatrix();
    }

    const wantProne = !!keys['KeyX'];
    const wantCrouch = !!keys['KeyC'];
    let targetH = HEIGHT_STAND;
    if (wantProne) targetH = HEIGHT_PRONE;
    else if (wantCrouch) targetH = HEIGHT_CROUCH;
    if (targetH > p.height + 0.001 && !canFit(p, targetH)) targetH = p.height;
    const k = Math.min(1, dt * 12);
    p.height += (targetH - p.height) * k;
    p.eyeH += (stanceEye(targetH) - p.eyeH) * k;

    let f = 0, s = 0, jump = false;
    if (keys['KeyW']) f += 1;
    if (keys['KeyS']) f -= 1;
    if (keys['KeyD']) s += 1;
    if (keys['KeyA']) s -= 1;
    jump = !!keys['Space'];

    let spd = SPEED * p.weapon.speedMul;
    if (p.height < 0.9) spd = SPEED_PRONE * p.weapon.speedMul;
    else if (p.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * p.weapon.speedMul;
    if (p.aiming) spd *= p.weapon.adsSpeedMul;

    const len = Math.hypot(f, s) || 1;
    f /= len;
    s /= len;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    p.pos.x += (fx * f + rx * s) * spd * dt;
    p.pos.z += (fz * f + rz * s) * spd * dt;

    if (jump && p.onGround && p.height > HEIGHT_PRONE + 0.15) {
        p.vy = JUMP_V;
        p.onGround = false;
    }

    p.prevY = p.pos.y;
    p.vy -= GRAV * dt;
    p.pos.y += p.vy * dt;
    collideWorld(p);
    if (p.pos.y <= 0) {
        p.pos.y = 0;
        p.vy = 0;
        p.onGround = true;
    }
    collidePlayers();

    if (mouse.leftDown) tryFire(p, now);

    const blink = now < p.invulnUntil && Math.floor(now / 100) % 2 === 0;
    p.mat.opacity = blink ? 0.35 : 1;

    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    p.cam.rotation.y = p.yaw;
    p.cam.rotation.x = p.pitch;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;
}

// ---- 更新靶子 ----
function updateTarget(t, dt, now) {
    if (now < t.deadUntil) {
        t.baseVisible = false;
        return;
    }
    t.baseVisible = true;
    // 固定位置
    t.pos.set(t.spawn.x, 0, t.spawn.z);
    t.yaw = t.spawn.yaw;
    t.pitch = 0;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.yaw;
    t.mesh.scale.y = 1;
    const blink = now < t.invulnUntil && Math.floor(now / 100) % 2 === 0;
    t.mat.opacity = blink ? 0.35 : 1;
}

function updatePickups(now) {
    pickups.forEach(pk => {
        if (!pk.active) {
            if (now >= pk.respawnAt) { pk.active = true; pk.box.visible = true; }
            return;
        }
        pk.box.rotation.y += 0.03;
        pk.box.position.y = 0.9 + Math.sin(now / 300 + pk.x) * 0.12;
        // 只检测玩家1，靶子不会拾取
        const p = p1;
        if (now < p.deadUntil) return;
        const dx = p.pos.x - pk.x, dz = p.pos.z - pk.z;
        if (dx * dx + dz * dz < 1.44) {
            if (pk.kind === 'hp' && p.hp < HP_MAX) { p.hp = HP_MAX; sPickup(p.id); pk.active = false; pk.box.visible = false; pk.respawnAt = now + 10000; }
            if (pk.kind === 'ammo' && p.reserve < p.weapon.reserveMax) {
                const add = p.weapon.key === 'sniper' ? 5 : (p.weapon.key === 'shotgun' ? 8 : (p.weapon.key === 'odin' ? 30 : 30));
                p.reserve = Math.min(p.weapon.reserveMax, p.reserve + add);
                sPickup(p.id);
                pk.active = false;
                pk.box.visible = false;
                pk.respawnAt = now + 10000;
            }
        }
    });
}