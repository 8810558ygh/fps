// ===== js/hud_report.js – 回合结算报告面板（无畏契约宽幅版） =====
// 上下分栏结构：人物伤害一栏，环境伤害（油桶）一栏

let combatReportEl = null;
let reportTimeout = null;

function createReportContainer() {
    if (combatReportEl) { combatReportEl.remove(); combatReportEl = null; }
    if (reportTimeout) { clearTimeout(reportTimeout); reportTimeout = null; }
    const div = document.createElement('div');
    div.id = 'roundReport';
    div.style.cssText = `
        position: fixed; 
        top: 50%; 
        right: 20px; 
        transform: translateY(-50%);
        z-index: 100;
        background: rgba(13, 19, 30, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px; padding: 18px 24px; 
        min-width: 520px;
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        color: #fff; box-shadow: 0 10px 36px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px); pointer-events: auto; cursor: default;
        transition: opacity 0.2s ease; opacity: 0;
        display: flex;
        flex-direction: column;
        gap: 12px; /* ★ 两个栏目的间距 */
    `;
    document.body.appendChild(div);
    combatReportEl = div;
    requestAnimationFrame(() => { div.style.opacity = '1'; });
    return div;
}

// ============================================================
// ★ 核心组件：渲染一栏伤害（包含左、中、右）
// ============================================================
function renderSection(title, dmgOut, dmgIn, rowList) {
    const sec = document.createElement('div');
    sec.style.cssText = `
        display: flex; flex-direction: column;
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,0.06);
    `;

    // 栏目标题（如：人物伤害、环境伤害）
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
        text-align: center; font-size: 13px; font-weight: 700; 
        color: rgba(255,255,255,0.5); letter-spacing: 2px; margin-bottom: 12px;
    `;
    titleEl.textContent = title;
    sec.appendChild(titleEl);

    // 左中右网格
    const bodyGrid = document.createElement('div');
    bodyGrid.style.cssText = `
        display: grid; grid-template-columns: 120px 1fr 120px; 
        gap: 20px; align-items: stretch;
    `;

    // 左侧：总输出
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center; 
        background: rgba(109, 179, 255, 0.08); border: 1px solid rgba(109, 179, 255, 0.2); 
        border-radius: 8px; padding: 10px;
    `;
    leftPanel.innerHTML = `
        <span style="color: #6db3ff; font-weight: 700; font-size: 12px; letter-spacing: 1px; margin-bottom: 6px;">输出总伤害</span>
        <span style="color: ${dmgOut.total > 0 ? '#6db3ff' : 'rgba(255,255,255,0.2)'}; font-size: 32px; font-weight: 800; font-family: Consolas, monospace; line-height: 1;">${Math.round(dmgOut.total)}</span>
    `;
    bodyGrid.appendChild(leftPanel);

    // 中间：部位明细
    const midPanel = document.createElement('div');
    midPanel.style.cssText = `display: flex; flex-direction: column; justify-content: center;`;

    const midHeader = document.createElement('div');
    midHeader.style.cssText = `
        display: grid; grid-template-columns: 1fr 60px 1fr; gap: 8px; 
        padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); 
        margin-bottom: 6px; text-align: center; font-size: 11px; letter-spacing: 1px;
    `;
    midHeader.innerHTML = `
        <span style="color: #6db3ff;">输出</span>
        <span style="color: rgba(255,255,255,0.3);">部位</span>
        <span style="color: #ff7a6d;">承受</span>
    `;
    midPanel.appendChild(midHeader);

    // 生成具体的行
    rowList.forEach(row => {
        const r = document.createElement('div');
        r.style.cssText = `
            display: grid; grid-template-columns: 1fr 60px 1fr; gap: 8px; 
            padding: 6px 0; text-align: center; font-size: 15px; 
            border-bottom: 1px solid rgba(255,255,255,0.04);
        `;
        
        // ★ 取整显示
        const valOut = Math.round(row.out);
        const valIn  = Math.round(row.in);
        const cOut = valOut > 0 ? '#6db3ff' : 'rgba(255,255,255,0.2)';
        const cIn  = valIn  > 0 ? '#ff7a6d' : 'rgba(255,255,255,0.2)';

        r.innerHTML = `
            <span style="color: ${cOut}; font-weight: 700; font-family: Consolas, monospace;">${valOut}</span>
            <span style="color: rgba(255,255,255,0.6); font-size: 12px; letter-spacing: 1px;">${row.label}</span>
            <span style="color: ${cIn}; font-weight: 700; font-family: Consolas, monospace;">${valIn}</span>
        `;
        midPanel.appendChild(r);
    });
    bodyGrid.appendChild(midPanel);

    // 右侧：总承受
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center; 
        background: rgba(255, 122, 109, 0.08); border: 1px solid rgba(255, 122, 109, 0.2); 
        border-radius: 8px; padding: 10px;
    `;
    rightPanel.innerHTML = `
        <span style="color: #ff7a6d; font-weight: 700; font-size: 12px; letter-spacing: 1px; margin-bottom: 6px;">承受总伤害</span>
        <span style="color: ${dmgIn.total > 0 ? '#ff7a6d' : 'rgba(255,255,255,0.2)'}; font-size: 32px; font-weight: 800; font-family: Consolas, monospace; line-height: 1;">${Math.round(dmgIn.total)}</span>
    `;
    bodyGrid.appendChild(rightPanel);

    sec.appendChild(bodyGrid);
    return sec;
}

// ============================================================
// ★ 整体面板渲染
// ============================================================
function showRoundReport(roundNumber, attacker, victim, dmgByAttacker, dmgByVictim,
                         killerSeat, victimSeat) {
    const report = createReportContainer();

    // 判断谁是本地玩家
    let dmgOut, dmgIn;
    if (killerSeat && victimSeat) {
        const mySeat = (typeof NET !== 'undefined' && NET.mySeat) ? NET.mySeat : 'blue';
        const isAttackerMe = (killerSeat === mySeat);
        dmgOut = isAttackerMe ? dmgByAttacker : dmgByVictim;
        dmgIn  = isAttackerMe ? dmgByVictim  : dmgByAttacker;
    } else {
        if (attacker && attacker.id === 1) {
            dmgOut = dmgByAttacker;
            dmgIn  = dmgByVictim;
        } else {
            dmgOut = dmgByVictim;
            dmgIn  = dmgByAttacker;
        }
    }

    if (!dmgOut) dmgOut = { head: 0, body: 0, leg: 0, total: 0 };
    if (!dmgIn)  dmgIn  = { head: 0, body: 0, leg: 0, total: 0 };

    // 顶部总标题
    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 15px; font-weight: 700; letter-spacing: 2px;
    `;
    titleRow.innerHTML = `
        <span style="color: #cfe0f0;">第 ${roundNumber} 回合 · 伤害报告</span>
    `;
    report.appendChild(titleRow);

    // ---- 1. 人物伤害栏 ----
    const personRows = [
        { label: '头 部', out: dmgOut.head || 0, in: dmgIn.head || 0 },
        { label: '身 体', out: dmgOut.body || 0, in: dmgIn.body || 0 },
        { label: '腿 部', out: dmgOut.leg || 0,  in: dmgIn.leg || 0  },
    ];
    report.appendChild(renderSection('人物伤害', dmgOut, dmgIn, personRows));

    // ---- 2. 环境伤害栏（如果有油桶伤害） ----
    const myToBarrel = window.RoundStats ? (window.RoundStats.p1ToBarrel || 0) : 0;
    const myFromBarrel = window.RoundStats ? (window.RoundStats.barrelToP1 || 0) : 0;
    
    if (myToBarrel > 0 || myFromBarrel > 0) {
        // 油桶没有头身腿，所以给个单独的 total 和行
        const barrelOut = { total: myToBarrel, head: 0, body: 0, leg: 0 };
        const barrelIn  = { total: myFromBarrel, head: 0, body: 0, leg: 0 };
        const barrelRows = [
            { label: '油 桶', out: myToBarrel, in: myFromBarrel }
        ];
        report.appendChild(renderSection('环境伤害', barrelOut, barrelIn, barrelRows));
    }

    // 底部提示
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 11px; color: rgba(255, 255, 255, 0.3); text-align: center; letter-spacing: 1px;
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

// ============================================================
// 局域网多玩家回合交互报告
// ============================================================
function showLANRoundReport(data) {
    if (!data) return;
    const report = createReportContainer();
    report.style.minWidth = '520px';
    report.style.maxHeight = 'calc(100vh - 40px)';
    report.style.overflowY = 'auto';

    const title = document.createElement('div');
    title.style.cssText = `
        padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);
        color: #cfe0f0; text-align: center; font-size: 15px; font-weight: 700;
        letter-spacing: 2px;
    `;
    title.textContent = `第 ${data.round || 0} 回合 · 伤害报告`;
    report.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display:grid; gap:10px;';
    if (!Array.isArray(data.interactions) || data.interactions.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:20px; color:#74899b; text-align:center; font-size:12px;';
        empty.textContent = '本回合没有与其他玩家产生伤害交互';
        list.appendChild(empty);
    } else {
        for (const interaction of data.interactions) {
            const section = document.createElement('div');
            section.style.cssText = `
                padding:10px 12px 11px; border:1px solid rgba(255,255,255,0.06);
                border-radius:8px; background:rgba(255,255,255,0.02);
            `;

            const name = document.createElement('strong');
            name.style.cssText = `
                display:block; margin-bottom:7px; overflow:hidden; text-overflow:ellipsis;
                white-space:nowrap; font-size:13px; color:${interaction.team === 'red' ? '#ff9d94' : '#8bc5ff'};
            `;
            name.textContent = interaction.name || '玩家';
            section.appendChild(name);

            const header = document.createElement('div');
            header.style.cssText = `
                display:grid; grid-template-columns:1fr 60px 1fr; gap:8px;
                padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.07);
                text-align:center; font-size:10px; letter-spacing:1px;
            `;
            header.innerHTML = `
                <span style="color:#6db3ff;">输出</span>
                <span style="color:rgba(255,255,255,0.35);">部位</span>
                <span style="color:#ff7a6d;">承受</span>
            `;
            section.appendChild(header);

            const parts = [
                ['头 部', interaction.outgoing?.head || 0, interaction.incoming?.head || 0],
                ['身 体', interaction.outgoing?.body || 0, interaction.incoming?.body || 0],
                ['腿 部', interaction.outgoing?.leg || 0, interaction.incoming?.leg || 0],
            ];
            if ((interaction.outgoing?.barrel || 0) > 0
                || (interaction.incoming?.barrel || 0) > 0) {
                parts.push([
                    '油 桶',
                    interaction.outgoing?.barrel || 0,
                    interaction.incoming?.barrel || 0,
                ]);
            }
            for (const [label, outgoing, incoming] of parts) {
                const row = document.createElement('div');
                row.style.cssText = `
                    display:grid; grid-template-columns:1fr 60px 1fr; gap:8px;
                    padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.035);
                    text-align:center; font:700 14px Consolas,monospace;
                `;
                row.innerHTML = `
                    <span style="color:${outgoing > 0 ? '#6db3ff' : 'rgba(255,255,255,0.2)'};">${Math.round(outgoing)}</span>
                    <span style="color:rgba(255,255,255,0.55); font:500 11px 'Microsoft YaHei',sans-serif;">${label}</span>
                    <span style="color:${incoming > 0 ? '#ff7a6d' : 'rgba(255,255,255,0.2)'};">${Math.round(incoming)}</span>
                `;
                section.appendChild(row);
            }
            list.appendChild(section);
        }
    }
    report.appendChild(list);

    const footer = document.createElement('div');
    footer.style.cssText = 'padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); color:rgba(255,255,255,0.34); text-align:center; font-size:10px;';
    footer.textContent = '点击可关闭 · 下一回合准备结束时自动关闭';
    report.appendChild(footer);
    report.addEventListener('click', closeCombatReport);
}

window.showRoundReport = showRoundReport;
window.showLANRoundReport = showLANRoundReport;
window.closeCombatReport = closeCombatReport;
