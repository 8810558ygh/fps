// ===== js/ui/settings.js – 设置系统（准星 + 灵敏度 + 画面） =====
// 入口：大厅右上角齿轮按钮
// 关闭：设置页左上角"← 返回"
// 无快捷键，纯鼠标点击

(function () {
    'use strict';

    const STORAGE_KEY = 'pvp_settings_v1';

    const GRAPHICS_PRESETS = {
        performance: {
            renderScale: 0.65,
            shadowQuality: 'off',
            fogDistance: 85,
            effectDensity: 0.45,
            zombieMaxAlive: 10,
        },
        balanced: {
            renderScale: 0.90,
            shadowQuality: 'medium',
            fogDistance: 120,
            effectDensity: 0.75,
            zombieMaxAlive: 16,
        },
        quality: {
            renderScale: 1.00,
            shadowQuality: 'high',
            fogDistance: 150,
            effectDensity: 1.00,
            zombieMaxAlive: 20,
        },
    };

    const SHADOW_SETTINGS = {
        off:    { enabled: false, size: 512,  type: THREE.BasicShadowMap, updateFrames: 10 },
        low:    { enabled: true,  size: 512,  type: THREE.BasicShadowMap, updateFrames: 8 },
        medium: { enabled: true,  size: 1024, type: THREE.PCFShadowMap,  updateFrames: 4 },
        high:   { enabled: true,  size: 2048, type: THREE.PCFSoftShadowMap, updateFrames: 3 },
    };

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
        network: {
            lanOptimization: true,
        },
        graphics: {
            preset: 'balanced',
            renderScale: 0.90,
            shadowQuality: 'medium',
            fogDistance: 120,
            effectDensity: 0.75,
            zombieMaxAlive: 16,      // 池容量固定 50，此项只控制同屏数量
            shadows: true,           // 兼容旧代码的派生字段
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

    function _clamp(v, min, max) {
        return Math.max(min, Math.min(max, Number(v)));
    }

    function _normalizeGraphics() {
        const g = SETTINGS.graphics;
        g.renderScale = _clamp(g.renderScale, 0.5, 1.0);
        g.fogDistance = _clamp(g.fogDistance, 70, 150);
        g.effectDensity = _clamp(g.effectDensity, 0.2, 1.0);
        g.zombieMaxAlive = _clamp(g.zombieMaxAlive, 5, 45);
        if (!SHADOW_SETTINGS[g.shadowQuality]) g.shadowQuality = 'medium';
        if (!GRAPHICS_PRESETS[g.preset] && g.preset !== 'custom') g.preset = 'custom';
        g.shadows = g.shadowQuality !== 'off';
    }

    function _applyPresetValues(name) {
        const preset = GRAPHICS_PRESETS[name];
        if (!preset) return false;
        SETTINGS.graphics.preset = name;
        Object.assign(SETTINGS.graphics, preset);
        SETTINGS.graphics.shadows = SETTINGS.graphics.shadowQuality !== 'off';
        return true;
    }

    function _markCustom() {
        SETTINGS.graphics.preset = 'custom';
        SETTINGS.graphics.shadows = SETTINGS.graphics.shadowQuality !== 'off';
    }

    let _lanGraphicsPrewarm = false;

    function _isLanPerformanceMode() {
        if (!SETTINGS.network.lanOptimization) return false;
        if (_lanGraphicsPrewarm) return true;
        return (typeof running !== 'undefined' && running
            && typeof gameMode !== 'undefined' && gameMode === 'lan');
    }

    function getEffectivePixelRatio() {
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
        const lanPerformanceMode = _isLanPerformanceMode();
        const isDesert = (typeof getCurrentMapId === 'function' && getCurrentMapId() === 'desert');
        const baseCap = (isTouch || lanPerformanceMode)
            ? 1
            : ((isOnline || isDesert) ? 1.5 : 2);
        const dpr = Math.min(window.devicePixelRatio || 1, baseCap);
        let scale = _clamp(SETTINGS.graphics.renderScale, 0.5, 1.0);
        if (lanPerformanceMode) scale = Math.min(scale, 0.65);
        return Math.max(0.5, dpr * scale);
    }

    window.SETTINGS_GetPixelRatio = getEffectivePixelRatio;
    window.SETTINGS_GetEffectDensity = function () {
        return _clamp(SETTINGS.graphics.effectDensity, 0.2, 1.0);
    };
    window.SETTINGS_ShouldUseDynamicLights = function () {
        return SETTINGS.graphics.effectDensity >= 0.65;
    };

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
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            mergeDefaults(SETTINGS, parsed);

            // 旧版本只有 shadows 开关，迁移为新的阴影质量字段。
            if (parsed && parsed.graphics
                && parsed.graphics.shadowQuality === undefined
                && parsed.graphics.shadows !== undefined) {
                SETTINGS.graphics.shadowQuality = parsed.graphics.shadows ? 'high' : 'off';
                SETTINGS.graphics.preset = 'custom';
            }

            _normalizeGraphics();
            refreshRuntime();
            return true;
        } catch (e) {
            console.warn('[settings] 读取失败，使用默认值', e);
            return false;
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
    // 画面应用
    // ============================================================
    let _lastShadowEnabled = null;
    let _lastShadowType = null;

    window.PERF_CaptureMapAtmosphere = function () {
        if (typeof scene === 'undefined' || !scene || !scene.fog) return;
        const fog = scene.fog;
        if (fog.isFogExp2) {
            scene.userData.perfFogBase = {
                type: 'exp2',
                density: fog.density,
            };
        } else if (fog.isFog) {
            scene.userData.perfFogBase = {
                type: 'linear',
                near: fog.near,
                far: fog.far,
            };
        }
        window.PERF_ApplyMapAtmosphere();
    };

    window.PERF_ApplyMapAtmosphere = function () {
        if (typeof scene === 'undefined' || !scene || !scene.fog) return;
        const base = scene.userData.perfFogBase;
        if (!base) return;

        const distance = _clamp(SETTINGS.graphics.fogDistance, 70, 150);
        if (base.type === 'exp2') {
            // 以 120m 作为调校基准；雾距越短，密度越高。
            scene.fog.density = base.density * (120 / distance);
        } else if (base.type === 'linear') {
            const far = Math.min(base.far, distance);
            scene.fog.far = far;
            scene.fog.near = Math.min(base.near, far * 0.55);
        }
    };

    function _applyMapLightDensity() {
        if (typeof scene === 'undefined' || !scene) return 0;
        const lights = [];
        scene.traverse(o => {
            if (o.isPointLight && o.userData && o.userData.isMapLight) lights.push(o);
        });

        const density = window.SETTINGS_GetEffectDensity();
        const wanted = lights.length > 0
            ? Math.max(1, Math.round(lights.length * density))
            : 0;
        for (let i = 0; i < lights.length; i++) {
            lights[i].visible = i < wanted;
        }
        return wanted;
    }

    function _updateGraphicsHint() {
        const g = SETTINGS.graphics;
        const el = document.getElementById('gfxQualityHint');
        if (!el) return;

        const presetName = {
            performance: '性能优先',
            balanced: '均衡',
            quality: '画质优先',
            custom: '自定义',
        }[g.preset] || '自定义';
        const effective = getEffectivePixelRatio().toFixed(2);
        const lanPerformanceMode = _isLanPerformanceMode();
        el.textContent = lanPerformanceMode
            ? `联机优化已启用 · 实际像素比 ${effective}× · 阴影关闭 · 普通模式仍使用“${presetName}”`
            : `当前：${presetName} · 3D 分辨率 ${Math.round(g.renderScale * 100)}% · 实际像素比 ${effective}×`;

        document.querySelectorAll('#qualityPresetRow .quality-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.qualityPreset === g.preset);
        });
    }

    function applyGraphics(force) {
        if (typeof renderer === 'undefined' || !renderer) return;

        _normalizeGraphics();
        const g = SETTINGS.graphics;
        const lanPerformanceMode = _isLanPerformanceMode();
        const effectiveShadowQuality = lanPerformanceMode ? 'off' : g.shadowQuality;
        const shadow = SHADOW_SETTINGS[effectiveShadowQuality] || SHADOW_SETTINGS.medium;

        // 像素比是最稳妥的全局性能杠杆，直接改变主画面的片元着色开销。
        if (typeof window.refreshRenderQualityForMap === 'function') {
            window.refreshRenderQualityForMap();
        } else {
            renderer.setPixelRatio(getEffectivePixelRatio());
        }

        const shadowStateChanged = (
            _lastShadowEnabled !== shadow.enabled
            || _lastShadowType !== shadow.type
        );
        _lastShadowEnabled = shadow.enabled;
        _lastShadowType = shadow.type;

        renderer.shadowMap.enabled = shadow.enabled;
        renderer.shadowMap.type = shadow.type;
        if (typeof sun !== 'undefined' && sun) {
            sun.castShadow = shadow.enabled;
            if (sun.shadow.mapSize.x !== shadow.size || sun.shadow.mapSize.y !== shadow.size) {
                sun.shadow.mapSize.set(shadow.size, shadow.size);
                if (sun.shadow.map) {
                    sun.shadow.map.dispose();
                    sun.shadow.map = null;
                }
            }
        }

        if (shadowStateChanged) {
            _forceRecompileMaterials();
        }
        if (shadow.enabled && typeof window.requestShadowUpdate === 'function') {
            window.requestShadowUpdate();
        }

        window.PERF_ApplyMapAtmosphere();
        const mapLights = _applyMapLightDensity();

        if (force || shadowStateChanged) {
            console.log(
                '[settings] 画面设置:',
                '3D 分辨率', Math.round(g.renderScale * 100) + '%',
                '阴影', effectiveShadowQuality,
                '联机优化', lanPerformanceMode ? '开启' : '关闭',
                '雾距', Math.round(g.fogDistance) + 'm',
                '特效', Math.round(g.effectDensity * 100) + '%',
                '地图灯光', mapLights
            );
        }
    }

    // ============================================================
    // ★ 应用僵尸设置（只应用同屏上限，池容量固定 50）
    // ============================================================
    function applyZombieSettings() {
        const g = SETTINGS.graphics;
        if (typeof window.setSurvivalMaxAlive === 'function') {
            window.setSurvivalMaxAlive(g.zombieMaxAlive);
        }
    }
    window.SETTINGS_ApplyZombie = applyZombieSettings;
    window.SETTINGS_PrepareLanMatch = function () {
        _lanGraphicsPrewarm = true;
        applyGraphics(true);
        _syncGraphicsUI();
    };
    window.SETTINGS_CancelLanPreload = function () {
        _lanGraphicsPrewarm = false;
        applyGraphics(true);
        _syncGraphicsUI();
    };

    // ============================================================
    // 玩家资料与本地战绩
    // ============================================================
    function _setProfileStatus(message, isError) {
        const el = document.getElementById('profileSaveStatus');
        if (!el) return;
        el.textContent = message || '';
        el.classList.toggle('error', !!isError);
    }

    function _formatMatchTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '时间未知';
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }

    function _formatDuration(seconds) {
        const total = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(total / 60);
        const remain = Math.floor(total % 60);
        return minutes > 0 ? `${minutes}分${remain}秒` : `${remain}秒`;
    }

    function _renderProfileMatches() {
        const list = document.getElementById('profileMatchList');
        if (!list || !window.PROFILE) return;

        const matches = window.PROFILE.matches || [];
        list.replaceChildren();
        if (matches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'profile-empty';
            empty.textContent = window.PROFILE.ready
                ? '还没有比赛记录，完成一局局域网对战后会显示在这里。'
                : '正在读取本机战绩…';
            list.appendChild(empty);
            return;
        }

        const mapNames = {
            battlefield: '战场',
            desert: '沙漠',
            indoor_complex: '设备间',
        };
        const resultNames = { win: '胜利', loss: '失败', draw: '平局' };

        for (const match of matches.slice(0, 8)) {
            const row = document.createElement('div');
            row.className = `profile-match-row ${match.result || 'draw'}`;

            const result = document.createElement('span');
            result.className = 'profile-match-result';
            result.textContent = resultNames[match.result] || '平局';

            const detail = document.createElement('div');
            detail.className = 'profile-match-detail';
            const title = document.createElement('strong');
            title.textContent = `${mapNames[match.mapId] || match.mapId || '未知地图'} · ${match.blueScore || 0} : ${match.redScore || 0}`;
            const meta = document.createElement('small');
            meta.textContent = `${_formatMatchTime(match.playedAt)} · ${_formatDuration(match.durationSeconds)}`;
            detail.append(title, meta);

            const score = document.createElement('div');
            score.className = 'profile-match-score';
            const kd = document.createElement('strong');
            kd.textContent = `${match.kills || 0} / ${match.deaths || 0}`;
            const label = document.createElement('small');
            label.textContent = `伤害 ${match.damage || 0}`;
            score.append(kd, label);

            row.append(result, detail, score);
            list.appendChild(row);
        }
    }

    function _syncProfileUI() {
        if (!window.PROFILE) return;
        const $ = id => document.getElementById(id);
        const info = window.PROFILE.info || {};
        const id = info.id || '';

        if ($('profilePlayerId') && document.activeElement !== $('profilePlayerId')) {
            $('profilePlayerId').value = id;
        }
        if ($('profileAvatar')) {
            $('profileAvatar').textContent = Array.from(id || '玩')[0] || '玩';
        }
        if ($('profileDataPath')) {
            $('profileDataPath').textContent = info.directory || '正在读取…';
            $('profileDataPath').title = info.directory || '';
        }
        if ($('profileOpenFolderBtn')) {
            $('profileOpenFolderBtn').disabled = !info.electron;
            $('profileOpenFolderBtn').textContent = info.electron ? '打开文件夹' : '仅桌面版可用';
        }

        const summary = window.PROFILE_GetSummary();
        if ($('profileTotalGames')) $('profileTotalGames').textContent = summary.games;
        if ($('profileTotalWins')) $('profileTotalWins').textContent = summary.wins;
        if ($('profileKd')) $('profileKd').textContent = summary.kd;
        if ($('profileKillsDeaths')) $('profileKillsDeaths').textContent = `${summary.kills} / ${summary.deaths}`;
        if ($('profileTotalDamage')) $('profileTotalDamage').textContent = summary.damage.toLocaleString('zh-CN');

        _renderProfileMatches();
    }

    function _bindProfileControls() {
        const idInput = document.getElementById('profilePlayerId');
        const saveButton = document.getElementById('profileSaveIdBtn');

        async function savePlayerId() {
            if (!window.PROFILE || !idInput || !saveButton) return;
            await window.PROFILE.readyPromise;
            const value = idInput.value.trim();
            if (!value) {
                _setProfileStatus('玩家 ID 不能为空', true);
                idInput.focus();
                return;
            }

            saveButton.disabled = true;
            saveButton.textContent = '保存中…';
            const result = await window.PROFILE_SetId(value);
            saveButton.disabled = false;
            saveButton.textContent = '保存 ID';

            if (!result || !result.ok) {
                _setProfileStatus((result && result.message) || '保存失败', true);
                return;
            }
            _setProfileStatus('已保存，联机时会使用新 ID', false);
            _syncProfileUI();
            if (typeof toast === 'function') toast(`玩家 ID 已改为：${window.PROFILE_GetId()}`);
        }

        saveButton?.addEventListener('click', savePlayerId);
        idInput?.addEventListener('keydown', event => {
            if (event.key === 'Enter') savePlayerId();
        });
        idInput?.addEventListener('input', () => _setProfileStatus('', false));

        document.getElementById('profileRefreshBtn')?.addEventListener('click', async () => {
            if (window.PROFILE) await window.PROFILE_RefreshMatches();
            _syncProfileUI();
            _setProfileStatus('战绩已刷新', false);
        });

        document.getElementById('profileOpenFolderBtn')?.addEventListener('click', async () => {
            if (!window.PROFILE) return;
            const result = await window.PROFILE_OpenDataFolder();
            if (!result || !result.ok) {
                _setProfileStatus((result && result.message) || '无法打开资料文件夹', true);
            }
        });
    }

    // 遍历场景 + 武器模板，让所有材质重新编译
    function _forceRecompileMaterials() {
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
        _syncProfileUI();
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
        _bindProfileControls();

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
        document.querySelectorAll('#qualityPresetRow .quality-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.qualityPreset;
                if (!_applyPresetValues(name)) return;
                applyGraphics(true);
                applyZombieSettings();
                _syncGraphicsUI();
            });
        });

        const lanOptimizationEl = $('gfxLanOptimization');
        if (lanOptimizationEl) {
            lanOptimizationEl.addEventListener('change', () => {
                SETTINGS.network.lanOptimization = lanOptimizationEl.checked;
                applyGraphics(true);
                _syncGraphicsUI();
            });
        }

        const renderScaleEl = $('gfxRenderScale');
        if (renderScaleEl) {
            renderScaleEl.addEventListener('input', () => {
                SETTINGS.graphics.renderScale = parseInt(renderScaleEl.value, 10) / 100;
                _markCustom();
                applyGraphics();
                _syncGraphicsUI();
            });
        }

        const shadowQualityEl = $('gfxShadowQuality');
        if (shadowQualityEl) {
            shadowQualityEl.addEventListener('change', () => {
                SETTINGS.graphics.shadowQuality = shadowQualityEl.value;
                _markCustom();
                applyGraphics(true);
                _syncGraphicsUI();
            });
        }

        const fogDistanceEl = $('gfxFogDistance');
        if (fogDistanceEl) {
            fogDistanceEl.addEventListener('input', () => {
                SETTINGS.graphics.fogDistance = parseInt(fogDistanceEl.value, 10);
                _markCustom();
                applyGraphics();
                _syncGraphicsUI();
            });
        }

        const effectDensityEl = $('gfxEffectDensity');
        if (effectDensityEl) {
            effectDensityEl.addEventListener('input', () => {
                SETTINGS.graphics.effectDensity = parseInt(effectDensityEl.value, 10) / 100;
                _markCustom();
                applyGraphics();
                _syncGraphicsUI();
            });
        }

        // 同屏僵尸上限（池容量固定 50）
        const gfxZombieMaxAlive    = $('gfxZombieMaxAlive');

        if (gfxZombieMaxAlive) {
            gfxZombieMaxAlive.addEventListener('input', () => {
                const v = parseInt(gfxZombieMaxAlive.value, 10);
                SETTINGS.graphics.zombieMaxAlive = v;
                _markCustom();
                applyZombieSettings();
                _syncGraphicsUI();
            });
        }
    }

    // ============================================================
    // 画面控件刷新
    // ============================================================
    function _syncGraphicsUI() {
        const $ = id => document.getElementById(id);
        const g = SETTINGS.graphics;
        const shadowLabels = {
            off: '关闭',
            low: '低',
            medium: '中',
            high: '高',
        };

        if ($('gfxRenderScale'))        $('gfxRenderScale').value = Math.round(g.renderScale * 100);
        if ($('gfxRenderScaleVal'))     $('gfxRenderScaleVal').textContent = Math.round(g.renderScale * 100) + '%';
        if ($('gfxShadowQuality'))      $('gfxShadowQuality').value = g.shadowQuality;
        if ($('gfxShadowQualityVal'))   $('gfxShadowQualityVal').textContent = shadowLabels[g.shadowQuality] || '中';
        if ($('gfxFogDistance'))        $('gfxFogDistance').value = Math.round(g.fogDistance);
        if ($('gfxFogDistanceVal'))     $('gfxFogDistanceVal').textContent = Math.round(g.fogDistance) + ' m';
        if ($('gfxEffectDensity'))      $('gfxEffectDensity').value = Math.round(g.effectDensity * 100);
        if ($('gfxEffectDensityVal'))   $('gfxEffectDensityVal').textContent = Math.round(g.effectDensity * 100) + '%';
        if ($('gfxZombieMaxAlive'))     $('gfxZombieMaxAlive').value = Math.round(g.zombieMaxAlive);
        if ($('gfxZombieMaxAliveVal'))  $('gfxZombieMaxAliveVal').textContent = Math.round(g.zombieMaxAlive);
        if ($('gfxLanOptimization'))    $('gfxLanOptimization').checked = !!SETTINGS.network.lanOptimization;

        _updateGraphicsHint();
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

        _syncGraphicsUI();

        applyCrosshair();
        _syncProfileUI();
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
        const hadSavedSettings = load();
        if (!hadSavedSettings && window.matchMedia('(pointer: coarse)').matches) {
            _applyPresetValues('performance');
        }
        _normalizeGraphics();
        refreshRuntime();
        applyCrosshair();

        const btn = document.getElementById('settingsBtn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof audio === 'function') audio();
                openPanel();
            });
        }

        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        const resetBtn = document.getElementById('settingsResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                mergeDefaults(SETTINGS, DEFAULTS);
                refreshRuntime();
                applyCrosshair();
                applyGraphics(true);
                applyZombieSettings();
                syncUIFromSettings();
                save();
                if (typeof toast === 'function') toast('已恢复默认设置');
            });
        }

        bindTabs();
        bindControls();
        window.addEventListener('profile-ready', _syncProfileUI);
        window.addEventListener('profile-updated', _syncProfileUI);
        toggleTouchUI();
        syncUIFromSettings();

        const tryApply = (attempt) => {
            if (typeof renderer !== 'undefined' && renderer) {
                applyGraphics(true);
            } else if (attempt < 20) {
                setTimeout(() => tryApply(attempt + 1), 50);
            }
        };
        tryApply(0);

        applyZombieSettings();

        console.log('[settings] 设置系统已就绪（准星 + 灵敏度 + 画面）');
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.SETTINGS_Open  = openPanel;
    window.SETTINGS_Close = closePanel;
    window.SETTINGS_Save  = save;
    window.SETTINGS_ApplyGraphics = applyGraphics;
    window.PERF_ReapplyMapQuality = function () {
        if (typeof window.PERF_CaptureMapAtmosphere === 'function') {
            window.PERF_CaptureMapAtmosphere();
        }
        _applyMapLightDensity();
        _syncGraphicsUI();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
