// ===== js/hud_effects.js – 硬直 / 易伤 / 闪光指示器 =====
// 从 hud.js 拆出，不改变任何对外接口

let _stunOverlayEl = null;
let _stunShakeRaf  = 0;
let _vulnOverlayEl = null;

// ============================================================
// ★★★ 硬直视觉反馈 ★★★
// ============================================================
function ensureStunOverlay() {
    if (_stunOverlayEl) return _stunOverlayEl;
    if (typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'stunOverlay';
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:44',
        'pointer-events:none',
        'background:radial-gradient(ellipse at center, rgba(255,40,40,0) 40%, rgba(255,40,40,0.45) 100%)',
        'opacity:0',
        'transition:opacity 0.15s',
        'display:none',
    ].join(';');
    document.body.appendChild(el);
    _stunOverlayEl = el;
    return el;
}

window.onStunStart = function (now) {
    if (_stunShakeRaf) cancelAnimationFrame(_stunShakeRaf);
    const startTime = performance.now();
    const dur = 500;
    function shake() {
        const t = performance.now() - startTime;
        if (t >= dur) {
            _stunShakeRaf = 0;
            document.body.style.transform = '';
            return;
        }
        const k = 1 - t / dur;
        const amp = 6 * k;
        const dx = (Math.random() - 0.5) * amp * 2;
        const dy = (Math.random() - 0.5) * amp * 2;
        document.body.style.transform = `translate(${dx}px, ${dy}px)`;
        _stunShakeRaf = requestAnimationFrame(shake);
    }
    shake();

    if (typeof sHit === 'function') sHit(1);
};

function updateStunUI(p, now) {
    const el = ensureStunOverlay();
    if (!el) return;

    const remain = p.stunUntil - now;
    if (remain > 0) {
        if (el.style.display !== 'block') el.style.display = 'block';
        const alpha = Math.min(1, remain / 1000) * 0.9;
        el.style.opacity = String(alpha);

        const h = (typeof H !== 'undefined') ? H[1] : null;
        if (h && h.center) {
            h.center.textContent = `落地受伤 · ${(remain / 1000).toFixed(1)}s`;
        }
    } else {
        if (el.style.display !== 'none') el.style.display = 'none';
    }
}

// ============================================================
// ★★★ 易伤视觉反馈（本地 HUD：紫色脉冲 + 顶部倒计时）★★★
// ============================================================
function ensureVulnOverlay() {
    if (_vulnOverlayEl) return _vulnOverlayEl;
    if (typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'vulnOverlay';
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:43',
        'pointer-events:none',
        'box-shadow:inset 0 0 120px 30px rgba(180,40,255,0.55)',
        'opacity:0',
        'transition:opacity 0.2s',
        'display:none',
    ].join(';');
    document.body.appendChild(el);
    _vulnOverlayEl = el;
    return el;
}

// 易伤触发瞬间（由 game_state.js 调用）
window.onVulnerableStart = function (now) {
    const el = ensureVulnOverlay();
    if (!el) return;
    el.style.display = 'block';
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.4s';
    });
    if (typeof sEmpty === 'function') sEmpty(1);
};

// 每帧更新易伤 HUD（仅本地玩家）
function updateVulnUI(p, now) {
    const el = ensureVulnOverlay();
    if (!el) return;

    const remain = p.vulnerableUntil - now;
    if (remain > 0) {
        if (el.style.display !== 'block') el.style.display = 'block';

        const base  = Math.min(1, remain / 3000) * 0.85;
        const pulse = 0.65 + 0.35 * Math.sin(now * 0.012);
        el.style.opacity = String(base * pulse);

        let tipEl = document.getElementById('vulnTimer');
        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.id = 'vulnTimer';
            tipEl.style.cssText = [
                'position:fixed', 'top:14px', 'left:50%',
                'transform:translateX(-50%) translateY(38px)',
                'z-index:16',
                'padding:4px 16px',
                'background:rgba(120,20,180,0.88)',
                'color:#fff',
                'border-radius:6px',
                'font-size:14px',
                'font-weight:700',
                'letter-spacing:2px',
                'pointer-events:none',
                'box-shadow:0 4px 14px rgba(0,0,0,0.55)',
                'font-family:"Microsoft YaHei",Arial,sans-serif',
                'border:1px solid rgba(200,120,255,0.6)',
            ].join(';');
            document.body.appendChild(tipEl);
        }
        tipEl.style.display = 'block';
        tipEl.textContent = `💜 易伤 ×2 · ${(remain / 1000).toFixed(1)}s`;
    } else {
        if (el.style.display !== 'none') el.style.display = 'none';
        const tipEl = document.getElementById('vulnTimer');
        if (tipEl) tipEl.style.display = 'none';
    }
}

// ============================================================
// ★★★ 易伤 3D 视觉：紫色光晕（对所有玩家生效，用于看对手）★★★
//
//   · 只在"易伤状态 + 活着 + 可见"时显示
//   · 无 PointLight（避免 shader 重编译）
// ============================================================
function updateVulnIndicator(p, now) {
    if (!p || !p.vulnIndicator) return;

    const active = p.vulnerableUntil > now
        && p.baseVisible
        && p.hp > 0
        && p.deadUntil <= now;

    if (active) {
        if (!p.vulnIndicator.visible) p.vulnIndicator.visible = true;

        const remain = p.vulnerableUntil - now;
        const t = Math.min(1, remain / 3000);
        const pulse = 0.7 + 0.3 * Math.sin(now * 0.008);

        const sphere = p.vulnIndicator.userData.sphere;
        const core   = p.vulnIndicator.userData.core;

        if (sphere) {
            sphere.material.opacity = 0.32 * t * pulse;
            const s = 1 + 0.06 * Math.sin(now * 0.01);
            sphere.scale.setScalar(s);
        }
        if (core) {
            core.material.opacity = 0.14 * t * pulse;
            const s = 1 + 0.10 * Math.sin(now * 0.014 + 1.3);
            core.scale.setScalar(s);
        }
    } else if (p.vulnIndicator.visible) {
        p.vulnIndicator.visible = false;
    }
}

function updateVulnIndicators(now) {
    if (typeof p1 !== 'undefined' && p1) updateVulnIndicator(p1, now);
    if (typeof p2 !== 'undefined' && p2) updateVulnIndicator(p2, now);
}
window.updateVulnIndicators = updateVulnIndicators;

// ============================================================
// ★★★ 闪光指示器（★ 删掉 fiLight 后，只更新球体透明度）★★★
// ============================================================
function updateFlashIndicators(now) {
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

    for (const p of [p1, p2]) {
        if (!p || !p.flashIndicator) continue;

        const isFlashed = p.flashUntil > now
            && p.baseVisible
            && p.hp > 0
            && p.deadUntil <= now;

        if (isFlashed) {
            const remain = p.flashUntil - now;
            const total = FLASH.flashDurationMs;
            const t = Math.max(0, Math.min(1, remain / total));

            p.flashIndicator.visible = true;

            const pulse = 1 + Math.sin(now * 0.012) * 0.12;
            p.flashIndicator.scale.setScalar(pulse);

            const sphere = p.flashIndicator.userData.sphere;
            const halo   = p.flashIndicator.userData.halo;
            // ★ fiLight 已删除

            if (sphere) sphere.material.opacity = 0.85 * t;
            if (halo)   halo.material.opacity   = 0.45 * t;
        } else if (p.flashIndicator.visible) {
            p.flashIndicator.visible = false;
        }
    }
}
window.updateFlashIndicators = updateFlashIndicators;