// ===== js/weapon_flash_hd.js – 高细节 PBR 闪光弹模型 =====
// 依赖：js/weapon_hd_common.js（必须先加载）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const U = window.HD_UTIL;
    if (!U) {
        console.error('[weapon_flash_hd] 缺少 HD_UTIL，请确认 weapon_hd_common.js 已加载');
        return;
    }

    const IS_TOUCH_LOW = U.IS_TOUCH_LOW;
    const TEX_SIZE = IS_TOUCH_LOW ? 256 : 512;
    const CYL_SEG  = IS_TOUCH_LOW ? 32  : 64;

    // ============================================================
    // 高度图
    // ============================================================
    function flashCanisterHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.85) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 40) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 2.0;
        for (let i = 0; i < n2; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 8 + Math.random() * 45;
            const ang = Math.random() * Math.PI * 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 80) | 0));
            for (let j = 0; j < len; j++) {
                const px = (x | 0) & mask;
                const py = (y | 0) & mask;
                const idx = (py * S + px) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
                x += dx; y += dy;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function capHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.8) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 45) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const step = Math.max(4, S / 96);
        for (let x = 0; x < S; x += step) {
            const xi = x | 0;
            const v = 128 + 45;
            for (let y = 0; y < S; y++) {
                const idx = (y * S + xi) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        for (let i = 0; i < S * 0.8; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 1 + Math.random() * 2;
            const v = Math.max(0, (100 - Math.random() * 20) | 0);
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (dx * dx + dy * dy > rad * rad) continue;
                    const xx = (cx + dx) & mask;
                    const yy = (cy + dy) & mask;
                    const idx = (yy * S + xx) << 2;
                    d[idx] = d[idx + 1] = d[idx + 2] = v;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    // ============================================================
    // 纹理缓存
    // ============================================================
    let _tex = null;
    function getTextures() {
        if (_tex) return _tex;
        const hCan = flashCanisterHeight();
        const hCap = capHeight();

        _tex = {
            nCanister: U.normalMapFromHeight(hCan, 0.9),
            nCap:      U.normalMapFromHeight(hCap, 1.6),

            rCanister: U.roughMapFromHeight(hCan, 0.42, 0.68, 1.0),
            rCap:      U.roughMapFromHeight(hCap, 0.22, 0.42, 1.0),

            gCanister: U.grayMapFromHeight(hCan, {
                aoStrength: 0.35, wearLow: 0.30, wearHigh: 0.55, grainAmount: 4
            }),

            cCap: U.colorMapFromHeight(hCap,
                [168, 172, 178], [216, 220, 224],
                { aoStrength: 0.35, wearLow: 0.28, wearHigh: 0.55,
                  dirtAmount: 0.04, grainAmount: 4 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图（flash 专属：暖黄 softbox）
    // ============================================================
    function getEnvMap() {
        return U.buildEnvMap({
            key: 'flash_env',
            width: 1024, height: 512,
            gradient: [
                [0.00, '#0d1117'], [0.28, '#1e2c3a'],
                [0.46, '#5d718a'], [0.50, '#8a99ac'],
                [0.54, '#3a4452'], [0.74, '#161a20'],
                [1.00, '#050608'],
            ],
            softboxes: [
                { ncx: 0.30, ncy: 0.18, nw: 0.20, nh: 0.15, rgb: '255,248,235', alpha: 1.00 },
                { ncx: 0.72, ncy: 0.24, nw: 0.15, nh: 0.13, rgb: '210,225,255', alpha: 0.85 },
                { ncx: 0.10, ncy: 0.42, nw: 0.09, nh: 0.08, rgb: '255,215,170', alpha: 0.65 },
                { ncx: 0.88, ncy: 0.55, nw: 0.10, nh: 0.09, rgb: '180,200,220', alpha: 0.55 },
                { ncx: 0.50, ncy: 0.62, nw: 0.13, nh: 0.07, rgb: '255,220,140', alpha: 0.35 },
            ],
        });
    }

    // ============================================================
    // 材质库
    // ============================================================
    let _mat = null;
    function getMaterials() {
        if (_mat) return _mat;
        const tex = getTextures();
        const env = getEnvMap();
        const mk = (base) => { if (env) base.envMap = env; return base; };

        _mat = {
            canister: new THREE.MeshPhysicalMaterial(mk({
                color: 0x4c4e4c,
                map: tex.gCanister,
                metalness: 0.55,
                roughness: 0.55,
                roughnessMap: tex.rCanister,
                normalMap: tex.nCanister,
                normalScale: new THREE.Vector2(0.55, 0.55),
                clearcoat: 0.35, clearcoatRoughness: 0.45,
                envMapIntensity: 1.10,
            })),

            metal: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff,
                map: tex.cCap,
                metalness: 1.0,
                roughness: 0.32,
                roughnessMap: tex.rCap,
                normalMap: tex.nCap,
                normalScale: new THREE.Vector2(0.55, 0.55),
                clearcoat: 0.35, clearcoatRoughness: 0.30,
                envMapIntensity: 1.60,
            })),

            bright: new THREE.MeshPhysicalMaterial(mk({
                color: 0xc8d0d8,
                metalness: 1.0,
                roughness: 0.18,
                normalMap: tex.nCap,
                normalScale: new THREE.Vector2(0.20, 0.20),
                envMapIntensity: 2.10,
            })),

            marker: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffd24a,
                metalness: 0.30,
                roughness: 0.48,
                clearcoat: 0.55,
                clearcoatRoughness: 0.32,
                emissive: 0x8a6810,
                emissiveIntensity: 0.55,
                envMapIntensity: 1.30,
            })),

            rubber: new THREE.MeshStandardMaterial(mk({
                color: 0x14181c,
                metalness: 0.0,
                roughness: 0.94,
                envMapIntensity: 0.35,
            })),
        };
        return _mat;
    }

    // ============================================================
    // 构建闪光弹（+Y 向上）
    // ============================================================
    function buildFlashHD() {
        const MAT = getMaterials();
        const gun = new THREE.Group();
        const inner = new THREE.Group();
        gun.add(inner);

        function part(geo, mat, x, y, z, rx, ry, rz, parent) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            m.rotation.set(rx || 0, ry || 0, rz || 0);
            m.castShadow = true;
            m.receiveShadow = true;
            (parent || inner).add(m);
            return m;
        }

        const R = Math.PI / 2;

        const BODY_R = 0.042;
        const BODY_H = 0.200;
        const CAP_R  = 0.044;
        const CAP_H  = 0.016;

        // -------- 1. 罐体 --------
        part(new THREE.CylinderGeometry(BODY_R, BODY_R, BODY_H, CYL_SEG, 1, false),
             MAT.canister, 0, 0, 0);

        // -------- 2. 上下端盖 --------
        part(new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, CYL_SEG),
             MAT.metal, 0, BODY_H / 2 + CAP_H / 2, 0);
        part(new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, CYL_SEG),
             MAT.metal, 0, -BODY_H / 2 - CAP_H / 2, 0);

        part(new THREE.TorusGeometry(CAP_R - 0.0005, 0.0026, 10, CYL_SEG),
             MAT.metal, 0, BODY_H / 2 + CAP_H - 0.0005, 0, R, 0, 0);
        part(new THREE.TorusGeometry(CAP_R - 0.0005, 0.0026, 10, CYL_SEG),
             MAT.metal, 0, -BODY_H / 2 - CAP_H + 0.0005, 0, R, 0, 0);

        // -------- 3. 上下窄装饰环 --------
        part(new THREE.CylinderGeometry(BODY_R + 0.0006, BODY_R + 0.0006, 0.006, CYL_SEG),
             MAT.metal, 0, BODY_H / 2 - 0.006, 0);
        part(new THREE.CylinderGeometry(BODY_R + 0.0006, BODY_R + 0.0006, 0.006, CYL_SEG),
             MAT.metal, 0, -BODY_H / 2 + 0.014, 0);

        // -------- 4. 鲜黄标记环 --------
        const MARKER_Y = 0.048;
        const MARKER_H = 0.014;
        part(new THREE.CylinderGeometry(BODY_R + 0.0018, BODY_R + 0.0018, MARKER_H, CYL_SEG),
             MAT.marker, 0, MARKER_Y, 0);

        part(new THREE.TorusGeometry(BODY_R + 0.0020, 0.0007, 6, CYL_SEG),
             MAT.bright, 0, MARKER_Y + MARKER_H / 2, 0, R, 0, 0);
        part(new THREE.TorusGeometry(BODY_R + 0.0020, 0.0007, 6, CYL_SEG),
             MAT.bright, 0, MARKER_Y - MARKER_H / 2, 0, R, 0, 0);

        // -------- 5. 底部橡胶缓冲环 --------
        part(new THREE.CylinderGeometry(BODY_R + 0.0008, BODY_R + 0.0008, 0.004, CYL_SEG),
             MAT.rubber, 0, -BODY_H / 2 + 0.008, 0);

        // -------- 6. 顶部拉环座 --------
        const SEAT_Y = BODY_H / 2 + CAP_H;
        part(new THREE.CylinderGeometry(0.010, 0.012, 0.006, 24), MAT.metal,
             0, SEAT_Y + 0.003, 0);
        part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 16), MAT.bright,
             0, SEAT_Y + 0.0075, 0);

        // -------- 7. 拉环 --------
        const RING_R    = 0.0165;
        const RING_TUBE = 0.0030;
        const RING_Y    = SEAT_Y + 0.0075 + RING_R + RING_TUBE - 0.0015;
        part(new THREE.TorusGeometry(RING_R, RING_TUBE, 14, 40),
             MAT.bright, 0, RING_Y, 0);

        // -------- 8. 拉销 --------
        const PIN_Y = RING_Y - RING_R + 0.004;
        part(new THREE.CylinderGeometry(0.0015, 0.0015, 0.052, 12),
             MAT.bright, 0, PIN_Y, 0, 0, 0, R);
        part(new THREE.SphereGeometry(0.0026, 12, 10), MAT.bright, -0.026, PIN_Y, 0);
        part(new THREE.SphereGeometry(0.0026, 12, 10), MAT.bright,  0.026, PIN_Y, 0);

        // -------- 9. 保险丝 --------
        {
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3( 0.026, PIN_Y, 0),
                new THREE.Vector3( 0.040, PIN_Y - 0.012, 0.008),
                new THREE.Vector3( 0.0435, SEAT_Y - 0.030, 0.014),
                new THREE.Vector3( 0.0435, SEAT_Y - 0.062, 0.020),
            ]);
            const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.0010, 6, false);
            part(tubeGeo, MAT.bright, 0, 0, 0);
        }

        // -------- 10. 顶部铭牌 --------
        part(new THREE.CylinderGeometry(0.0435, 0.0435, 0.005, CYL_SEG),
             MAT.metal, 0, BODY_H / 2 + CAP_H - 0.0025, 0);

        // -------- 居中 --------
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y, -center.z);

        // -------- 锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(0, 0, 0);
        inner.add(muzzlePoint);

        gun.userData.muzzlePoint = muzzlePoint;

        gun.userData.basePos = new THREE.Vector3(0, 0, 0);
        gun.userData.baseRot = new THREE.Euler(0, 0, 0);
        gun.userData.adsPos  = gun.userData.basePos.clone();
        gun.userData.adsRot  = gun.userData.baseRot.clone();

        gun.updateMatrixWorld(true);
        return gun;
    }

    // ============================================================
    // 第一人称视图模型
    // ============================================================
    function buildFlashViewmodelHD() {
        const g = buildFlashHD();

        const BASE_X = 0.32, BASE_Y = -0.30, BASE_Z = -0.44;
        const BASE_RX = 0.15, BASE_RY = -0.30, BASE_RZ = 0.10;

        g.position.set(BASE_X, BASE_Y, BASE_Z);
        g.rotation.set(BASE_RX, BASE_RY, BASE_RZ);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = new THREE.Euler(BASE_RX, BASE_RY, BASE_RZ);
        g.userData.adsPos = g.userData.basePos.clone();
        g.userData.adsRot = g.userData.baseRot.clone();

        g.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.frustumCulled = false;
            }
        });
        return g;
    }

    // ============================================================
    // 强制预热
    // ============================================================
    function preload(rendererArg) {
        const r = rendererArg || (typeof renderer !== 'undefined' ? renderer : null);
        if (!r) return;

        const tex = getTextures();
        const env = getEnvMap();

        const allTextures = [
            tex.nCanister, tex.nCap,
            tex.rCanister, tex.rCap,
            tex.gCanister, tex.cCap,
            env,
        ];

        for (const t of allTextures) {
            if (t && typeof r.initTexture === 'function') {
                try { r.initTexture(t); } catch (e) {}
            }
        }

        if (typeof scene === 'undefined' || !scene) return;
        if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

        const dummyMeshes = [];
        const M = getMaterials();
        const dummyGeo = new THREE.SphereGeometry(0.05, 8, 6);
        const usedMats = [M.canister, M.metal, M.bright, M.marker, M.rubber];

        for (let i = 0; i < usedMats.length; i++) {
            try {
                const mesh = new THREE.Mesh(dummyGeo, usedMats[i]);
                mesh.position.set(0, 50 + i * 0.3, 0);
                scene.add(mesh);
                dummyMeshes.push(mesh);
            } catch (e) {}
        }

        let vmDummy = null;
        try {
            vmDummy = buildFlashViewmodelHD();
            vmDummy.position.set(0, 50, 0);
            vmDummy.rotation.set(0, 0, 0);
            scene.add(vmDummy);
            dummyMeshes.push(vmDummy);
        } catch (e) {}

        scene.updateMatrixWorld(true);

        try {
            if (typeof r.compile === 'function') r.compile(scene, p1.cam);
        } catch (e) {}

        try {
            if (typeof r.render === 'function') {
                r.render(scene, p1.cam);
                r.render(scene, p1.cam);
            }
        } catch (e) {}

        for (const m of dummyMeshes) {
            if (m.parent === scene) scene.remove(m);
        }
        try { dummyGeo.dispose(); } catch (e) {}

        console.log('[weapon_flash_hd] preload 完成');
    }

    window.__HD_FLASH = {
        buildWorld:     buildFlashHD,
        buildViewmodel: buildFlashViewmodelHD,
        preload:        preload,
        _getTextures:   getTextures,
        _getEnvMap:     getEnvMap,
        _getMaterials:  getMaterials,
    };

    console.log('[weapon_flash_hd] 高细节闪光弹已注册（复用 HD_UTIL）');
})();