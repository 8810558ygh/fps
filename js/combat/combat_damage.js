// ===== js/combat_damage.js – 伤害扣血 / 击杀 =====
// 从 game_combat.js 拆出，不改变任何对外接口

// ============================================================
// ★ damage() —— 只负责扣血/护甲/击杀
//   易伤翻倍已经在调用方（tryFire / tryMelee / barrels）应用
// ============================================================
function damage(victim, dmg, from) {
    if (gameState !== 'combat') return;
    if (gameMode === 'online' && typeof NET !== 'undefined' && !NET.isHost) return;
    const now = performance.now();
    if (victim.hp <= 0) return;
    if (now < victim.invulnUntil) { sEmpty(from.id); return; }

    // ★ 注意：dmg 是"已经应用易伤后"的最终值
    let hpDamage = dmg;
    if (victim.armor > 0) {
        const wantAbsorb = dmg * ARMOR_ABSORB;
        const actualAbsorb = Math.min(victim.armor, wantAbsorb);
        victim.armor = Math.max(0, victim.armor - actualAbsorb);
        hpDamage = dmg - actualAbsorb;
    }
    victim.hp -= hpDamage;
    dmgFlash(victim);

    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (victim === p2 && typeof NET_sendDamageEvent === 'function') {
            NET_sendDamageEvent('p2', dmg);
        }
    }

    if (victim.hp <= 0) kill(victim, from, now);
}

// ============================================================
// kill
// ============================================================
function kill(victim, from, now) {
    const isSuicide = (from === victim);

    const scoringPlayer = isSuicide ? other(victim) : from;

    if (scoringPlayer) scoringPlayer.score++;

    victim.hp = 0;
    victim.deadUntil = Infinity;

    // ★ 死亡时清理滑索/硬直/易伤状态
    if (victim.zipline && victim.zipline.active) {
        victim.zipline.active = false;
    }
    victim._zipStunPending  = false;
    victim.stunUntil        = 0;
    victim.vulnerableUntil  = 0;

    const emptyDmg = { body: 0, head: 0, leg: 0, total: 0 };
    const dmgByAttacker = scoringPlayer.damageDealt[victim.id] || emptyDmg;
    const dmgByVictim   = victim.damageDealt[scoringPlayer.id] || emptyDmg;
    lastKillReport = { attacker: scoringPlayer, victim: victim, dmgByAttacker, dmgByVictim };

    let killerSeat = null, victimSeat = null;
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        const hostSeat  = (NET.mySeat === 'red') ? 'red' : 'blue';
        const otherSeat = (hostSeat === 'blue')  ? 'red' : 'blue';

        if (isSuicide) {
            const suicideSeat = (victim === p1) ? hostSeat : otherSeat;
            killerSeat = suicideSeat;
            victimSeat = suicideSeat;
        } else {
            killerSeat = (scoringPlayer === p1) ? hostSeat : otherSeat;
            victimSeat = (victim === p1) ? hostSeat : otherSeat;
        }

        if (typeof NET_sendKillEvent === 'function') {
            NET_sendKillEvent(
                killerSeat, victimSeat, roundNumber,
                { head: dmgByAttacker.head, body: dmgByAttacker.body, leg: dmgByAttacker.leg, total: dmgByAttacker.total },
                { head: dmgByVictim.head,   body: dmgByVictim.body,   leg: dmgByVictim.leg,   total: dmgByVictim.total }
            );
        }
    }

    if (window.showRoundReport) {
        window.showRoundReport(
            roundNumber, scoringPlayer, victim,
            dmgByAttacker, dmgByVictim,
            killerSeat, victimSeat
        );
    }

    delete from.damageDealt[victim.id];
    delete victim.damageDealt[from.id];

    if (isSuicide) {
        feed(victim, `<b style="color:#ff7a6d">自我击杀</b>（自爆）`);
    } else {
        feed(victim, `被 <b style="color:${from.id===1?'#6db3ff':'#ff7a6d'}">玩家${from.id}</b> 击杀`);
        feed(from, `<b style="color:#ffd24a">击杀 玩家${victim.id}！</b>  +1`);
    }

    const _vEyeY = victim.pos.y + victim.eyeH;
    emitWorldSound('death', victim.pos.x, _vEyeY, victim.pos.z, victim.id === 1);
    const _kEyeY = scoringPlayer.pos.y + scoringPlayer.eyeH;
    emitWorldSound('kill', scoringPlayer.pos.x, _kEyeY, scoringPlayer.pos.z, scoringPlayer.id === 1);

    if (gameMode === 'ai' && !isSuicide) {
        if (from.id === 2 && typeof aiTaunt === 'function') aiTaunt();
        if (from.id === 1 && typeof resetAiStreakOnPlayerKill === 'function') resetAiStreakOnPlayerKill();
    }

    if (scoringPlayer.score >= TARGET_KILLS) { endMatch(scoringPlayer); return; }
    gameState = 'roundEnd';
    stateEndTime = now + ROUND_END_MS;
    if (gameMode === 'online' && typeof NET !== 'undefined' && NET.isHost) {
        if (typeof NET_sendRoundEvent === 'function') {
            NET_sendRoundEvent('roundEnd', ROUND_END_MS, false, roundNumber);
        }
    }
}