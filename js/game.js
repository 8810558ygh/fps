// ===== js/game.js – 回合管理、特效循环、比赛管理 =====

function updateEffects(dt, now) {
    if (typeof updateTracers === 'function') updateTracers(now);

    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) {
            scene.remove(s.mesh);
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

    // ★ 油桶爆炸特效
    if (typeof updateExplosionVisuals === 'function') {
        updateExplosionVisuals(dt, now);
    }

    // ★ 弹壳物理同步
    if (typeof updateShellCasings === 'function') {
        updateShellCasings(dt, now);
    }
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
    }
    p.reloadEnd = 0; p.nextShot = 0;
    p.aiming = false; p.aimStage = 0; p.boltEnd = 0;

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
    p._prevOnGround = true;
    p._vyBeforeLand = 0;
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

    if (p._netTargetPos) p._netTargetPos.set(p.spawn.x, gh, p.spawn.z);
    if (p._netTargetYaw !== undefined) p._netTargetYaw = p.spawn.yaw;

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

    if (window.PHYSICS && window.PHYSICS.isReady()) {
        window.PHYSICS.teleportPlayerBody(p);
    }
}

function startRound(now) {
    roundNumber++;
    clearAllSmokes();
    clearAllFlashes();
    clearAllBulletHoles();
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    // ★ 重置所有油桶
    if (typeof window.resetBarrels === 'function') window.resetBarrels();

    // ★ 清空弹壳
    if (typeof clearAllShellCasings === 'function') clearAllShellCasings();

    resetPlayer(p1, now);
    resetPlayer(p2, now);

    if (gameMode === 'ai' && typeof aiResetRound === 'function') aiResetRound(now);

    for (const k in keys) keys[k] = false;
    mouse.leftDown = false; mouse.aim = false;

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

// ============================================================
// ★ 修复：endMatch 支持联机模式下的颜色/比分正确映射
// ============================================================
function endMatch(winner) {
    running = false; gameState = 'idle';
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.closeCombatReport) window.closeCombatReport();
    if (typeof closeChat === 'function') closeChat();

    // ============================================================
    // ★ 联机模式下 p1 / p2 与"蓝方 / 红方"不固定对应，
    //   必须根据座位或观战目标来推导"胜方颜色"。
    // ============================================================
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online'
                      && typeof NET !== 'undefined' && NET.roomId);

    let winningColor = null;   // 'blue' | 'red' | null（平局）
    if (winner) {
        if (isOnline) {
            if (NET.role === 'spectator') {
                const p1IsBlue = (NET.spectatorTarget === 'blue');
                const winnerIsP1 = (winner === p1);
                winningColor = (winnerIsP1 === p1IsBlue) ? 'blue' : 'red';
            } else {
                // 玩家（房主 / 客户端）：p1 代表自己的座位
                const mySeat  = NET.mySeat;                       // 'blue' | 'red'
                const oppSeat = (mySeat === 'blue') ? 'red' : 'blue';
                winningColor = (winner === p1) ? mySeat : oppSeat;
            }
        } else {
            winningColor = (winner.id === 1) ? 'blue' : 'red';
        }
    }

    // ============================================================
    // ★ 比分统一按"蓝方 : 红方"顺序显示
    // ============================================================
    let blueScore, redScore;
    if (isOnline) {
        if (NET.role === 'spectator') {
            const p1IsBlue = (NET.spectatorTarget === 'blue');
            blueScore = p1IsBlue ? p1.score : p2.score;
            redScore  = p1IsBlue ? p2.score : p1.score;
        } else {
            if (NET.mySeat === 'blue') {
                blueScore = p1.score;
                redScore  = p2.score;
            } else {
                blueScore = p2.score;
                redScore  = p1.score;
            }
        }
    } else {
        blueScore = p1.score;
        redScore  = p2.score;
    }

    const el = document.getElementById('endOverlay');
    const titleColor = winningColor === 'blue' ? 'b' : 'r';
    const titleName  = winningColor === 'blue' ? '蓝色' : '红色';

    document.getElementById('endTitle').innerHTML = winningColor
        ? `<span class="${titleColor}">${titleName}</span>玩家获胜！`
        : '平局！';
    document.getElementById('endScore').textContent = `${blueScore} : ${redScore}`;

    const againBtn = document.getElementById('againBtn');
    if (againBtn) {
        if (gameMode === 'online') {
            againBtn.textContent = '返 回 房 间';
        } else {
            againBtn.textContent = '再 来 一 局';
        }
    }

    el.style.display = 'flex';

    if (typeof setOver === 'function') setOver(true);

    sWin();

    document.body.classList.remove('in-game');
    const rot = document.getElementById('rotateOverlay');
    if (rot) rot.style.display = 'none';

    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

    // ============================================================
    // ★ 房主广播比赛结束时，附带最终比分
    //   （客户端 handleRoundEvent 会用它同步本地分数并显示结局）
    // ============================================================
    if (isOnline && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('idle', 0, false, roundNumber, {
                blueScore: blueScore,
                redScore:  redScore,
            });
        }
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

    if (typeof setOver === 'function') setOver(false);

    document.getElementById('weaponPanel').style.display = 'none';
    running = true;
    startRound(now);
    document.body.classList.add('in-game');
    if (typeof checkOrientation === 'function') checkOrientation();
}