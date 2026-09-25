// ===== js/game.js – 回合管理、特效循环、比赛管理 =====

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
        if (s.life <= 0) {
            scene.remove(s.mesh);
            // ★ 火花材质现在是共享缓存的（见 game_effects.js 的 _getSparkMat），
            //   这里不能再 dispose，否则会把其他火花的材质一起销毁
            sparks.splice(i, 1);
        }
    }
    if (p1.muzzle.intensity > 0) p1.muzzle.intensity = Math.max(0, p1.muzzle.intensity - 14 * dt);
    if (p1.vmMuzzle.intensity > 0) p1.vmMuzzle.intensity = Math.max(0, p1.vmMuzzle.intensity - 14 * dt);
    if (p2.muzzle && p2.muzzle.intensity > 0) p2.muzzle.intensity = Math.max(0, p2.muzzle.intensity - 14 * dt);

    updateSmokes(dt, now);
    updateFlashes(dt, now);
    updateFlashBursts(dt, now);
    updateFlashOverlay(now);
    updateFlashIndicators(now);
    updateSmokeTrajectory(now);
    updateFlashTrajectory(now);
    updateBulletHoles(now);
    updateThrowFuse(now);
}

function resetPlayer(p, now) {
    const gh = terrainGroundAt(p.spawn.x, p.spawn.z);
    p.pos.set(p.spawn.x, gh, p.spawn.z);
    p.yaw = p.spawn.yaw; p.pitch = 0;
    p.vy = 0; p.prevY = gh; p.onGround = true;
    p.height = HEIGHT_STAND; p.eyeH = EYE_STAND;
    p.mesh.scale.y = 1;
    p.hp = HP_MAX; p.armor = ARMOR_MAX;
    if (!p.isMelee && !p.isSmoke && !p.isFlash) {
        p.ammo = p.weapon.mag;
        p.reserve = p.weapon.startReserve;
    } else { p.ammo = 0; p.reserve = 0; }
    p.reloadEnd = 0; p.nextShot = 0;
    p.aiming = false; p.aimStage = 0; p.boltEnd = 0;

    // ★★★ 关键修复：重置右键开镜意图，避免下一回合自动开镜 ★★★
    if (p.input) {
        p.input.aim   = false;
        p.input.fire  = false;
        p.input.jump  = false;
        p.input.crouch = false;
        p.input.forward = 0;
        p.input.right   = 0;
    }

    p.deadUntil = 0; p.invulnUntil = 0;
    p.spinUpProgress = 0; p.lastShotTime = 0;
    p.damageDealt = {};
    p.baseVisible = true;
    p.mat.opacity = 1;
    p._prevStepX = p.spawn.x; p._prevStepZ = p.spawn.z;
    p._stepAccum = 0;
    p.equipEnd = 0;
    p.meleeCombo = 0; p.meleeEnd = 0; p.meleeRecovery = 0;
    p.meleeIsHeavy = false; p.lastMeleeTime = 0;
    p.smokeCharges = SMOKE.maxPerRound;
    p.smokeCooldownEnd = 0;
    p.lastSmokeThrowAt = 0;
    p.flashCharges = FLASH.maxPerRound;
    p.flashCooldownEnd = 0;
    p.lastFlashThrowAt = 0;
    p.flashUntil = 0;
    p.throwFuseActive = false;
    p.throwFuseType = null;
    p.throwFuseStart = 0;
    p.throwFuseEnd = 0;
    p.throwFuseInHand = false;

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

function startRound(now) {
    roundNumber++;
    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    resetPlayer(p1, now);
    resetPlayer(p2, now);

    if (gameMode === 'ai' && typeof aiResetRound === 'function') aiResetRound(now);

    for (const k in keys) keys[k] = false;
    mouse.leftDown = false; mouse.aim = false;

    // ★★★ 双保险：再清一次输入意图（p1 本地 + p2 联机时可能残留）★★★
    if (p1 && p1.input) p1.input.aim = false;
    if (p2 && p2.input) p2.input.aim = false;

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
    running = false; gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();
    const el = document.getElementById('endOverlay');
    document.getElementById('endTitle').innerHTML = winner ?
        `<span class="${winner.id===1?'b':'r'}">${winner.id===1?'蓝色':'红色'}</span>玩家获胜！` : '平局！';
    document.getElementById('endScore').textContent = `${p1.score} : ${p2.score}`;
    el.style.display = 'flex';
    sWin();

    document.body.classList.remove('in-game');
    const rot = document.getElementById('rotateOverlay');
    if (rot) rot.style.display = 'none';

    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') NET_sendRoundEvent('idle', 0, false, roundNumber);
    }
}

function resetMatch() {
    const now = performance.now();
    p1.score = 0; p2.score = 0;
    roundNumber = 0; lastKillReport = null;
    matchStart = now;
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof clearChat === 'function') clearChat();
    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';
    document.getElementById('endOverlay').style.display = 'none';
    document.getElementById('weaponPanel').style.display = 'none';
    running = true;
    startRound(now);
    document.body.classList.add('in-game');
    if (typeof checkOrientation === 'function') checkOrientation();
}