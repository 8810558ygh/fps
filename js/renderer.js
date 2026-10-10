// ===== js/renderer.js – WebGL 渲染器（提前创建，供 player.js / HD_UTIL 使用） =====
//
// 加载顺序：必须在 player.js / map_desert.js / weapon_hd_common.js 之前
// 原因：
//   · player.js 创建 p1 时立刻构建武器 HD 模型 → 需要 renderer 生成 PMREM 环境贴图
//   · map_desert.js 读取 renderer.capabilities.getMaxAnisotropy()

(function () {
    'use strict';
    if (typeof THREE === 'undefined') {
        console.error('[renderer] THREE 未加载，无法创建 WebGLRenderer');
        return;
    }

    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.outputEncoding = THREE.sRGBEncoding;
    r.setScissorTest(false);

    // ★ 挂到 window，让所有脚本都能通过 window.renderer 拿到
    window.renderer = r;

    console.log('[renderer] WebGLRenderer 已创建');
})();