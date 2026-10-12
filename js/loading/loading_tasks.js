// ===== js/loading_tasks.js – 加载任务表 =====
// 依赖：window.LoadingWarmup

(function () {
    'use strict';

    // ============================================================
    // 完整加载任务表（首局进入 / 换模式）
    //   mapId : 要加载的地图 id
    //   mode  : 'ai' | 'survival'
    // ============================================================
    function buildGameLoadTasks(mapId, mode) {
        const W = window.LoadingWarmup;
        if (!W) {
            console.warn('[loading_tasks] LoadingWarmup 未就绪');
            return [];
        }

        const ALL_WEAPON_TYPES = W.ALL_WEAPON_TYPES;
        const WEAPON_NAMES     = W.WEAPON_NAMES;
        const tasks = [];

        tasks.push({ name: '初始化音频系统', weight: 3, fn: () => W.warmupAudioDeep() });

        tasks.push({
            name: '构建地图', weight: 6,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '构建武器模板：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => {
                    if (typeof _getWorldTemplate === 'function') _getWorldTemplate(type);
                    if (typeof _getViewTemplate  === 'function') _getViewTemplate(type);
                },
            });
        });

        tasks.push({ name: '上传全部纹理到 GPU', weight: 8, fn: () => W.forceUploadAllTextures() });
        tasks.push({ name: '编译场景基础着色器', weight: 6, fn: () => W.compileSceneShaders() });

        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第一人称：' + (WEAPON_NAMES[type] || type),
                weight: 4,
                fn: () => W.warmupSingleViewmodel(type),
            });
        });

        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第三人称：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => W.warmupSingleWorldModel(type),
            });
        });

        tasks.push({ name: '预热特效材质', weight: 6, fn: () => W.warmupEffectMaterials() });
        tasks.push({ name: '预热烟雾云', weight: 3, fn: () => W.warmupSmokeCloud() });
        tasks.push({ name: '预热闪光爆发', weight: 2, fn: () => W.warmupFlashBurst() });
        tasks.push({ name: '预热油桶爆炸', weight: 3, fn: () => W.warmupExplosion() });
        tasks.push({ name: '预热闪光指示器', weight: 2, fn: () => W.warmupFlashIndicator() });
        tasks.push({ name: '预热瞄准镜 PiP', weight: 3, fn: () => W.warmupScopePip() });
        tasks.push({ name: '预热物理引擎', weight: 4, fn: () => W.warmupPhysicsDeep() });

        if (mode === 'survival') {
            tasks.push({ name: '预热僵尸模型', weight: 4, fn: () => W.warmupZombies() });
            tasks.push({ name: '预热传送门', weight: 3, fn: () => W.warmupSurvivalPortal() });
        }

        tasks.push({ name: '预热 HUD 样式', weight: 2, fn: () => W.warmupHudDom() });
        tasks.push({ name: '最终场景渲染', weight: 5, fn: () => W.finalSceneRender() });

        return tasks;
    }

    // ============================================================
    // ★ 切地图专用任务表（轻量）
    //
    //   · 只做：清僵尸 + 加载新地图 + 上传新纹理 + 编译地图 shader
    //   · 不重复：武器 / 特效 / 物理 / 僵尸 / HUD 预热（首局已经做过）
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