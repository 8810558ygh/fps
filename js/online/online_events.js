// ===== js/online_events.js – 射击 / 击杀 / 回合 / 伤害 事件 =====
// 从 online_game.js 拆出，不改变任何对外接口
// 依赖：online_serialize.js 提供 _clientPlayerState / _lastLowFreqBlue / _lastLowFreqRed

function handleShootEvent(data) {
    // ============================================================
    // 近战事件（knife_light / knife_heavy）
    // ============================================================
    if (data.weapon === 'knife_light' || data.weapon === 'knife_heavy') {
        const isHeavy = data.weapon === 'knife_heavy';
        if (typeof sMelee === 'function') sMelee(isHeavy);
        if (typeof p2 !== 'undefined' && p2) {
            const now = performance.now();
            p2.meleeEnd = now + (isHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs);
            p2.meleeIsHeavy = isHeavy;
        }
        return;
    }

    // ============================================================
    // ★ 修复重复弹道：
    //
    //   房主广播 shootEvent 时带的 shooter 字段：
    //     'p1' → 房主自己开的枪 → 客户端应显示 tracer
    //     'p2' → 客户端（= 我）开的枪 → 客户端本地已经 spawnTracer 过，
    //            收到房主回传的广播时必须跳过，否则会画两条弹道
    //
    //   注意：这个字段是新加的，如果收到老版本（无 shooter）的广播，
    //         走下面的兜底逻辑按"正常显示"处理（宁可重复也不漏掉对方开枪）
    // ============================================================
    if (data.shooter === 'p2') {
        // 这是客户端自己开的枪：
        //   · tracer 已在本地 tryFire 的 client 分支里 spawn 过
        //   · 音效也已在本地 emitWorldSound 播过
        //   · p2 的枪口光更新也不必要（p2 是房主的模型，不是我）
        // → 直接跳过，避免重复
        return;
    }

    // ============================================================
    // 房主开的枪（shooter === 'p1' 或未定义）
    // ============================================================
    if (typeof p2 !== 'undefined' && p2) {
        if (p2.muzzle) p2.muzzle.intensity = 2.2;
        if (typeof spawnTracer === 'function'
            && data.sx !== undefined && data.ex !== undefined) {
            spawnTracer(
                new THREE.Vector3(data.sx, data.sy, data.sz),
                new THREE.Vector3(data.ex, data.ey, data.ez)
            );
        }
    }

    // ★ 音效
    //   房主开枪时，房主侧的 emitWorldSound('rifle', ..., isSelf=false)
    //   已经通过 worldSound 广播把空间化音效发过来了，客户端会走
    //   handleRemoteWorldSound 播放。
    //
    //   这里的 2D 音效（sShootRifle(2)）是早期遗留代码，与空间化系统
    //   冲突（永远播到右声道）。所以保留注释，不再播放。
    //
    // switch (data.weapon) {
    //     case 'sniper': sShootSniper(2); break;
    //     case 'shotgun': sShootShotgun(2); break;
    //     case 'odin': sShootOdin(2); break;
    //     default: sShootRifle(2); break;
    // }
}

function getPlayerNameBySeat(seat) {
    if (!seat) return '未知';
    const peerId = seat === 'blue' ? NET.seats.blue
                 : seat === 'red'  ? NET.seats.red
                 : null;
    if (!peerId) return seat === 'blue' ? '蓝方' : '红方';
    if (peerId === NET.myPeerId) return '你';
    const m = NET.members.get(peerId);
    return (m && m.name) || (seat === 'blue' ? '蓝方' : '红方');
}

function handleKillEvent(data) {
    // ============================================================
    // ★ 已删除：sKill(1) / sDeath()
    //
    // 原因：
    //   · 房主侧 combat_damage.js 的 kill() 已经通过
    //       emitWorldSound('death', ...) / emitWorldSound('kill', ...)
    //     广播了【空间化】的击杀/死亡音效，客户端会通过
    //     handleRemoteWorldSound 收到并定位播放。
    //   · 这里再调 sKill(1) / sDeath() 会重复播放。
    // ============================================================

    const mySeat     = NET.mySeat;
    const isMePlayer = (mySeat === 'blue' || mySeat === 'red');
    const isSuicide  = (data.killerSeat && data.killerSeat === data.victimSeat);
    const iAmKiller  = isMePlayer && !isSuicide && (data.killerSeat === mySeat);
    const iAmVictim  = isMePlayer && (data.victimSeat === mySeat);

    if (NET.role === 'spectator') {
        if (data.victimSeat === NET.spectatorTarget) {
            if (typeof p1 !== 'undefined' && p1) {
                p1.hp = 0;
                p1.deadUntil = Infinity;
                p1.baseVisible = false;
            }
        } else if (typeof p2 !== 'undefined' && p2) {
            p2.hp = 0;
            p2.deadUntil = Infinity;
            p2.baseVisible = false;
            p2.mesh.visible = false;
        }
    } else if (iAmVictim && typeof p1 !== 'undefined' && p1) {
        p1.hp = 0;
        p1.deadUntil = Infinity;
        p1.baseVisible = false;
        p1.aiming = false;
        if (p1.input) p1.input.aim = false;
        p1.flashUntil = 0;
    } else if (iAmKiller && typeof p2 !== 'undefined' && p2) {
        p2.hp = 0;
        p2.deadUntil = Infinity;
        p2.baseVisible = false;
        p2.mesh.visible = false;
        p2.flashUntil = 0;
    } else if (typeof p2 !== 'undefined' && p2) {
        p2.hp = 0;
        p2.deadUntil = Infinity;
        p2.baseVisible = false;
        p2.mesh.visible = false;
        p2.flashUntil = 0;
    }

    if (isSuicide) {
        const victimName = getPlayerNameBySeat(data.victimSeat);
        if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
            feed(p1, `<b style="color:#ff7a6d">${victimName}</b> 自我击杀（自爆）`);
        }
    } else {
        const killerName = getPlayerNameBySeat(data.killerSeat);
        const victimName = getPlayerNameBySeat(data.victimSeat);
        const kc = data.killerSeat === 'blue' ? '#6db3ff' : '#ff7a6d';
        const vc = data.victimSeat === 'blue' ? '#6db3ff' : '#ff7a6d';
        const html = `<b style="color:${kc}">${killerName}</b> 击杀了 <b style="color:${vc}">${victimName}</b>`;
        if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
            feed(p1, html);
        }
    }

    if (typeof showRoundReport === 'function'
        && data.dmgByKiller && data.dmgByVictim) {

        let attacker, victim;
        if (NET.role === 'spectator') {
            if (data.killerSeat === NET.spectatorTarget) {
                attacker = p1; victim = p2;
            } else {
                attacker = p2; victim = p1;
            }
        } else if (isMePlayer) {
            if (iAmKiller) { attacker = p1; victim = p2; }
            else           { attacker = p2; victim = p1; }
        } else {
            attacker = p1; victim = p2;
        }

        window.showRoundReport(
            data.roundNumber || 1,
            attacker, victim,
            data.dmgByKiller, data.dmgByVictim,
            data.killerSeat, data.victimSeat
        );
    }
}

function handleRoundEvent(data) {
    const prevState = (typeof gameState !== 'undefined') ? gameState : null;

    if (typeof gameState !== 'undefined') gameState = data.gameState;
    if (typeof stateEndTime !== 'undefined') stateEndTime = performance.now() + data.remain;
    if (typeof roundNumber !== 'undefined' && data.roundNumber) roundNumber = data.roundNumber;

    if (data.gameState === 'combat' && prevState === 'prep') {
        if (window.closeCombatReport) window.closeCombatReport();
        const panel = document.getElementById('weaponPanel');
        if (panel) panel.style.display = 'none';
        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice
            && typeof renderer !== 'undefined' && running) {
            if (typeof isChatOpen === 'function' && isChatOpen()) return;
            if (NET.role === 'spectator') return;
            if (document.pointerLockElement !== renderer.domElement) {
                renderer.domElement.requestPointerLock();
            }
        }
    }

    if (data.gameState === 'idle' && prevState !== 'idle') {
        if (typeof running !== 'undefined' && running
            && typeof endMatch === 'function') {

            if (data.blueScore !== undefined && data.redScore !== undefined
                && typeof NET !== 'undefined') {

                if (NET.role === 'spectator') {
                    const p1IsBlue = (NET.spectatorTarget === 'blue');
                    if (p1IsBlue) {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.blueScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.redScore;
                    } else {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.redScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.blueScore;
                    }
                } else {
                    if (NET.mySeat === 'blue') {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.blueScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.redScore;
                    } else {
                        if (typeof p1 !== 'undefined' && p1) p1.score = data.redScore;
                        if (typeof p2 !== 'undefined' && p2) p2.score = data.blueScore;
                    }
                }
            }

            let winner = null;
            if (typeof p1 !== 'undefined' && typeof p2 !== 'undefined') {
                if (p1.score > p2.score) winner = p1;
                else if (p2.score > p1.score) winner = p2;
            }

            endMatch(winner);
        }
        return;
    }

    if (data.reset) {
        if (typeof clearAllSmokes === 'function') clearAllSmokes();
        if (typeof clearAllFlashes === 'function') clearAllFlashes();
        if (typeof clearAllBulletHoles === 'function') clearAllBulletHoles();

        if (typeof window.resetBarrels === 'function') window.resetBarrels();
        if (typeof clearAllShellCasings === 'function') clearAllShellCasings();

        if (typeof p1 !== 'undefined' && p1) p1.flashUntil = 0;
        if (typeof p2 !== 'undefined' && p2) p2.flashUntil = 0;

        if (typeof resetPlayer === 'function') {
            if (typeof p1 !== 'undefined' && p1) resetPlayer(p1, performance.now());
            if (typeof p2 !== 'undefined' && p2) resetPlayer(p2, performance.now());
        } else {
            if (typeof p1 !== 'undefined' && p1) { p1.deadUntil = 0; p1.hp = 100; p1.baseVisible = true; }
            if (typeof p2 !== 'undefined' && p2) { p2.deadUntil = 0; p2.hp = 100; p2.baseVisible = true; }
        }

        _clientPlayerState.blue = null;
        _clientPlayerState.red  = null;
        _lastLowFreqBlue._init = false;
        _lastLowFreqRed._init = false;
        NET._lastSentInput = null;

        NET.pendingZiplineMount = null;
        NET.pendingZiplineDismount = false;
        NET.pendingVulnerableStart = null;
    }
}

function handleDamageEvent(data) {
    if (data.target === 'p2' && NET.role === 'player') {
        if (typeof p1 !== 'undefined' && typeof dmgFlash === 'function') dmgFlash(p1);
        if (typeof sHit === 'function') sHit(1);
    }
}

window.NET_sendDamageEvent = function (target, dmg) {
    if (!NET.isHost) return;
    broadcast({ type: 'damageEvent', target, dmg });
};

window.NET_sendKillEvent = function (killerSeat, victimSeat, round, dmgByKiller, dmgByVictim) {
    if (!NET.isHost) return;
    broadcast({
        type: 'killEvent',
        killerSeat: killerSeat || null,
        victimSeat: victimSeat || null,
        roundNumber: round,
        dmgByKiller: dmgByKiller || { body: 0, head: 0, leg: 0, total: 0 },
        dmgByVictim: dmgByVictim || { body: 0, head: 0, leg: 0, total: 0 }
    });
};

window.NET_sendRoundEvent = function (gameStateStr, remain, reset, roundNum, extra) {
    if (!NET.isHost) return;
    const packet = {
        type: 'roundEvent',
        gameState: gameStateStr,
        remain,
        reset,
        roundNumber: roundNum,
    };
    if (extra) {
        if (extra.blueScore !== undefined) packet.blueScore = extra.blueScore;
        if (extra.redScore  !== undefined) packet.redScore  = extra.redScore;
    }
    broadcast(packet);
};