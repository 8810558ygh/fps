// ===== js/loading_tasks.js – 加载任务表 =====
// 依赖：window.LoadingWarmup

(function () {
    'use strict';

    // ============================================================
    // 完整加载任务表（首局进入 / 换模式）
    // ============================================================
    function buildGameLoadTasks(mapId, mode) {
        const W = window.LoadingWarmup;
        if (!W) {
            console.warn('[loading_tasks] LoadingWarmup 未就绪');
            return [];
        }

        const isSurvival = (mode === 'survival');

        const ALL_WEAPON_TYPES = W.ALL_WEAPON_TYPES;
        const WEAPON_TYPES = isSurvival
            ? ALL_WEAPON_TYPES.filter(t => t !== 'smoke' && t !== 'flash')
            : ALL_WEAPON_TYPES;

        const WEAPON_NAMES = W.WEAPON_NAMES;
        const tasks = [];

        // ---- 音频 ----
        tasks.push({ name: '初始化音频系统', weight: 3, fn: () => W.warmupAudioDeep() });

        // ---- 地图 ----
        tasks.push({
            name: '构建地图', weight: 6,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        // ---- 武器模板 ----
        WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '构建武器模板：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => {
                    if (typeof _getWorldTemplate === 'function') _getWorldTemplate(type);
                    if (typeof _getViewTemplate  === 'function') _getViewTemplate(type);
                },
            });
        });

        // ---- 纹理上传 / shader 编译 ----
        tasks.push({ name: '上传全部纹理到 GPU', weight: 8, fn: () => W.forceUploadAllTextures() });
        tasks.push({ name: '编译场景基础着色器', weight: 6, fn: () => W.compileSceneShaders() });

        // ---- 第一人称渲染 ----
        WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第一人称：' + (WEAPON_NAMES[type] || type),
                weight: 4,
                fn: () => W.warmupSingleViewmodel(type),
            });
        });

        // ---- 第三人称渲染 ----
        WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第三人称：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => W.warmupSingleWorldModel(type),
            });
        });

        // ---- 特效 ----
        tasks.push({ name: '预热特效材质', weight: 6, fn: () => W.warmupEffectMaterials() });

        if (!isSurvival) {
            tasks.push({ name: '预热烟雾云', weight: 3, fn: () => W.warmupSmokeCloud() });
            tasks.push({ name: '预热闪光爆发', weight: 2, fn: () => W.warmupFlashBurst() });
        }

        tasks.push({ name: '预热油桶爆炸', weight: 3, fn: () => W.warmupExplosion() });

        if (!isSurvival) {
            tasks.push({ name: '预热闪光指示器', weight: 2, fn: () => W.warmupFlashIndicator() });
        }

        tasks.push({ name: '预热瞄准镜 PiP', weight: 3, fn: () => W.warmupScopePip() });
        tasks.push({ name: '预热物理引擎', weight: 4, fn: () => W.warmupPhysicsDeep() });

        // ---- 生存模式：僵尸 / 传送门 ----
        if (isSurvival) {
            tasks.push({ name: '预热僵尸模型', weight: 5, fn: () => W.warmupZombies() });
            tasks.push({ name: '预热传送门', weight: 3, fn: () => W.warmupSurvivalPortal() });
        }

        // ---- HUD / 最终渲染 ----
        tasks.push({ name: '预热 HUD 样式', weight: 2, fn: () => W.warmupHudDom() });
        tasks.push({ name: '最终场景渲染', weight: 5, fn: () => W.finalSceneRender() });

        return tasks;
    }

    // ============================================================
    // 切地图专用任务表（轻量）
    // ============================================================
    function buildMapSwitchTasks(mapId) {
        const W = window.LoadingWarmup;
        if (!W) {
            console.warn('[loading_tasks] LoadingWarmup 未就绪');
            return [];
        }
        const tasks = [];

        tasks.push({
            name: '清理场景',
            weight: 1,
            fn: () => {
                if (typeof window.clearAllZombies === 'function') window.clearAllZombies();
            },
        });

        tasks.push({
            name: '构建新地图',
            weight: 6,
            fn: () => {
                if (typeof window.loadMap === 'function') {
                    window.loadMap(mapId);
                }
            },
        });

        // ★ 新增：进入沙漠图时预热演奏僵尸
        if (mapId === 'desert') {
            tasks.push({
                name: '预热演奏僵尸',
                weight: 3,
                fn: () => {
                    if (window.PlayerZombie && typeof window.PlayerZombie.warmup === 'function') {
                        window.PlayerZombie.warmup();
                    }
                },
            });
        }

        tasks.push({
            name: '上传地图纹理',
            weight: 5,
            fn: () => W.forceUploadAllTextures(),
        });

        tasks.push({
            name: '编译地图着色器',
            weight: 4,
            fn: () => W.warmupMapOnly(),
        });

        return tasks;
    }

    window.buildGameLoadTasks = buildGameLoadTasks;
    window.buildMapSwitchTasks = buildMapSwitchTasks;

    console.log('[loading_tasks] 加载任务表模块已就绪');
})();