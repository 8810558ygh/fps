// ===== js/settings.js – 设置系统（准星 + 灵敏度 + 画面） =====
// 入口：大厅右上角齿轮按钮
// 关闭：设置页左上角"← 返回"
// 无快捷键，纯鼠标点击

(function () {
    'use strict';

    const STORAGE_KEY = 'pvp_settings_v1';

    // ============================================================
    // 默认配置
    // ============================================================
    const DEFAULTS = {
        crosshair: {
            color: '#ffffff',
            dot: 4,
            len: 13,
            thick: 2,
            gap: 0,
            opacity: 0.95,
            outline: false,
            outlineThick: 1,
        },
        sensitivity: {
            mouse: 22,
            adsMul: 1.00,
            vertMul: 1.00,
            invertY: false,
            touch: 60,
        },
        graphics: {
            shadows: true,
        },
    };

    function mergeDefaults(target, src) {
        for (const k in DEFAULTS) {
            if (typeof DEFAULTS[k] === 'object' && DEFAULTS[k] !== null) {
                if (!target[k]) target[k] = {};
                for (const kk in DEFAULTS[k]) {
                    if (src && src[k] && src[k][kk] !== undefined) {
                        target[k][kk] = src[k][kk];
                    } else if (target[k][kk] === undefined) {
                        target[k][kk] = DEFAULTS[k][kk];
                    }
                }
            } else if (src && src[k] !== undefined) {
                target[k] = src[k];
            } else if (target[k] === undefined) {
                target[k] = DEFAULTS[k];
            }
        }
    }

    // ============================================================
    // 全局配置
    // ============================================================
    const SETTINGS = JSON.parse(JSON.stringify(DEFAULTS));
    window.SETTINGS = SETTINGS;

    window.SETTINGS_RT = {
        mouseSens: DEFAULTS.sensitivity.mouse / 10000,
        touchSens: DEFAULTS.sensitivity.touch / 10000,
    };

    function refreshRuntime() {
        const s = SETTINGS.sensitivity;
        window.SETTINGS_RT.mouseSens = s.mouse / 10000;
        window.SETTINGS_RT.touchSens = s.touch / 10000;
    }

    // ============================================================
    // 持久化
    // ============================================================
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(SETTINGS));
        } catch (e) {
            console.warn('[settings] 保存失败', e);
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            mergeDefaults(SETTINGS, parsed);
            refreshRuntime();
        } catch (e) {
            console.warn('[settings] 读取失败，使用默认值', e);
        }
    }

    // ============================================================
    // 准星应用
    // ============================================================
    function applyCrosshair() {
        const c = SETTINGS.crosshair;
        const targets = document.querySelectorAll('#crosshair, .ch-preview');

        const v = {
            '--ch-color': c.color,
            '--ch-opacity': String(c.opacity),
            '--ch-len': c.len + 'px',
            '--ch-thick': c.thick + 'px',
            '--ch-gap': c.gap + 'px',
            '--ch-dot': c.dot + 'px',
            '--ch-outline': (c.outline ? c.outlineThick : 0) + 'px',
            '--ch-outline-color': 'rgba(0,0,0,0.85)',
        };
        targets.forEach(el => {
            for (const k in v) el.style.setProperty(k, v[k]);
        });

        const dotDisplay = c.dot > 0 ? '' : 'none';
        document.querySelectorAll('#crosshair .ch-dot, .ch-preview .ch-dot')
            .forEach(el => { el.style.display = dotDisplay; });

        const lineDisplay = c.len > 0 ? '' : 'none';
        document.querySelectorAll('#crosshair .ch-line, .ch-preview .ch-line')
            .forEach(el => { el.style.display = lineDisplay; });
    }

    // ============================================================
    // 画面应用（阴影开关）
    // ============================================================
    let _lastShadowsApplied = null;

    function applyGraphics(force) {
        if (typeof renderer === 'undefined' || !renderer) return;

        const want = !!SETTINGS.graphics.shadows;

        // 避免重复应用
        if (!force && _lastShadowsApplied === want) return;

        const prev = renderer.shadowMap.enabled;
        _lastShadowsApplied = want;

        // 设置新值
        renderer.shadowMap.enabled = want;

        // 若切换 → 需要重新编译所有材质
        // （因为材质 shader 里是否包含阴影采样，由 shadowMap.enabled 决定）
        if (prev !== want) {
            _forceRecompileMaterials();
            if (want) renderer.shadowMap.needsUpdate = true;
        }

        console.log('[settings] 阴影:', want ? '开' : '关');
    }

    // 遍历场景 + 武器模板，让所有材质重新编译
    function _forceRecompileMaterials() {
        // ---- 1. 场景中所有 mesh 的材质 ----
        if (typeof scene !== 'undefined' && scene) {
            scene.traverse(o => {
                if (!o.isMesh && !o.isPoints && !o.isLine) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) {
                    if (m && m.needsUpdate !== undefined) {
                        m.needsUpdate = true;
                    }
                }
            });
        }

        // ---- 2. ★ 武器 HD 模板的材质（不在 scene 里）----
        //   否则换枪时从模板 clone 的材质会现场编译 shader → 卡
        if (typeof window.markAllWeaponTemplatesDirty === 'function') {
            try { window.markAllWeaponTemplatesDirty(); } catch (e) {}
        }
    }

    // ============================================================
    // 面板打开 / 关闭
    // ============================================================
    let _open = false;

    function openPanel() {
        if (_open) return;
        _open = true;

        document.body.classList.add('settings-open');
        const panel = document.getElementById('settingsOverlay');
        if (panel) panel.style.display = 'block';

        const content = document.querySelector('.settings-content');
        if (content) content.scrollTop = 0;

        syncUIFromSettings();
    }

    function closePanel() {
        if (!_open) return;
        _open = false;

        document.body.classList.remove('settings-open');
        const panel = document.getElementById('settingsOverlay');
        if (panel) panel.style.display = 'none';

        save();
    }

    // ============================================================
    // Tab 切换
    // ============================================================
    function bindTabs() {
        const tabs = document.querySelectorAll('#settingsTabs .stab');
        const pages = document.querySelectorAll('.settings-page');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.tab;
                tabs.forEach(b => b.classList.toggle('active', b === btn));
                pages.forEach(p => {
                    p.style.display = (p.dataset.page === key) ? 'block' : 'none';
                });
                const content = document.querySelector('.settings-content');
                if (content) content.scrollTop = 0;
            });
        });
    }

    // ============================================================
    // 控件绑定
    // ============================================================
    function bindControls() {
        const $ = id => document.getElementById(id);

        // ---------- 准星 ----------
        function bindCh(key, elId, valId, fmt) {
            const el = $(elId), val = $(valId);
            if (!el) return;
            el.addEventListener('input', () => {
                const v = parseFloat(el.value);
                SETTINGS.crosshair[key] = v;
                if (val) val.textContent = fmt ? fmt(v) : v;
                applyCrosshair();
            });
        }
        bindCh('dot',   'chDot',   'chDotVal',   v => v + ' px');
        bindCh('len',   'chLen',   'chLenVal',   v => v + ' px');
        bindCh('thick', 'chThick', 'chThickVal', v => v + ' px');
        bindCh('gap',   'chGap',   'chGapVal',   v => v + ' px');
        bindCh('outlineThick', 'chOutlineThick', 'chOutlineThickVal', v => v + ' px');

        $('chOpacity')?.addEventListener('input', e => {
            const v = parseInt(e.target.value, 10) / 100;
            SETTINGS.crosshair.opacity = v;
            const val = $('chOpacityVal');
            if (val) val.textContent = v.toFixed(2);
            applyCrosshair();
        });

        $('chOutline')?.addEventListener('change', e => {
            SETTINGS.crosshair.outline = e.target.checked;
            applyCrosshair();
        });

        $('chColor')?.addEventListener('input', e => {
            SETTINGS.crosshair.color = e.target.value;
            applyCrosshair();
        });

        document.querySelectorAll('.swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                const hex = btn.dataset.color;
                SETTINGS.crosshair.color = hex;
                const ci = $('chColor');
                if (ci) ci.value = hex;
                applyCrosshair();
            });
        });

        // ---------- 灵敏度 ----------
        function bindSens(key, elId, valId, fmt, transform) {
            const el = $(elId), val = $(valId);
            if (!el) return;
            el.addEventListener('input', () => {
                const raw = parseFloat(el.value);
                const v = transform ? transform(raw) : raw;
                SETTINGS.sensitivity[key] = v;
                if (val) val.textContent = fmt ? fmt(v) : v;
                refreshRuntime();
            });
        }
        bindSens('mouse',  'sensMouse', 'sensMouseVal', v => v);
        bindSens('touch',  'sensTouch', 'sensTouchVal', v => v);
        bindSens('adsMul', 'sensAds',   'sensAdsVal',   v => v.toFixed(2) + '×', r => r / 100);
        bindSens('vertMul','sensVert',  'sensVertVal',  v => v.toFixed(2) + '×', r => r / 100);

        $('sensInvertY')?.addEventListener('change', e => {
            SETTINGS.sensitivity.invertY = e.target.checked;
        });

        // ---------- 画面 ----------
        $('gfxShadows')?.addEventListener('change', e => {
            SETTINGS.graphics.shadows = e.target.checked;
            const val = $('gfxShadowsVal');
            if (val) val.textContent = e.target.checked ? '开' : '关';
            applyGraphics(true);
        });
    }

    // ============================================================
    // 从 SETTINGS 反向刷新 UI
    // ============================================================
    function syncUIFromSettings() {
        const $ = id => document.getElementById(id);
        const c = SETTINGS.crosshair;
        const s = SETTINGS.sensitivity;
        const g = SETTINGS.graphics;

        if ($('chColor'))        $('chColor').value        = c.color;
        if ($('chDot'))          $('chDot').value          = c.dot;
        if ($('chLen'))          $('chLen').value          = c.len;
        if ($('chThick'))        $('chThick').value        = c.thick;
        if ($('chGap'))          $('chGap').value          = c.gap;
        if ($('chOpacity'))      $('chOpacity').value      = Math.round(c.opacity * 100);
        if ($('chOutline'))      $('chOutline').checked    = !!c.outline;
        if ($('chOutlineThick')) $('chOutlineThick').value = c.outlineThick;

        if ($('chDotVal'))          $('chDotVal').textContent          = c.dot + ' px';
        if ($('chLenVal'))          $('chLenVal').textContent          = c.len + ' px';
        if ($('chThickVal'))        $('chThickVal').textContent        = c.thick + ' px';
        if ($('chGapVal'))          $('chGapVal').textContent          = c.gap + ' px';
        if ($('chOpacityVal'))      $('chOpacityVal').textContent      = c.opacity.toFixed(2);
        if ($('chOutlineThickVal')) $('chOutlineThickVal').textContent = c.outlineThick + ' px';

        if ($('sensMouse'))   $('sensMouse').value    = s.mouse;
        if ($('sensAds'))     $('sensAds').value      = Math.round(s.adsMul * 100);
        if ($('sensVert'))    $('sensVert').value     = Math.round(s.vertMul * 100);
        if ($('sensInvertY')) $('sensInvertY').checked = !!s.invertY;
        if ($('sensTouch'))   $('sensTouch').value    = s.touch;

        if ($('sensMouseVal')) $('sensMouseVal').textContent = s.mouse;
        if ($('sensAdsVal'))   $('sensAdsVal').textContent   = s.adsMul.toFixed(2) + '×';
        if ($('sensVertVal'))  $('sensVertVal').textContent  = s.vertMul.toFixed(2) + '×';
        if ($('sensTouchVal')) $('sensTouchVal').textContent = s.touch;

        // 画面
        if ($('gfxShadows'))    $('gfxShadows').checked = !!g.shadows;
        if ($('gfxShadowsVal')) $('gfxShadowsVal').textContent = g.shadows ? '开' : '关';

        applyCrosshair();
    }

    // ============================================================
    // 触屏设备才显示触摸灵敏度
    // ============================================================
    function toggleTouchUI() {
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        const section = document.getElementById('touchSection');
        if (section) section.style.display = isTouch ? 'block' : 'none';
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        load();
        refreshRuntime();
        applyCrosshair();

        // 打开：点击齿轮按钮
        const btn = document.getElementById('settingsBtn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof audio === 'function') audio();
                openPanel();
            });
        }

        // 关闭
        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        // 恢复默认
        const resetBtn = document.getElementById('settingsResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                mergeDefaults(SETTINGS, DEFAULTS);
                refreshRuntime();
                applyCrosshair();
                applyGraphics(true);
                syncUIFromSettings();
                save();
                if (typeof toast === 'function') toast('已恢复默认设置');
            });
        }

        bindTabs();
        bindControls();
        toggleTouchUI();
        syncUIFromSettings();

        // 启动时立即应用一次画面设置
        const tryApply = (attempt) => {
            if (typeof renderer !== 'undefined' && renderer) {
                applyGraphics(true);
            } else if (attempt < 20) {
                setTimeout(() => tryApply(attempt + 1), 50);
            }
        };
        tryApply(0);

        console.log('[settings] 设置系统已就绪（准星 + 灵敏度 + 画面）');
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.SETTINGS_Open  = openPanel;
    window.SETTINGS_Close = closePanel;
    window.SETTINGS_Save  = save;
    window.SETTINGS_ApplyGraphics = applyGraphics;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();