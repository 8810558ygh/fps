// ===== js/hud.js – HUD更新与击杀报告 =====
function q(s) { return document.querySelector(s); }

const H = {
    1: {
        score: q('#hud1 .score'),
        hpText: q('#hpText'),
        armorText: q('#armorText'),
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

// ---------- 击杀报告（右上角） ----------
let combatReportEl = null;
let reportTimeout = null;

function createCombatReport() {
    if (combatReportEl) {
        combatReportEl.remove();
        combatReportEl = null;
    }
    if (reportTimeout) {
        clearTimeout(reportTimeout);
        reportTimeout = null;
    }

    const div = document.createElement('div');
    div.id = 'combatReport';
    div.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        z-index: 100;
        background: rgba(13, 19, 30, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 12px 16px;
        min-width: 220px;
        max-width: 320px;
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        color: #fff;
        box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        backdrop-filter: blur(8px);
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

function showCombatReport(attacker, victim, damageInfo) {
    const report = createCombatReport();

    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
    `;
    const attackerColor = attacker.id === 1 ? '#6db3ff' : '#ff7a6d';
    const victimColor = victim.id === 1 ? '#6db3ff' : '#ff7a6d';
    titleRow.innerHTML = `
        <span style="color: ${attackerColor};">玩家${attacker.id}</span>
        <span style="color: rgba(255,255,255,0.3); margin: 0 6px;">→</span>
        <span style="color: ${victimColor};">玩家${victim.id}</span>
        <span style="margin-left: auto; font-size: 12px; color: #ffd24a; background: rgba(255,210,74,0.15); padding: 0 8px; border-radius: 3px;">💀 击杀</span>
    `;
    report.appendChild(titleRow);

    const list = document.createElement('div');
    list.style.cssText = `font-size: 13px;`;

    if (damageInfo.body > 0) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            color: rgba(255,255,255,0.8);
        `;
        row.innerHTML = `
            <span>🔫 身体</span>
            <span style="color: #ff6b6b; font-weight: 600;">-${damageInfo.body}</span>
        `;
        list.appendChild(row);
    }

    if (damageInfo.head > 0) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            color: rgba(255,255,255,0.8);
        `;
        row.innerHTML = `
            <span>🎯 头部</span>
            <span style="color: #ffd24a; font-weight: 600;">-${damageInfo.head}</span>
        `;
        list.appendChild(row);
    }

    const totalRow = document.createElement('div');
    totalRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 6px 0 2px 0;
        border-top: 1px solid rgba(255,255,255,0.08);
        margin-top: 4px;
        font-weight: 700;
        font-size: 14px;
    `;
    totalRow.innerHTML = `
        <span style="color: rgba(255,255,255,0.6);">总伤害</span>
        <span style="color: #ff6b6b;">${damageInfo.total}</span>
    `;
    list.appendChild(totalRow);

    report.appendChild(list);

    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.04);
        font-size: 11px;
        color: rgba(255,255,255,0.25);
        text-align: right;
    `;
    footer.textContent = '点击任意处关闭';
    report.appendChild(footer);

    report.addEventListener('click', () => {
        closeCombatReport();
    });

    if (reportTimeout) clearTimeout(reportTimeout);
    reportTimeout = setTimeout(() => {
        closeCombatReport();
    }, 4000);
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

window.showCombatReport = showCombatReport;
window.closeCombatReport = closeCombatReport;

// ---------- 原有feed/centerMsg/dmgFlash/hitmark ----------
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
    h.armorText.textContent = '50';

    let ammoText = p.ammo;
    if (p.reloadEnd > now) {
        const remain = (p.reloadEnd - now) / 1000;
        ammoText = `换弹中 ${remain.toFixed(1)}s`;
    }
    h.ammo.innerHTML = ammoText + ` <span class="rsv">/ ${p.reserve}</span>`;

    h.wtag.textContent = p.weapon.name;
    const scoped = running && p.aiming && p.weapon.scope && now >= p.deadUntil;
    h.scope.style.display = scoped ? 'block' : 'none';

    const left = Math.max(0, MATCH_MS - (now - matchStart));
    const mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
    q('#timer').textContent = `${mm}:${String(ss).padStart(2,'0')}`;
    if (running && left <= 0) {
        endMatch(p1.score === p2.score ? null : (p1.score > p2.score ? p1 : p2));
    }
    if (h.hint) h.hint.style.display =
        (running && document.pointerLockElement !== renderer.domElement && !isOver()) ? 'block' : 'none';

  
}