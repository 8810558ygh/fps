// ===== js/hud.js – HUD DOM 缓存 + 工具函数 + 主 HUD 更新 =====
// 回合结算 → hud_report.js
// TAB 战绩 / AI 开关 / TAB 键 → hud_score.js
// 硬直 / 易伤视觉反馈 → hud_effects.js

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

const _timerEl   = q('#timer');
const _cdEl      = document.getElementById('throwCountdown');
const _cdIconEl  = document.getElementById('throwCountdownIcon');
const _cdLabelEl = document.getElementById('throwCountdownLabel');
const _cdTimeEl  = document.getElementById('throwCountdownTime');
const _crossEl   = q('#hud1 .cross');
const _adsRetEl  = document.getElementById('adsReticle');

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
    hintDisplay: '',
    cdIcon: '',
    cdLabel: '',
    cdTime: '',
    cdTimeColor: '',
};

// ============================================================
// 反馈工具（feed / centerMsg / dmgFlash / hitmark）
// ============================================================
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
// 缓存式 DOM 更新工具
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

// ============================================================
// 主 HUD 更新
// ============================================================
function updateHUD(now) {
    const p = p1;
    const h = H[1];
    if (!h) return;

    const hpVal = Math.max(0, Math.round(p.hp));
    if (hpVal !== _hudState.hp) {
        h.hpText.textContent = hpVal;
        _hudState.hp = hpVal;
    }

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

    if (_cdEl) {
        if (running && gameState === 'combat' && p.throwFuseActive && p.throwFuseType) {
            const remain = Math.max(0, p.throwFuseEnd - now);
            const isSmoke = (p.throwFuseType === 'smoke');

            _setText(_cdIconEl,  isSmoke ? '💨' : '⚡', 'cdIcon');
            _setText(_cdLabelEl, isSmoke ? '烟雾倒计时' : '闪光倒计时', 'cdLabel');
            _setText(_cdTimeEl,  (remain / 1000).toFixed(1) + 's', 'cdTime');
            _setStyle(_cdTimeEl, 'color', remain > 0 ? '#ffd24a' : '#7ee08a', 'cdTimeColor');

            if (_hudState.cdDisplay !== 'flex') {
                _cdEl.style.display = 'flex';
                _hudState.cdDisplay = 'flex';
            }
        } else if (_hudState.cdDisplay !== 'none') {
            _cdEl.style.display = 'none';
            _hudState.cdDisplay = 'none';
        }
    }

    const scoped = running && gameState === 'combat' && !p.isMelee && !p.isSmoke && !p.isFlash
        && p.aiming && p.weapon.scope && now >= p.deadUntil;
    const scopeDisplay = scoped ? 'block' : 'none';
    if (_hudState.scopeDisplay !== scopeDisplay) {
        h.scope.style.display = scopeDisplay;
        _hudState.scopeDisplay = scopeDisplay;
    }

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

    const hintDisplay = (
        running
        && gameState === 'prep'
        && document.pointerLockElement !== renderer.domElement
        && !isOver()
    ) ? 'block' : 'none';
    _setStyle(h.hint, 'display', hintDisplay, 'hintDisplay');

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

    // ★ 拆分后：这两项现在来自 hud_score.js，加 typeof 保护
    if (typeof _tickScorePanel === 'function') _tickScorePanel();
    if (typeof _updateAiToggleUI === 'function') _updateAiToggleUI();

    // ★ 滑索 UI 提示
    if (typeof updateZiplinePrompt === 'function') {
        updateZiplinePrompt(p);
    }

    // ★ 硬直视觉反馈（来自 hud_effects.js）
    if (typeof updateStunUI === 'function') {
        updateStunUI(p, now);
    }

    // ★ 易伤视觉反馈（来自 hud_effects.js）
    if (typeof updateVulnUI === 'function') {
        updateVulnUI(p, now);
    }
}