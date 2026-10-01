// ===== js/weapon_knife_hd.js – 高细节 PBR 战术匕首模型 =====
// 使用方式（与 rifle/sniper/shotgun/odin HD 完全一致）：
//   1. 本文件必须在 player_model.js 之前加载
//   2. player_model.js 里的 _getWorldTemplate / _getViewTemplate 需加 knife 分支
//
// 仅覆盖 'knife'，其他武器不受影响。
//
// ★ 设计要点：
//   · 几何仍以 +X 为刀尖方向，与枪械保持一致
//   · gun.rotation.y = π/2 → 刀尖朝 -Z（正前方）
//   · 暴露 muzzlePoint / bladeTip / attackPoint 三个锚点，clone 后按 name 重绑定
//   · 世界模型 / 视图模型都走 getMaterials() 缓存，clone 时只复制节点

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);
    const TEX = IS_TOUCH_LOW ? 256 : 512;

    // ============================================================
    // Canvas 工具
    // ============================================================
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
        t.anisotropy = IS_TOUCH_LOW ? 2 : 8;
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
        t.anisotropy = IS_TOUCH_LOW ? 2 : 8;
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

        const aoStrength  = opts.aoStrength  !== undefined ? opts.aoStrength  : 0.35;
        const wearLow     = opts.wearLow     !== undefined ? opts.wearLow     : 0.32;
        const wearHigh    = opts.wearHigh    !== undefined ? opts.wearHigh    : 0.55;
        const dirtAmount  = opts.dirtAmount  !== undefined ? opts.dirtAmount  : 0.06;
        const grainAmount = opts.grainAmount !== undefined ? opts.grainAmount : 6;
        const wearBoost   = opts.wearBoost   !== undefined ? opts.wearBoost   : 1.0;

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
        else if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = IS_TOUCH_LOW ? 2 : 8;
        return t;
    }

    // ============================================================
    // 高度图
    // ============================================================
    function bladeHeight() {
        const S = TEX;
        const { c, ctx, img, d } = newHeightData(S);
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
        const { c, ctx, img, d } = newHeightData(S);
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
        const { c, ctx, img, d } = newHeightData(S);
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
            nBlade:   normalMapFromHeight(hBlade,   0.6),
            nSteel:   normalMapFromHeight(hSteel,   1.1),
            nLeather: normalMapFromHeight(hLeather, 1.9),

            rBlade:   roughMapFromHeight(hBlade,   0.03, 0.09, 1.0),
            rSteel:   roughMapFromHeight(hSteel,   0.10, 0.24, 1.0),
            rLeather: roughMapFromHeight(hLeather, 0.68, 0.88, 1.0),

            cBlade:   colorMapFromHeight(hBlade,   [225, 230, 238], [252, 254, 255],
                { aoStrength: 0.20, wearLow: 0.26, wearHigh: 0.60, dirtAmount: 0.012, grainAmount: 2 }),
            cSteel:   colorMapFromHeight(hSteel,   [180, 186, 194], [230, 234, 240],
                { aoStrength: 0.26, wearLow: 0.30, wearHigh: 0.58, dirtAmount: 0.02,  grainAmount: 3 }),
            cLeather: colorMapFromHeight(hLeather, [28, 22, 18],    [78, 64, 52],
                { aoStrength: 0.55, wearLow: 0.30, wearHigh: 0.55, dirtAmount: 0.08,  grainAmount: 6 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图
    // ============================================================
    function softboxRect(ctx, cx, cy, w, h, rgb, alpha) {
        const layers = 14;
        for (let i = layers; i >= 0; i--) {
            const t = i / layers;
            const sc = 1 + t * 0.7;
            const a = alpha * Math.pow(1 - t, 2.0) * 0.42;
            ctx.fillStyle = 'rgba(' + rgb + ', ' + a + ')';
            ctx.fillRect(cx - w * sc / 2, cy - h * sc / 2, w * sc, h * sc);
        }
        ctx.fillStyle = 'rgba(' + rgb + ', ' + alpha + ')';
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    }

    let _envMap = null;
    function getEnvMap() {
        if (_envMap) return _envMap;
        if (typeof renderer === 'undefined' || !renderer) return null;
        try {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();

            const W = IS_TOUCH_LOW ? 2048 : 4096, H = W / 2;
            const c = makeCanvas(W, H), ctx = c.getContext('2d');

            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0.00, '#05070a');
            g.addColorStop(0.20, '#0c1016');
            g.addColorStop(0.38, '#28323e');
            g.addColorStop(0.46, '#5a6a80');
            g.addColorStop(0.50, '#8794a8');
            g.addColorStop(0.54, '#3a4454');
            g.addColorStop(0.65, '#181c24');
            g.addColorStop(0.85, '#080a0d');
            g.addColorStop(1.00, '#030405');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            const k = W / 4096;

            softboxRect(ctx, 1400*k, 260*k, 1700*k, 420*k, '255,248,235', 1.0);
            softboxRect(ctx, 2950*k, 340*k, 1050*k, 300*k, '220,232,255', 0.92);
            softboxRect(ctx, 340*k,  720*k, 480*k,  210*k, '200,216,255', 0.72);
            softboxRect(ctx, 3740*k, 840*k, 620*k,  230*k, '255,215,170', 0.78);
            softboxRect(ctx, 2000*k, 470*k, 380*k,  65*k,  '255,242,225', 0.65);
            softboxRect(ctx, 2200*k, 180*k, 700*k,  140*k, '245,250,255', 0.75);

            const gb = ctx.createLinearGradient(0, H * 0.55, 0, H);
            gb.addColorStop(0, 'rgba(16, 20, 26, 0.55)');
            gb.addColorStop(1, 'rgba(3, 4, 6, 0.95)');
            ctx.fillStyle = gb;
            ctx.fillRect(0, H * 0.55, W, H * 0.45);

            const tex = new THREE.CanvasTexture(c);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;

            const rt = pmrem.fromEquirectangular(tex);
            _envMap = rt.texture;
            tex.dispose();
            pmrem.dispose();
        } catch (e) {
            console.warn('[weapon_knife_hd] 环境贴图生成失败', e);
        }
        return _envMap;
    }

    // ============================================================
    // 材质（缓存，供所有 clone 共享）
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
        if (!nor) return;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            const nx = Math.abs(nor.getX(i));
            const ny = Math.abs(nor.getY(i));
            const nz = Math.abs(nor.getZ(i));
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            let u, v;
            if (nz >= nx && nz >= ny)      { u = x; v = y; }
            else if (nx >= ny)              { u = z; v = y; }
            else                            { u = x; v = z; }
            uv[i * 2]     = u * scale;
            uv[i * 2 + 1] = v * scale;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    const CURVE_SEG = IS_TOUCH_LOW ? 8 : 14;
    const BEVEL_SEG = IS_TOUCH_LOW ? 2 : 3;

    function roundedBoxZ(w, h, d, r, bevel, uvScale) {
        bevel   = bevel   === undefined ? 0.0012 : bevel;
        uvScale = uvScale === undefined ? 22     : uvScale;
        const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
            depth: Math.max(d - bevel * 2, 0.0002),
            bevelEnabled: true,
            bevelThickness: bevel, bevelSize: bevel,
            bevelSegments: BEVEL_SEG, curveSegments: CURVE_SEG,
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
    // 刀身几何（+X 方向，刀尖在 +X 端）
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

        // 保证法线朝外
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

        applyTriplanarUV(geo, 30);
        return geo;
    }

    // ============================================================
    // 构建整刀（+X 为刀尖方向）
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

        // -------- 2. 护手（竖椭圆薄片） --------
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
        applyTriplanarUV(gGeo, 22);

        part(gGeo, MAT.steel, GUARD_X, 0, 0);

        // -------- 3. 皮革缠绕柄 --------
        const HANDLE_X0 = -0.160;
        const HANDLE_X1 = -0.045;
        const HANDLE_L  = HANDLE_X1 - HANDLE_X0;
        const HANDLE_CX = (HANDLE_X0 + HANDLE_X1) / 2;

        // 内芯（钢）
        part(roundedBoxX(HANDLE_L + 0.006, 0.024, 0.020, 0.008), MAT.steel,
             HANDLE_CX, 0, 0);

        // 皮革主体
        part(roundedBoxX(HANDLE_L, 0.029, 0.024, 0.010), MAT.leather,
             HANDLE_CX, 0, 0);

        // 后端球头
        part(new THREE.SphereGeometry(0.0155, 20, 14), MAT.leather,
             HANDLE_X0 - 0.002, 0, 0);

        // 皮革缠绕环（16 道）
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

        // 缠绕起收线
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
        //   · muzzlePoint：兼容 muzzleWorld() 使用的枪口点 → 刀尖位置
        //   · bladeTip   ：刀尖锚点（供后续命中判定使用）
        //   · attackPoint：攻击判定中心（护手位置）
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

        // -------- 整体旋转：+X → -Z（刀尖朝前） --------
        gun.rotation.y = Math.PI / 2;

                gun.userData.muzzlePoint = muzzlePoint;
        gun.userData.bladeTip    = bladeTip;
        gun.userData.attackPoint = attackPoint;

        // ★ 风险 5 修复：世界模型规范变换
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

        // ★ 屏幕右下角，刀尖朝前，刀身微微上抬（BASE_RZ）
        //   rotation.set(0, π/2, rz) → 刀尖方向约 (0, sin rz, -cos rz)
        const BASE_X = 0.26;
        const BASE_Y = -0.22;
        const BASE_Z = -0.42;
        const BASE_RY = Math.PI / 2;
        const BASE_RZ = 0.10;

        g.position.set(BASE_X, BASE_Y, BASE_Z);
        g.rotation.set(0, BASE_RY, BASE_RZ);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = new THREE.Euler(0, BASE_RY, BASE_RZ);
        // 刀无 ADS，与 base 保持一致（不进入 rifle/odin 的 ADS 分支）
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

    console.log('[weapon_knife_hd] 高细节战术匕首已注册（对称双刃 · 凹磨刃口 · 皮革缠绕柄）');
})();