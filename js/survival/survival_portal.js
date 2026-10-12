// ===== js/survival/survival_portal.js – 传送门（极简版） =====
// 一个蓝色漩涡圆盘，竖直放置在地图正中心
// 材质：程序化 canvas 纹理 + AdditiveBlending（自发光、加法混合，不加 PointLight）
// 动画：圆盘绕自身轴缓慢旋转
//
// ★ 性能：纹理缓存 + 预热
//   · _vortexTex 全局缓存，多次 spawn 不重复生成（避免 CPU 卡顿）
//   · warmupSurvivalPortal() 在 loading 阶段调用：
//       1) 提前生成纹理（消耗 CPU）
//       2) 上传纹理到 GPU
//       3) 用 dummy 渲染一次，编译 shader
//   · despawn 时不 dispose 纹理（要复用）

const PORTAL_RADIUS = 2.40;   // 圆盘半径
const PORTAL_HEIGHT = 2.00;   // 圆心离地高度

let _portalGroup = null;
let _vortexTex = null;        // ★ 全局纹理缓存

// ============================================================
// 程序化生成漩涡纹理
// ============================================================
function _makeVortexTexture(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const half = size / 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - half + 0.5;
            const dy = y - half + 0.5;
            const r = Math.sqrt(dx * dx + dy * dy) / half;
            const i = (y * size + x) * 4;

            if (r > 1) { d[i + 3] = 0; continue; }

            const a = Math.atan2(dy, dx);

            const spiral1 = Math.sin(a * 3 + r * 18.0) * 0.5 + 0.5;
            const spiral2 = Math.sin(a * 6 + r * 30.0) * 0.5 + 0.5;
            const spiral3 = Math.sin(a * 9 + r * 44.0) * 0.5 + 0.5;
            const mixed   = spiral1 * 0.55 + spiral2 * 0.30 + spiral3 * 0.15;

            const falloff = Math.pow(1 - r, 1.4);
            const core    = Math.max(0, 1 - r * 2.5);
            const intensity = Math.min(1, mixed * falloff * 1.1 + core * 0.85);

            d[i]     = Math.round(80 + intensity * 120);
            d[i + 1] = Math.round(180 + intensity * 75);
            d[i + 2] = 255;
            d[i + 3] = Math.round(intensity * 255);
        }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

// ★ 取缓存的纹理（首次调用时生成）
function _getVortexTexture() {
    if (!_vortexTex) _vortexTex = _makeVortexTexture(512);
    return _vortexTex;
}

// ============================================================
// ★ 预热（供 loading 调用）
//   · 生成纹理
//   · 上传 GPU
//   · 用一个 dummy 圆盘渲染一次，编译 shader
// ============================================================
function warmupSurvivalPortal() {
    try {
        if (typeof scene === 'undefined' || !scene) return;

        // 1. 提前生成纹理（消耗 CPU）
        const tex = _getVortexTexture();

        // 2. 上传纹理到 GPU
        if (typeof renderer !== 'undefined' && renderer
            && typeof renderer.initTexture === 'function') {
            try { renderer.initTexture(tex); } catch (e) {}
        }

        // 3. dummy 圆盘编译 shader
        if (typeof renderer !== 'undefined' && renderer && p1 && p1.cam) {
            const geo = new THREE.CircleGeometry(PORTAL_RADIUS, 64);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            });
            const dummy = new THREE.Mesh(geo, mat);
            dummy.position.set(0, 54.5, 0);   // warmup 相机视野里
            dummy.frustumCulled = false;
            scene.add(dummy);
            scene.updateMatrixWorld(true);

            try {
                if (typeof renderer.compile === 'function') {
                    renderer.compile(scene, p1.cam);
                }
                renderer.render(scene, p1.cam);
            } catch (e) {}

            scene.remove(dummy);
            geo.dispose();
            mat.dispose();
            // ★ 注意：不 dispose 纹理（要缓存复用）
        }

        console.log('[portal] 传送门资源已预热');
    } catch (e) {
        console.warn('[portal] 预热失败:', e);
    }
}
window.warmupSurvivalPortal = warmupSurvivalPortal;

// ============================================================
// 生成传送门
// ============================================================
function spawnSurvivalPortal() {
    if (_portalGroup) return _portalGroup;
    if (typeof scene === 'undefined' || !scene) return null;

    // ---- 地面高度 ----
    const mapId = (typeof window.getCurrentMapId === 'function')
        ? window.getCurrentMapId() : null;

    let groundY;
    if (mapId === 'battlefield') {
        groundY = 2.5;
    } else {
        groundY = (typeof terrainGroundAt === 'function')
            ? terrainGroundAt(0, 0) : 0;
    }

    const g = new THREE.Group();
    g.position.set(0, groundY + PORTAL_HEIGHT, 0);

    // ---- 漩涡圆盘 ----
    const geo = new THREE.CircleGeometry(PORTAL_RADIUS, 64);
    const tex = _getVortexTexture();   // ★ 复用缓存

    const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
    });

    const disc = new THREE.Mesh(geo, mat);
    disc.renderOrder = 50;
    disc.castShadow = false;
    disc.receiveShadow = false;
    g.add(disc);

    g.userData.disc = disc;

    scene.add(g);
    _portalGroup = g;

    console.log('[portal] 传送门已生成 @', g.position.x, g.position.y, g.position.z);
    return g;
}
window.spawnSurvivalPortal = spawnSurvivalPortal;

// ============================================================
// 移除传送门
//   ★ 不 dispose 纹理（缓存复用）
// ============================================================
function despawnSurvivalPortal() {
    if (!_portalGroup) return;
    if (_portalGroup.parent === scene) {
        scene.remove(_portalGroup);
    }
    _portalGroup.traverse(o => {
        if (o.isMesh) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                // ★ 不 dispose material.map，因为 _vortexTex 是复用的
                o.material.dispose();
            }
        }
    });
    _portalGroup = null;
    console.log('[portal] 传送门已移除');
}
window.despawnSurvivalPortal = despawnSurvivalPortal;

function isPortalActive() {
    return !!_portalGroup;
}
window.isPortalActive = isPortalActive;

// ============================================================
// 每帧动画
// ============================================================
function updateSurvivalPortal(dt, now) {
    if (!_portalGroup) return;
    const g = _portalGroup;
    const t = now * 0.001;

    if (g.userData.disc) {
        g.userData.disc.rotation.z = -t * 1.6;
    }
}
window.updateSurvivalPortal = updateSurvivalPortal;