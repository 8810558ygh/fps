// ===== js/weapon_shotgun_hd.js – 高细节 PBR 霰弹枪模型（战术泵动 12GA） =====
// 依赖：js/weapon_hd_common.js（必须先加载）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const U = window.HD_UTIL;
    if (!U) {
        console.error('[weapon_shotgun_hd] 缺少 HD_UTIL，请确认 weapon_hd_common.js 已加载');
        return;
    }

    const IS_TOUCH_LOW = U.IS_TOUCH_LOW;
    const TEX_SIZE = IS_TOUCH_LOW ? 256 : 512;
    const SHOTGUN_SCALE = 0.78;

    // ============================================================
    // 高度图生成器
    // ============================================================
    function bluedSteelHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.75) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 38) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 4;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 0.6 + Math.random() * 1.6;
            const r2 = rad * rad;
            const v = (106 - Math.random() * 32) | 0;
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

        const n3 = S * 2;
        for (let i = 0; i < n3; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 2 + Math.random() * 5;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 30) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    const cur = d[idx];
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.round(cur * 0.6 + v * 0.4);
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function brushedBarrelHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        for (let y = 0; y < S; y++) {
            const rowC = y * S;
            let streak = 0;
            for (let x = 0; x < S; x++) {
                if (Math.random() < 0.05) streak = (Math.random() - 0.5) * 72;
                const v = Math.max(0, Math.min(255, (128 + streak + (Math.random() - 0.5) * 14) | 0));
                const idx = (rowC + x) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        for (let i = 0; i < S * 3.5; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 4 + Math.random() * 30;
            const ang = Math.random() * Math.PI * 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 90) | 0));
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

    function polymerStockHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.6) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 62) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 16;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 1 + Math.random() * 2.6;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 48) | 0;
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

        for (let i = 0; i < S * 2; i++) {
            let x = Math.random() * S;
            let y = Math.random() * S;
            const len = 6 + Math.random() * 30;
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

    function pumpGripHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.55) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 58) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const step = Math.max(10, S / 32);
        const lw = 2.2;
        for (let i = -S; i < S * 2; i += step) {
            for (let y = 0; y < S; y++) {
                const x = i + y * 0.12;
                const ir = Math.ceil(lw);
                for (let oy = -ir; oy <= ir; oy++) {
                    for (let ox = -ir; ox <= ir; ox++) {
                        if (ox * ox + oy * oy > lw * lw) continue;
                        const px = ((x + ox) | 0) & mask;
                        const py = ((y + oy) | 0) & mask;
                        const idx = (py * S + px) << 2;
                        const cur = d[idx];
                        const target = 180;
                        d[idx] = d[idx + 1] = d[idx + 2] = Math.round(cur + (target - cur) * 0.42);
                    }
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function rubberHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = U.newHeightData(S);
        const n = (S * S * 1.5) | 0;
        for (let i = 0; i < n; i++) {
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
        const hBlued  = bluedSteelHeight();
        const hBarrel = brushedBarrelHeight();
        const hStock  = polymerStockHeight();
        const hPump   = pumpGripHeight();
        const hRubber = rubberHeight();

        _tex = {
            nBlued:  U.normalMapFromHeight(hBlued,  1.5),
            nBarrel: U.normalMapFromHeight(hBarrel, 1.7),
            nStock:  U.normalMapFromHeight(hStock,  1.3),
            nPump:   U.normalMapFromHeight(hPump,   2.1),
            nRubber: U.normalMapFromHeight(hRubber, 3.2),

            rBlued:  U.roughMapFromHeight(hBlued,  0.26, 0.44, 1.0),
            rBarrel: U.roughMapFromHeight(hBarrel, 0.16, 0.34, 1.0),
            rStock:  U.roughMapFromHeight(hStock,  0.72, 0.90, 1.0),
            rPump:   U.roughMapFromHeight(hPump,   0.76, 0.92, 1.0),
            rRubber: U.roughMapFromHeight(hRubber, 0.90, 0.98, 1.0),

            cBlued: U.colorMapFromHeight(hBlued, [26, 29, 34], [88, 92, 100],
                { aoStrength: 0.45, wearLow: 0.32, wearHigh: 0.55, dirtAmount: 0.05, grainAmount: 7 }),
            cBarrel: U.colorMapFromHeight(hBarrel, [18, 22, 26], [78, 82, 90],
                { aoStrength: 0.40, wearLow: 0.28, wearHigh: 0.52, dirtAmount: 0.04, grainAmount: 6 }),
            cStock: U.colorMapFromHeight(hStock, [30, 34, 40], [72, 74, 80],
                { aoStrength: 0.55, wearLow: 0.30, wearHigh: 0.58, dirtAmount: 0.07, grainAmount: 4 }),
            cPump: U.colorMapFromHeight(hPump, [26, 30, 35], [70, 72, 78],
                { aoStrength: 0.60, wearLow: 0.36, wearHigh: 0.60, dirtAmount: 0.09, grainAmount: 5 }),
            cRubber: U.colorMapFromHeight(hRubber, [12, 14, 17], [48, 48, 50],
                { aoStrength: 0.65, wearLow: 0.25, wearHigh: 0.50, dirtAmount: 0.04, grainAmount: 10 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图（与 rifle 共用）
    // ============================================================
    function getEnvMap() {
        return U.buildEnvMap({
            key: 'rifle_env',
            width: 1024, height: 512,
            gradient: [
                [0.00, '#0e1218'], [0.30, '#233040'],
                [0.48, '#6b7f96'], [0.50, '#909fb2'],
                [0.52, '#404855'], [0.75, '#181c22'],
                [1.00, '#050607'],
            ],
            lights: [
                { cx: 500,  cy: 120, r: 500, rgb: '255,252,242', alpha: 1.0  },
                { cx: 1300, cy: 160, r: 420, rgb: '210,225,255', alpha: 0.85 },
                { cx: 1750, cy: 280, r: 320, rgb: '255,215,170', alpha: 0.7  },
                { cx: 300,  cy: 380, r: 380, rgb: '150,180,220', alpha: 0.5  },
                { cx: 1000, cy: 400, r: 300, rgb: '200,210,230', alpha: 0.35 },
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
            receiver: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cBlued,
                metalness: 1.0, roughness: 0.38,
                roughnessMap: tex.rBlued,
                normalMap: tex.nBlued,
                normalScale: new THREE.Vector2(0.55, 0.55),
                clearcoat: 0.32, clearcoatRoughness: 0.42,
                envMapIntensity: 1.50,
            })),
            barrel: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cBarrel,
                metalness: 1.0, roughness: 0.28,
                roughnessMap: tex.rBarrel,
                normalMap: tex.nBarrel,
                normalScale: new THREE.Vector2(0.48, 0.48),
                clearcoat: 0.24, clearcoatRoughness: 0.28,
                envMapIntensity: 1.70,
            })),
            bright: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cBlued,
                metalness: 1.0, roughness: 0.18,
                normalMap: tex.nBlued,
                normalScale: new THREE.Vector2(0.22, 0.22),
                envMapIntensity: 2.0,
            })),
            stock: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cStock,
                metalness: 0.04, roughness: 0.80,
                roughnessMap: tex.rStock,
                normalMap: tex.nStock,
                normalScale: new THREE.Vector2(0.90, 0.90),
                clearcoat: 0.12, clearcoatRoughness: 0.82,
                envMapIntensity: 1.0,
            })),
            pump: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cPump,
                metalness: 0.03, roughness: 0.88,
                roughnessMap: tex.rPump,
                normalMap: tex.nPump,
                normalScale: new THREE.Vector2(1.4, 1.4),
                clearcoat: 0.08, clearcoatRoughness: 0.90,
                envMapIntensity: 0.90,
            })),
            rubber: new THREE.MeshStandardMaterial(mk({
                color: 0xffffff, map: tex.cRubber,
                metalness: 0.0, roughness: 0.95,
                roughnessMap: tex.rRubber,
                normalMap: tex.nRubber,
                normalScale: new THREE.Vector2(1.6, 1.6),
                envMapIntensity: 0.35,
            })),
            slotInner: new THREE.MeshStandardMaterial(mk({
                color: 0x06070a, metalness: 0.55, roughness: 0.68,
                envMapIntensity: 0.35,
            })),
        };
        return _mat;
    }

    // ============================================================
    // 几何快捷方式
    // ============================================================
    const CURVE_SEG = IS_TOUCH_LOW ? 6 : 10;
    const BEVEL_SEG = IS_TOUCH_LOW ? 2 : 3;
    const boxX = (L, H, W, r, bevel, uvScale) =>
        U.roundedBoxX(L, H, W, r, bevel, uvScale || 18, CURVE_SEG, BEVEL_SEG);
    const boxZ = (W, H, D, r, bevel, uvScale) =>
        U.roundedBoxZ(W, H, D, r, bevel, uvScale || 18, CURVE_SEG, BEVEL_SEG);

    // ============================================================
    // 铭文贴图
    // ============================================================
    function makeRollMarkTexture(text, subText) {
        const W = 1024, H = 192;
        const c = U.makeCanvas(W, H);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        ctx.font = 'bold 72px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'rgba(150, 158, 168, 0.92)';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 30, 70);

        ctx.font = '32px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'rgba(120, 128, 138, 0.85)';
        ctx.fillText(subText, 30, 145);

        ctx.font = 'bold 38px "Courier New", monospace';
        ctx.fillStyle = 'rgba(140, 148, 158, 0.88)';
        ctx.fillText('SN 87' + String(Math.floor(Math.random() * 90000) + 10000), 720, 70);

        ctx.font = '28px "Courier New", monospace';
        ctx.fillStyle = 'rgba(110, 118, 128, 0.80)';
        ctx.fillText('12GA · 3" CHAMBER', 720, 145);

        const t = new THREE.CanvasTexture(c);
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
    }

    // ============================================================
    // 构建霰弹枪
    // ============================================================
    function buildShotgunHD() {
        const MAT = getMaterials();
        const gun = new THREE.Group();
        const inner = new THREE.Group();
        gun.add(inner);

        const SEG = IS_TOUCH_LOW ? 20 : 40;

        function part(geo, mat, x, y, z, rx, ry, rz, parent) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            m.rotation.set(rx || 0, ry || 0, rz || 0);
            m.castShadow = true; m.receiveShadow = true;
            (parent || inner).add(m);
            return m;
        }

        const R = Math.PI / 2;
        const Y_BARREL = 0.122;
        const Y_MAG    = 0.076;
        const Y_RECV   = 0.098;

        // -------- 1. 枪托 --------
        const stockGroup = new THREE.Group();
        stockGroup.position.set(-0.075, Y_RECV, 0);
        stockGroup.rotation.z = 0.15;
        inner.add(stockGroup);

        part(boxX(0.092, 0.062, 0.052, 0.016), MAT.stock,
            -0.030, 0.000, 0, 0, 0, 0, stockGroup);
        part(boxX(0.176, 0.075, 0.058, 0.016), MAT.stock,
            -0.152, -0.016, 0, 0, 0, 0, stockGroup);
        part(boxX(0.158, 0.0050, 0.0605, 0.0016), MAT.stock,
            -0.154, -0.055, 0, 0, 0, 0, stockGroup);
        part(boxX(0.148, 0.0050, 0.0605, 0.0016), MAT.stock,
            -0.154, 0.024, 0, 0, 0, 0, stockGroup);
        part(boxX(0.144, 0.024, 0.052, 0.008), MAT.stock,
            -0.154, 0.038, 0, 0, 0, 0, stockGroup);

        {
            const stripeGeo = new THREE.BoxGeometry(0.0028, 0.022, 0.053);
            const count = 4;
            const mesh = new THREE.InstancedMesh(stripeGeo, MAT.stock, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(-0.108 - i * 0.032, 0.038, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        part(boxX(0.032, 0.124, 0.058, 0.012), MAT.rubber,
            -0.252, -0.026, 0, 0, 0, 0, stockGroup);

        {
            const grooveGeo = new THREE.BoxGeometry(0.0040, 0.114, 0.059);
            const count = 5;
            const mesh = new THREE.InstancedMesh(grooveGeo, MAT.rubber, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(-0.263 + i * 0.0055, -0.026, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        {
            const holeGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.030, 8);
            const count = 6;
            const mesh = new THREE.InstancedMesh(holeGeo, MAT.slotInner, count);
            mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R, 0, 0));
            const s = new THREE.Vector3(1, 1, 1);
            const p = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                const row = Math.floor(i / 3);
                const col = i % 3;
                p.set(-0.252, -0.026 + 0.014 + row * 0.014, -0.018 + col * 0.018);
                m4.compose(p, q, s);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        part(new THREE.TorusGeometry(0.0095, 0.0021, 8, IS_TOUCH_LOW ? 14 : 20), MAT.bright,
            -0.202, -0.052, 0, 0, R, 0, stockGroup);

        part(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0034, 16), MAT.bright,
            -0.268, -0.026, 0, R, 0, 0, stockGroup);
        part(new THREE.BoxGeometry(0.0010, 0.0072, 0.0012), MAT.slotInner,
            -0.2700, -0.026, 0, 0, 0, 0, stockGroup);

        // -------- 2. 机匣 --------
        part(boxX(0.155, 0.072, 0.058, 0.010), MAT.receiver, 0, Y_RECV, 0);
        part(boxX(0.150, 0.010, 0.036, 0.003), MAT.receiver, 0, Y_RECV + 0.040, 0);

        part(boxX(0.060, 0.036, 0.004, 0.002), MAT.slotInner,
            0.008, Y_RECV + 0.006, 0.0285);
        part(boxX(0.058, 0.034, 0.003, 0.002), MAT.receiver,
            0.008, Y_RECV + 0.006, 0.0292);
        part(new THREE.BoxGeometry(0.062, 0.0022, 0.004), MAT.receiver,
            0.008, Y_RECV - 0.014, 0.0295);

        part(new THREE.CylinderGeometry(0.0125, 0.0125, 0.020, SEG, 1, false),
            MAT.receiver, -0.086, Y_RECV + 0.006, 0, 0, 0, R);
        for (let i = 0; i < 6; i++) {
            part(new THREE.TorusGeometry(0.0128, 0.0008, 6, 20), MAT.receiver,
                -0.094 + i * 0.0028, Y_RECV + 0.006, 0, 0, R, 0);
        }

        part(boxX(0.018, 0.006, 0.003, 0.0008), MAT.bright,
            0.030, Y_RECV + 0.006, 0.0292);

        part(boxX(0.084, 0.0040, 0.0008, 0.0006), MAT.slotInner,
            -0.020, Y_RECV + 0.018, 0.0292);
        part(boxX(0.084, 0.0040, 0.0008, 0.0006), MAT.slotInner,
            -0.020, Y_RECV - 0.012, 0.0292);
        part(boxX(0.084, 0.0040, 0.0008, 0.0006), MAT.slotInner,
            -0.020, Y_RECV + 0.018, -0.0292);
        part(boxX(0.084, 0.0040, 0.0008, 0.0006), MAT.slotInner,
            -0.020, Y_RECV - 0.012, -0.0292);

        for (let i = 0; i < 5; i++) {
            part(new THREE.BoxGeometry(0.0028, 0.016, 0.0016), MAT.slotInner,
                -0.070 + i * 0.0055, Y_RECV - 0.016, 0.0291);
        }

        part(new THREE.CylinderGeometry(0.0055, 0.0055, 0.009, 16), MAT.bright,
            -0.044, Y_RECV - 0.018, 0.0292, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.064, 12), MAT.bright,
            -0.044, Y_RECV - 0.018, 0, R, 0, 0);
        for (let i = 0; i < 3; i++) {
            part(new THREE.BoxGeometry(0.007, 0.0020, 0.0012), MAT.slotInner,
                -0.044, Y_RECV - 0.026 + i * 0.005, 0.0295);
        }

        part(new THREE.CylinderGeometry(0.0040, 0.0040, 0.062, 16), MAT.bright,
            -0.057, Y_RECV + 0.008, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0040, 0.0040, 0.062, 16), MAT.bright,
            0.050, Y_RECV + 0.008, 0, R, 0, 0);

        const rollMarkTex = makeRollMarkTexture('TACTICAL PUMP', 'SEMI-AUTO / PUMP ACTION');
        const rollMarkMat = new THREE.MeshStandardMaterial({
            map: rollMarkTex,
            transparent: true,
            metalness: 0.85,
            roughness: 0.42,
            envMapIntensity: 1.3,
            depthWrite: false,
        });
        const rollMarkGeo = new THREE.PlaneGeometry(0.106, 0.022);
        const rollMarkMesh = new THREE.Mesh(rollMarkGeo, rollMarkMat);
        rollMarkMesh.position.set(-0.005, Y_RECV + 0.016, 0.02935);
        inner.add(rollMarkMesh);

        // -------- 3. 扳机组 --------
        part(new THREE.TorusGeometry(0.030, 0.0042, 8, IS_TOUCH_LOW ? 18 : 26, Math.PI),
            MAT.receiver, -0.054, Y_RECV - 0.036, 0, 0, 0, Math.PI);
        part(boxX(0.0055, 0.028, 0.010, 0.002), MAT.receiver,
            -0.024, Y_RECV - 0.050, 0);
        part(boxX(0.0085, 0.026, 0.011, 0.0028), MAT.bright,
            -0.054, Y_RECV - 0.052, 0, 0, 0, 0.20);
        part(new THREE.CylinderGeometry(0.0018, 0.0018, 0.020, 8), MAT.bright,
            -0.054, Y_RECV - 0.068, 0, 0, 0, 0.20);
        part(boxX(0.016, 0.020, 0.032, 0.003), MAT.receiver,
            -0.054, Y_RECV - 0.076, 0);

        // -------- 4. 枪管 + 弹仓管 --------
        part(new THREE.CylinderGeometry(0.0132, 0.0142, 0.470, SEG, 1, false), MAT.barrel,
            0.310, Y_BARREL, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0180, 0.0155, 0.028, SEG, 1, false), MAT.barrel,
            0.084, Y_BARREL, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0112, 0.0122, 0.355, SEG, 1, false), MAT.barrel,
            0.2525, Y_MAG, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0148, 0.0148, 0.020, SEG, 1, false), MAT.barrel,
            0.084, Y_MAG, 0, 0, 0, R);

        part(new THREE.CylinderGeometry(0.0130, 0.0130, 0.018, SEG, 1, false), MAT.bright,
            0.428, Y_MAG, 0, 0, 0, R);

        {
            const knurlGeo = new THREE.BoxGeometry(0.016, 0.0036, 0.0020);
            const count = 12;
            const mesh = new THREE.InstancedMesh(knurlGeo, MAT.bright, count);
            mesh.castShadow = true;
            const m4 = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3(1, 1, 1);
            const p = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2;
                p.set(0.428, Y_MAG + Math.cos(a) * 0.0130, Math.sin(a) * 0.0130);
                q.setFromEuler(new THREE.Euler(-a, 0, 0));
                m4.compose(p, q, s);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        part(new THREE.CylinderGeometry(0.0106, 0.0106, 0.0018, 20), MAT.slotInner,
            0.4372, Y_MAG, 0, 0, 0, R);

        part(new THREE.BoxGeometry(0.400, 0.0040, 0.0085), MAT.barrel,
            0.310, Y_BARREL + 0.0162, 0);

        {
            const gapGeo = new THREE.BoxGeometry(0.0028, 0.0052, 0.0090);
            const count = 12;
            const mesh = new THREE.InstancedMesh(gapGeo, MAT.slotInner, count);
            mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(0.130 + i * 0.030, Y_BARREL + 0.0162, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        part(boxX(0.016, 0.072, 0.032, 0.004), MAT.barrel,
            0.415, (Y_BARREL + Y_MAG) / 2, 0);

        // -------- 5. 准星（带护翼） --------
        part(new THREE.BoxGeometry(0.018, 0.010, 0.009), MAT.barrel,
            0.510, Y_BARREL + 0.0200, 0);
        part(new THREE.SphereGeometry(0.0048, 20, 14), MAT.bright,
            0.510, Y_BARREL + 0.0275, 0);
        part(new THREE.BoxGeometry(0.009, 0.018, 0.0020), MAT.barrel,
            0.510, Y_BARREL + 0.0270, 0.0065);
        part(new THREE.BoxGeometry(0.009, 0.018, 0.0020), MAT.barrel,
            0.510, Y_BARREL + 0.0270, -0.0065);

        // -------- 6. 泵动前护木 --------
        const pumpGroup = new THREE.Group();
        pumpGroup.position.set(0.172, Y_MAG, 0);
        inner.add(pumpGroup);

        const pumpGeo = new THREE.CylinderGeometry(0.0312, 0.0300, 0.120, 8, 1, false, Math.PI / 8);
        pumpGeo.rotateZ(R);
        U.scaleGeometryUV(pumpGeo, 2.5, 3.5);
        part(pumpGeo, MAT.pump, 0, 0, 0, 0, 0, 0, pumpGroup);

        part(new THREE.CylinderGeometry(0.0315, 0.0315, 0.006, 8, 1, false, Math.PI / 8),
            MAT.barrel, 0.058, 0, 0, 0, 0, R, pumpGroup);
        part(new THREE.CylinderGeometry(0.0315, 0.0315, 0.006, 8, 1, false, Math.PI / 8),
            MAT.barrel, -0.058, 0, 0, 0, 0, R, pumpGroup);

        part(new THREE.CylinderGeometry(0.0320, 0.0320, 0.007, 8, 1, false, Math.PI / 8),
            MAT.pump, -0.064, 0, 0, 0, 0, R, pumpGroup);
        part(new THREE.CylinderGeometry(0.0320, 0.0320, 0.007, 8, 1, false, Math.PI / 8),
            MAT.pump, 0.064, 0, 0, 0, 0, R, pumpGroup);

        {
            const ribGeo = new THREE.TorusGeometry(0.0323, 0.0016, 6, IS_TOUCH_LOW ? 16 : 24);
            const count = 7;
            const mesh = new THREE.InstancedMesh(ribGeo, MAT.pump, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R, 0));
            const s = new THREE.Vector3(1, 1, 1);
            const p = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                p.set(-0.048 + i * 0.016, 0, 0);
                m4.compose(p, q, s);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            pumpGroup.add(mesh);
        }

        part(boxX(0.095, 0.012, 0.036, 0.004), MAT.pump,
            0, -0.030, 0, 0, 0, 0, pumpGroup);

        // -------- 7. 鬼环照门 --------
        part(boxX(0.034, 0.012, 0.030, 0.003), MAT.receiver,
            -0.077, Y_RECV + 0.042, 0);
        part(new THREE.TorusGeometry(0.0078, 0.0015, 8, IS_TOUCH_LOW ? 16 : 24), MAT.bright,
            -0.077, Y_RECV + 0.062, 0);
        part(new THREE.BoxGeometry(0.005, 0.020, 0.0035), MAT.receiver,
            -0.077, Y_RECV + 0.054, 0.007);
        part(new THREE.BoxGeometry(0.005, 0.020, 0.0035), MAT.receiver,
            -0.077, Y_RECV + 0.054, -0.007);

        part(new THREE.CylinderGeometry(0.0040, 0.0040, 0.009, 16), MAT.bright,
            -0.077, Y_RECV + 0.054, 0.016, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0040, 0.0040, 0.009, 16), MAT.bright,
            -0.077, Y_RECV + 0.074, 0, 0, 0, 0);

        // -------- 8. 前部背带环 --------
        part(new THREE.TorusGeometry(0.0095, 0.0021, 8, IS_TOUCH_LOW ? 16 : 20), MAT.bright,
            0.440, Y_MAG - 0.012, 0, 0, 0, R);

        // -------- 枪口锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(0.548, Y_BARREL, 0);
        inner.add(muzzlePoint);

        // -------- 居中 --------
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y * 0.85, -center.z * 0.15);

        // -------- 整体缩放 + 旋转 --------
        gun.scale.setScalar(SHOTGUN_SCALE);
        gun.rotation.y = Math.PI / 2;

        gun.userData.muzzlePoint = muzzlePoint;

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
    function buildShotgunViewmodelHD() {
        const g = buildShotgunHD();

        const BASE_X = 0.30, BASE_Y = -0.22, BASE_Z = -0.50;
        const BASE_RZ = 0.02;
        const ADS_X = 0.0, ADS_Y = -0.115, ADS_Z = -0.34;

        const baseRot = new THREE.Euler(0, Math.PI / 2, BASE_RZ);
        const adsRot  = new THREE.Euler(0, Math.PI / 2, 0);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = baseRot.clone();
        g.userData.adsPos  = new THREE.Vector3(ADS_X, ADS_Y, ADS_Z);
        g.userData.adsRot  = adsRot.clone();

        g.position.copy(g.userData.basePos);
        g.rotation.copy(g.userData.baseRot);

        g.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.frustumCulled = false;
            }
        });
        return g;
    }

    window.__HD_SHOTGUN = {
        buildWorld:     buildShotgunHD,
        buildViewmodel: buildShotgunViewmodelHD,
        preload: function () { getMaterials(); getEnvMap(); },
    };

    console.log('[weapon_shotgun_hd] 高细节霰弹枪已注册（复用 HD_UTIL）');
})();