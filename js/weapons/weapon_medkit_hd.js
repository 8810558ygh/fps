// ===== js/weapons/weapon_medkit_hd.js – 高细节 PBR 医疗包模型 =====
// 依赖：js/weapons/weapon_hd_common.js（必须先加载）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const U = window.HD_UTIL;
    if (!U) {
        console.error('[weapon_medkit_hd] 缺少 HD_UTIL，请确认 weapon_hd_common.js 已加载');
        return;
    }

    const IS_TOUCH_LOW = U.IS_TOUCH_LOW;
    const TEX_SIZE = IS_TOUCH_LOW ? 256 : 512;
    const CURVE_SEG = IS_TOUCH_LOW ? 6 : 10;
    const BEVEL_SEG = IS_TOUCH_LOW ? 2 : 3;

    // ============================================================
    // 高度图生成器
    // ============================================================
    function whitePlasticHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.55) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 48) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 8;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 1 + Math.random() * 2.5;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 42) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    d[idx] = d[idx + 1] = d[idx + 2] = v;
                }
            }
        }

        const n3 = S * 4;
        for (let i = 0; i < n3; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 8 + Math.random() * 42;
            const ang = Math.random() * Math.PI * 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 85) | 0));
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

    function redCrossHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.5) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 40) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 3;
        for (let i = 0; i < n2; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 4 + Math.random() * 18;
            const ang = Math.random() * Math.PI * 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 70) | 0));
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

    function metalHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        for (let i = 0; i < S * S * 0.6; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 36) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        for (let i = 0; i < S * 3; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 0.6 + Math.random() * 1.8;
            const r2 = rad * rad;
            const v = (100 - Math.random() * 30) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.max(0, v);
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function rubberHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        for (let i = 0; i < S * S * 1.5; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 130) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
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

        const hWhite = whitePlasticHeight();
        const hRed   = redCrossHeight();
        const hMetal = metalHeight();
        const hRub   = rubberHeight();

        _tex = {
            nWhite: U.normalMapFromHeight(hWhite, 1.2),
            rWhite: U.roughMapFromHeight(hWhite, 0.55, 0.78, 1.0),
            cWhite: U.colorMapFromHeight(hWhite, [226, 228, 230], [252, 252, 252], {
                aoStrength: 0.42, wearLow: 0.32, wearHigh: 0.60,
                dirtAmount: 0.035, grainAmount: 5,
            }),

            nRed: U.normalMapFromHeight(hRed, 1.0),
            rRed: U.roughMapFromHeight(hRed, 0.50, 0.70, 1.0),
            cRed: U.colorMapFromHeight(hRed, [178, 28, 28], [228, 60, 60], {
                aoStrength: 0.40, wearLow: 0.30, wearHigh: 0.55,
                dirtAmount: 0.03, grainAmount: 4,
            }),

            nMetal: U.normalMapFromHeight(hMetal, 1.4),
            rMetal: U.roughMapFromHeight(hMetal, 0.22, 0.42, 1.0),
            cMetal: U.colorMapFromHeight(hMetal, [168, 174, 180], [220, 224, 228], {
                aoStrength: 0.40, wearLow: 0.30, wearHigh: 0.56,
                dirtAmount: 0.03, grainAmount: 4,
            }),

            nRub: U.normalMapFromHeight(hRub, 3.0),
            rRub: U.roughMapFromHeight(hRub, 0.88, 0.98, 1.0),
            cRub: U.colorMapFromHeight(hRub, [18, 20, 22], [42, 44, 46], {
                aoStrength: 0.65, wearLow: 0.25, wearHigh: 0.50,
                dirtAmount: 0.04, grainAmount: 10,
            }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图
    // ============================================================
    function getEnvMap() {
        return U.buildEnvMap({
            key: 'medkit_env',
            width:  IS_TOUCH_LOW ? 512 : 1024,
            height: IS_TOUCH_LOW ? 256 : 512,
            gradient: [
                [0.00, '#0e1218'], [0.30, '#233040'],
                [0.48, '#6b7f96'], [0.50, '#909fb2'],
                [0.52, '#404855'], [0.75, '#181c22'],
                [1.00, '#050607'],
            ],
            softboxes: [
                { ncx: 0.30, ncy: 0.18, nw: 0.20, nh: 0.15, rgb: '255,248,235', alpha: 1.00 },
                { ncx: 0.72, ncy: 0.24, nw: 0.15, nh: 0.13, rgb: '210,225,255', alpha: 0.85 },
                { ncx: 0.10, ncy: 0.42, nw: 0.09, nh: 0.08, rgb: '255,215,170', alpha: 0.65 },
                { ncx: 0.88, ncy: 0.55, nw: 0.10, nh: 0.09, rgb: '180,200,220', alpha: 0.55 },
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
            white: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff,
                map: tex.cWhite,
                metalness: 0.04,
                roughness: 0.62,
                roughnessMap: tex.rWhite,
                normalMap: tex.nWhite,
                normalScale: new THREE.Vector2(0.55, 0.55),
                clearcoat: 0.22, clearcoatRoughness: 0.55,
                envMapIntensity: 1.10,
            })),

            red: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff,
                map: tex.cRed,
                metalness: 0.05,
                roughness: 0.58,
                roughnessMap: tex.rRed,
                normalMap: tex.nRed,
                normalScale: new THREE.Vector2(0.45, 0.45),
                clearcoat: 0.30, clearcoatRoughness: 0.42,
                envMapIntensity: 1.15,
            })),

            metal: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff,
                map: tex.cMetal,
                metalness: 1.0,
                roughness: 0.30,
                roughnessMap: tex.rMetal,
                normalMap: tex.nMetal,
                normalScale: new THREE.Vector2(0.40, 0.40),
                clearcoat: 0.20, clearcoatRoughness: 0.30,
                envMapIntensity: 1.70,
            })),

            dark: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff,
                map: tex.cRub,
                metalness: 0.05,
                roughness: 0.92,
                roughnessMap: tex.rRub,
                normalMap: tex.nRub,
                normalScale: new THREE.Vector2(1.4, 1.4),
                clearcoat: 0.10, clearcoatRoughness: 0.88,
                envMapIntensity: 0.55,
            })),

            rubber: new THREE.MeshStandardMaterial(mk({
                color: 0x0a0a0c,
                metalness: 0.0,
                roughness: 0.95,
                normalMap: tex.nRub,
                normalScale: new THREE.Vector2(1.6, 1.6),
                envMapIntensity: 0.35,
            })),
        };
        return _mat;
    }

    // ============================================================
    // 构建医疗包（变薄版）
    // ============================================================
    function buildMedkitHD() {
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
        const W = 0.22;
        const H = 0.105;
        const D = 0.15;

        // 1. 主体
        part(U.roundedBoxZ(W, H, D, 0.014, 0.0016, 10, CURVE_SEG, BEVEL_SEG),
             MAT.white, 0, 0, 0);

        // 2. 接缝环
        part(U.roundedBoxZ(W + 0.0006, 0.006, D + 0.0006, 0.002, 0.0008, 10, 8, 2),
             MAT.dark, 0, H * 0.16, 0);

        // 3. 底部橡胶缓冲垫
        part(U.roundedBoxZ(W - 0.026, 0.005, D - 0.026, 0.004, 0.0008, 10, 6, 2),
             MAT.rubber, 0, -H / 2 + 0.004, 0);

        // 4. 顶部提手
        const HANDLE_R    = 0.038;
        const HANDLE_TUBE = 0.0052;
        const HANDLE_Y    = H / 2 + 0.001;

        part(new THREE.TorusGeometry(
                HANDLE_R, HANDLE_TUBE, 10,
                IS_TOUCH_LOW ? 20 : 28, Math.PI),
             MAT.dark, 0, HANDLE_Y, 0);

        for (const sx of [-1, 1]) {
            part(new THREE.CylinderGeometry(0.009, 0.011, 0.007, 16),
                 MAT.metal, sx * HANDLE_R, HANDLE_Y, 0);
        }

        // 5. 正/背面红十字
        const ARM_LONG  = 0.062;
        const ARM_SHORT = 0.020;
        const CROSS_T   = 0.0028;

        function addCross(zPos) {
            part(new THREE.BoxGeometry(ARM_SHORT, ARM_LONG, CROSS_T),
                 MAT.red, 0, 0, zPos);
            part(new THREE.BoxGeometry(ARM_LONG, ARM_SHORT, CROSS_T),
                 MAT.red, 0, 0, zPos);
        }
        addCross( D / 2 + 0.0010);
        addCross(-D / 2 - 0.0010);

        // 6. 侧面锁扣
        const claspGeo = U.roundedBoxZ(0.010, 0.020, 0.032, 0.003, 0.0008, 12, 6, 2);
        for (const sx of [-1, 1]) {
            part(claspGeo, MAT.metal,
                 sx * (W / 2 + 0.0016), H * 0.14, 0, 0, R, 0);

            part(new THREE.SphereGeometry(0.0030, 12, 8), MAT.metal,
                 sx * (W / 2 + 0.0035), H * 0.14 + 0.013, 0);
        }

        // 7. 侧面小口袋
        part(U.roundedBoxX(0.010, 0.030, 0.050, 0.003, 0.0008, 12, 6, 2),
             MAT.white, W / 2 - 0.001, -H * 0.10, 0);

        const tagGeo  = new THREE.BoxGeometry(0.0014, 0.014, 0.005);
        const tagGeo2 = new THREE.BoxGeometry(0.0014, 0.005, 0.014);
        for (const sx of [-1, 1]) {
            part(tagGeo,  MAT.red, sx * (W / 2 + 0.0055), -H * 0.10, 0);
            part(tagGeo2, MAT.red, sx * (W / 2 + 0.0055), -H * 0.10, 0);
        }

        // 8. 四角金属加固
        const cornerGeo = U.roundedBoxZ(0.024, 0.024, 0.012, 0.004, 0.001, 12, 6, 2);
        for (const sz of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sx of [-1, 1]) {
                    part(cornerGeo, MAT.dark,
                         sx * (W / 2 - 0.010),
                         sy * (H / 2 - 0.008),
                         sz * (D / 2 - 0.004));
                }
            }
        }

        // 9. 顶面小红标
        const topCrossGeo1 = new THREE.BoxGeometry(0.013, 0.0020, 0.004);
        const topCrossGeo2 = new THREE.BoxGeometry(0.004, 0.0020, 0.013);
        for (const sx of [-1, 1]) {
            part(topCrossGeo1, MAT.red, sx * 0.078, H / 2 + 0.0010, 0);
            part(topCrossGeo2, MAT.red, sx * 0.078, H / 2 + 0.0010, 0);
        }

        // 居中
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y, -center.z);

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

    function buildMedkitViewmodelHD() {
        const g = buildMedkitHD();

        const BASE_X = 0.30, BASE_Y = -0.26, BASE_Z = -0.42;
        const BASE_RX = 0.15, BASE_RY = -0.40, BASE_RZ = 0.10;

        g.position.set(BASE_X, BASE_Y, BASE_Z);
        g.rotation.set(BASE_RX, BASE_RY, BASE_RZ);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = new THREE.Euler(BASE_RX, BASE_RY, BASE_RZ);
        g.userData.adsPos  = g.userData.basePos.clone();
        g.userData.adsRot  = g.userData.baseRot.clone();

        g.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.frustumCulled = false;
            }
        });
        return g;
    }

    function preload(rendererArg) {
        const r = rendererArg || (typeof renderer !== 'undefined' ? renderer : null);
        if (!r) return;

        const tex = getTextures();
        const env = getEnvMap();

        const allTextures = [
            tex.nWhite, tex.rWhite, tex.cWhite,
            tex.nRed,   tex.rRed,   tex.cRed,
            tex.nMetal, tex.rMetal, tex.cMetal,
            tex.nRub,   tex.rRub,   tex.cRub,
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
        const usedMats = [M.white, M.red, M.metal, M.dark, M.rubber];

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
            vmDummy = buildMedkitViewmodelHD();
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

        console.log('[weapon_medkit_hd] preload 完成');
    }

    window.__HD_MEDKIT = {
        buildWorld:     buildMedkitHD,
        buildViewmodel: buildMedkitViewmodelHD,
        preload:        preload,
        _getTextures:   getTextures,
        _getEnvMap:     getEnvMap,
        _getMaterials:  getMaterials,
    };

    console.log('[weapon_medkit_hd] 高细节医疗包已注册（复用 HD_UTIL）');
})();