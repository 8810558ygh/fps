// ===== js/main_pip.js – 瞄准镜画中画（PiP） =====
// 从 main.js 拆出，不改变任何对外接口
// 依赖：main.js 的 renderer / isTouchDevice

let _scopeCam = null;
let _scopeRT  = null;
let _scopeMat = null;

let _pipCachedLensF = null;
let _pipCachedLensB = null;
let _pipOrigMatF = null;
let _pipOrigMatB = null;
let _pipActive = false;
let _pipFrameCounter = 0;

const PIP_UPDATE_EVERY_N_FRAMES = 2;
const PIP_RT_SIZE_DESKTOP = 192;
const PIP_RT_SIZE_MOBILE  = 160;

function ensureScopeResources() {
    if (_scopeCam) return;

    const scopeFov = isTouchDevice ? 14 : 10;
    _scopeCam = new THREE.PerspectiveCamera(scopeFov, 1, 0.02, 250);
    _scopeCam.rotation.order = 'YXZ';
    _scopeCam.updateProjectionMatrix();

    const rtSize = isTouchDevice ? PIP_RT_SIZE_MOBILE : PIP_RT_SIZE_DESKTOP;
    _scopeRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false
    });

    _scopeMat = new THREE.MeshBasicMaterial({
        map: _scopeRT.texture,
        toneMapped: false,
        depthWrite: true,
        depthTest: true
    });
}

function updateScopePip() {
    if (typeof p1 === 'undefined' || !p1 || !p1.vm || p1.vm.children.length === 0) return;
    const vmGun = p1.vm.children[0];
    if (!vmGun || !vmGun.userData) return;
    const lensF = vmGun.userData.lensMeshF;
    const lensB = vmGun.userData.lensMeshB;
    if (!lensF) return;

    if (lensF !== _pipCachedLensF) {
        _pipCachedLensF = lensF;
        _pipCachedLensB = lensB || null;
        _pipOrigMatF = lensF.material;
        _pipOrigMatB = lensB ? lensB.material : null;
        _pipActive = false;
    }

    const now = performance.now();
    const isADS = running && gameState === 'combat'
        && p1.aiming
        && p1.weapon && (p1.weapon.key === 'rifle' || p1.weapon.key === 'odin')
        && !p1.isMelee && !p1.isSmoke && !p1.isFlash
        && p1.hp > 0 && now >= p1.deadUntil;

    if (isADS !== _pipActive) {
        _pipActive = isADS;
        if (isADS) {
            ensureScopeResources();
            _pipCachedLensF.material = _scopeMat;
            if (_pipCachedLensB) _pipCachedLensB.material = _scopeMat;
            _pipFrameCounter = PIP_UPDATE_EVERY_N_FRAMES;
        } else {
            _pipCachedLensF.material = _pipOrigMatF;
            if (_pipCachedLensB) _pipCachedLensB.material = _pipOrigMatB;
            return;
        }
    }

    if (!_pipActive) return;

    _pipFrameCounter++;
    if (_pipFrameCounter < PIP_UPDATE_EVERY_N_FRAMES) return;
    _pipFrameCounter = 0;

    _scopeCam.position.copy(p1.cam.position);
    _scopeCam.quaternion.copy(p1.cam.quaternion);

    const vmWasVisible = p1.vm.visible;
    p1.vm.visible = false;

    const shadowPrevAuto = renderer.shadowMap.autoUpdate;
    const shadowPrevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(_scopeRT);
    renderer.clear();
    renderer.render(scene, _scopeCam);
    renderer.setRenderTarget(prevRT);

    renderer.shadowMap.autoUpdate = shadowPrevAuto;
    renderer.shadowMap.needsUpdate = shadowPrevNeeds;

    p1.vm.visible = vmWasVisible;
}

// ============================================================
// ★ 预热 PiP 瞄准镜资源（供 loading_warmup.js 调用）
//
//   这一步做了 3 件事：
//     1. 创建 _scopeCam / _scopeRT / _scopeMat
//     2. 渲染一次 _scopeRT，建立 framebuffer，上传 RT texture
//     3. ★ 关键：用一个 dummy 平面把 _scopeMat 挂上去，
//        真正触发 shader 编译（否则第一次开镜会现场编译 → 卡顿）
// ============================================================
window.warmupScopePip = function () {
    ensureScopeResources();
    if (!_scopeCam || !_scopeRT) return;

    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;

    if (typeof p1 !== 'undefined' && p1 && p1.cam) {
        _scopeCam.position.copy(p1.cam.position);
        _scopeCam.quaternion.copy(p1.cam.quaternion);
    } else {
        _scopeCam.position.set(0, 5, 10);
        _scopeCam.lookAt(0, 0, 0);
    }
    _scopeCam.updateMatrixWorld(true);

    // ---------- 步骤 1：渲染一次 RT，建立 framebuffer ----------
    try {
        renderer.setRenderTarget(_scopeRT);
        renderer.clear();
        renderer.render(scene, _scopeCam);
        renderer.setRenderTarget(prevRT);
    } catch (e) {
        try { renderer.setRenderTarget(prevRT); } catch (e2) {}
    }

    // ---------- 步骤 2：把 _scopeMat 挂到 dummy 平面，编译它的 shader ----------
    let _warmupPlane = null;
    let _warmupGeo = null;
    try {
        _warmupGeo = new THREE.PlaneGeometry(0.5, 0.5);
        _warmupPlane = new THREE.Mesh(_warmupGeo, _scopeMat);
        _warmupPlane.position.set(0, 54.5, 0);
        _warmupPlane.frustumCulled = false;
        _warmupPlane.castShadow = false;
        _warmupPlane.receiveShadow = false;
        scene.add(_warmupPlane);

        // 确保场景矩阵更新
        scene.updateMatrixWorld(true);

        // renderer.compile 会遍历 scene，遇到使用 _scopeMat 的物体 → 编译它的 shader
        try {
            if (typeof renderer.compile === 'function') {
                renderer.compile(scene, p1.cam);
            }
        } catch (e) {
            console.warn('[main_pip] compile 失败（非致命）:', e);
        }

        // 再 render 一次，双保险
        try {
            renderer.render(scene, p1.cam);
        } catch (e) {}
    } catch (e) {
        console.warn('[main_pip] _scopeMat 预热失败（非致命）:', e);
    } finally {
        // ---------- 清理 ----------
        if (_warmupPlane && _warmupPlane.parent === scene) {
            scene.remove(_warmupPlane);
        }
        if (_warmupGeo) {
            try { _warmupGeo.dispose(); } catch (e) {}
        }
    }

    renderer.shadowMap.autoUpdate = prevAuto;
    renderer.shadowMap.needsUpdate = prevNeeds;

    console.log('[main_pip] PiP 瞄准镜资源已预热（含 _scopeMat shader 编译）');
};