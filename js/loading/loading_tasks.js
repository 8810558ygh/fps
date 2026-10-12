// ===== js/loading_tasks.js – 加载任务表（buildGameLoadTasks） =====
// 从 loading.js 拆出，不改变任何对外接口
// 依赖：window.LoadingWarmup

(function () {
    'use strict';

    function buildGameLoadTasks(mapId) {
        const W = window.LoadingWarmup;
        if (!W) {
            console.warn('[loading_tasks] LoadingWarmup 未就绪，任务表为空');
            return [];
        }

        const ALL_WEAPON_TYPES = W.ALL_WEAPON_TYPES;
        const WEAPON_NAMES     = W.WEAPON_NAMES;
        const tasks = [];

        // 1. 音频系统
        tasks.push({
            name: '初始化音频系统',
            weight: 3,
            fn: () => W.warmupAudioDeep(),
        });

        // 2. 构建地图
        tasks.push({
            name: '构建地图',
            weight: 6,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        // 3. 构建所有武器模板
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

        // 4. 上传所有纹理到 GPU
        tasks.push({
            name: '上传全部纹理到 GPU',
            weight: 8,
            fn: () => W.forceUploadAllTextures(),
        });

        // 5. 基础场景 shader 编译
        tasks.push({
            name: '编译场景基础着色器',
            weight: 6,
            fn: () => W.compileSceneShaders(),
        });

        // 6. 每个武器的 viewmodel 在 6 个状态下真实渲染
        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第一人称：' + (WEAPON_NAMES[type] || type),
                weight: 4,
                fn: () => W.warmupSingleViewmodel(type),
            });
        });

        // 7. 每个武器的 world model 真实渲染
        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第三人称：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => W.warmupSingleWorldModel(type),
            });
        });

        // 8. 特效材质（弹痕 / 火花 / 曳光 / 弹壳）
        tasks.push({
            name: '预热特效材质',
            weight: 6,
            fn: () => W.warmupEffectMaterials(),
        });

        // 9. 烟雾云
        tasks.push({
            name: '预热烟雾云',
            weight: 3,
            fn: () => W.warmupSmokeCloud(),
        });

        // 10. 闪光爆发
        tasks.push({
            name: '预热闪光爆发',
            weight: 2,
            fn: () => W.warmupFlashBurst(),
        });

        // 11. 油桶爆炸
        tasks.push({
            name: '预热油桶爆炸',
            weight: 3,
            fn: () => W.warmupExplosion(),
        });

        // 12. 闪光指示器
        tasks.push({
            name: '预热闪光指示器',
            weight: 2,
            fn: () => W.warmupFlashIndicator(),
        });

        // 13. 瞄准镜 PiP
        tasks.push({
            name: '预热瞄准镜 PiP',
            weight: 3,
            fn: () => W.warmupScopePip(),
        });

        // 14. 物理引擎
        tasks.push({
            name: '预热物理引擎',
            weight: 4,
            fn: () => W.warmupPhysicsDeep(),
        });

        // 15. HUD DOM 样式
        tasks.push({
            name: '预热 HUD 样式',
            weight: 2,
            fn: () => W.warmupHudDom(),
        });

        // 16. 最终整体渲染
        tasks.push({
            name: '最终场景渲染',
            weight: 5,
            fn: () => W.finalSceneRender(),
        });

        return tasks;
    }

    window.buildGameLoadTasks = buildGameLoadTasks;

    console.log('[loading_tasks] 加载任务表模块已就绪');
})();