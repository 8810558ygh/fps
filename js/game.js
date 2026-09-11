// ===== js/game.js – 核心游戏逻辑（单机 / 人机 / 联机房主权威） =====
let running = false;
let matchStart = 0;
let gameMode = 'range';    // 'range' | 'ai' | 'online'

let gameState = 'idle';
let stateEndTime = 0;
let roundNumber = 0;
let lastKillReport = null;

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
    if (p2.muzzle && p2.muzzle.intensity > 0) p2.muzzle.intensity = Math.max(0, p2.muzzle.intensity - 14 * dt);
}

function isOver() { return document.getElementById('endOverlay').style.display === 'flex'; }

function startReload(p, now) {
    if (p.id !== 1) return;
    if (!running || gameState !== 'combat') return;
    const w = p.weapon;
    if (now < p.deadUntil || p.reloadEnd > now || p.ammo === w.mag || p.reserve <= 0) return;
    if (now < p.boltEnd) return;
    p.reloadEnd = now + w.reloadMs;
    p.aimStage = 0;
    p.aiming = false;
    mouse.aim = false;
    sReload(p.id);
}

function toggleAim() {
    if (!running || isOver() || gameState !== 'combat') return;
    const now = performance.now();
    const p = p1;
    if (now < p.boltEnd) return;
    if (p.reloadEnd > now) return;
    if (now < p.deadUntil) return;
    const w = p.weapon;
    if (w.key === 'sniper') {
        p.aimStage = (p.aimStage + 1) % 3;
    } else {
        p.aimStage = p.aimStage > 0 ? 0 : 1;
    }
    mouse.aim = p.aimStage > 0;
}

function stanceEye(h) {
    return h <= HEIGHT_CROUCH + 0.01 ? EYE_CROUCH : EYE_STAND;
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
    if (gameMode === 'online') return;
    const dx = p2.pos.x - p1.pos.x, dz = p2.pos.z - p1.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.8 - d) / 2;
        const nx = dx / d, nz = dz / d;
        p1.pos.x -= nx * push;
        p1.pos.z -= nz * push;
        p2.pos.x += nx * push;
        p2.pos.z += nz * push;
    }
}

// ============================================================
// 脚步声
// ============================================================
const STRIDE_LENGTH = 2.0;
const STEP_MAX_AUDIBLE = 22;

function updateFootsteps(p, dt, now) {
    if (!running || gameState !== 'combat') { p._stepAccum = 0; return; }
    if (now < p.deadUntil) { p._stepAccum = 0; return; }

    const crouched = p.height < HEIGHT_STAND - 0.15;
    if (crouched) {
        p._stepAccum = 0;
        p._prevStepX = p.pos.x;
        p._prevStepZ = p.pos.z;
        return;
    }

    if (p._prevStepX === undefined || p._prevStepZ === undefined) {
        p._prevStepX = p.pos.x;
        p._prevStepZ = p.pos.z;
        p._stepAccum = 0;
        return;
    }

    const dx = p.pos.x - p._prevStepX;
    const dz = p.pos.z - p._prevStepZ;
    p._prevStepX = p.pos.x;
    p._prevStepZ = p.pos.z;

    if (!p.onGround) {
        p._stepAccum = Math.min(p._stepAccum || 0, STRIDE_LENGTH * 0.5);
        return;
    }

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
            const rightX = Math.cos(yaw);
            const rightZ = -Math.sin(yaw);
            const dotRight = ex * rightX + ez * rightZ;
            const pan = d > 0.3 ? Math.max(-1, Math.min(1, dotRight / d)) : 0;
            sFootstepEnemy(vol, pan);
        }
    }
}

// ============================================================
// 射击
// ============================================================
function tryFire(p, now) {
    if (p.id !== 1) return;
    if (gameState !== 'combat') return;

    const w = p.weapon;
    if (now < p.nextShot || now < p.deadUntil || p.reloadEnd > now) return;
    if (now < p.boltEnd) return;

    if (p.ammo <= 0) { sEmpty(p.id); p.nextShot = now + 300; startReload(p, now); return; }
    p.ammo--;

    let currentFireMs = w.fireMs;
    if (w.spinUpMs && w.minFireMs) {
        const since = now - (p.lastShotTime || 0);
        if (since < 200) p.spinUpProgress = Math.min(1, (p.spinUpProgress || 0) + since / w.spinUpMs);
        else p.spinUpProgress = 0;
        currentFireMs = Math.max(w.minFireMs, w.fireMs - (w.fireMs - w.minFireMs) * p.spinUpProgress);
    }
    p.nextShot = now + currentFireMs;
    p.lastShotTime = now;

    if (w.key === 'sniper' && w.boltMs) {
        p.boltEnd = now + w.boltMs;
        p.aimStage = 0;
        p.aiming = false;
        mouse.aim = false;
    }

    switch (w.key) {
        case 'sniper':  sShootSniper(p.id);  break;
        case 'shotgun': sShootShotgun(p.id); break;
        case 'odin':    sShootOdin(p.id);    break;
        default:        sShootRifle(p.id);   break;
    }
    p.muzzle.intensity = 2.2;
    p.vmMuzzle.intensity = 2.2;

    // 联机客户端：只上报开火，本地不做射线
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) {
        if (typeof NET_sendShootRequest === 'function') NET_sendShootRequest(w.key);
        const origin = p.cam.getWorldPosition(_v1).clone();
        const dir = _v2.set(0, 0, -1).applyQuaternion(p.cam.quaternion);
        const end = origin.clone().add(dir.multiplyScalar(100));
        spawnTracer(muzzleWorld(p, _v1), end);
        return;
    }

    // 单机/人机/联机房主：本地射线判定
    const origin = p.cam.getWorldPosition(_v1).clone();
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
        const rc = new THREE.Raycaster(origin.clone(), randDir.clone(), 0, 150);
        const hits = rc.intersectObjects(targets, false);
        let end = origin.clone().add(randDir.multiplyScalar(150));
        if (hits.length) {
            const h = hits[0];
            end = h.point;
            if (h.object.userData.part) {
                const dmg = h.object.userData.part === 'head' ? w.dmgHead : w.dmgBody;
                const targetId = o.id;
                if (!p.damageDealt[targetId]) p.damageDealt[targetId] = { body: 0, head: 0, total: 0 };
                if (h.object.userData.part === 'head') p.damageDealt[targetId].head += dmg;
                else p.damageDealt[targetId].body += dmg;
                p.damageDealt[targetId].total += dmg;

                spawnSparks(h.point, 0xff5040);
                hitmark(p);
                sHit(p.id);
                damage(o, dmg, p);
            } else {
                spawnSparks(h.point, 0xffd28a);
            }
        }
        if (i === 0) spawnTracer(muzzleWorld(p, _v1), end);
    }
}

// ============================================================
// 伤害（仅房主）
// ============================================================
function damage(victim, dmg, from) {
    if (gameState !== 'combat') return;
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;

    const now = performance.now();
    if (victim.hp <= 0) return;
    if (now < victim.invulnUntil) { sEmpty(from.id); return; }

    let hpDamage = dmg;
    if (victim.armor > 0) {
        const wantAbsorb = dmg * ARMOR_ABSORB;
        const actualAbsorb = Math.min(victim.armor, wantAbsorb);
        victim.armor = Math.max(0, victim.armor - actualAbsorb);
        hpDamage = dmg - actualAbsorb;
    }

    victim.hp -= hpDamage;
    dmgFlash(victim);

    // 联机房主：客户端被打 → 通知客户端闪屏
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (victim === p2 && typeof NET_sendDamageEvent === 'function') {
            NET_sendDamageEvent('p2', dmg);
        }
    }

    if (victim.hp <= 0) kill(victim, from, now);
}

// ============================================================
// 击杀
// ============================================================
function kill(victim, from, now) {
    from.score++;
    victim.hp = 0;
    victim.deadUntil = Infinity;

    // 先取伤害统计（后面会删除）
    const dmgByAttacker = from.damageDealt[victim.id] || { body: 0, head: 0, total: 0 };
    const dmgByVictim = victim.damageDealt[from.id] || { body: 0, head: 0, total: 0 };

    lastKillReport = { attacker: from, victim: victim, dmgByAttacker, dmgByVictim };

    // 联机房主：广播 kill 事件（带完整伤害数据）
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        const killerSide = (from === p1) ? 'host' : 'client';
        const victimSide = (victim === p1) ? 'host' : 'client';
        if (typeof NET_sendKillEvent === 'function') {
            NET_sendKillEvent(
                killerSide, victimSide, roundNumber,
                { head: dmgByAttacker.head, body: dmgByAttacker.body, total: dmgByAttacker.total },
                { head: dmgByVictim.head, body: dmgByVictim.body, total: dmgByVictim.total }
            );
        }
    }

    // 本地显示报告
    if (window.showRoundReport) {
        window.showRoundReport(roundNumber, from, victim, dmgByAttacker, dmgByVictim);
    }

    delete from.damageDealt[victim.id];
    delete victim.damageDealt[from.id];

    feed(victim, `被 <b style="color:${from.id===1?'#6db3ff':'#ff7a6d'}">玩家${from.id}</b> 击杀`);
    feed(from, `<b style="color:#ffd24a">击杀 玩家${victim.id}！</b>  +1`);
    sDeath();
    sKill(from.id);

    if (gameMode === 'ai' && from.id === 2 && typeof aiTaunt === 'function') aiTaunt();
    if (gameMode === 'ai' && from.id === 1 && typeof resetAiStreakOnPlayerKill === 'function') resetAiStreakOnPlayerKill();

    if (from.score >= TARGET_KILLS) { endMatch(from); return; }

    gameState = 'roundEnd';
    stateEndTime = now + ROUND_END_MS;

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('roundEnd', ROUND_END_MS, false, roundNumber);
        }
    }
}

// ============================================================
// 重置
// ============================================================
function resetPlayer(p, now) {
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
    p.armor = ARMOR_MAX;
    p.ammo = p.weapon.mag;
    p.reserve = p.weapon.startReserve;
    p.reloadEnd = 0;
    p.nextShot = 0;
    p.aiming = false;
    p.aimStage = 0;
    p.boltEnd = 0;
    p.deadUntil = 0;
    p.invulnUntil = 0;
    p.spinUpProgress = 0;
    p.lastShotTime = 0;
    p.damageDealt = {};
    p.baseVisible = true;
    p.mat.opacity = 1;
    p._prevStepX = p.spawn.x;
    p._prevStepZ = p.spawn.z;
    p._stepAccum = 0;

    if (p.vm && p.vm.children.length > 0) {
        const vm = p.vm.children[0];
        if (vm.userData.basePos) {
            vm.position.copy(vm.userData.basePos);
            vm.rotation.copy(vm.userData.baseRot);
        }
    }

    if (p.cam) {
        p.cam.fov = BASE_FOV;
        p.cam.updateProjectionMatrix();
    }
}

// ============================================================
// 回合流程
// ============================================================
function startRound(now) {
    roundNumber++;
    resetPlayer(p1, now);
    resetPlayer(p2, now);

    if (gameMode === 'ai' && typeof aiResetRound === 'function') {
        aiResetRound(now);
    }

    for (const k in keys) keys[k] = false;
    mouse.leftDown = false;
    mouse.aim = false;

    gameState = 'prep';
    stateEndTime = now + PREP_MS;

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('prep', PREP_MS, true, roundNumber);
        }
    }
}

function endPrep(now) {
    gameState = 'combat';
    if (window.closeCombatReport) window.closeCombatReport();
    const panel = document.getElementById('weaponPanel');
    if (panel) panel.style.display = 'none';
    if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
        if (document.pointerLockElement !== renderer.domElement && running) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            if (typeof NET !== 'undefined' && NET.role === 'spectator') return;
            renderer.domElement.requestPointerLock();
        }
    }

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('combat', 0, false, roundNumber);
        }
    }
}

function endMatch(winner) {
    running = false;
    gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    const el = document.getElementById('endOverlay');
    document.getElementById('endTitle').innerHTML = winner ?
        `<span class="${winner.id===1?'b':'r'}">${winner.id===1?'蓝色':'红色'}</span>玩家获胜！` :
        '平局！';
    document.getElementById('endScore').textContent = `${p1.score} : ${p2.score}`;
    el.style.display = 'flex';
    sWin();

    document.body.classList.remove('in-game');
    const rot = document.getElementById('rotateOverlay');
    if (rot) rot.style.display = 'none';

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('idle', 0, false, roundNumber);
        }
    }
}

function resetMatch() {
    const now = performance.now();
    p1.score = 0;
    p2.score = 0;
    roundNumber = 0;
    lastKillReport = null;
    matchStart = now;
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof clearChat === 'function') clearChat();
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    running = true;

    startRound(now);

    document.body.classList.add('in-game');
    if (typeof checkOrientation === 'function') checkOrientation();
}

// ============================================================
// 拉栓动画
// ============================================================
function updateSniperViewmodel(p, dt, now) {
    if (!p.vm || p.vm.children.length === 0) return;
    const vm = p.vm.children[0];
    if (!vm.userData.basePos || !vm.userData.baseRot) return;

    const w = p.weapon;
    if (w.key === 'sniper' && w.boltMs && p.boltEnd > now) {
        const progress = 1 - (p.boltEnd - now) / w.boltMs;
        const pull = Math.sin(progress * Math.PI);
        vm.position.set(
            vm.userData.basePos.x,
            vm.userData.basePos.y - pull * 0.06,
            vm.userData.basePos.z + pull * 0.20
        );
        vm.rotation.x = vm.userData.baseRot.x + pull * 0.55;
    } else {
        const k = Math.min(1, dt * 15);
        vm.position.lerp(vm.userData.basePos, k);
        vm.rotation.x += (vm.userData.baseRot.x - vm.rotation.x) * k;
    }
}

// ============================================================
// 更新玩家1
// ============================================================
function updatePlayer(p, dt, now) {
    if (p.id !== 1) return;

    if (now < p.deadUntil) {
        p.baseVisible = false;
        p.aiming = false;
        p.aimStage = 0;
        centerMsg(p, '回合结束');
        return;
    }

    p.baseVisible = true;

    let msg = '';
    if (gameState === 'prep') msg = `第 ${roundNumber} 回合 · 准备阶段`;
    else if (gameState === 'roundEnd') msg = '回合结束';
    centerMsg(p, msg);

    if (p.reloadEnd > 0 && now >= p.reloadEnd) {
        const w = p.weapon, need = w.mag - p.ammo, take = Math.min(need, p.reserve);
        p.ammo += take;
        p.reserve -= take;
        p.reloadEnd = 0;
    }

    if (p.boltEnd > 0 && now >= p.boltEnd) p.boltEnd = 0;

    const wantAim = p.aimStage > 0;
    const canAim = (gameState === 'combat') && (now >= p.boltEnd) && (p.reloadEnd <= now);
    p.aiming = wantAim && canAim;

    let targetFov = BASE_FOV;
    if (p.aiming) {
        if (p.weapon.key === 'sniper' && p.aimStage === 2 && p.weapon.zoomFov2) {
            targetFov = p.weapon.zoomFov2;
        } else {
            targetFov = p.weapon.zoomFov;
        }
    }
    if (Math.abs(p.cam.fov - targetFov) > 0.05) {
        p.cam.fov += (targetFov - p.cam.fov) * Math.min(1, dt * 11);
        p.cam.updateProjectionMatrix();
    }

    const wantCrouch = !!keys['ShiftLeft'];
    let targetH = HEIGHT_STAND;
    if (wantCrouch) targetH = HEIGHT_CROUCH;
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
    if (p.height < HEIGHT_STAND - 0.1) spd = SPEED_CROUCH * p.weapon.speedMul;
    if (p.aiming) spd *= p.weapon.adsSpeedMul;

    const len = Math.hypot(f, s) || 1;
    f /= len; s /= len;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    p.pos.x += (fx * f + rx * s) * spd * dt;
    p.pos.z += (fz * f + rz * s) * spd * dt;

    if (jump && p.onGround) {
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

    p.mat.opacity = 1;

    p.cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    p.cam.rotation.y = p.yaw;
    p.cam.rotation.x = p.pitch;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.scale.y = p.height / HEIGHT_STAND;

    updateSniperViewmodel(p, dt, now);
}

// ============================================================
// 靶子
// ============================================================
function updateTarget(t, dt, now) {
    if (now < t.deadUntil) { t.baseVisible = false; return; }
    t.baseVisible = true;
    t.pos.set(t.spawn.x, 0, t.spawn.z);
    t.yaw = t.spawn.yaw;
    t.pitch = 0;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.yaw;
    t.mesh.scale.y = 1;
    t.mat.opacity = 1;
}