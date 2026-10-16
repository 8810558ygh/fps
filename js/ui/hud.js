// ===== js/hud.js – HUD DOM 缓存 + 工具函数 + 主 HUD 更新 =====

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
const _mkEl      = document.getElementById('medkitProgress');
const _mkFill    = document.getElementById('mkBarFill');

const _hudState = {
    score: -1, hp: -1, armor: -1, armorColor: '',
    ammoHtml: '', wtagText: '', scopeDisplay: '',
    timerText: '', timerColor: '', timerBg: '',
    crossOpacity: '', adsRetDisplay: '',
    cdDisplay: '', hintDisplay: '',
    cdIcon: '', cdLabel: '', cdTime: '', cdTimeColor: '',
    mkDisplay: '', mkWidth: '',
};

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
// ★ 暴击命中反馈（准星短暂加金色）
//   由 combat_fire.js / combat_melee.js 在暴击时调用
// ============================================================
let _critFlashRaf = 0;
let _critTimeoutId = 0;
function _flashCritHitmark() {
    if (_critFlashRaf) return;
    const el = H[1].hit;
    if (!el) return;

    el.classList.add('crit');
    _critFlashRaf = requestAnimationFrame(() => {
        _critFlashRaf = 0;
        if (_critTimeoutId) clearTimeout(_critTimeoutId);
        _critTimeoutId = setTimeout(() => {
            _critTimeoutId = 0;
            el.classList.remove('crit');
        }, 180);
    });
}
window._flashCritHitmark = _flashCritHitmark;

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

    const hpVal = Math.max(0, Math.ceil(p.hp));
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
    } else if (p.isMedkit) {
        // ★ 医疗包：右下角只显示数量，进度条单独在屏幕中间
        const cnt = p.medkits || 0;
        const color = cnt > 0 ? '#ff6b8a' : '#5a6a7a';
        if (p.healing) {
            ammoHtml = `<span style="color:#ff6b8a;font-size:18px;letter-spacing:2px;">✚ 使用中…</span>`;
        } else {
            ammoHtml = `<span style="color:${color};font-size:18px;letter-spacing:2px;">✚ 医疗包 ×${cnt}</span>`;
        }
        wtagText = '医疗包' + (cnt > 0 ? ' · 按住左键' : '（已用完）');
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

    // ============================================================
    // ★ 医疗包进度条（屏幕中间偏下）
    // ============================================================
    if (_mkEl) {
        if (p.isMedkit && p.healing) {
            if (_hudState.mkDisplay !== 'flex') {
                _mkEl.style.display = 'flex';
                _hudState.mkDisplay = 'flex';
            }
            const progress = Math.max(0, Math.min(1, (now - p.healStart) / MEDKIT.useTimeMs));
            const pctStr = Math.round(progress * 100) + '%';
            if (_hudState.mkWidth !== pctStr && _mkFill) {
                _mkFill.style.width = pctStr;
                _hudState.mkWidth = pctStr;
            }
        } else if (_hudState.mkDisplay !== 'none') {
            _mkEl.style.display = 'none';
            _hudState.mkDisplay = 'none';
            _hudState.mkWidth = '';
            if (_mkFill) _mkFill.style.width = '0%';
        }
    }

    const scoped = running && gameState === 'combat' && !p.isMelee && !p.isSmoke && !p.isFlash && !p.isMedkit
        && p.aiming && p.weapon.scope && now >= p.deadUntil;
    const scopeDisplay = scoped ? 'block' : 'none';
    if (_hudState.scopeDisplay !== scopeDisplay) {
        h.scope.style.display = scopeDisplay;
        _hudState.scopeDisplay = scopeDisplay;
    }

    const isSurvival = (running
        && typeof gameMode !== 'undefined' && gameMode === 'survival'
        && typeof SurvivalState !== 'undefined' && SurvivalState.active);

    if (isSurvival) {
        let svText = '';
        let svColor = '#fff';
        const svBg = 'rgba(70, 15, 15, 0.72)';

        const mapName = (SurvivalState.mapIndex === 0) ? '战场' : '沙漠';

        if (SurvivalState.phase === 'prep') {
            const remain = Math.max(0, (SurvivalState.prepEndTime - now) / 1000);
            svText = `🧟 ${mapName} · 准备 ${remain.toFixed(1)}s`;
            svColor = '#ffd24a';
        } else if (SurvivalState.phase === 'wave') {
            const alive = (typeof getZombiesAliveCount === 'function')
                ? getZombiesAliveCount() : 0;
            const queue = (SurvivalState.waveQueue && SurvivalState.waveQueue.length)
                ? SurvivalState.waveQueue.length : 0;
            const remain = alive + queue;

            // ★ 无限模式下显示循环轮数
            const loopTag = SurvivalState.endlessMode
                ? ` · 🔥${SurvivalState.endlessLoop + 1}轮`
                : '';

            svText = `${mapName}${loopTag} · 第 ${SurvivalState.wave} / ${SurvivalState.maxWaves} 波 · 🧟 ${remain}`;
            svColor = '#7ee08a';
        } else if (SurvivalState.phase === 'endlessChoice') {
            svText = `✨ 选择去向`;
            svColor = '#ffd24a';
        } else if (SurvivalState.phase === 'portal') {
            svText = `✨ 传送门已开启`;
            svColor = '#66ffee';
        } else if (SurvivalState.phase === 'loading') {
            svText = `📍 正在进入下一区域...`;
            svColor = '#66ffee';
        } else if (SurvivalState.phase === 'victory') {
            svText = '🎉 通 关 ！';
            svColor = '#ffd24a';
        } else if (SurvivalState.phase === 'defeat') {
            svText = '💀 失 败';
            svColor = '#ff7a6d';
        } else {
            svText = '生存模式';
            svColor = '#fff';
        }

        _setText(_timerEl, svText, 'timerText');
        _setStyle(_timerEl, 'color', svColor, 'timerColor');
        _setStyle(_timerEl, 'background', svBg, 'timerBg');

    } else if (running && gameState === 'prep') {
        const remain = Math.max(0, (stateEndTime - now) / 1000);
        _setText(_timerEl, `准备 ${remain.toFixed(1)}s`, 'timerText');
        _setStyle(_timerEl, 'color', '#ffd24a', 'timerColor');
        _setStyle(_timerEl, 'background', 'rgba(0, 0, 0, 0.45)', 'timerBg');

    } else {
        const left = Math.max(0, MATCH_MS - (now - matchStart));
        const mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
        _setText(_timerEl, `${mm}:${String(ss).padStart(2, '0')}`, 'timerText');
        _setStyle(_timerEl, 'color', '#fff', 'timerColor');
        _setStyle(_timerEl, 'background', 'rgba(0, 0, 0, 0.45)', 'timerBg');
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
        && !p1.isMelee && !p1.isSmoke && !p1.isFlash && !p1.isMedkit
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

    if (typeof _tickScorePanel === 'function') _tickScorePanel();
    if (typeof _updateAiToggleUI === 'function') _updateAiToggleUI();

    if (typeof updateZiplinePrompt === 'function') {
        updateZiplinePrompt(p);
    }

    if (typeof updateSurvivalPortalPrompt === 'function') {
        updateSurvivalPortalPrompt();
    }

    if (typeof updateStunUI === 'function') {
        updateStunUI(p, now);
    }

    if (typeof updateVulnUI === 'function') {
        updateVulnUI(p, now);
    }

    if (typeof updateVulnIndicators === 'function') {
        updateVulnIndicators(now);
    }
}