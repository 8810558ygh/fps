// ===== js/weapon_hd_common.js – 武器 HD 模型公共工具 =====
//
// 所有 weapon_*_hd.js 共用的工具集：
//   · Canvas / 高度图 data
//   · 法线 / 粗糙度 / 颜色 / 灰度 贴图生成
//   · 圆角几何 + 三角平面 UV 投影
//   · PMREM 环境贴图（带缓存）
//
// 加载顺序：本文件必须在任何 weapon_*_hd.js 之前加载

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);

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

    // ============================================================
    // 贴图生成
    // ============================================================
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

                const dirt  = (Math.random() - 0.5) * dirtAmount * 80;
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

    // 灰度贴图（深灰罐体 / 中性灰表面）
    function grayMapFromHeight(hCanvas, opts) {
        opts = opts || {};
        const S = hCanvas.width;
        const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = makeCanvas(S);
        const octx = out.getContext('2d');
        const dst = octx.createImageData(S, S);
        const d = dst.data;
        const mask = S - 1;

        const aoStrength  = opts.aoStrength  !== undefined ? opts.aoStrength  : 0.35;
        const wearLow     = opts.wearLow     !== undefined ? opts.wearLow     : 0.30;
        const wearHigh    = opts.wearHigh    !== undefined ? opts.wearHigh    : 0.55;
        const grainAmount = opts.grainAmount !== undefined ? opts.grainAmount : 5;
        const baseGray    = opts.baseGray    !== undefined ? opts.baseGray    : 210;
        const wornGray    = opts.wornGray    !== undefined ? opts.wornGray    : 250;

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

                const v = baseGray * (1 - w) + wornGray * w;
                const grain = (Math.random() - 0.5) * grainAmount;

                const val = Math.max(0, Math.min(255, v * ao + grain));
                const i = (y * S + x) << 2;
                d[i] = d[i + 1] = d[i + 2] = val;
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

        let uv = geo.attributes.uv;
        if (!uv) {
            uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
            geo.setAttribute('uv', uv);
        }

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

    // uvScale 传 0 或省略时不做 triplanar（与旧版行为一致）
    function roundedBoxZ(w, h, d, r, bevel, uvScale, curveSeg, bevelSeg) {
        bevel    = bevel    === undefined ? 0.0016 : bevel;
        curveSeg = curveSeg === undefined ? (IS_TOUCH_LOW ? 5 : 8) : curveSeg;
        bevelSeg = bevelSeg === undefined ? 2 : bevelSeg;

        const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
            depth: Math.max(d - bevel * 2, 0.0002),
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: bevelSeg,
            curveSegments: curveSeg,
        });
        geo.translate(0, 0, -(d - bevel * 2) / 2);
        geo.computeVertexNormals();

        if (uvScale && uvScale > 0) {
            applyTriplanarUV(geo, uvScale);
        }
        return geo;
    }

    function roundedBoxX(L, H, W, r, bevel, uvScale, curveSeg, bevelSeg) {
        const geo = roundedBoxZ(W, H, L, r, bevel, uvScale, curveSeg, bevelSeg);
        geo.rotateY(Math.PI / 2);
        return geo;
    }

    // ============================================================
    // 环境贴图（PMREM）
    // ============================================================
    function paintSoftbox(ctx, cx, cy, w, h, rgb, alpha) {
        const layers = 16;
        for (let i = layers; i >= 0; i--) {
            const t = i / layers;
            const sc = 1 + t * 0.7;
            const a = alpha * Math.pow(1 - t, 2.0) * 0.40;
            ctx.fillStyle = 'rgba(' + rgb + ', ' + a + ')';
            ctx.fillRect(cx - w * sc / 2, cy - h * sc / 2, w * sc, h * sc);
        }
        ctx.fillStyle = 'rgba(' + rgb + ', ' + alpha + ')';
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    }

    // ★ 获取全局 renderer：
    //    · main.js 里是 `const renderer = ...`，顶层 const 不会自动挂 window
    //    · 但同一全局词法环境里，其他文件通过 `typeof renderer` 能取到
    //    · 加 try/catch 兜底 TDZ（buildEnvMap 在运行时被调用，理论上不会触发）
    //    · window.renderer 作为第二道保险（main.js 会主动挂上）
    function _getGlobalRenderer() {
        try {
            if (typeof renderer !== 'undefined' && renderer) return renderer;
        } catch (e) {
            // TDZ 中，忽略
        }
        if (typeof window !== 'undefined' && window.renderer) return window.renderer;
        return null;
    }

    const _envCache = new Map();

    /**
     * buildEnvMap(config) —— 生成 PMREM 环境贴图，带缓存
     *
     * config = {
     *   key:        'rifle_env',                  // 必填，用于缓存
     *   width:      1024,                          // 默认 1024
     *   height:     512,                           // 默认 width/2
     *
     *   // 渐变背景（垂直方向）
     *   gradient: [
     *     [0.00, '#0e1218'],
     *     [0.50, '#909fb2'],
     *     [1.00, '#050607'],
     *   ],
     *
     *   // 径向灯光
     *   lights: [
     *     { cx: 125, cy: 30, r: 130, rgb: '255,252,242', alpha: 1.0 },
     *   ],
     *
     *   // softbox 矩形（支持 ncx/ncy/nw/nh 归一化 0~1，或 cx/cy/w/h 绝对像素）
     *   softboxes: [
     *     { ncx: 0.30, ncy: 0.18, nw: 0.20, nh: 0.15, rgb: '255,248,235', alpha: 1.0 },
     *   ],
     *
     *   // 可选：底部渐暗
     *   bottomGradient: { startY: 0.55, from: 'rgba(16,20,26,0.55)', to: 'rgba(3,4,6,0.95)' },
     * }
     */
    function buildEnvMap(config) {
        config = config || {};
        const renderer = _getGlobalRenderer();
        if (!renderer) {
            console.warn('[HD_UTIL] buildEnvMap: 无法获取 renderer，envMap 将不可用');
            return null;
        }

        if (config.key && _envCache.has(config.key)) {
            return _envCache.get(config.key);
        }

        try {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();

            const W = config.width  || 1024;
            const H = config.height || (W / 2);
            const c = makeCanvas(W, H);
            const ctx = c.getContext('2d');

            // ---- 基础渐变 ----
            const stops = config.gradient || [
                [0.00, '#0e1218'], [0.30, '#233040'],
                [0.48, '#6b7f96'], [0.50, '#909fb2'],
                [0.52, '#404855'], [0.75, '#181c22'],
                [1.00, '#050607'],
            ];
            const g = ctx.createLinearGradient(0, 0, 0, H);
            for (let i = 0; i < stops.length; i++) {
                g.addColorStop(stops[i][0], stops[i][1]);
            }
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // ---- 径向灯光 ----
            if (config.lights) {
                for (let i = 0; i < config.lights.length; i++) {
                    const L = config.lights[i];
                    const rg = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.r);
                    rg.addColorStop(0,    'rgba(' + L.rgb + ',' + L.alpha + ')');
                    rg.addColorStop(0.35, 'rgba(' + L.rgb + ',' + (L.alpha * 0.45) + ')');
                    rg.addColorStop(0.7,  'rgba(' + L.rgb + ',' + (L.alpha * 0.10) + ')');
                    rg.addColorStop(1,    'rgba(' + L.rgb + ',0)');
                    ctx.fillStyle = rg;
                    ctx.fillRect(L.cx - L.r, L.cy - L.r, L.r * 2, L.r * 2);
                }
            }

            // ---- softbox ----
            if (config.softboxes) {
                for (let i = 0; i < config.softboxes.length; i++) {
                    const sb = config.softboxes[i];
                    let cx, cy, w, h;
                    if (sb.ncx !== undefined) {
                        cx = W * sb.ncx; cy = H * sb.ncy;
                        w  = W * sb.nw;  h  = H * sb.nh;
                    } else {
                        cx = sb.cx; cy = sb.cy; w = sb.w; h = sb.h;
                    }
                    paintSoftbox(ctx, cx, cy, w, h, sb.rgb, sb.alpha);
                }
            }

            // ---- 底部渐暗 ----
            if (config.bottomGradient) {
                const bg = config.bottomGradient;
                const startY = H * (bg.startY !== undefined ? bg.startY : 0.55);
                const gb = ctx.createLinearGradient(0, startY, 0, H);
                gb.addColorStop(0, bg.from);
                gb.addColorStop(1, bg.to);
                ctx.fillStyle = gb;
                ctx.fillRect(0, startY, W, H - startY);
            }

            // ---- PMREM ----
            const tex = new THREE.CanvasTexture(c);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;

            const rt = pmrem.fromEquirectangular(tex);
            const envMap = rt.texture;

            tex.dispose();
            pmrem.dispose();

            if (config.key) _envCache.set(config.key, envMap);
            return envMap;
        } catch (e) {
            console.warn('[HD_UTIL] buildEnvMap 失败:', config.key || '', e);
            return null;
        }
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.HD_UTIL = {
        IS_TOUCH_LOW,
        makeCanvas,
        newHeightData,
        normalMapFromHeight,
        roughMapFromHeight,
        colorMapFromHeight,
        grayMapFromHeight,
        roundedRectShape,
        applyTriplanarUV,
        scaleGeometryUV,
        roundedBoxZ,
        roundedBoxX,
        paintSoftbox,
        buildEnvMap,

        // 调试用
        _getGlobalRenderer,
        _envCache,
    };

    console.log('[HD_UTIL] 武器 HD 公共工具已注册');
})();