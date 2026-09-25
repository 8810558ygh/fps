// ===== js/weapon_odin_hd.js – 高细节 PBR 轻机枪模型（M249 SAW 风格）=====
// 使用方式：
//   1. 本文件必须在 player_model.js 之前加载
//   2. player_model.js 里的 makeWeaponModel / makeViewmodel 需加早返回
//
// 仅覆盖 'odin'，其他武器不受影响。
//
// ★ 本次修正：
//   · 镜筒主体改空心管（openEnded = true），去掉前后端盖
//   · 前端环 / 后端环改用 Torus 环形，中间通孔，开镜能看穿
//   · 前镜片前移到 +0.0485，镀膜 / 红点同步，避免与端环 z-fighting
//   · scopeCenter 锚点同步到新镜片位置
//   · 视图模型 BASE_Z 从 -0.42 → -0.72（枪身缩进画面，能看到扳机 / 枪托）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);
    const TEX_SIZE = IS_TOUCH_LOW ? 256 : 512;
    const SEG = IS_TOUCH_LOW ? 20 : 40;
    const CURVE_SEG = IS_TOUCH_LOW ? 6 : 10;
    const BEVEL_SEG = IS_TOUCH_LOW ? 2 : 3;

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h || w;
        return c;
    }

    function newHeightData(S) {
        const c = makeCanvas(S);
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = d[i + 1] = d[i + 2] = 128;
            d[i + 3] = 255;
        }
        return { c, ctx, img, d };
    }

    function normalMapFromHeight(hCanvas, strength) {
        const S = hCanvas.width;
        const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = makeCanvas(S);
        const octx = out.getContext('2d');
        const dst = octx.createImageData(S, S);
        const d = dst.data;
        const mask = S - 1;

        for (let y = 0; y < S; y++) {
            const rowC = y * S;
            const rowU = ((y - 1) & mask) * S;
            const rowD = ((y + 1) & mask) * S;
            for (let x = 0; x < S; x++) {
                const xL = (x - 1) & mask;
                const xR = (x + 1) & mask;
                const dx = (src[(rowC + xR) * 4] - src[(rowC + xL) * 4]) / 255 * strength;
                const dy = (src[(rowD + x) * 4] - src[(rowU + x) * 4]) / 255 * strength;
                const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
                const i = (rowC + x) * 4;
                d[i]     = ((-dx * invLen) * 0.5 + 0.5) * 255;
                d[i + 1] = ((-dy * invLen) * 0.5 + 0.5) * 255;
                d[i + 2] = ((     invLen) * 0.5 + 0.5) * 255;
                d[i + 3] = 255;
            }
        }
        octx.putImageData(dst, 0, 0);
        const t = new THREE.CanvasTexture(out);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
    }

    function roughMapFromHeight(hCanvas, low, high, contrast) {
        contrast = contrast || 1.0;
        const S = hCanvas.width;
        const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = makeCanvas(S);
        const octx = out.getContext('2d');
        const dst = octx.createImageData(S, S);
        const d = dst.data;
        const range = high - low;
        for (let i = 0; i < src.length; i += 4) {
            let v = src[i] / 255;
            v = Math.pow(v, contrast);
            v = low + v * range;
            const g = Math.max(0, Math.min(255, v * 255)) | 0;
            d[i] = d[i + 1] = d[i + 2] = g;
            d[i + 3] = 255;
        }
        octx.putImageData(dst, 0, 0);
        const t = new THREE.CanvasTexture(out);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
    }

    function colorMapFromHeight(hCanvas, baseRGB, wornRGB, opts) {
        opts = opts || {};
        const S = hCanvas.width;
        const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = makeCanvas(S);
        const octx = out.getContext('2d');
        const dst = octx.createImageData(S, S);
        const d = dst.data;
        const mask = S - 1;

        const aoStrength   = opts.aoStrength   !== undefined ? opts.aoStrength   : 0.35;
        const wearLow      = opts.wearLow      !== undefined ? opts.wearLow      : 0.32;
        const wearHigh     = opts.wearHigh     !== undefined ? opts.wearHigh     : 0.55;
        const dirtAmount   = opts.dirtAmount   !== undefined ? opts.dirtAmount   : 0.06;
        const grainAmount  = opts.grainAmount  !== undefined ? opts.grainAmount  : 6;
        const wearBoost    = opts.wearBoost    !== undefined ? opts.wearBoost    : 1.0;

        const at = (x, y) => src[(((y & mask) * S + (x & mask)) << 2)] / 255;

        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const h = at(x, y);

                let sum = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        sum += at(x + dx, y + dy);
                const avg = sum / 9;
                const ao = 1 - Math.max(0, avg - h) * aoStrength * 4.5;

                let w = 0;
                if (h < wearLow) w = 1;
                else if (h < wearHigh) w = (wearHigh - h) / (wearHigh - wearLow);
                w *= wearBoost;

                const dr = baseRGB[0] * (1 - w) + wornRGB[0] * w;
                const dg = baseRGB[1] * (1 - w) + wornRGB[1] * w;
                const db = baseRGB[2] * (1 - w) + wornRGB[2] * w;

                const dirt = (Math.random() - 0.5) * dirtAmount * 80;
                const grain = (Math.random() - 0.5) * grainAmount;

                const i = (y * S + x) << 2;
                d[i]     = Math.max(0, Math.min(255, dr * ao + dirt + grain));
                d[i + 1] = Math.max(0, Math.min(255, dg * ao + dirt + grain));
                d[i + 2] = Math.max(0, Math.min(255, db * ao + dirt + grain));
                d[i + 3] = 255;
            }
        }
        octx.putImageData(dst, 0, 0);
        const t = new THREE.CanvasTexture(out);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
    }

    // ============================================================
    // 高度图生成器
    // ============================================================
    function phosphatedSteelHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.85) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 52) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 8;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 0.8 + Math.random() * 2.2;
            const r2 = rad * rad;
            const v = (108 - Math.random() * 34) | 0;
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

        const n3 = S * 3;
        for (let i = 0; i < n3; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 3 + Math.random() * 6;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 38) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    const cur = d[idx];
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.round(cur * 0.65 + v * 0.35);
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function heavyBarrelHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
        const mask = S - 1;

        for (let y = 0; y < S; y++) {
            const rowC = y * S;
            let streak = 0;
            for (let x = 0; x < S; x++) {
                if (Math.random() < 0.06) streak = (Math.random() - 0.5) * 88;
                const v = Math.max(0, Math.min(255, (128 + streak + (Math.random() - 0.5) * 18) | 0));
                const idx = (rowC + x) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        const n = S * 3;
        for (let i = 0; i < n; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 6 + Math.random() * 14;
            const r2 = rad * rad;
            const v = 128 + ((Math.random() - 0.5) * 45) | 0;
            const ir = Math.ceil(rad);
            for (let dy = -ir; dy <= ir; dy++) {
                const yy = (cy + dy) & mask;
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const xx = (cx + dx) & mask;
                    const idx = (yy * S + xx) << 2;
                    const cur = d[idx];
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.round(cur * 0.7 + v * 0.3);
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    function polymerHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.7) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 55) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        const n2 = S * 20;
        for (let i = 0; i < n2; i++) {
            const cx = (Math.random() * S) | 0;
            const cy = (Math.random() * S) | 0;
            const rad = 0.8 + Math.random() * 2.4;
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
            const len = 4 + Math.random() * 22;
            const ang = Math.random() * Math.PI * 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const v = Math.max(0, Math.min(255, (128 + (Math.random() - 0.5) * 75) | 0));
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

    function heatShieldHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.7) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 44) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        for (let y = 0; y < S; y++) {
            const rowC = y * S;
            let streak = 0;
            for (let x = 0; x < S; x++) {
                if (Math.random() < 0.04) streak = (Math.random() - 0.5) * 50;
                const idx = (rowC + x) << 2;
                const v = Math.max(0, Math.min(255, (d[idx] + streak) | 0));
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        ctx.putImageData(img, 0, 0);
        return c;
    }

    function rubberHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
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

        const hPhos   = phosphatedSteelHeight();
        const hBarrel = heavyBarrelHeight();
        const hPoly   = polymerHeight();
        const hShield = heatShieldHeight();
        const hRubber = rubberHeight();

        _tex = {
            nPhos:   normalMapFromHeight(hPhos,   1.6),
            nBarrel: normalMapFromHeight(hBarrel, 1.6),
            nPoly:   normalMapFromHeight(hPoly,   1.5),
            nShield: normalMapFromHeight(hShield, 1.3),
            nRubber: normalMapFromHeight(hRubber, 3.2),

            rPhos:   roughMapFromHeight(hPhos,   0.36, 0.56, 1.0),
            rBarrel: roughMapFromHeight(hBarrel, 0.20, 0.40, 1.0),
            rPoly:   roughMapFromHeight(hPoly,   0.74, 0.90, 1.0),
            rShield: roughMapFromHeight(hShield, 0.30, 0.52, 1.0),
            rRubber: roughMapFromHeight(hRubber, 0.90, 0.98, 1.0),

            cPhos:   colorMapFromHeight(hPhos,   [34, 37, 41], [92, 96, 104],
                { aoStrength: 0.50, wearLow: 0.34, wearHigh: 0.58, dirtAmount: 0.06, grainAmount: 7 }),
            cBarrel: colorMapFromHeight(hBarrel, [22, 25, 30], [86, 90, 98],
                { aoStrength: 0.42, wearLow: 0.30, wearHigh: 0.55, dirtAmount: 0.05, grainAmount: 6 }),
            cPoly:   colorMapFromHeight(hPoly,   [24, 26, 30], [72, 74, 78],
                { aoStrength: 0.55, wearLow: 0.32, wearHigh: 0.58, dirtAmount: 0.06, grainAmount: 4 }),
            cShield: colorMapFromHeight(hShield, [28, 31, 35], [86, 90, 96],
                { aoStrength: 0.42, wearLow: 0.30, wearHigh: 0.55, dirtAmount: 0.05, grainAmount: 5 }),
            cRubber: colorMapFromHeight(hRubber, [12, 14, 17], [48, 48, 50],
                { aoStrength: 0.65, wearLow: 0.25, wearHigh: 0.50, dirtAmount: 0.04, grainAmount: 10 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图
    // ============================================================
    let _envMap = null;
    function getEnvMap() {
        if (_envMap) return _envMap;
        if (typeof renderer === 'undefined' || !renderer) return null;
        try {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();

            const W = 1024, H = 512;
            const c = makeCanvas(W, H);
            const ctx = c.getContext('2d');

            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0.00, '#0e1218');
            g.addColorStop(0.30, '#233040');
            g.addColorStop(0.48, '#6b7f96');
            g.addColorStop(0.50, '#909fb2');
            g.addColorStop(0.52, '#404855');
            g.addColorStop(0.75, '#181c22');
            g.addColorStop(1.00, '#050607');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            const k = W / 2048;
            const lights = [
                { x: 500 * k,  y: 120 * k, r: 500 * k, c: '255,252,242', a: 1.0  },
                { x: 1300 * k, y: 160 * k, r: 420 * k, c: '210,225,255', a: 0.85 },
                { x: 1750 * k, y: 280 * k, r: 320 * k, c: '255,215,170', a: 0.7  },
                { x: 300 * k,  y: 380 * k, r: 380 * k, c: '150,180,220', a: 0.5  },
                { x: 1000 * k, y: 400 * k, r: 300 * k, c: '200,210,230', a: 0.35 },
            ];
            lights.forEach(L => {
                const rg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
                rg.addColorStop(0,    'rgba(' + L.c + ',' + L.a + ')');
                rg.addColorStop(0.35, 'rgba(' + L.c + ',' + (L.a * 0.45) + ')');
                rg.addColorStop(0.7,  'rgba(' + L.c + ',' + (L.a * 0.1)  + ')');
                rg.addColorStop(1,    'rgba(' + L.c + ',0)');
                ctx.fillStyle = rg;
                ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
            });

            const tex = new THREE.CanvasTexture(c);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;

            const rt = pmrem.fromEquirectangular(tex);
            _envMap = rt.texture;
            tex.dispose();
            pmrem.dispose();
        } catch (e) {
            console.warn('[weapon_odin_hd] 环境贴图生成失败', e);
        }
        return _envMap;
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
                color: 0xffffff, map: tex.cPhos, metalness: 1.0, roughness: 0.44,
                roughnessMap: tex.rPhos, normalMap: tex.nPhos,
                normalScale: new THREE.Vector2(0.60, 0.60),
                clearcoat: 0.22, clearcoatRoughness: 0.52, envMapIntensity: 1.35,
            })),
            barrel: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cBarrel, metalness: 1.0, roughness: 0.32,
                roughnessMap: tex.rBarrel, normalMap: tex.nBarrel,
                normalScale: new THREE.Vector2(0.50, 0.50),
                clearcoat: 0.20, clearcoatRoughness: 0.32, envMapIntensity: 1.55,
            })),
            shield: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cShield, metalness: 1.0, roughness: 0.44,
                roughnessMap: tex.rShield, normalMap: tex.nShield,
                normalScale: new THREE.Vector2(0.45, 0.45),
                clearcoat: 0.14, clearcoatRoughness: 0.52, envMapIntensity: 1.20,
            })),
            bright: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cPhos, metalness: 1.0, roughness: 0.20,
                normalMap: tex.nPhos, normalScale: new THREE.Vector2(0.24, 0.24),
                envMapIntensity: 1.9,
            })),
            polymer: new THREE.MeshPhysicalMaterial(mk({
                color: 0xffffff, map: tex.cPoly, metalness: 0.04, roughness: 0.82,
                roughnessMap: tex.rPoly, normalMap: tex.nPoly,
                normalScale: new THREE.Vector2(1.0, 1.0),
                clearcoat: 0.12, clearcoatRoughness: 0.84, envMapIntensity: 0.95,
            })),
            rubber: new THREE.MeshStandardMaterial(mk({
                color: 0xffffff, map: tex.cRubber, metalness: 0.0, roughness: 0.95,
                roughnessMap: tex.rRubber, normalMap: tex.nRubber,
                normalScale: new THREE.Vector2(1.6, 1.6), envMapIntensity: 0.35,
            })),
            slotInner: new THREE.MeshStandardMaterial(mk({
                color: 0x06070a, metalness: 0.55, roughness: 0.68, envMapIntensity: 0.35,
            })),
            brass: new THREE.MeshPhysicalMaterial(mk({
                color: 0xb08a3c, metalness: 1.0, roughness: 0.28,
                clearcoat: 0.30, clearcoatRoughness: 0.30, envMapIntensity: 1.8,
            })),
            copper: new THREE.MeshPhysicalMaterial(mk({
                color: 0x9c5a30, metalness: 1.0, roughness: 0.34, envMapIntensity: 1.6,
            })),
            optic: new THREE.MeshPhysicalMaterial(mk({
                color: 0x1c1f24, metalness: 0.92, roughness: 0.30,
                roughnessMap: tex.rPhos, normalMap: tex.nPhos,
                normalScale: new THREE.Vector2(0.30, 0.30),
                clearcoat: 0.40, clearcoatRoughness: 0.28, envMapIntensity: 1.65,
                side: THREE.DoubleSide,   // ★ 空心管需要双面渲染
            })),
            glass: new THREE.MeshPhysicalMaterial(mk({
                color: 0x060a12, metalness: 0.0, roughness: 0.06,
                clearcoat: 1.0, clearcoatRoughness: 0.03,
                reflectivity: 0.55, ior: 1.52,
                emissive: 0x0a1424, emissiveIntensity: 0.10,
                transparent: true, opacity: 0.80,
                envMapIntensity: 1.3, side: THREE.DoubleSide,
            })),
            dot: new THREE.MeshBasicMaterial({ color: 0xff3220 }),
        };
        return _mat;
    }

    // ============================================================
    // 几何工具
    // ============================================================
    function roundedRectShape(w, h, r) {
        r = Math.min(r, w / 2 - 0.0001, h / 2 - 0.0001);
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
    }

    function applyTriplanarUV(geo, scale) {
        const pos = geo.attributes.position;
        const nor = geo.attributes.normal;
        const uv  = geo.attributes.uv;
        if (!uv || !nor) return;
        for (let i = 0; i < pos.count; i++) {
            const nx = Math.abs(nor.getX(i));
            const ny = Math.abs(nor.getY(i));
            const nz = Math.abs(nor.getZ(i));
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            let u, v;
            if (nz >= nx && nz >= ny) { u = x; v = y; }
            else if (nx >= ny)        { u = z; v = y; }
            else                      { u = x; v = z; }
            uv.setXY(i, u * scale, v * scale);
        }
        uv.needsUpdate = true;
    }

    function scaleGeometryUV(geo, uScale, vScale) {
        const uv = geo.attributes.uv;
        if (!uv) return geo;
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
        }
        uv.needsUpdate = true;
        return geo;
    }

    function roundedBoxZ(w, h, d, r, bevel, uvScale) {
        bevel = bevel === undefined ? 0.0018 : bevel;
        uvScale = uvScale === undefined ? 18 : uvScale;
        const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
            depth: Math.max(d - bevel * 2, 0.0002),
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: BEVEL_SEG,
            curveSegments: CURVE_SEG,
        });
        geo.translate(0, 0, -(d - bevel * 2) / 2);
        geo.computeVertexNormals();
        applyTriplanarUV(geo, uvScale);
        return geo;
    }

    function roundedBoxX(L, H, W, r, bevel, uvScale) {
        const geo = roundedBoxZ(W, H, L, r, bevel, uvScale);
        geo.rotateY(Math.PI / 2);
        return geo;
    }

    // ============================================================
    // 铭文 / 镜片贴图
    // ============================================================
    function makeRollMarkTexture(text, subText) {
        const W = 1024, H = 192;
        const c = makeCanvas(W, H);
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
        ctx.fillText('5.56×45MM NATO', 720, 145);

        const t = new THREE.CanvasTexture(c);
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
    }

    function makeLensCoatingTexture() {
        const S = 256;
        const c = makeCanvas(S);
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(S * 0.35, S * 0.35, 0, S * 0.5, S * 0.5, S * 0.65);
        grad.addColorStop(0,    'rgba(160, 200, 255, 0.85)');
        grad.addColorStop(0.35, 'rgba(80, 140, 220, 0.45)');
        grad.addColorStop(0.7,  'rgba(40, 80, 160, 0.25)');
        grad.addColorStop(1,    'rgba(20, 40, 80, 0.10)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, S, S);

        const t = new THREE.CanvasTexture(c);
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        return t;
    }

    let _lensCoating = null;
    function getLensCoating() {
        if (!_lensCoating) _lensCoating = makeLensCoatingTexture();
        return _lensCoating;
    }

    // ============================================================
    // 构建轻机枪（+X 为枪管方向）
    // ============================================================
    function buildOdinHD() {
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
        const Y_BARREL = 0.165;
        const Y_RECV   = 0.130;
        const Y_FEED   = 0.200;

        // -------- 1. 聚合物枪托 --------
        const stockGroup = new THREE.Group();
        stockGroup.position.set(-0.230, Y_RECV - 0.002, 0);
        stockGroup.rotation.z = 0.10;
        inner.add(stockGroup);

        part(roundedBoxX(0.095, 0.090, 0.064, 0.022), MAT.polymer,
             -0.028, 0.004, 0, 0, 0, 0, stockGroup);
        part(roundedBoxX(0.170, 0.102, 0.076, 0.022), MAT.polymer,
             -0.155, -0.016, 0, 0, 0, 0, stockGroup);
        part(roundedBoxX(0.145, 0.022, 0.065, 0.007), MAT.polymer,
             -0.158, 0.048, 0, 0, 0, 0, stockGroup);

        {
            const stripeGeo = new THREE.BoxGeometry(0.0032, 0.018, 0.066);
            const count = 5;
            const mesh = new THREE.InstancedMesh(stripeGeo, MAT.polymer, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(-0.110 - i * 0.026, 0.048, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        part(roundedBoxX(0.155, 0.008, 0.078, 0.002), MAT.polymer,
             -0.158, -0.072, 0, 0, 0, 0, stockGroup);

        part(roundedBoxX(0.038, 0.155, 0.078, 0.016), MAT.rubber,
             -0.262, -0.022, 0, 0, 0, 0, stockGroup);

        {
            const grooveGeo = new THREE.BoxGeometry(0.0048, 0.144, 0.079);
            const count = 5;
            const mesh = new THREE.InstancedMesh(grooveGeo, MAT.rubber, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(-0.275 + i * 0.0066, -0.022, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        {
            const holeGeo = new THREE.CylinderGeometry(0.0020, 0.0020, 0.040, 8);
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
                p.set(-0.262, -0.022 + 0.022 + row * 0.018, -0.024 + col * 0.024);
                m4.compose(p, q, s);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            stockGroup.add(mesh);
        }

        part(new THREE.TorusGeometry(0.0115, 0.0024, 8, IS_TOUCH_LOW ? 14 : 20), MAT.bright,
             -0.215, -0.068, 0, 0, R, 0, stockGroup);

        part(new THREE.CylinderGeometry(0.0050, 0.0050, 0.0040, 16), MAT.bright,
             -0.280, -0.022, 0, R, 0, 0, stockGroup);
        part(new THREE.BoxGeometry(0.0012, 0.0084, 0.0014), MAT.slotInner,
             -0.2824, -0.022, 0, 0, 0, 0, stockGroup);

        // -------- 2. 机匣 --------
        const RECV_X = -0.060;
        const RECV_L = 0.290;

        part(roundedBoxX(RECV_L, 0.100, 0.078, 0.012), MAT.receiver, RECV_X, Y_RECV, 0);

        const rollMarkTex = makeRollMarkTexture('M249 SAW', '5.56MM LIGHT MACHINE GUN');
        const rollMarkMat = new THREE.MeshStandardMaterial({
            map: rollMarkTex, transparent: true,
            metalness: 0.85, roughness: 0.42, envMapIntensity: 1.3, depthWrite: false,
        });
        const rollMarkMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.130, 0.028), rollMarkMat);
        rollMarkMesh.position.set(RECV_X - 0.045, Y_RECV + 0.012, 0.0391);
        inner.add(rollMarkMesh);

        part(roundedBoxX(0.120, 0.0050, 0.0008, 0.0006), MAT.slotInner,
             RECV_X - 0.030, Y_RECV + 0.024, 0.0391);
        part(roundedBoxX(0.120, 0.0050, 0.0008, 0.0006), MAT.slotInner,
             RECV_X - 0.030, Y_RECV - 0.016, 0.0391);
        part(roundedBoxX(0.120, 0.0050, 0.0008, 0.0006), MAT.slotInner,
             RECV_X - 0.030, Y_RECV + 0.024, -0.0391);
        part(roundedBoxX(0.120, 0.0050, 0.0008, 0.0006), MAT.slotInner,
             RECV_X - 0.030, Y_RECV - 0.016, -0.0391);

        part(new THREE.CylinderGeometry(0.0050, 0.0050, 0.082, 16), MAT.bright,
             RECV_X - 0.095, Y_RECV + 0.014, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0050, 0.0050, 0.082, 16), MAT.bright,
             RECV_X + 0.080, Y_RECV + 0.014, 0, R, 0, 0);

        // -------- 3. 顶部供弹机盖 --------
        const FEED_X = RECV_X + 0.005;

        part(roundedBoxX(0.255, 0.022, 0.072, 0.005), MAT.receiver, FEED_X, Y_FEED, 0);

        part(roundedBoxX(0.238, 0.008, 0.010, 0.0018), MAT.receiver,
             FEED_X, Y_FEED + 0.015, 0.022);
        part(roundedBoxX(0.238, 0.008, 0.010, 0.0018), MAT.receiver,
             FEED_X, Y_FEED + 0.015, -0.022);

        part(new THREE.CylinderGeometry(0.0050, 0.0050, 0.072, 14), MAT.bright,
             FEED_X - 0.118, Y_FEED - 0.010, 0, R, 0, 0);
        part(new THREE.SphereGeometry(0.0062, 12, 10), MAT.bright,
             FEED_X - 0.118, Y_FEED - 0.010, 0.038);
        part(new THREE.SphereGeometry(0.0062, 12, 10), MAT.bright,
             FEED_X - 0.118, Y_FEED - 0.010, -0.038);

        part(roundedBoxX(0.085, 0.048, 0.010, 0.004), MAT.slotInner,
             FEED_X + 0.020, Y_FEED - 0.024, -0.044);
        part(roundedBoxX(0.092, 0.008, 0.012, 0.0018), MAT.receiver,
             FEED_X + 0.020, Y_FEED - 0.046, -0.044);
        part(roundedBoxX(0.092, 0.008, 0.012, 0.0018), MAT.receiver,
             FEED_X + 0.020, Y_FEED - 0.002, -0.044);

        part(roundedBoxX(0.028, 0.016, 0.012, 0.002), MAT.bright,
             FEED_X + 0.110, Y_FEED - 0.005, 0.035);
        for (let i = 0; i < 4; i++) {
            part(new THREE.BoxGeometry(0.0018, 0.010, 0.0012), MAT.slotInner,
                 FEED_X + 0.100 + i * 0.006, Y_FEED - 0.005, 0.0415);
        }

        part(roundedBoxX(0.016, 0.012, 0.018, 0.002), MAT.bright,
             FEED_X + 0.132, Y_FEED - 0.005, 0);

        {
            const slotGeo = new THREE.BoxGeometry(0.044, 0.004, 0.0055);
            const count = 4;
            const mesh = new THREE.InstancedMesh(slotGeo, MAT.slotInner, count);
            mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(FEED_X - 0.048 + i * 0.052, Y_FEED + 0.0112, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        // -------- 4. 提把 --------
        const CARRY_X = 0.180;

        part(roundedBoxX(0.058, 0.024, 0.052, 0.005), MAT.receiver,
             CARRY_X, Y_BARREL + 0.036, 0);
        part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.058, 14), MAT.bright,
             CARRY_X - 0.020, Y_BARREL + 0.042, 0, R, 0, 0);

        const carryArmGeo = new THREE.BoxGeometry(0.012, 0.040, 0.008);
        part(carryArmGeo, MAT.receiver, CARRY_X - 0.005, Y_BARREL + 0.062, 0.016);
        part(carryArmGeo, MAT.receiver, CARRY_X - 0.005, Y_BARREL + 0.062, -0.016);

        part(new THREE.CylinderGeometry(0.0068, 0.0068, 0.070, 16), MAT.receiver,
             CARRY_X - 0.005, Y_BARREL + 0.084, 0, 0, 0, R);
        part(new THREE.SphereGeometry(0.0080, 14, 10), MAT.receiver,
             CARRY_X - 0.005, Y_BARREL + 0.084, 0.035);
        part(new THREE.SphereGeometry(0.0080, 14, 10), MAT.receiver,
             CARRY_X - 0.005, Y_BARREL + 0.084, -0.035);

        for (let i = 0; i < 8; i++) {
            part(new THREE.TorusGeometry(0.0070, 0.0007, 6, 14), MAT.receiver,
                 CARRY_X - 0.005 - 0.024 + i * 0.0068, Y_BARREL + 0.084, 0, 0, R, 0);
        }

        // -------- 5. 散热罩 --------
        const SHIELD_X0 = 0.075;
        const SHIELD_X1 = 0.370;
        const SHIELD_L  = SHIELD_X1 - SHIELD_X0;
        const SHIELD_CX = (SHIELD_X0 + SHIELD_X1) / 2;
        const SHIELD_R  = 0.0340;

        const shieldGeo = new THREE.CylinderGeometry(SHIELD_R, SHIELD_R - 0.0012, SHIELD_L, 8, 1, false, Math.PI / 8);
        shieldGeo.rotateZ(R);
        scaleGeometryUV(shieldGeo, 3, 5);
        part(shieldGeo, MAT.shield, SHIELD_CX, Y_BARREL, 0);

        {
            const holeGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 10);
            const rings = 8;
            const cols = 10;
            const total = rings * cols;
            const mesh = new THREE.InstancedMesh(holeGeo, MAT.slotInner, total);

            const m4 = new THREE.Matrix4();
            const s = new THREE.Vector3(1, 1, 1);
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            let n = 0;

            for (let r = 0; r < rings; r++) {
                const ang = (r / rings) * Math.PI * 2 + Math.PI / 8;
                const rr = SHIELD_R * 0.94;

                for (let c = 0; c < cols; c++) {
                    const x = SHIELD_X0 + 0.030 + c * 0.028;
                    p.set(x, Y_BARREL + Math.cos(ang) * rr, Math.sin(ang) * rr);

                    const radial = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang)).normalize();
                    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
                    m4.compose(p, q, s);
                    mesh.setMatrixAt(n++, m4);
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        part(new THREE.CylinderGeometry(SHIELD_R + 0.0018, SHIELD_R + 0.0018, 0.009, 8, 1, false, Math.PI / 8),
             MAT.barrel, SHIELD_X0, Y_BARREL, 0).rotation.z = R;
        part(new THREE.CylinderGeometry(SHIELD_R + 0.0018, SHIELD_R + 0.0018, 0.009, 8, 1, false, Math.PI / 8),
             MAT.barrel, SHIELD_X1, Y_BARREL, 0).rotation.z = R;

        part(new THREE.BoxGeometry(SHIELD_L - 0.02, 0.0040, 0.008), MAT.barrel,
             SHIELD_CX, Y_BARREL + SHIELD_R + 0.001, 0);

        // -------- 6. 聚合物护木 --------
        const FOREX_X0 = 0.375;
        const FOREX_X1 = 0.475;
        const FOREX_L  = FOREX_X1 - FOREX_X0;
        const FOREX_CX = (FOREX_X0 + FOREX_X1) / 2;

        const forexGeo = new THREE.CylinderGeometry(0.0352, 0.0338, FOREX_L, 8, 1, false, Math.PI / 8);
        forexGeo.rotateZ(R);
        scaleGeometryUV(forexGeo, 2.5, 3.5);
        part(forexGeo, MAT.polymer, FOREX_CX, Y_BARREL, 0);

        part(new THREE.CylinderGeometry(0.0355, 0.0355, 0.008, 8, 1, false, Math.PI / 8),
             MAT.barrel, FOREX_X0 + 0.002, Y_BARREL, 0).rotation.z = R;
        part(new THREE.CylinderGeometry(0.0341, 0.0341, 0.008, 8, 1, false, Math.PI / 8),
             MAT.barrel, FOREX_X1 - 0.002, Y_BARREL, 0).rotation.z = R;

        {
            const ribGeo = new THREE.TorusGeometry(0.0354, 0.0016, 6, IS_TOUCH_LOW ? 16 : 24);
            const count = 5;
            const mesh = new THREE.InstancedMesh(ribGeo, MAT.polymer, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R, 0));
            const s = new THREE.Vector3(1, 1, 1);
            const p = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                p.set(FOREX_CX - 0.035 + i * 0.0175, Y_BARREL, 0);
                m4.compose(p, q, s);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        part(roundedBoxX(0.090, 0.014, 0.042, 0.004), MAT.polymer,
             FOREX_CX, Y_BARREL - 0.034, 0);

        // -------- 7. 枪管 --------
        const BARREL_X0 = 0.075;
        const BARREL_X1 = 0.660;
        const BARREL_L  = BARREL_X1 - BARREL_X0;
        const BARREL_CX = (BARREL_X0 + BARREL_X1) / 2;

        part(new THREE.CylinderGeometry(0.0178, 0.0190, BARREL_L, SEG, 1, false), MAT.barrel,
             BARREL_CX, Y_BARREL, 0, 0, 0, R);

        part(new THREE.CylinderGeometry(0.0255, 0.0215, 0.034, SEG, 1, false), MAT.barrel,
             BARREL_X0 + 0.018, Y_BARREL, 0, 0, 0, R);

        part(new THREE.CylinderGeometry(0.0255, 0.0255, 0.042, SEG, 1, false), MAT.barrel,
             0.555, Y_BARREL, 0, 0, 0, R);
        part(roundedBoxX(0.036, 0.022, 0.026, 0.003), MAT.barrel,
             0.555, Y_BARREL + 0.024, 0);

        part(new THREE.CylinderGeometry(0.0038, 0.0038, 0.350, 12), MAT.bright,
             0.290, Y_BARREL + 0.026, 0, 0, 0, R);

        // -------- 8. 消焰器 --------
        const MUZZLE_X = 0.695;

        part(new THREE.CylinderGeometry(0.0230, 0.0230, 0.075, SEG, 1, false), MAT.barrel,
             MUZZLE_X, Y_BARREL, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0198, 0.0230, 0.016, SEG, 1, false), MAT.barrel,
             MUZZLE_X - 0.040, Y_BARREL, 0, 0, 0, R);

        for (let i = 0; i < 3; i++) {
            part(new THREE.TorusGeometry(0.0233, 0.0018, 6, 22), MAT.barrel,
                 MUZZLE_X - 0.020 + i * 0.020, Y_BARREL, 0, 0, R, 0);
        }

        for (let i = 0; i < 3; i++) {
            const x = MUZZLE_X - 0.020 + i * 0.020;
            part(new THREE.BoxGeometry(0.009, 0.007, 0.024), MAT.slotInner, x, Y_BARREL + 0.020, 0);
            part(new THREE.BoxGeometry(0.009, 0.007, 0.024), MAT.slotInner, x, Y_BARREL, 0.020);
            part(new THREE.BoxGeometry(0.009, 0.007, 0.024), MAT.slotInner, x, Y_BARREL, -0.020);
        }

        part(new THREE.CylinderGeometry(0.0100, 0.0100, 0.002, 18), MAT.slotInner,
             MUZZLE_X + 0.040, Y_BARREL, 0, 0, 0, R);

        // -------- 9. 下挂弹箱 --------
        const AMMO_X = 0.010;
        const AMMO_TOP = Y_RECV - 0.051;
        const AMMO_W = 0.160;
        const AMMO_H = 0.128;
        const AMMO_D = 0.104;
        const AMMO_CY = AMMO_TOP - AMMO_H / 2;

        const ammoBox = new THREE.Group();
        ammoBox.position.set(AMMO_X, AMMO_CY, 0);
        ammoBox.rotation.z = -0.03;
        inner.add(ammoBox);

        part(roundedBoxX(AMMO_W, AMMO_H, AMMO_D, 0.011), MAT.polymer,
             0, 0, 0, 0, 0, 0, ammoBox);

        part(roundedBoxX(0.058, 0.005, 0.032, 0.002), MAT.slotInner,
             -0.045, AMMO_H / 2 - 0.001, -0.030, 0, 0, 0, ammoBox);
        part(roundedBoxX(0.062, 0.007, 0.006, 0.0018), MAT.receiver,
             -0.045, AMMO_H / 2 + 0.002, -0.015, 0, 0, 0, ammoBox);
        part(roundedBoxX(0.062, 0.007, 0.006, 0.0018), MAT.receiver,
             -0.045, AMMO_H / 2 + 0.002, -0.046, 0, 0, 0, ammoBox);
        part(roundedBoxX(0.007, 0.007, 0.038, 0.0018), MAT.receiver,
             -0.016, AMMO_H / 2 + 0.002, -0.030, 0, 0, 0, ammoBox);

        for (let i = 0; i < 3; i++) {
            part(roundedBoxX(AMMO_W - 0.012, 0.006, AMMO_D + 0.0005, 0.0018), MAT.polymer,
                 0, -0.042 + i * 0.042, 0, 0, 0, 0, ammoBox);
        }

        part(roundedBoxX(0.010, 0.020, 0.024, 0.002), MAT.bright,
             AMMO_W / 2 + 0.002, 0.020, 0, 0, 0, 0, ammoBox);
        for (let i = 0; i < 3; i++) {
            part(new THREE.BoxGeometry(0.005, 0.0016, 0.0014), MAT.slotInner,
                 AMMO_W / 2 + 0.0075, 0.012 + i * 0.009, 0, 0, 0, 0, ammoBox);
        }

        part(new THREE.CylinderGeometry(0.0040, 0.0040, AMMO_D - 0.012, 12), MAT.bright,
             -AMMO_W / 2 - 0.002, 0.012, 0, 0, 0, R, ammoBox);

        {
            const rivetGeo = new THREE.SphereGeometry(0.0030, 10, 8);
            const count = 6;
            const mesh = new THREE.InstancedMesh(rivetGeo, MAT.bright, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            let n = 0;
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 3; col++) {
                    m4.makeTranslation(-0.052 + col * 0.052, -0.024 + row * 0.050, AMMO_D / 2 + 0.0005);
                    mesh.setMatrixAt(n++, m4);
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            ammoBox.add(mesh);
        }

        part(roundedBoxX(0.115, 0.005, 0.0008, 0.0006), MAT.slotInner,
             0, -0.012, AMMO_D / 2 + 0.001, 0, 0, 0, ammoBox);
        part(roundedBoxX(0.115, 0.005, 0.0008, 0.0006), MAT.slotInner,
             0, -0.030, AMMO_D / 2 + 0.001, 0, 0, 0, ammoBox);

        part(roundedBoxX(AMMO_W - 0.024, 0.005, AMMO_D - 0.014, 0.002), MAT.rubber,
             0, -AMMO_H / 2 - 0.001, 0, 0, 0, 0, ammoBox);

        // -------- 10. 弹链 --------
        {
            const beltStart = new THREE.Vector3(FEED_X + 0.020, Y_FEED - 0.024, -0.055);
            const beltCtrl  = new THREE.Vector3(FEED_X - 0.040, Y_FEED - 0.095, -0.100);
            const beltEnd   = new THREE.Vector3(AMMO_X - 0.045, AMMO_CY + AMMO_H / 2 + 0.006, -0.030);

            const beltCount = IS_TOUCH_LOW ? 16 : 24;
            const beltPts = [];
            for (let i = 0; i < beltCount; i++) {
                const t = i / (beltCount - 1);
                const u = 1 - t;
                const p = new THREE.Vector3(
                    u * u * beltStart.x + 2 * u * t * beltCtrl.x + t * t * beltEnd.x,
                    u * u * beltStart.y + 2 * u * t * beltCtrl.y + t * t * beltEnd.y,
                    u * u * beltStart.z + 2 * u * t * beltCtrl.z + t * t * beltEnd.z
                );
                beltPts.push(p);
            }

            const caseGeo = new THREE.CylinderGeometry(0.0048, 0.0052, 0.024, 12);
            const tipGeo  = new THREE.ConeGeometry(0.0037, 0.012, 12);
            const linkGeo = new THREE.BoxGeometry(0.0085, 0.0050, 0.0115);

            const caseMesh = new THREE.InstancedMesh(caseGeo, MAT.brass,    beltCount);
            const tipMesh  = new THREE.InstancedMesh(tipGeo,  MAT.copper,   beltCount);
            const linkMesh = new THREE.InstancedMesh(linkGeo, MAT.receiver, beltCount);
            caseMesh.castShadow = true; caseMesh.receiveShadow = true;
            tipMesh.castShadow = true;  tipMesh.receiveShadow = true;
            linkMesh.castShadow = true; linkMesh.receiveShadow = true;

            const m4 = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3(1, 1, 1);
            const dir = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);

            for (let i = 0; i < beltCount; i++) {
                const p = beltPts[i];
                const n = beltPts[Math.min(i + 1, beltCount - 1)];
                dir.subVectors(n, p).normalize();
                if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);

                q.setFromUnitVectors(up, dir);

                const caseP = p.clone().addScaledVector(dir, -0.006);
                m4.compose(caseP, q, s);
                caseMesh.setMatrixAt(i, m4);

                const tipP = p.clone().addScaledVector(dir, 0.016);
                m4.compose(tipP, q, s);
                tipMesh.setMatrixAt(i, m4);

                m4.compose(p, q, s);
                linkMesh.setMatrixAt(i, m4);
            }
            caseMesh.instanceMatrix.needsUpdate = true;
            tipMesh.instanceMatrix.needsUpdate = true;
            linkMesh.instanceMatrix.needsUpdate = true;
            inner.add(caseMesh);
            inner.add(tipMesh);
            inner.add(linkMesh);
        }

        // -------- 11. 握把 + 扳机组 --------
        const gripGroup = new THREE.Group();
        gripGroup.position.set(RECV_X - 0.100, Y_RECV - 0.062, 0);
        gripGroup.rotation.z = -0.28;
        inner.add(gripGroup);

        part(roundedBoxX(0.054, 0.130, 0.048, 0.015), MAT.polymer,
             0, -0.062, 0, 0, 0, 0, gripGroup);

        for (let i = 0; i < 4; i++) {
            part(roundedBoxX(0.056, 0.006, 0.050, 0.002), MAT.polymer,
                 0, -0.018 - i * 0.026, 0, 0, 0, 0, gripGroup);
        }

        part(roundedBoxX(0.058, 0.010, 0.052, 0.004), MAT.polymer,
             0, -0.132, 0, 0, 0, 0, gripGroup);

        part(roundedBoxX(0.012, 0.032, 0.052, 0.004), MAT.polymer,
             0.028, -0.052, 0, 0, 0, 0, gripGroup);

        part(new THREE.TorusGeometry(0.032, 0.0045, 8, IS_TOUCH_LOW ? 18 : 26, Math.PI),
             MAT.receiver, RECV_X - 0.045, Y_RECV - 0.044, 0, 0, 0, Math.PI);

        part(roundedBoxX(0.006, 0.030, 0.012, 0.002), MAT.receiver,
             RECV_X - 0.014, Y_RECV - 0.058, 0);

        part(roundedBoxX(0.010, 0.028, 0.012, 0.003), MAT.bright,
             RECV_X - 0.045, Y_RECV - 0.060, 0, 0, 0, 0.20);

        part(new THREE.CylinderGeometry(0.0020, 0.0020, 0.020, 8), MAT.bright,
             RECV_X - 0.045, Y_RECV - 0.076, 0, 0, 0, 0.20);

        // -------- 12. 前准星 + 后照门 --------
        part(new THREE.BoxGeometry(0.024, 0.014, 0.012), MAT.barrel,
             0.610, Y_BARREL + 0.024, 0);
        part(new THREE.BoxGeometry(0.0065, 0.028, 0.0065), MAT.barrel,
             0.610, Y_BARREL + 0.040, 0);
        part(new THREE.BoxGeometry(0.010, 0.026, 0.0024), MAT.barrel,
             0.610, Y_BARREL + 0.039, 0.0095);
        part(new THREE.BoxGeometry(0.010, 0.026, 0.0024), MAT.barrel,
             0.610, Y_BARREL + 0.039, -0.0095);

        const GHOST_X = RECV_X - 0.135;
        part(roundedBoxX(0.034, 0.014, 0.034, 0.003), MAT.receiver,
             GHOST_X, Y_FEED + 0.020, 0);

        part(new THREE.TorusGeometry(0.0088, 0.0017, 8, IS_TOUCH_LOW ? 16 : 24), MAT.bright,
             GHOST_X, Y_FEED + 0.046, 0);

        part(new THREE.BoxGeometry(0.006, 0.024, 0.004), MAT.receiver,
             GHOST_X, Y_FEED + 0.035, 0.008);
        part(new THREE.BoxGeometry(0.006, 0.024, 0.004), MAT.receiver,
             GHOST_X, Y_FEED + 0.035, -0.008);

        // -------- 13. 导轨 + 红点镜 --------
        const Y_RAIL_BASE = Y_FEED + 0.012;
        const RAIL_X = FEED_X - 0.078;

        part(roundedBoxX(0.120, 0.009, 0.045, 0.002), MAT.receiver,
             RAIL_X, Y_RAIL_BASE + 0.0045, 0);

        {
            const railGeo = new THREE.BoxGeometry(0.0086, 0.0055, 0.047);
            const count = 10;
            const mesh = new THREE.InstancedMesh(railGeo, MAT.receiver, count);
            mesh.castShadow = true; mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(RAIL_X - 0.042 + i * 0.0125, Y_RAIL_BASE + 0.0118, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        {
            const slotGeo = new THREE.BoxGeometry(0.0042, 0.0024, 0.046);
            const count = 9;
            const mesh = new THREE.InstancedMesh(slotGeo, MAT.slotInner, count);
            mesh.receiveShadow = true;
            const m4 = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
                m4.makeTranslation(RAIL_X - 0.0355 + i * 0.0125, Y_RAIL_BASE + 0.0085, 0);
                mesh.setMatrixAt(i, m4);
            }
            mesh.instanceMatrix.needsUpdate = true;
            inner.add(mesh);
        }

        const Y_RAIL_TOP = Y_RAIL_BASE + 0.0145;
        const SIGHT_X = RAIL_X;

        part(roundedBoxX(0.072, 0.018, 0.046, 0.003), MAT.optic,
             SIGHT_X, Y_RAIL_TOP + 0.009, 0);

        part(new THREE.CylinderGeometry(0.0044, 0.0044, 0.050, 16), MAT.bright,
             SIGHT_X, Y_RAIL_TOP + 0.006, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0058, 0.0058, 0.0050, 6), MAT.bright,
             SIGHT_X, Y_RAIL_TOP + 0.006, 0.028, R, 0, 0);

        part(roundedBoxX(0.020, 0.009, 0.007, 0.0016), MAT.optic,
             SIGHT_X, Y_RAIL_TOP + 0.006, -0.028);
        for (let i = 0; i < 4; i++) {
            part(new THREE.BoxGeometry(0.0030, 0.0014, 0.0070), MAT.slotInner,
                 SIGHT_X - 0.0068 + i * 0.0045, Y_RAIL_TOP + 0.010, -0.028);
        }

        part(roundedBoxX(0.036, 0.022, 0.038, 0.004), MAT.optic,
             SIGHT_X, Y_RAIL_TOP + 0.028, 0);

        const Y_TUBE_ACTUAL = Y_RAIL_TOP + 0.052;

        // ★ 镜筒主体：空心管（openEnded = true），去掉前后端盖
        part(new THREE.CylinderGeometry(0.0235, 0.0235, 0.080, SEG, 1, true), MAT.optic,
             SIGHT_X, Y_TUBE_ACTUAL, 0, 0, 0, R);

        // ★ 前端环：Torus 环形（中间通孔，可看穿）
        //   rotation 参数顺序 (rx, ry, rz) = (0, R, 0) → 绕 Y 轴转 90°，环面法线朝 ±X
        part(new THREE.TorusGeometry(0.0257, 0.0025, 12, 32), MAT.optic,
             SIGHT_X + 0.040, Y_TUBE_ACTUAL, 0, 0, R, 0);

        // ★ 后端环：Torus 环形
        part(new THREE.TorusGeometry(0.0257, 0.0025, 12, 32), MAT.optic,
             SIGHT_X - 0.040, Y_TUBE_ACTUAL, 0, 0, R, 0);

        for (let i = 0; i < 3; i++) {
            part(new THREE.TorusGeometry(0.0280, 0.0007, 6, 24), MAT.optic,
                 SIGHT_X + 0.036 + i * 0.0040, Y_TUBE_ACTUAL, 0, 0, R, 0);
        }

        part(new THREE.CylinderGeometry(0.0112, 0.0112, 0.014, 20), MAT.optic,
             SIGHT_X, Y_TUBE_ACTUAL + 0.027, 0, 0, 0, 0);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            part(new THREE.BoxGeometry(0.0018, 0.012, 0.0025), MAT.slotInner,
                 SIGHT_X + Math.cos(a) * 0.0118, Y_TUBE_ACTUAL + 0.027 + Math.sin(a) * 0.0118, 0, 0, 0, -a);
        }

        part(new THREE.CylinderGeometry(0.0103, 0.0103, 0.014, 20), MAT.optic,
             SIGHT_X, Y_TUBE_ACTUAL, 0.033, R, 0, 0);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            part(new THREE.BoxGeometry(0.0018, 0.0025, 0.012), MAT.slotInner,
                 SIGHT_X + Math.cos(a) * 0.0110, Y_TUBE_ACTUAL + Math.sin(a) * 0.0110, 0.033, 0, 0, -a);
        }

        // ★ 前镜片：前移到 +0.0485，避免和前端环同 z 面产生 z-fighting
        const lensF = part(new THREE.CircleGeometry(0.0228, 40), MAT.glass,
                           SIGHT_X + 0.0485, Y_TUBE_ACTUAL, 0, 0, R, 0);
        lensF.name = 'scopeLensFront';

        // ★ 镀膜：跟着镜片前移
        {
            const coatMat = new THREE.MeshBasicMaterial({
                map: getLensCoating(), transparent: true, opacity: 0.55, depthWrite: false,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            });
            const coat = new THREE.Mesh(new THREE.CircleGeometry(0.0226, 40), coatMat);
            coat.position.set(SIGHT_X + 0.0488, Y_TUBE_ACTUAL, 0);
            coat.rotation.y = R;
            inner.add(coat);
        }

        // ★ 后镜片：稍微后移
        const lensB = part(new THREE.CircleGeometry(0.0218, 40), MAT.glass,
                           SIGHT_X - 0.0485, Y_TUBE_ACTUAL, 0, 0, -R, 0);
        lensB.name = 'scopeLensBack';

        // ★ 红点：跟着镜片前移
        part(new THREE.CircleGeometry(0.0025, 24), MAT.dot,
             SIGHT_X + 0.0480, Y_TUBE_ACTUAL, 0, 0, R, 0);
        part(new THREE.CircleGeometry(0.0010, 16), MAT.dot,
             SIGHT_X + 0.0478, Y_TUBE_ACTUAL, 0, 0, R, 0);

        // -------- 14. 前背带环 --------
        part(new THREE.TorusGeometry(0.0105, 0.0024, 8, IS_TOUCH_LOW ? 16 : 20), MAT.bright,
             0.485, Y_BARREL - 0.038, 0, 0, 0, R);

        // -------- 枪口锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(MUZZLE_X + 0.042, Y_BARREL, 0);
        inner.add(muzzlePoint);

        // ★ 瞄准镜中心锚点（PiP + ADS 计算用），位置与新前镜片一致
        const scopeCenter = new THREE.Object3D();
        scopeCenter.name = 'scopeCenter';
        scopeCenter.position.set(SIGHT_X + 0.0485, Y_TUBE_ACTUAL, 0);
        inner.add(scopeCenter);

        // -------- 居中 --------
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y * 0.50, -center.z * 0.15);

        // -------- 整体旋转（枪管指向 -Z） --------
        gun.rotation.y = Math.PI / 2;

        gun.userData.muzzlePoint = muzzlePoint;
        gun.userData.scopeCenter = scopeCenter;
        gun.userData.lensMeshF = lensF;
        gun.userData.lensMeshB = lensB;

        gun.updateMatrixWorld(true);
        return gun;
    }

    // ============================================================
    // 第一人称视图模型
    //   ★ BASE_Z 后移到 -0.72 → 枪身整体缩进画面，正常视角能看到扳机 / 枪托
    //   ★ ADS 位置用 scopeCenter 计算 → 开镜时镜片正对相机（PiP）
    // ============================================================
    function buildOdinViewmodelHD() {
        const g = buildOdinHD();

        // ★ 后移（远离相机），露出完整枪身
         const BASE_X = 0.27, BASE_Y = -0.20, BASE_Z = -0.56;
        const BASE_RZ = 0.02;

        // 用 scopeCenter 计算 ADS 位置（和狙击枪完全一样）
        g.position.set(0, 0, 0);
        g.rotation.set(0, Math.PI / 2, 0);
        g.updateMatrixWorld(true);
        const sc = new THREE.Vector3();
        g.userData.scopeCenter.getWorldPosition(sc);

        const ADS_X = -sc.x;
        const ADS_Y = -sc.y;
        const ADS_Z = -0.30 - sc.z;

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

    window.__HD_ODIN = {
        buildWorld:     buildOdinHD,
        buildViewmodel: buildOdinViewmodelHD,
        preload: function () { getMaterials(); getEnvMap(); },
    };

    console.log('[weapon_odin_hd] 高细节轻机枪已注册（M249 SAW 风格 · 空心镜筒 + PiP）');
})();