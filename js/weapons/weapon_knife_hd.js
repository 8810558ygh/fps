// ===== js/weapon_knife_hd.js – 高细节 PBR 战术匕首模型 =====
// 依赖：js/weapon_hd_common.js（必须先加载）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const U = window.HD_UTIL;
    if (!U) {
        console.error('[weapon_knife_hd] 缺少 HD_UTIL，请确认 weapon_hd_common.js 已加载');
        return;
    }

    const IS_TOUCH_LOW = U.IS_TOUCH_LOW;
    const TEX = IS_TOUCH_LOW ? 256 : 512;

    // ============================================================
    // 高度图生成器
    // ============================================================
    function bladeHeight() {
        const S = TEX;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        for (let y = 0; y < S; y++) {
            const rowC = y * S;
            let streak = 0;
            for (let x = 0; x < S; x++) {
                if (Math.random() < 0.05) streak = (Math.random() - 0.5) * 22;
                const v = Math.max(0, Math.min(255, (128 + streak + (Math.random() - 0.5) * 4) | 0));
                const idx = (rowC + x) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        for (let i = 0; i < S * 0.35; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 3 + Math.random() * 8;
            const ang = (Math.random() - 0.5) * 0.2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 35) | 0));
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

    function polishSteelHeight() {
        const S = TEX;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.8) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 36) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 3;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 0.5 + Math.random() * 1.4;
            const r2 = rad * rad;
            const v = 110 - Math.random() * 25;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.max(0, v | 0);
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function leatherHeight() {
        const S = TEX;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.9) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 62) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 8;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 2 + Math.random() * 6;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 55) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    const cur = d[idx];
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.round(cur * 0.55 + v * 0.45);
                }
            }
        }

        for (let x = 0; x < S; x++) {
            for (let y = 0; y < S; y++) {
                if (Math.random() < 0.03) {
                    const idx = (y * S + x) << 2;
                    const v = Math.max(0, Math.min(255, (d[idx] + (Math.random() - 0.5) * 40) | 0));
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

        const hBlade   = bladeHeight();
        const hSteel   = polishSteelHeight();
        const hLeather = leatherHeight();

        _tex = {
            nBlade:   U.normalMapFromHeight(hBlade,   0.6),
            nSteel:   U.normalMapFromHeight(hSteel,   1.1),
            nLeather: U.normalMapFromHeight(hLeather, 1.9),

            rBlade:   U.roughMapFromHeight(hBlade,   0.03, 0.09, 1.0),
            rSteel:   U.roughMapFromHeight(hSteel,   0.10, 0.24, 1.0),
            rLeather: U.roughMapFromHeight(hLeather, 0.68, 0.88, 1.0),

            cBlade:   U.colorMapFromHeight(hBlade,   [225, 230, 238], [252, 254, 255],
                { aoStrength: 0.20, wearLow: 0.26, wearHigh: 0.60, dirtAmount: 0.012, grainAmount: 2 }),
            cSteel:   U.colorMapFromHeight(hSteel,   [180, 186, 194], [230, 234, 240],
                { aoStrength: 0.26, wearLow: 0.30, wearHigh: 0.58, dirtAmount: 0.02,  grainAmount: 3 }),
            cLeather: U.colorMapFromHeight(hLeather, [28, 22, 18],    [78, 64, 52],
                { aoStrength: 0.55, wearLow: 0.30, wearHigh: 0.55, dirtAmount: 0.08,  grainAmount: 6 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图（knife 用专属的高对比 env）
    // ============================================================
    function getEnvMap() {
        return U.buildEnvMap({
            key: 'knife_env',
            width: IS_TOUCH_LOW ? 2048 : 4096,
            gradient: [
                [0.00, '#05070a'], [0.20, '#0c1016'],
                [0.38, '#28323e'], [0.46, '#5a6a80'],
                [0.50, '#8794a8'], [0.54, '#3a4454'],
                [0.65, '#181c24'], [0.85, '#080a0d'],
                [1.00, '#030405'],
            ],
            softboxes: [
                { ncx: 1400/4096, ncy: 260/2048,  nw: 1700/4096, nh: 420/2048,  rgb: '255,248,235', alpha: 1.0  },
                { ncx: 2950/4096, ncy: 340/2048,  nw: 1050/4096, nh: 300/2048,  rgb: '220,232,255', alpha: 0.92 },
                { ncx: 340/4096,  ncy: 720/2048,  nw: 480/4096,  nh: 210/2048,  rgb: '200,216,255', alpha: 0.72 },
                { ncx: 3740/4096, ncy: 840/2048,  nw: 620/4096,  nh: 230/2048,  rgb: '255,215,170', alpha: 0.78 },
                { ncx: 2000/4096, ncy: 470/2048,  nw: 380/4096,  nh: 65/2048,   rgb: '255,242,225', alpha: 0.65 },
                { ncx: 2200/4096, ncy: 180/2048,  nw: 700/4096,  nh: 140/2048,  rgb: '245,250,255', alpha: 0.75 },
            ],
            bottomGradient: {
                startY: 0.55,
                from: 'rgba(16, 20, 26, 0.55)',
                to:   'rgba(3, 4, 6, 0.95)',
            },
        });
    }

    // ============================================================
    // 材质
    // ============================================================
    let _mat = null;
    function getMaterials() {
        if (_mat) return _mat;
        const tex = getTextures();
        const env = getEnvMap();
        const mk = (base) => { if (env) base.envMap = env; return base; };

        _mat = {
            blade: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cBlade,
                metalness: 1.0, roughness: 0.045,
                roughnessMap: tex.rBlade,
                normalMap: tex.nBlade,
                normalScale: new THREE.Vector2(0.14, 0.14),
                envMapIntensity: 3.2,
                reflectivity: 1.0,
            })),
            steel: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cSteel,
                metalness: 1.0, roughness: 0.14,
                roughnessMap: tex.rSteel,
                normalMap: tex.nSteel,
                normalScale: new THREE.Vector2(0.22, 0.22),
                envMapIntensity: 2.5,
            })),
            leather: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cLeather,
                metalness: 0.02, roughness: 0.80,
                roughnessMap: tex.rLeather,
                normalMap: tex.nLeather,
                normalScale: new THREE.Vector2(1.6, 1.6),
                clearcoat: 0.16, clearcoatRoughness: 0.78,
                envMapIntensity: 0.85,
            })),
            slotInner: new THREE.MeshStandardMaterial(mk({
                color: 0x252a32, metalness: 0.85, roughness: 0.35,
                envMapIntensity: 1.2,
            })),
        };
        return _mat;
    }

    // ============================================================
    // 几何工具
    // ============================================================
    const CURVE_SEG = IS_TOUCH_LOW ? 8 : 14;
    const BEVEL_SEG = IS_TOUCH_LOW ? 2 : 3;

    function roundedBoxZ(w, h, d, r, bevel, uvScale) {
        return U.roundedBoxZ(w, h, d, r, bevel || 0.0012, uvScale || 22, CURVE_SEG, BEVEL_SEG);
    }

    function roundedBoxX(L, H, W, r, bevel, uvScale) {
        return U.roundedBoxX(L, H, W, r, bevel || 0.0012, uvScale || 22, CURVE_SEG, BEVEL_SEG);
    }

    // ============================================================
    // 刀身几何（+X 方向）
    // ============================================================
    const BLADE_X_OFFSET = -0.038;
    const BLADE_LEN      =  0.233;
    const BLADE_MAX_W    =  0.0150;
    const BLADE_MAX_T    =  0.0052;

    function buildDaggerGeometry() {
        const SEG_X    = IS_TOUCH_LOW ? 64 : 96;
        const N_HALF   = IS_TOUCH_LOW ? 8  : 12;
        const GRIND_POW = 1.10;

        const PTS = [];
        for (let i = 0; i <= N_HALF; i++) {
            const t = i / N_HALF;
            const y = Math.cos(t * Math.PI);
            const z = Math.pow(1 - Math.abs(y), GRIND_POW);
            PTS.push([y, z]);
        }
        for (let i = N_HALF - 1; i >= 1; i--) {
            const t = i / N_HALF;
            const y = Math.cos(t * Math.PI);
            const z = -Math.pow(1 - Math.abs(y), GRIND_POW);
            PTS.push([y, z]);
        }
        const N_SECTION = PTS.length;

        const halfW = (t) => {
            let v;
            if (t < 0.45) {
                v = BLADE_MAX_W * (1 + 0.020 * Math.sin(t * Math.PI));
            } else {
                const u = (t - 0.45) / 0.55;
                v = BLADE_MAX_W * Math.pow(1 - u, 0.50);
            }
            return Math.max(v, 0.00028);
        };

        const halfT = (t) => {
            let v;
            if (t < 0.55) {
                v = BLADE_MAX_T * (1 - t * 0.16);
            } else {
                const u = (t - 0.55) / 0.45;
                v = BLADE_MAX_T * 0.91 * Math.pow(1 - u, 0.65);
            }
            return Math.max(v, 0.00006);
        };

        const positions = [];
        const indices = [];

        for (let i = 0; i <= SEG_X; i++) {
            const t = i / SEG_X;
            const x = t * BLADE_LEN + BLADE_X_OFFSET;
            const hw = halfW(t);
            const ht = halfT(t);
            for (let k = 0; k < N_SECTION; k++) {
                positions.push(x, PTS[k][0] * hw, PTS[k][1] * ht);
            }
        }

        for (let i = 0; i < SEG_X; i++) {
            for (let j = 0; j < N_SECTION; j++) {
                const jn = (j + 1) % N_SECTION;
                const a = i * N_SECTION + j;
                const b = i * N_SECTION + jn;
                const c = (i + 1) * N_SECTION + jn;
                const d = (i + 1) * N_SECTION + j;
                indices.push(a, d, c);
                indices.push(a, c, b);
            }
        }

        const rootCenter = positions.length / 3;
        positions.push(BLADE_X_OFFSET, 0, 0);
        for (let j = 0; j < N_SECTION; j++) {
            const jn = (j + 1) % N_SECTION;
            indices.push(rootCenter, j, jn);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        {
            const pos = geo.attributes.position;
            const nor = geo.attributes.normal;
            let sum = 0;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                const z = pos.getZ(i);
                if (Math.abs(y) + Math.abs(z) < 0.0004) continue;
                sum += nor.getY(i) * y + nor.getZ(i) * z;
            }
            if (sum < 0) {
                const arr = geo.index.array;
                for (let i = 0; i < arr.length; i += 3) {
                    const tmp = arr[i]; arr[i] = arr[i + 2]; arr[i + 2] = tmp;
                }
                geo.index.needsUpdate = true;
                geo.computeVertexNormals();
            }
        }

        U.applyTriplanarUV(geo, 30);
        return geo;
    }

    // ============================================================
    // 构建整刀
    // ============================================================
    function buildKnifeHD() {
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

        // -------- 1. 刀身 --------
        part(buildDaggerGeometry(), MAT.blade, 0, 0, 0);

        // -------- 2. 护手 --------
        const GUARD_THICK = 0.006;
        const GUARD_RY    = 0.048;
        const GUARD_RZ    = 0.018;
        const GUARD_X     = -0.036;

        const gShape = new THREE.Shape();
        gShape.absellipse(0, 0, GUARD_RZ, GUARD_RY, 0, Math.PI * 2, false, 0);

        const gGeo = new THREE.ExtrudeGeometry(gShape, {
            depth: GUARD_THICK,
            bevelEnabled: true,
            bevelThickness: 0.0016, bevelSize: 0.0016,
            bevelSegments: 2,
            curveSegments: IS_TOUCH_LOW ? 24 : 48,
        });
        gGeo.rotateY(Math.PI / 2);
        gGeo.translate(-GUARD_THICK / 2, 0, 0);
        gGeo.computeVertexNormals();
        U.applyTriplanarUV(gGeo, 22);

        part(gGeo, MAT.steel, GUARD_X, 0, 0);

        // -------- 3. 皮革缠绕柄 --------
        const HANDLE_X0 = -0.160;
        const HANDLE_X1 = -0.045;
        const HANDLE_L  = HANDLE_X1 - HANDLE_X0;
        const HANDLE_CX = (HANDLE_X0 + HANDLE_X1) / 2;

        part(roundedBoxX(HANDLE_L + 0.006, 0.024, 0.020, 0.008), MAT.steel,
             HANDLE_CX, 0, 0);
        part(roundedBoxX(HANDLE_L, 0.029, 0.024, 0.010), MAT.leather,
             HANDLE_CX, 0, 0);
        part(new THREE.SphereGeometry(0.0155, 20, 14), MAT.leather,
             HANDLE_X0 - 0.002, 0, 0);

        {
            const WRAP_COUNT = 16;
            const spacing = HANDLE_L / WRAP_COUNT;
            for (let i = 0; i < WRAP_COUNT; i++) {
                const x = HANDLE_X0 + spacing * (i + 0.5);
                const mesh = part(roundedBoxX(0.0052, 0.0300, 0.0252, 0.0112),
                                  MAT.leather, x, 0, 0);
                mesh.rotation.y = 0.055;
            }
        }

        part(new THREE.TorusGeometry(0.0125, 0.0016, 8, 22), MAT.leather,
             HANDLE_X0 + 0.004, 0, 0, 0, R, 0);
        part(new THREE.TorusGeometry(0.0125, 0.0016, 8, 22), MAT.leather,
             HANDLE_X1 - 0.004, 0, 0, 0, R, 0);

        // -------- 4. 尾盖 --------
        part(new THREE.CylinderGeometry(0.0155, 0.0155, 0.006, 32), MAT.steel,
             -0.155, 0, 0, 0, 0, R);
        part(new THREE.SphereGeometry(0.0178, 48, 32), MAT.steel,
             -0.165, 0, 0);

        // -------- 5. 锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(BLADE_X_OFFSET + BLADE_LEN, 0, 0);
        inner.add(muzzlePoint);

        const bladeTip = new THREE.Object3D();
        bladeTip.name = 'bladeTip';
        bladeTip.position.set(BLADE_X_OFFSET + BLADE_LEN, 0, 0);
        inner.add(bladeTip);

        const attackPoint = new THREE.Object3D();
        attackPoint.name = 'attackPoint';
        attackPoint.position.set(GUARD_X, 0, 0);
        inner.add(attackPoint);

        // -------- 居中 --------
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y, -center.z);

        // -------- 整体旋转：+X → -Z --------
        gun.rotation.y = Math.PI / 2;

        gun.userData.muzzlePoint = muzzlePoint;
        gun.userData.bladeTip    = bladeTip;
        gun.userData.attackPoint = attackPoint;

        gun.userData.basePos = new THREE.Vector3(0, 0, 0);
        gun.userData.baseRot = new THREE.Euler(0, Math.PI / 2, 0);
        gun.userData.adsPos  = gun.userData.basePos.clone();
        gun.userData.adsRot  = gun.userData.baseRot.clone();

        gun.updateMatrixWorld(true);
        return gun;
    }

    // ============================================================
    // 第一人称视图模型
    // ============================================================
    function buildKnifeViewmodelHD() {
        const g = buildKnifeHD();

        const BASE_X = 0.26;
        const BASE_Y = -0.22;
        const BASE_Z = -0.42;
        const BASE_RY = Math.PI / 2;
        const BASE_RZ = 0.10;

        g.position.set(BASE_X, BASE_Y, BASE_Z);
        g.rotation.set(0, BASE_RY, BASE_RZ);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = new THREE.Euler(0, BASE_RY, BASE_RZ);
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

    window.__HD_KNIFE = {
        buildWorld:     buildKnifeHD,
        buildViewmodel: buildKnifeViewmodelHD,
        preload: function () { getMaterials(); getEnvMap(); },
    };

    console.log('[weapon_knife_hd] 高细节战术匕首已注册（复用 HD_UTIL）');
})();