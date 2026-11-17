// ===== js/main.js – 引导层：渲染器引用 / 设备判定 / 阴影节流 =====
//
// 拆分说明：
//   · main_input.js —— 全屏 / 锁定 / 鼠标 / weaponPanel / resize 响应
//   · main_pip.js   —— 瞄准镜画中画（PiP）
//   · main_loop.js  —— 主循环 / FPS / render / 远端插值 / 小地图
//   · main_entry.js —— 大厅入口 / enterGame / exitToLobby / 返回房间 / 地图选择
//
// 本文件保留：renderer 初始化 / isTouchDevice / pixelRatio / 阴影配置 / 全局常量

const renderer = window.renderer;
if (!renderer) {
    console.error('[main] renderer 未初始化，请检查 js/renderer.js 是否加载');
}
window.renderer = renderer;

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

function getDesiredPixelRatio() {
    if (typeof window.SETTINGS_GetPixelRatio === 'function') {
        return window.SETTINGS_GetPixelRatio();
    }
    if (isTouchDevice) return 1;
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    const isDesert = (typeof getCurrentMapId === 'function' && getCurrentMapId() === 'desert');
    return Math.min(window.devicePixelRatio || 1, (isOnline || isDesert) ? 1.5 : 2);
}
renderer.setPixelRatio(getDesiredPixelRatio());

function refreshRenderQualityForMap() {
    if (!renderer) return;
    renderer.setPixelRatio(getDesiredPixelRatio());
    renderer.shadowMap.needsUpdate = true;
}
window.refreshRenderQualityForMap = refreshRenderQualityForMap;

if (isTouchDevice) {
    renderer.shadowMap.type = THREE.PCFShadowMap;
} else {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.appendChild(renderer.domElement);

// ============================================================
// ★ B3：阴影节流更新
// ============================================================
function getShadowUpdateInterval() {
    const quality = window.SETTINGS && window.SETTINGS.graphics
        ? window.SETTINGS.graphics.shadowQuality
        : 'medium';
    const base = {
        off: 10,
        low: 8,
        medium: 4,
        high: 3,
    }[quality] || 4;
    const isLan = (typeof gameMode !== 'undefined' && gameMode === 'lan');
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online');
    const isDesert = (typeof getCurrentMapId === 'function' && getCurrentMapId() === 'desert');
    if (isLan && window.SETTINGS?.network?.lanOptimization) return 30;
    if (isDesert) return Math.max(base, 8);
    return (isOnline || isLan) ? Math.max(base, 6) : base;
}
let _shadowFrameCounter = 0;

renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

window.requestShadowUpdate = function () {
    renderer.shadowMap.needsUpdate = true;
};
