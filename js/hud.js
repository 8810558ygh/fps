// ===== js/hud.js – HUD更新与回合结算报告（含刀 + 烟雾 + 闪光 + 引信倒计时 + ADS准星） =====
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

// ============================================================
// ★ 性能优化（A1）：缓存 updateHUD 里高频访问的 DOM 节点
// ============================================================
const _timerEl   = q('#timer');
const _cdEl      = document.getElementById('throwCountdown');
const _cdIconEl  = document.getElementById('throwCountdownIcon');
const _cdLabelEl = document.getElementById('throwCountdownLabel');
const _cdTimeEl  = document.getElementById('throwCountdownTime');
const _crossEl   = q('#hud1 .cross');
const _adsRetEl  = document.getElementById('adsReticle');

// ============================================================
// ★ 性能优化（B4）：HUD 只在变化时写 DOM
// ============================================================
const _hudState = {
    score: -1,
    hp: -1,
    armor: -1,
    armorColor: '',
    ammoHtml: '',
    wtagText: '',
    scopeDisplay: '',
    timerText: '',
    timerColor: '',
    crossOpacity: '',
    adsRetDisplay: '',
    cdDisplay: '',
};

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

// ============================================================
// ★ 报告列名解析
//   新增 attackerSeat：优先用座位语义，保证观战者/红方客户端的列名正确
// ============================================================
function getReportColumns(attacker, attackerSeat) {
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    const hasNET   = (typeof NET !== 'undefined' && NET && NET.roomId);

    if (isOnline && hasNET) {
        // —— 观战者：左右列固定为"蓝方 | 红方" ——
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

        // —— 玩家：左右列固定为"你 | 对手名" ——
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

    // —— 单机 / AI 模式 ——
    return {
        leftLabel:  '玩家1', leftColor:  '#6db3ff',
        rightLabel: '玩家2', rightColor: '#ff7a6d',
        killLabel:  '玩家' + (attacker ? attacker.id : 1)
    };
}

// ============================================================
// ★ showRoundReport：新增 killerSeat / victimSeat 参数
//   · 有座位信息 → 左列=蓝方、右列=红方
//   · 无座位信息 → 沿用 attacker.id 的旧逻辑（单机 / AI）
//   列值语义：该玩家造成的伤害
// ============================================================
function showRoundReport(roundNumber, attacker, victim, dmgByAttacker, dmgByVictim,
                         killerSeat, victimSeat) {
    const report = createReportContainer();

    // 伤害列映射
    let dmg1, dmg2;
    if (killerSeat && victimSeat) {
        const blueIsAttacker = (killerSeat === 'blue');
        dmg1 = blueIsAttacker ? dmgByAttacker : dmgByVictim;   // 蓝方造成的伤害
        dmg2 = blueIsAttacker ? dmgByVictim  : dmgByAttacker;  // 红方造成的伤害
    } else {
        if (attacker.id === 1) { dmg1 = dmgByAttacker; dmg2 = dmgByVictim; }
        else                   { dmg1 = dmgByVictim;  dmg2 = dmgByAttacker; }
    }

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
    report.appendChild(makeRow('🎯', '头部', dmg1.head, dmg2.head, '#ffd24a'));
    report.appendChild(makeRow('🔫', '身体', dmg1.body, dmg2.body, '#ff6b6b'));

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

function feed(p, html) {
    if (p.id !== 1) return;
    const d = document.createElement('div');
    d.innerHTML = html;
    const box = H[1].feed;
    box.prepend(d);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 2200);
}

function centerMsg(p, text) { if (p.id === 1) H[1].center.textContent = text; }

// ============================================================
// ★ 受伤红闪：加 requestAnimationFrame 去重
// ============================================================
let _dmgFlashRaf = 0;
function dmgFlash(p) {
    if (p.id !== 1) return;
    if (_dmgFlashRaf) return;
    const f = H[1].flash;
    f.style.transition = 'none';
    f.style.opacity = 1;
    _dmgFlashRaf = requestAnimationFrame(() => {
        _dmgFlashRaf = 0;
        f.style.transition = 'opacity .4s';
        f.style.opacity = 0;
    });
}

function hitmark(p) {
    if (p.id !== 1) return;
    const el = H[1].hit;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

// ============================================================
// ★ B4：只在值变化时写 DOM
// ============================================================
function _setText(el, val, cacheKey) {
    if (!el) return;
    if (_hudState[cacheKey] === val) return;
    el.textContent = val;
    _hudState[cacheKey] = val;
}

function _setHtml(el, val, cacheKey) {
    if (!el) return;
    if (_hudState[cacheKey] === val) return;
    el.innerHTML = val;
    _hudState[cacheKey] = val;
}

function _setStyle(el, prop, val, cacheKey) {
    if (!el) return;
    if (_hudState[cacheKey] === val) return;
    el.style[prop] = val;
    _hudState[cacheKey] = val;
}

function updateHUD(now) {
    const p = p1;
    const h = H[1];
    if (!h) return;

    // 分数
    _setText(h.score, String(p.score), 'score');

    // HP
    const hpVal = Math.max(0, Math.round(p.hp));
    if (hpVal !== _hudState.hp) {
        h.hpText.textContent = hpVal;
        _hudState.hp = hpVal;
    }

    // 护甲
    const armorVal = Math.max(0, Math.round(p.armor));
    if (armorVal !== _hudState.armor) {
        h.armorText.textContent = armorVal;
        _hudState.armor = armorVal;
    }
    const armorColor = armorVal > 0 ? '#6db3ff' : '#5a6a7a';
    if (armorColor !== _hudState.armorColor) {
        if (h.armorWrap) h.armorWrap.style.color = armorColor;
        _hudState.armorColor = armorColor;
    }

    // 弹药 / 武器名
    let ammoHtml = '';
    let wtagText = '';
    if (p.isMelee) {
        ammoHtml = `<span style="color:#ffd24a;font-size:20px;letter-spacing:2px;">⚔ 近战</span>`;
        wtagText = p.weapon.name + (p.meleeIsHeavy ? ' · 重击' : '');
    } else if (p.isSmoke) {
        const charge = p.smokeCharges || 0;
        const color = charge > 0 ? '#7ee08a' : '#5a6a7a';
        ammoHtml = `<span style="color:${color};font-size:18px;letter-spacing:2px;">💨 烟雾 ×${charge}</span>`;
        wtagText = '烟雾弹' + (charge > 0 ? ' · 左键拔保险' : '（已用完）');
    } else if (p.isFlash) {
        const charge = p.flashCharges || 0;
        const color = charge > 0 ? '#ffe066' : '#5a6a7a';
        ammoHtml = `<span style="color:${color};font-size:18px;letter-spacing:2px;">⚡ 闪光 ×${charge}</span>`;
        wtagText = '闪光弹' + (charge > 0 ? ' · 左键拔保险' : '（已用完）');
    } else {
        let ammoText = p.ammo;
        if (p.reloadEnd > now) {
            const remain = (p.reloadEnd - now) / 1000;
            ammoText = `换弹中 ${remain.toFixed(1)}s`;
        }
        ammoHtml = ammoText + ` <span class="rsv">/ ${p.reserve}</span>`;
        wtagText = p.weapon.name;

        const tips = [];
        if (p.smokeCharges > 0 && gameState === 'combat') tips.push(`💨${p.smokeCharges}`);
        if (p.flashCharges > 0 && gameState === 'combat') tips.push(`⚡${p.flashCharges}`);
        if (tips.length) wtagText += '  ·  ' + tips.join(' ');
    }
    _setHtml(h.ammo, ammoHtml, 'ammoHtml');
    _setText(h.wtag, wtagText, 'wtagText');

    // 投掷引信倒计时
    if (_cdEl) {
        if (running && gameState === 'combat' && p.throwFuseActive && p.throwFuseType) {
            const remain = Math.max(0, p.throwFuseEnd - now);

            if (_cdIconEl)  _cdIconEl.textContent  = (p.throwFuseType === 'smoke') ? '💨' : '⚡';
            if (_cdLabelEl) _cdLabelEl.textContent = (p.throwFuseType === 'smoke') ? '烟雾倒计时' : '闪光倒计时';
            if (_cdTimeEl) {
                _cdTimeEl.textContent = (remain / 1000).toFixed(1) + 's';
                _cdTimeEl.style.color = remain > 0 ? '#ffd24a' : '#7ee08a';
            }
            if (_hudState.cdDisplay !== 'flex') {
                _cdEl.style.display = 'flex';
                _hudState.cdDisplay = 'flex';
            }
        } else if (_hudState.cdDisplay !== 'none') {
            _cdEl.style.display = 'none';
            _hudState.cdDisplay = 'none';
        }
    }

    // 倍镜遮罩
    const scoped = running && gameState === 'combat' && !p.isMelee && !p.isSmoke && !p.isFlash
        && p.aiming && p.weapon.scope && now >= p.deadUntil;
    const scopeDisplay = scoped ? 'block' : 'none';
    if (_hudState.scopeDisplay !== scopeDisplay) {
        h.scope.style.display = scopeDisplay;
        _hudState.scopeDisplay = scopeDisplay;
    }

    // 计时器
    if (running && gameState === 'prep') {
        const remain = Math.max(0, (stateEndTime - now) / 1000);
        _setText(_timerEl, `准备 ${remain.toFixed(1)}s`, 'timerText');
        _setStyle(_timerEl, 'color', '#ffd24a', 'timerColor');
    } else {
        const left = Math.max(0, MATCH_MS - (now - matchStart));
        const mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
        _setText(_timerEl, `${mm}:${String(ss).padStart(2, '0')}`, 'timerText');
        _setStyle(_timerEl, 'color', '#fff', 'timerColor');
        if (running && left <= 0) endMatch(p1.score === p2.score ? null : (p1.score > p2.score ? p1 : p2));
    }

    if (h.hint) h.hint.style.display =
        (running && gameState === 'prep' && document.pointerLockElement !== renderer.domElement && !isOver()) ? 'block' : 'none';

    // ADS 状态
    const isRedDotADS = running && gameState === 'combat'
        && p1.aiming
        && p1.weapon && (p1.weapon.key === 'rifle' || p1.weapon.key === 'odin')
        && !p1.isMelee && !p1.isSmoke && !p1.isFlash
        && now >= p1.deadUntil;

    const crossOpacity = isRedDotADS ? '0' : '1';
    if (_hudState.crossOpacity !== crossOpacity) {
        if (_crossEl) {
            _crossEl.style.transition = 'opacity 0.12s';
            _crossEl.style.opacity = crossOpacity;
        }
        _hudState.crossOpacity = crossOpacity;
    }

    const adsRetDisplay = isRedDotADS ? 'block' : 'none';
    if (_hudState.adsRetDisplay !== adsRetDisplay) {
        if (_adsRetEl) _adsRetEl.style.display = adsRetDisplay;
        _hudState.adsRetDisplay = adsRetDisplay;
    }
}