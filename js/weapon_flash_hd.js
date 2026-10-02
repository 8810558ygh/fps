// ===== js/weapon_flash_hd.js – 高细节 PBR 闪光弹模型 =====
// 使用方式（与 rifle/sniper/shotgun/odin/knife/smoke 完全一致）：
//   1. 本文件必须在 player_model.js 之前加载
//   2. player_model.js 的 _getWorldTemplate / _getViewTemplate 需加 flash 分支
//   3. loading.js 的任务列表加上 'flash' 预热
//
// 仅覆盖 'flash'，其他武器不受影响。
//
// ★ 设计要点（与 smoke 视觉明确区分）：
//   · 罐体：深中性军灰 0x4c4e4c（不是绿）
//   · 标记环：鲜黄 0xffd24a + 暖黄 emissive（一眼识别）
//   · 粗糙度更低（0.42~0.68），金属反光更强
//   · 环境贴图多加一盏暖黄 softbox，模拟闪光弹的"亮"暗示
//   · 顶部：拉环 + 拉销 + 保险丝 + 铭牌（与 smoke 结构一致）
//   · 暴露 muzzlePoint 锚点（保持 _cloneHdTemplate 兼容）
//   · preload(renderer) 主动上传纹理 + 编译 shader，彻底消除首帧卡顿

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);
    const TEX_SIZE = IS_TOUCH_LOW ? 256 : 512;
    const CYL_SEG  = IS_TOUCH_LOW ? 32  : 64;

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

    // ★ flash 特有：灰度贴图（用于深灰色罐体）
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

        const baseGray = 210;
        const wornGray = 250;

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

    // ============================================================
    // 高度图
    // ============================================================
    function flashCanisterHeight() {
        const S = TEX_SIZE;
        const { c, ctx, img, d } = newHeightData(S);
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
        const { c, ctx, img, d } = newHeightData(S);
        const mask = S - 1;

        const n1 = (S * S * 0.8) | 0;
        for (let i = 0; i < n1; i++) {
            const x = (Math.random() * S) | 0;
            const y = (Math.random() * S) | 0;
            const v = 128 + ((Math.random() - 0.5) * 45) | 0;
            const idx = (y * S + x) << 2;
            d[idx] = d[idx + 1] = d[idx + 2] = v;
        }

        // 竖向滚花
        const step = Math.max(4, S / 96);
        for (let x = 0; x < S; x += step) {
            const xi = x | 0;
            const v = 128 + 45;
            for (let y = 0; y < S; y++) {
                const idx = (y * S + xi) << 2;
                d[idx] = d[idx + 1] = d[idx + 2] = v;
            }
        }

        // 斑点
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
            nCanister: normalMapFromHeight(hCan, 0.9),   // ★ flash 法线更弱（光滑罐体）
            nCap:      normalMapFromHeight(hCap, 1.6),

            rCanister: roughMapFromHeight(hCan, 0.42, 0.68, 1.0),  // ★ 更光滑
            rCap:      roughMapFromHeight(hCap, 0.22, 0.42, 1.0),

            // ★ flash 用灰度贴图（深灰罐体）
            gCanister: grayMapFromHeight(hCan, {
                aoStrength: 0.35, wearLow: 0.30, wearHigh: 0.55, grainAmount: 4
            }),

            cCap: colorMapFromHeight(hCap,
                [168, 172, 178], [216, 220, 224],
                { aoStrength: 0.35, wearLow: 0.28, wearHigh: 0.55,
                  dirtAmount: 0.04, grainAmount: 4 }),
        };
        return _tex;
    }

    // ============================================================
    // 环境贴图（比 smoke 多一盏暖黄 softbox）
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
            g.addColorStop(0.00, '#0d1117');
            g.addColorStop(0.28, '#1e2c3a');
            g.addColorStop(0.46, '#5d718a');
            g.addColorStop(0.50, '#8a99ac');
            g.addColorStop(0.54, '#3a4452');
            g.addColorStop(0.74, '#161a20');
            g.addColorStop(1.00, '#050608');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            function softbox(cx, cy, w, h, rgb, alpha) {
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

            softbox(W * 0.30, H * 0.18, 500, 260, '255,248,235', 1.00);
            softbox(W * 0.72, H * 0.24, 380, 220, '210,225,255', 0.85);
            softbox(W * 0.10, H * 0.42, 220, 140, '255,215,170', 0.65);
            softbox(W * 0.88, H * 0.55, 260, 160, '180,200,220', 0.55);
            // ★ flash 特有：暖黄 softbox，暗示"闪光"
            softbox(W * 0.50, H * 0.62, 320, 130, '255,220,140', 0.35);

            const tex = new THREE.CanvasTexture(c);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            else if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;

            const rt = pmrem.fromEquirectangular(tex);
            _envMap = rt.texture;
            tex.dispose();
            pmrem.dispose();
        } catch (e) {
            console.warn('[weapon_flash_hd] 环境贴图生成失败', e);
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
            // ★ 罐体：深中性军灰（flash 特有）
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

            // ★ 鲜黄标记环（flash 特有，高辨识度）
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

        // -------- 枪口锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(0, 0, 0);
        inner.add(muzzlePoint);

        gun.userData.muzzlePoint = muzzlePoint;

        // ★ 风险 5 修复：显式记录世界模型规范变换
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

        // 与其它投掷物 viewmodel 保持一致的"手部"位置
        const BASE_X = 0.32, BASE_Y = -0.30, BASE_Z = -0.44;
        const BASE_RX = 0.15, BASE_RY = -0.30, BASE_RZ = 0.10;

        g.position.set(BASE_X, BASE_Y, BASE_Z);
        g.rotation.set(BASE_RX, BASE_RY, BASE_RZ);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = new THREE.Euler(BASE_RX, BASE_RY, BASE_RZ);
        // 投掷物无 ADS，与 base 保持一致
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
    // ★ 强制预热：主动把纹理送入显存 + 编译 shader
    //
    //   loading.js 会调用 __HD_FLASH.preload(renderer)
    //   效果：
    //     1. renderer.initTexture() 立即执行 texImage2D → 纹理上 GPU
    //     2. 用 dummy mesh 走一遍 renderer.compile() → 编译 PBR shader
    //     3. 再走一遍 renderer.render() → 覆盖 clearcoat/envMap 变体
    // ============================================================
    function preload(rendererArg) {
        const r = rendererArg || (typeof renderer !== 'undefined' ? renderer : null);
        if (!r) return;

        // ---- 1. 强制上传纹理 ----
        const tex = getTextures();
        const env = getEnvMap();

        const allTextures = [
            tex.nCanister, tex.nCap,
            tex.rCanister, tex.rCap,
            tex.gCanister, tex.cCap,   // ★ flash 用 gCanister
            env,
        ];

        for (const t of allTextures) {
            if (t && typeof r.initTexture === 'function') {
                try { r.initTexture(t); } catch (e) {}
            }
        }

        // ---- 2. 用 dummy mesh 走一遍 compile + render ----
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

        // 用 viewmodel 完整构建一次，覆盖所有 mesh 组合
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
            if (typeof r.compile === 'function') {
                r.compile(scene, p1.cam);
            }
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

        console.log('[weapon_flash_hd] preload 完成：纹理已上传 + shader 已编译');
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.__HD_FLASH = {
        buildWorld:     buildFlashHD,
        buildViewmodel: buildFlashViewmodelHD,
        preload:        preload,

        // 调试用
        _getTextures:   getTextures,
        _getEnvMap:     getEnvMap,
        _getMaterials:  getMaterials,
    };

    console.log('[weapon_flash_hd] 高细节闪光弹已注册（深中性军灰 + 鲜黄标记环 · PBR）');
})();