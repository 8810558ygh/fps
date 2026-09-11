// ===== js/hud.js – HUD更新与回合结算报告 =====
function q(s) { return document.querySelector(s); }

const H = {
    1: {
        score: q('#hud1 .score'),
        hpText: q('#hpText'),
        armorText: q('#armorText'),
        armorWrap: q('#hud1 .armor-val'),
        ammo: q('#hud1 .ammo'),
        feed: q('#hud1 .feed'),
        center: q('#hud1 .centermsg'),
        flash: q('#hud1 .dmgflash'),
        hit: q('#hud1 .hitmark'),
        hint: q('#hud1 .subhint'),
        scope: q('#hud1 .scope'),
        wtag: q('#hud1 .wtag')
    }
};

// ---------- 回合结算报告（右上角） ----------
let combatReportEl = null;
let reportTimeout = null;

function createReportContainer() {
    if (combatReportEl) {
        combatReportEl.remove();
        combatReportEl = null;
    }
    if (reportTimeout) {
        clearTimeout(reportTimeout);
        reportTimeout = null;
    }

    const div = document.createElement('div');
    div.id = 'roundReport';
    div.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: 100;
        background: rgba(13, 19, 30, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 14px 18px;
        min-width: 290px;
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        color: #fff;
        box-shadow: 0 10px 36px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        pointer-events: auto;
        cursor: default;
        transition: opacity 0.2s ease;
        opacity: 0;
    `;
    document.body.appendChild(div);
    combatReportEl = div;

    requestAnimationFrame(() => {
        div.style.opacity = '1';
    });

    return div;
}

// ============================================================
// ★ 决定列头（联机模式：你 / 对手名；单机：玩家1 / 玩家2）
// ============================================================
function getReportColumns(attacker) {
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    const hasNET = (typeof NET !== 'undefined' && NET && NET.roomId);

    if (isOnline && hasNET) {
        if (NET.role === 'spectator') {
            // 观战者：蓝方 / 红方
            return {
                leftLabel: '蓝方',
                leftColor: '#6db3ff',
                rightLabel: '红方',
                rightColor: '#ff7a6d',
                // 谁击杀（attacker.id：1=蓝方, 2=红方）
                killLabel: attacker.id === 1 ? '蓝方' : '红方'
            };
        }
        // 房主 / 玩家：p1 = 我（自己座位的颜色），p2 = 对手
        const myIsBlue = (NET.mySeat === 'blue');
        const myColor = myIsBlue ? '#6db3ff' : '#ff7a6d';
        const opColor = myIsBlue ? '#ff7a6d' : '#6db3ff';
        const opName = (NET.getOpponentName && NET.getOpponentName()) || '对手';

        // attacker.id === 1 → 我击杀；=== 2 → 对手击杀
        const killLabel = (attacker.id === 1) ? '你' : opName;

        return {
            leftLabel: '你',
            leftColor: myColor,
            rightLabel: opName,
            rightColor: opColor,
            killLabel
        };
    }

    // 单机 / 人机
    return {
        leftLabel: '玩家1',
        leftColor: '#6db3ff',
        rightLabel: '玩家2',
        rightColor: '#ff7a6d',
        killLabel: '玩家' + attacker.id
    };
}

function showRoundReport(roundNumber, attacker, victim, dmgByAttacker, dmgByVictim) {
    const report = createReportContainer();

    // 从 attacker.id 判断左右列的伤害
    let dmg1, dmg2;
    if (attacker.id === 1) {
        dmg1 = dmgByAttacker;
        dmg2 = dmgByVictim;
    } else {
        dmg1 = dmgByVictim;
        dmg2 = dmgByAttacker;
    }

    // 动态列头
    const cols = getReportColumns(attacker);

    // ---- 标题行 ----
    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        margin-bottom: 10px;
        font-size: 13px;
        font-weight: 600;
    `;
    titleRow.innerHTML = `
        <span style="color: #cfe0f0; letter-spacing: 1px;">第 ${roundNumber} 回合结算</span>
        <span style="font-size: 12px; color: #ffd24a; background: rgba(255,210,74,0.15); padding: 2px 8px; border-radius: 3px;">💀 ${cols.killLabel} 击杀</span>
    `;
    report.appendChild(titleRow);

    // ---- 列头 ----
    const header = document.createElement('div');
    header.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 70px 70px;
        gap: 8px;
        padding: 4px 0 8px;
        font-size: 12px;
        color: #9fb2c8;
        letter-spacing: 1px;
    `;
    header.innerHTML = `
        <span></span>
        <span style="text-align: right; color: ${cols.leftColor};">${cols.leftLabel}</span>
        <span style="text-align: right; color: ${cols.rightColor};">${cols.rightLabel}</span>
    `;
    report.appendChild(header);

    // ---- 数据行工厂 ----
    function makeRow(icon, label, v1, v2, color) {
        const r = document.createElement('div');
        r.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 70px 70px;
            gap: 8px;
            padding: 4px 0;
            font-size: 13px;
        `;
        const c1 = v1 > 0 ? color : 'rgba(255,255,255,0.25)';
        const c2 = v2 > 0 ? color : 'rgba(255,255,255,0.25)';
        r.innerHTML = `
            <span style="color: rgba(255,255,255,0.75);">${icon} ${label}</span>
            <span style="text-align: right; color: ${c1}; font-weight: 600;">-${v1}</span>
            <span style="text-align: right; color: ${c2}; font-weight: 600;">-${v2}</span>
        `;
        return r;
    }

    report.appendChild(makeRow('🎯', '头部', dmg1.head, dmg2.head, '#ffd24a'));
    report.appendChild(makeRow('🔫', '身体', dmg1.body, dmg2.body, '#ff6b6b'));

    // ---- 分隔 ----
    const sep = document.createElement('div');
    sep.style.cssText = `margin: 8px 0 6px; border-top: 1px solid rgba(255,255,255,0.08);`;
    report.appendChild(sep);

    // ---- 总伤害 ----
    const totalRow = document.createElement('div');
    totalRow.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 70px 70px;
        gap: 8px;
        padding: 4px 0;
        font-size: 15px;
        font-weight: 700;
    `;
    const t1c = dmg1.total > 0 ? cols.leftColor : 'rgba(255,255,255,0.25)';
    const t2c = dmg2.total > 0 ? cols.rightColor : 'rgba(255,255,255,0.25)';
    totalRow.innerHTML = `
        <span style="color: rgba(255,255,255,0.6);">总伤害</span>
        <span style="text-align: right; color: ${t1c};">${dmg1.total}</span>
        <span style="text-align: right; color: ${t2c};">${dmg2.total}</span>
    `;
    report.appendChild(totalRow);

    // ---- 底部 ----
    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.3);
        text-align: right;
    `;
    footer.textContent = '下一回合准备阶段结束时自动关闭';
    report.appendChild(footer);

    report.addEventListener('click', () => {
        closeCombatReport();
    });
}

function closeCombatReport() {
    if (combatReportEl) {
        combatReportEl.style.opacity = '0';
        setTimeout(() => {
            if (combatReportEl) {
                combatReportEl.remove();
                combatReportEl = null;
            }
        }, 200);
    }
    if (reportTimeout) {
        clearTimeout(reportTimeout);
        reportTimeout = null;
    }
}

window.showRoundReport = showRoundReport;
window.closeCombatReport = closeCombatReport;

// ---------- 反馈 ----------
function feed(p, html) {
    if (p.id !== 1) return;
    const d = document.createElement('div');
    d.innerHTML = html;
    const box = H[1].feed;
    box.prepend(d);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 2200);
}

function centerMsg(p, text) {
    if (p.id === 1) H[1].center.textContent = text;
}

function dmgFlash(p) {
    if (p.id !== 1) return;
    const f = H[1].flash;
    f.style.transition = 'none';
    f.style.opacity = 1;
    requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = 0; });
}

function hitmark(p) {
    if (p.id !== 1) return;
    const el = H[1].hit;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

// ---- 主HUD更新 ----
function updateHUD(now) {
    const p = p1;
    const h = H[1];
    if (!h) return;
    h.score.textContent = p.score;
    h.hpText.textContent = Math.max(0, Math.round(p.hp));

    const armorVal = Math.max(0, Math.round(p.armor));
    h.armorText.textContent = armorVal;
    if (h.armorWrap) {
        h.armorWrap.style.color = armorVal > 0 ? '#6db3ff' : '#5a6a7a';
    }

    let ammoText = p.ammo;
    if (p.reloadEnd > now) {
        const remain = (p.reloadEnd - now) / 1000;
        ammoText = `换弹中 ${remain.toFixed(1)}s`;
    }
    h.ammo.innerHTML = ammoText + ` <span class="rsv">/ ${p.reserve}</span>`;

    h.wtag.textContent = p.weapon.name;
    const scoped = running && gameState === 'combat' && p.aiming && p.weapon.scope && now >= p.deadUntil;
    h.scope.style.display = scoped ? 'block' : 'none';

    const timerEl = q('#timer');
    if (running && gameState === 'prep') {
        const remain = Math.max(0, (stateEndTime - now) / 1000);
        timerEl.textContent = `准备 ${remain.toFixed(1)}s`;
        timerEl.style.color = '#ffd24a';
    } else {
        const left = Math.max(0, MATCH_MS - (now - matchStart));
        const mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
        timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
        timerEl.style.color = '#fff';
        if (running && left <= 0) {
            endMatch(p1.score === p2.score ? null : (p1.score > p2.score ? p1 : p2));
        }
    }

    if (h.hint) h.hint.style.display =
        (running && gameState === 'prep' && document.pointerLockElement !== renderer.domElement && !isOver()) ? 'block' : 'none';
}