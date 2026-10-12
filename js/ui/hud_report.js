// ===== js/hud_report.js – 回合结算报告面板 =====
// 从 hud.js 拆出，不改变任何对外接口

let combatReportEl = null;
let reportTimeout = null;

function createReportContainer() {
    if (combatReportEl) { combatReportEl.remove(); combatReportEl = null; }
    if (reportTimeout) { clearTimeout(reportTimeout); reportTimeout = null; }
    const div = document.createElement('div');
    div.id = 'roundReport';
    div.style.cssText = `
        position: fixed; top: 70px; right: 20px; z-index: 100;
        background: rgba(13, 19, 30, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px; padding: 14px 18px; min-width: 290px;
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        color: #fff; box-shadow: 0 10px 36px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px); pointer-events: auto; cursor: default;
        transition: opacity 0.2s ease; opacity: 0;
    `;
    document.body.appendChild(div);
    combatReportEl = div;
    requestAnimationFrame(() => { div.style.opacity = '1'; });
    return div;
}

function getReportColumns(attacker, attackerSeat) {
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    const hasNET   = (typeof NET !== 'undefined' && NET && NET.roomId);

    if (isOnline && hasNET) {
        if (NET.role === 'spectator') {
            const killLabel =
                attackerSeat === 'red'  ? '红方' :
                attackerSeat === 'blue' ? '蓝方' :
                (attacker && attacker.id === 1 ? '蓝方' : '红方');
            return {
                leftLabel:  '蓝方', leftColor:  '#6db3ff',
                rightLabel: '红方', rightColor: '#ff7a6d',
                killLabel
            };
        }

        const myIsBlue = (NET.mySeat === 'blue');
        const myColor  = myIsBlue ? '#6db3ff' : '#ff7a6d';
        const opColor  = myIsBlue ? '#ff7a6d' : '#6db3ff';
        const opName   = (NET.getOpponentName && NET.getOpponentName()) || '对手';
        const killLabel = attackerSeat
            ? (attackerSeat === NET.mySeat ? '你' : opName)
            : (attacker && attacker.id === 1 ? '你' : opName);
        return {
            leftLabel:  '你',   leftColor:  myColor,
            rightLabel: opName, rightColor: opColor,
            killLabel
        };
    }

    return {
        leftLabel:  '玩家1', leftColor:  '#6db3ff',
        rightLabel: '玩家2', rightColor: '#ff7a6d',
        killLabel:  '玩家' + (attacker ? attacker.id : 1)
    };
}

// ============================================================
// ★ showRoundReport
// ============================================================
function showRoundReport(roundNumber, attacker, victim, dmgByAttacker, dmgByVictim,
                         killerSeat, victimSeat) {
    const report = createReportContainer();

    let dmg1, dmg2;
    if (killerSeat && victimSeat) {
        const blueIsAttacker = (killerSeat === 'blue');
        dmg1 = blueIsAttacker ? dmgByAttacker : dmgByVictim;
        dmg2 = blueIsAttacker ? dmgByVictim  : dmgByAttacker;
    } else {
        if (attacker.id === 1) { dmg1 = dmgByAttacker; dmg2 = dmgByVictim; }
        else                   { dmg1 = dmgByVictim;  dmg2 = dmgByAttacker; }
    }

    const leg1 = dmg1.leg || 0;
    const leg2 = dmg2.leg || 0;

    const cols = getReportColumns(attacker, killerSeat);

    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        margin-bottom: 10px; font-size: 13px; font-weight: 600;
    `;
    titleRow.innerHTML = `
        <span style="color: #cfe0f0; letter-spacing: 1px;">第 ${roundNumber} 回合结算</span>
        <span style="font-size: 12px; color: #ffd24a; background: rgba(255,210,74,0.15); padding: 2px 8px; border-radius: 3px;">💀 ${cols.killLabel} 击杀</span>
    `;
    report.appendChild(titleRow);

    const header = document.createElement('div');
    header.style.cssText = `display: grid; grid-template-columns: 1fr 70px 70px; gap: 8px; padding: 4px 0 8px; font-size: 12px; color: #9fb2c8; letter-spacing: 1px;`;
    header.innerHTML = `
        <span></span>
        <span style="text-align: right; color: ${cols.leftColor};">${cols.leftLabel}</span>
        <span style="text-align: right; color: ${cols.rightColor};">${cols.rightLabel}</span>
    `;
    report.appendChild(header);

    function makeRow(icon, label, v1, v2, color) {
        const r = document.createElement('div');
        r.style.cssText = `display: grid; grid-template-columns: 1fr 70px 70px; gap: 8px; padding: 4px 0; font-size: 13px;`;
        const c1 = v1 > 0 ? color : 'rgba(255,255,255,0.25)';
        const c2 = v2 > 0 ? color : 'rgba(255,255,255,0.25)';
        r.innerHTML = `
            <span style="color: rgba(255,255,255,0.75);">${icon} ${label}</span>
            <span style="text-align: right; color: ${c1}; font-weight: 600;">-${v1}</span>
            <span style="text-align: right; color: ${c2}; font-weight: 600;">-${v2}</span>
        `;
        return r;
    }
    report.appendChild(makeRow('🎯', '头部', dmg1.head || 0, dmg2.head || 0, '#ffd24a'));
    report.appendChild(makeRow('🔫', '身体', dmg1.body || 0, dmg2.body || 0, '#ff6b6b'));
    report.appendChild(makeRow('🦵', '腿部', leg1, leg2, '#8fe8a8'));

    const sep = document.createElement('div');
    sep.style.cssText = `margin: 8px 0 6px; border-top: 1px solid rgba(255,255,255,0.08);`;
    report.appendChild(sep);

    const totalRow = document.createElement('div');
    totalRow.style.cssText = `display: grid; grid-template-columns: 1fr 70px 70px; gap: 8px; padding: 4px 0; font-size: 15px; font-weight: 700;`;
    const t1c = dmg1.total > 0 ? cols.leftColor  : 'rgba(255,255,255,0.25)';
    const t2c = dmg2.total > 0 ? cols.rightColor : 'rgba(255,255,255,0.25)';
    totalRow.innerHTML = `
        <span style="color: rgba(255,255,255,0.6);">总伤害</span>
        <span style="text-align: right; color: ${t1c};">${dmg1.total}</span>
        <span style="text-align: right; color: ${t2c};">${dmg2.total}</span>
    `;
    report.appendChild(totalRow);

    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 11px; color: rgba(255, 255, 255, 0.3); text-align: right;
    `;
    footer.textContent = '下一回合准备阶段结束时自动关闭';
    report.appendChild(footer);
    report.addEventListener('click', () => { closeCombatReport(); });
}

function closeCombatReport() {
    if (combatReportEl) {
        combatReportEl.style.opacity = '0';
        setTimeout(() => {
            if (combatReportEl) { combatReportEl.remove(); combatReportEl = null; }
        }, 200);
    }
    if (reportTimeout) { clearTimeout(reportTimeout); reportTimeout = null; }
}

window.showRoundReport = showRoundReport;
window.closeCombatReport = closeCombatReport;