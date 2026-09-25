// ===== js/weapon_sniper_hd.js – 高细节 PBR 狙击枪模型（冥驹风格 · 左侧大拉栓）=====
// 使用方式：
//   1. 本文件必须在 player_model.js 之前加载
//   2. player_model.js 里的 makeWeaponModel / makeViewmodel 需加早返回
//
// 仅覆盖 'sniper'，其他武器不受影响。

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);
    const TEX_SIZE = IS_TOUCH_LOW ? 128 : 256;
    const SNIPER_SCALE = 0.62;   // ★ 调整：0.72 → 0.62（枪太长，缩一点）

    // ============================================================
    // Canvas 工具
    // ============================================================
    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h || w;
        return c;
    }

    function normalMapFromHeight(hCanvas, strength) {
        const S = hCanvas.width;
        const src = hCanvas.getContext('2d').getImageData(0, 0, S, S).data;
        const out = makeCanvas(S);
        const octx = out.getContext('2d');
        const dst = octx.createImageData(S, S);
        const at = (x, y) => {
            x = ((x % S) + S) % S;
            y = ((y % S) + S) % S;
            return src[(y * S + x) * 4] / 255;
        };
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
                const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
                const len = Math.sqrt(dx * dx + dy * dy + 1) || 1;
                const i = (y * S + x) * 4;
                dst.data[i]     = ((-dx / len) * 0.5 + 0.5) * 255;
                dst.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
                dst.data[i + 2] = (( 1 / len) * 0.5 + 0.5) * 255;
                dst.data[i + 3] = 255;
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
        const range = high - low;
        for (let i = 0; i < src.length; i += 4) {
            let v = src[i] / 255;
            v = Math.pow(v, contrast);
            v = low + v * range;
            const g = Math.max(0, Math.min(255, v * 255)) | 0;
            dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = g;
            dst.data[i + 3] = 255;
        }
        octx.putImageData(dst, 0, 0);
        const t = new THREE.CanvasTexture(out);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
    }

    // ============================================================
    // 高度图生成器
    // ============================================================
    function hPolymerCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        const n1 = S * S * 0.55;
        for (let i = 0; i < n1; i++) {
            const v = 128 + ((Math.random() - 0.5) * 65) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
        }
        const n2 = S * 12;
        for (let i = 0; i < n2; i++) {
            const x = Math.random() * S, y = Math.random() * S;
            const r = 1 + Math.random() * 2.2;
            const v = 128 + ((Math.random() - 0.5) * 55) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        return c;
    }

    function hBrushedCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * 12; i++) {
            const y = Math.random() * S, x0 = Math.random() * S;
            const len = 20 + Math.random() * S * 0.55;
            const v = 128 + ((Math.random() - 0.5) * 90) | 0;
            ctx.strokeStyle = `rgba(${v},${v},${v},${0.10 + Math.random() * 0.28})`;
            ctx.lineWidth = Math.random() * 1.3;
            ctx.beginPath(); ctx.moveTo(x0, y);
            ctx.lineTo(x0 + len, y + (Math.random() - 0.5) * 1.6); ctx.stroke();
        }
        return c;
    }

    function hSteelCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * S * 0.6; i++) {
            const v = 128 + ((Math.random() - 0.5) * 55) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.2, 1.2);
        }
        for (let i = 0; i < S * 3; i++) {
            const x = Math.random() * S, y = Math.random() * S;
            const r = 0.6 + Math.random() * 1.8;
            const v = (128 - 20 - Math.random() * 40) | 0;
            ctx.fillStyle = `rgba(${v},${v},${v},0.6)`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        return c;
    }

    function hGripCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * S * 0.6; i++) {
            const v = 128 + ((Math.random() - 0.5) * 70) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
        }
        ctx.strokeStyle = 'rgba(180,180,180,0.45)';
        ctx.lineWidth = 1.6;
        const step = Math.max(8, S / 40);
        for (let i = -S; i < S * 2; i += step) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke();
        }
        return c;
    }

    function hRubberCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * S * 1.5; i++) {
            const v = 128 + ((Math.random() - 0.5) * 130) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
        }
        return c;
    }

    // ============================================================
    // 纹理缓存
    // ============================================================
    let _tex = null;
    function getTextures() {
        if (_tex) return _tex;
        const hPoly = hPolymerCanvas();
        const hBrush = hBrushedCanvas();
        const hSteel = hSteelCanvas();
        const hGrip = hGripCanvas();
        const hRub = hRubberCanvas();
        _tex = {
            nPolymer: normalMapFromHeight(hPoly, 1.4),
            nBrushed: normalMapFromHeight(hBrush, 1.6),
            nSteel:   normalMapFromHeight(hSteel, 1.5),
            nGrip:    normalMapFromHeight(hGrip, 2.2),
            nRubber:  normalMapFromHeight(hRub, 3.0),
            rPolymer: roughMapFromHeight(hPoly,  0.72, 0.88, 1.0),
            rBrushed: roughMapFromHeight(hBrush, 0.22, 0.42, 1.0),
            rSteel:   roughMapFromHeight(hSteel, 0.20, 0.40, 1.0),
            rGrip:    roughMapFromHeight(hGrip,  0.78, 0.92, 1.0),
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
            const W = 512, H = 256;
            const cv = makeCanvas(W, H);
            const ctx = cv.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0.00, '#0e1218');
            g.addColorStop(0.30, '#233040');
            g.addColorStop(0.48, '#6b7f96');
            g.addColorStop(0.50, '#909fb2');
            g.addColorStop(0.52, '#404855');
            g.addColorStop(0.75, '#181c22');
            g.addColorStop(1.00, '#050607');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            const lights = [
                { x: 125, y: 30,  r: 130, c: '255,252,242', a: 1.0 },
                { x: 325, y: 40,  r: 105, c: '210,225,255', a: 0.85 },
                { x: 440, y: 70,  r: 80,  c: '255,215,170', a: 0.7 },
                { x: 75,  y: 95,  r: 95,  c: '150,180,220', a: 0.5 },
            ];
            lights.forEach(L => {
                const rg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
                rg.addColorStop(0,    `rgba(${L.c},${L.a})`);
                rg.addColorStop(0.35, `rgba(${L.c},${L.a * 0.45})`);
                rg.addColorStop(0.7,  `rgba(${L.c},${L.a * 0.1})`);
                rg.addColorStop(1,    `rgba(${L.c},0)`);
                ctx.fillStyle = rg;
                ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
            });
            const tex = new THREE.CanvasTexture(cv);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            const rt = pmrem.fromEquirectangular(tex);
            _envMap = rt.texture;
            tex.dispose();
            pmrem.dispose();
        } catch (e) {
            console.warn('[weapon_sniper_hd] 环境贴图生成失败', e);
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
            body: new THREE.MeshPhysicalMaterial(mk({
                color: 0x3a3d42, metalness: 0.85, roughness: 0.48,
                roughnessMap: tex.rPolymer, normalMap: tex.nPolymer,
                normalScale: new THREE.Vector2(0.35, 0.35),
                clearcoat: 0.20, clearcoatRoughness: 0.60, envMapIntensity: 1.10,
            })),
            receiver: new THREE.MeshPhysicalMaterial(mk({
                color: 0x1e2126, metalness: 0.92, roughness: 0.40,
                roughnessMap: tex.rPolymer, normalMap: tex.nPolymer,
                normalScale: new THREE.Vector2(0.45, 0.45),
                clearcoat: 0.28, clearcoatRoughness: 0.50, envMapIntensity: 1.20,
            })),
            steel: new THREE.MeshPhysicalMaterial(mk({
                color: 0x181a1e, metalness: 1.0, roughness: 0.32,
                roughnessMap: tex.rBrushed, normalMap: tex.nBrushed,
                normalScale: new THREE.Vector2(0.4, 0.4),
                clearcoat: 0.20, clearcoatRoughness: 0.30, envMapIntensity: 1.50,
            })),
            bright: new THREE.MeshPhysicalMaterial(mk({
                color: 0x9aa2ac, metalness: 1.0, roughness: 0.20,
                normalMap: tex.nSteel,
                normalScale: new THREE.Vector2(0.25, 0.25),
                envMapIntensity: 1.9,
            })),
            grip: new THREE.MeshPhysicalMaterial(mk({
                color: 0x1a1c20, metalness: 0.04, roughness: 0.86,
                roughnessMap: tex.rGrip, normalMap: tex.nGrip,
                normalScale: new THREE.Vector2(1.2, 1.2),
                clearcoat: 0.10, clearcoatRoughness: 0.88, envMapIntensity: 0.80,
            })),
            rubber: new THREE.MeshStandardMaterial(mk({
                color: 0x0c0e11, metalness: 0.0, roughness: 0.95,
                normalMap: tex.nRubber,
                normalScale: new THREE.Vector2(1.5, 1.5), envMapIntensity: 0.35,
            })),
            glass: new THREE.MeshPhysicalMaterial(mk({
                color: 0x0a1c30, metalness: 0.0, roughness: 0.015,
                clearcoat: 1.0, clearcoatRoughness: 0.01,
                reflectivity: 1.0, ior: 1.52,
                emissive: 0x071626, emissiveIntensity: 1.4,
                envMapIntensity: 3.2,
                side: THREE.DoubleSide,
            })),
            dot: new THREE.MeshBasicMaterial({ color: 0x35e8a0 }),
            slotInner: new THREE.MeshStandardMaterial(mk({
                color: 0x060709, metalness: 0.60, roughness: 0.70, envMapIntensity: 0.30,
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

    const CURVE_SEG = IS_TOUCH_LOW ? 5 : 8;
    const BEVEL_SEG = 2;

    function roundedBoxZ(w, h, d, r, bevel) {
        bevel = bevel === undefined ? 0.0016 : bevel;
        const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
            depth: Math.max(d - bevel * 2, 0.0002),
            bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
            bevelSegments: BEVEL_SEG, curveSegments: CURVE_SEG,
        });
        geo.translate(0, 0, -(d - bevel * 2) / 2);
        geo.computeVertexNormals();
        return geo;
    }

    function roundedBoxX(L, H, W, r, bevel) {
        const geo = roundedBoxZ(W, H, L, r, bevel);
        geo.rotateY(Math.PI / 2);
        return geo;
    }

    function boxX(L, H, W, r) { return roundedBoxX(L, H, W, r === undefined ? 0.002 : r, 0.0012); }
    function boxZ(W, H, D, r) { return roundedBoxZ(W, H, D, r === undefined ? 0.002 : r, 0.0012); }

    // ============================================================
    // 构建狙击枪（+X 为枪管方向，-Z 为左侧拉栓）
    // ============================================================
    function buildSniperHD() {
        const MAT = getMaterials();
        const gun = new THREE.Group();
        const inner = new THREE.Group();
        gun.add(inner);

        function part(geo, mat, x, y, z, rx, ry, rz, parent) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            m.rotation.set(rx || 0, ry || 0, rz || 0);
            m.castShadow = true; m.receiveShadow = true;
            (parent || inner).add(m);
            return m;
        }

        const R = Math.PI / 2;
        const AXIS_Y = 0.070;

        // -------- 1. 枪托 --------
        part(boxX(0.200, 0.098, 0.058, 0.008), MAT.receiver, -0.480, 0.055, 0);
        part(boxX(0.320, 0.022, 0.052, 0.004), MAT.body,     -0.400, 0.118, 0);
        part(boxX(0.240, 0.028, 0.058, 0.006), MAT.grip,     -0.400, 0.138, 0);
        part(boxX(0.200, 0.008, 0.008, 0.002), MAT.body,     -0.400, 0.126,  0.028);
        part(boxX(0.200, 0.008, 0.008, 0.002), MAT.body,     -0.400, 0.126, -0.028);
        part(new THREE.CylinderGeometry(0.0062, 0.0062, 0.012, 14), MAT.bright,
             -0.400, 0.158, 0, 0, 0, 0);

        const lowerStockShape = new THREE.Shape();
        lowerStockShape.moveTo( 0.000,  0.000);
        lowerStockShape.lineTo( 0.000, -0.038);
        lowerStockShape.lineTo(-0.060, -0.052);
        lowerStockShape.lineTo(-0.200, -0.058);
        lowerStockShape.lineTo(-0.240, -0.042);
        lowerStockShape.lineTo(-0.240, -0.006);
        lowerStockShape.lineTo(-0.140,  0.002);
        lowerStockShape.lineTo(-0.060,  0.006);
        lowerStockShape.closePath();
        const lowerStockGeo = new THREE.ExtrudeGeometry(lowerStockShape, {
            depth: 0.048 - 0.003,
            bevelEnabled: true, bevelThickness: 0.0014, bevelSize: 0.0014,
            bevelSegments: 2, curveSegments: 6,
        });
        lowerStockGeo.translate(0, 0, -(0.048 - 0.003) / 2);
        lowerStockGeo.computeVertexNormals();
        part(lowerStockGeo, MAT.body, -0.310, -0.010, 0);

        part(boxX(0.240, 0.012, 0.048, 0.004), MAT.rubber, -0.410, -0.058, 0);
        part(boxX(0.022, 0.110, 0.056, 0.006), MAT.rubber, -0.590,  0.045, 0);
        for (let i = 0; i < 5; i++) {
            part(new THREE.BoxGeometry(0.0024, 0.100, 0.057), MAT.rubber,
                 -0.598 + i * 0.0045, 0.045, 0);
        }
        part(boxZ(0.140, 0.010, 0.003, 0.001), MAT.slotInner, -0.460, 0.070,  0.030);
        part(boxZ(0.140, 0.010, 0.003, 0.001), MAT.slotInner, -0.460, 0.070, -0.030);
        part(boxZ(0.140, 0.010, 0.003, 0.001), MAT.slotInner, -0.460, 0.030,  0.030);
        part(boxZ(0.140, 0.010, 0.003, 0.001), MAT.slotInner, -0.460, 0.030, -0.030);
        part(boxX(0.100, 0.006, 0.046, 0.002), MAT.steel, -0.520, 0.132, 0);
        part(new THREE.TorusGeometry(0.0090, 0.0019, 8, IS_TOUCH_LOW ? 14 : 18), MAT.steel,
             -0.540, -0.040, 0.030, 0, R, 0);

        // -------- 2. 机匣 --------
        part(boxX(0.280, 0.090, 0.064, 0.008), MAT.receiver, -0.100, 0.070, 0);
        part(boxX(0.300, 0.016, 0.058, 0.004), MAT.body,     -0.100, 0.118, 0);
        part(boxX(0.060, 0.078, 0.062, 0.006), MAT.receiver,  0.060, 0.070, 0);

        // 皮卡汀尼导轨
        part(boxX(0.720, 0.010, 0.040, 0.002), MAT.receiver, 0.130, 0.130, 0);
        for (let i = 0; i < 56; i++) {
            const x = -0.230 + i * 0.0128;
            if (x > 0.470) break;
            part(new THREE.BoxGeometry(0.0072, 0.0072, 0.040), MAT.receiver, x, 0.1385, 0);
        }
        for (let i = 0; i < 56; i++) {
            const x = -0.2236 + i * 0.0128;
            if (x > 0.470) break;
            part(new THREE.BoxGeometry(0.0048, 0.002, 0.040), MAT.slotInner, x, 0.1348, 0);
        }

        // 抛壳窗（右侧）
        part(boxZ(0.085, 0.038, 0.003, 0.002), MAT.slotInner, -0.045, 0.080, 0.0322);
        part(boxZ(0.082, 0.035, 0.002, 0.002), MAT.body,      -0.045, 0.080, 0.0328);

        // -------- 3. ★ 左侧大拉栓组 --------
        const boltGroup = new THREE.Group();
        boltGroup.name = 'boltGroup';        // ★ 新增：clone 后按 name 重新绑定
        inner.add(boltGroup);

        part(boxZ(0.052, 0.020, 0.010, 0.002), MAT.receiver,
             -0.090, 0.095, -0.036);
        part(new THREE.CylinderGeometry(0.0095, 0.0095, 0.048, 16), MAT.steel,
             -0.090, 0.095, -0.058, R, 0, 0, boltGroup);
        part(boxX(0.048, 0.022, 0.030, 0.005), MAT.steel,
             -0.090, 0.095, -0.086, 0, 0, 0, boltGroup);
        part(new THREE.CylinderGeometry(0.0150, 0.0150, 0.018, 20), MAT.bright,
             -0.090, 0.095, -0.110, R, 0, 0, boltGroup);
        part(new THREE.CylinderGeometry(0.0162, 0.0162, 0.004, 20), MAT.steel,
             -0.090, 0.095, -0.121, R, 0, 0, boltGroup);
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            part(new THREE.BoxGeometry(0.0018, 0.018, 0.0022), MAT.steel,
                 -0.090 + Math.cos(a) * 0.0150,
                  0.095 + Math.sin(a) * 0.0150,
                 -0.110, 0, 0, -a, boltGroup);
        }
        part(new THREE.TorusGeometry(0.0150, 0.0022, 8, 20), MAT.bright,
             -0.090, 0.095, -0.101, 0, 0, 0, boltGroup);
        part(new THREE.SphereGeometry(0.0040, 10, 8), MAT.bright,
             -0.090, 0.110, -0.110, 0, 0, 0, boltGroup);
        part(new THREE.SphereGeometry(0.0040, 10, 8), MAT.bright,
             -0.090, 0.080, -0.110, 0, 0, 0, boltGroup);

        // -------- 4. 快慢机 / 弹匣井 / 销钉 --------
        part(boxX(0.032, 0.012, 0.008, 0.002), MAT.steel, -0.060, 0.048, 0.038);
        part(new THREE.CylinderGeometry(0.0058, 0.0058, 0.030, 12), MAT.bright,
             -0.075, 0.048, 0.032, R, 0, 0);
        part(boxX(0.092, 0.056, 0.052, 0.006), MAT.receiver, -0.160, -0.005, 0, 0, 0, 0.02);
        part(boxX(0.098, 0.010, 0.058, 0.004), MAT.body,     -0.160, -0.036, 0, 0, 0, 0.02);
        part(boxX(0.016, 0.014, 0.012, 0.002), MAT.bright,   -0.110,  0.018, 0.032);
        part(boxZ(0.180, 0.012, 0.003, 0.001), MAT.slotInner, -0.100, 0.088,  0.0325);
        part(boxZ(0.180, 0.012, 0.003, 0.001), MAT.slotInner, -0.100, 0.088, -0.0325);
        part(new THREE.CylinderGeometry(0.0034, 0.0034, 0.064, 12), MAT.bright, -0.170, 0.045, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0034, 0.0034, 0.064, 12), MAT.bright,  0.020, 0.050, 0, R, 0, 0);

        // -------- 5. 扳机组 --------
        part(new THREE.TorusGeometry(0.030, 0.0042, 8, IS_TOUCH_LOW ? 16 : 24, Math.PI), MAT.receiver,
             -0.220, 0.012, 0, 0, 0, Math.PI);
        part(boxX(0.005, 0.030, 0.009, 0.002), MAT.receiver, -0.190, 0.006, 0);
        part(boxX(0.0085, 0.028, 0.011, 0.003), MAT.bright,
             -0.222, -0.010, 0, 0, 0, 0.20);
        part(new THREE.CylinderGeometry(0.0019, 0.0019, 0.020, 8), MAT.bright,
             -0.222, -0.028, 0, 0, 0, 0.20);

        // -------- 6. 握把 --------
        const gripGroup = new THREE.Group();
        gripGroup.position.set(-0.290, 0.005, 0);
        gripGroup.rotation.z = -0.28;
        inner.add(gripGroup);
        part(boxX(0.048, 0.130, 0.044, 0.008), MAT.grip, 0, -0.062, 0, 0, 0, 0, gripGroup);
        for (let i = 0; i < 4; i++) {
            part(boxX(0.050, 0.005, 0.046, 0.001), MAT.grip,
                 0, -0.020 - i * 0.026, 0, 0, 0, 0, gripGroup);
        }
        part(boxX(0.052, 0.010, 0.048, 0.003), MAT.body,     0, -0.132, 0, 0, 0, 0, gripGroup);
        part(boxX(0.044, 0.020, 0.046, 0.004), MAT.receiver, 0,  0.006, 0, 0, 0, 0, gripGroup);

        // -------- 7. 弹匣 --------
        part(boxX(0.070, 0.150, 0.050, 0.006), MAT.receiver, -0.160, -0.090, 0, 0, 0, 0.02);
        part(boxX(0.072, 0.004, 0.052, 0.001), MAT.slotInner, -0.160, -0.050, 0, 0, 0, 0.02);
        part(boxX(0.072, 0.004, 0.052, 0.001), MAT.slotInner, -0.160, -0.100, 0, 0, 0, 0.02);
        part(boxX(0.080, 0.012, 0.056, 0.004), MAT.rubber,    -0.160, -0.174, 0, 0, 0, 0.02);

        // -------- 8. 护木 --------
        const handguardShape = new THREE.Shape();
        handguardShape.moveTo(-0.240,  0.036);
        handguardShape.lineTo( 0.180,  0.032);
        handguardShape.lineTo( 0.240,  0.020);
        handguardShape.lineTo( 0.240, -0.020);
        handguardShape.lineTo( 0.180, -0.032);
        handguardShape.lineTo(-0.240, -0.036);
        handguardShape.lineTo(-0.240,  0.036);
        handguardShape.closePath();
        const handguardGeo = new THREE.ExtrudeGeometry(handguardShape, {
            depth: 0.058 - 0.003,
            bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016,
            bevelSegments: 2, curveSegments: 6,
        });
        handguardGeo.translate(0, 0, -(0.058 - 0.003) / 2);
        handguardGeo.computeVertexNormals();
        part(handguardGeo, MAT.body, 0.220, AXIS_Y, 0);

        part(boxX(0.480, 0.014, 0.040, 0.002), MAT.receiver, 0.220, 0.108, 0);

        for (let i = 0; i < 5; i++) {
            const x = 0.020 + i * 0.080;
            part(boxZ(0.052, 0.016, 0.004, 0.002), MAT.slotInner, x, AXIS_Y,  0.0312);
            part(boxZ(0.056, 0.003, 0.004, 0.001), MAT.slotInner, x, AXIS_Y + 0.0105,  0.0312);
            part(boxZ(0.056, 0.003, 0.004, 0.001), MAT.slotInner, x, AXIS_Y - 0.0105,  0.0312);
            part(boxZ(0.052, 0.016, 0.004, 0.002), MAT.slotInner, x, AXIS_Y, -0.0312);
            part(boxZ(0.056, 0.003, 0.004, 0.001), MAT.slotInner, x, AXIS_Y + 0.0105, -0.0312);
            part(boxZ(0.056, 0.003, 0.004, 0.001), MAT.slotInner, x, AXIS_Y - 0.0105, -0.0312);
        }
        for (let i = 0; i < 5; i++) {
            const x = 0.020 + i * 0.080;
            part(new THREE.BoxGeometry(0.052, 0.004, 0.016), MAT.slotInner, x, AXIS_Y - 0.0312, 0);
            part(new THREE.BoxGeometry(0.056, 0.004, 0.003), MAT.slotInner, x, AXIS_Y - 0.0312,  0.0105);
            part(new THREE.BoxGeometry(0.056, 0.004, 0.003), MAT.slotInner, x, AXIS_Y - 0.0312, -0.0105);
        }

        part(boxX(0.020, 0.060, 0.056, 0.006), MAT.steel, 0.470, AXIS_Y, 0);
        part(boxX(0.400, 0.005, 0.003, 0.001), MAT.steel, 0.220, AXIS_Y + 0.025,  0.0295);
        part(boxX(0.400, 0.005, 0.003, 0.001), MAT.steel, 0.220, AXIS_Y + 0.025, -0.0295);

        // -------- 9. 枪管组 --------
        part(new THREE.CylinderGeometry(0.0190, 0.0190, 0.100, IS_TOUCH_LOW ? 18 : 28), MAT.steel,
             0.520, AXIS_Y, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0145, 0.0145, 0.400, IS_TOUCH_LOW ? 18 : 30), MAT.steel,
             0.770, AXIS_Y, 0, 0, 0, R);
        for (let i = 0; i < 14; i++) {
            part(new THREE.TorusGeometry(0.0150, 0.0011, 6, IS_TOUCH_LOW ? 14 : 22), MAT.steel,
                 0.600 + i * 0.024, AXIS_Y, 0, 0, R, 0);
        }
        part(new THREE.CylinderGeometry(0.0215, 0.0215, 0.016, IS_TOUCH_LOW ? 16 : 24), MAT.steel,
             0.575, AXIS_Y, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0190, 0.0190, 0.024, IS_TOUCH_LOW ? 14 : 20), MAT.steel,
             0.860, AXIS_Y, 0, 0, 0, R);
        part(boxX(0.030, 0.014, 0.022, 0.003), MAT.steel, 0.860, AXIS_Y + 0.019, 0);
        part(new THREE.CylinderGeometry(0.0026, 0.0026, 0.320, 10), MAT.bright,
             0.710, AXIS_Y + 0.024, 0, 0, 0, R);

        // -------- 10. 枪口制退器 --------
        part(boxX(0.090, 0.046, 0.046, 0.004), MAT.steel, 1.015, AXIS_Y, 0);
        part(boxX(0.014, 0.040, 0.040, 0.004), MAT.steel, 1.065, AXIS_Y, 0);
        part(boxX(0.014, 0.052, 0.052, 0.005), MAT.steel, 0.962, AXIS_Y, 0);
        for (let i = 0; i < 3; i++) {
            const x = 0.982 + i * 0.028;
            part(new THREE.BoxGeometry(0.014, 0.022, 0.048), MAT.slotInner, x, AXIS_Y,  0.010);
            part(new THREE.BoxGeometry(0.014, 0.022, 0.048), MAT.slotInner, x, AXIS_Y, -0.010);
            part(new THREE.BoxGeometry(0.012, 0.010, 0.048), MAT.slotInner, x, AXIS_Y + 0.022, 0);
        }
        part(boxX(0.086, 0.004, 0.048, 0.001), MAT.steel, 1.015, AXIS_Y + 0.023, 0);
        part(boxX(0.086, 0.004, 0.048, 0.001), MAT.steel, 1.015, AXIS_Y - 0.023, 0);
        part(new THREE.CylinderGeometry(0.0080, 0.0080, 0.003, 20), MAT.slotInner,
             1.073, AXIS_Y, 0, 0, 0, R);

        // -------- 11. 瞄准镜 --------
        const SS = IS_TOUCH_LOW ? 20 : 32;
        part(boxX(0.032, 0.032, 0.044, 0.004), MAT.receiver, -0.130, 0.170, 0);
        part(boxX(0.032, 0.032, 0.044, 0.004), MAT.receiver,  0.070, 0.170, 0);
        part(new THREE.CylinderGeometry(0.0058, 0.0058, 0.050, 12), MAT.bright,
             -0.130, 0.150, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0058, 0.0058, 0.050, 12), MAT.bright,
              0.070, 0.150, 0, R, 0, 0);

        part(new THREE.CylinderGeometry(0.0230, 0.0230, 0.230, SS), MAT.receiver,
             -0.030, 0.196, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0330, 0.0330, 0.034, SS), MAT.receiver,
              0.115, 0.196, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0350, 0.0350, 0.010, SS), MAT.receiver,
              0.138, 0.196, 0, 0, 0, R);

        const lensF = part(new THREE.CircleGeometry(0.0308, 32), MAT.glass,
                           0.1435, 0.196, 0, 0, R, 0);
        lensF.name = 'scopeLensFront';
        part(new THREE.TorusGeometry(0.0304, 0.0016, 6, 24), MAT.steel,
             0.1435, 0.196, 0, 0, R, 0);

        part(new THREE.CylinderGeometry(0.0285, 0.0285, 0.030, SS), MAT.receiver,
             -0.170, 0.196, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0305, 0.0305, 0.010, SS), MAT.receiver,
             -0.190, 0.196, 0, 0, 0, R);

        const lensB = part(new THREE.CircleGeometry(0.0268, 32), MAT.glass,
                           -0.1955, 0.196, 0, 0, -R, 0);
        lensB.name = 'scopeLensBack';

        part(new THREE.CircleGeometry(0.0016, 16), MAT.dot, 0.1400, 0.196, 0, 0, R, 0);

        part(boxX(0.024, 0.014, 0.024, 0.003), MAT.receiver, -0.030, 0.224, 0);
        part(new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 20), MAT.receiver,
             -0.030, 0.236, 0, 0, 0, 0);
        part(new THREE.CylinderGeometry(0.0123, 0.0123, 0.004, 20), MAT.receiver,
             -0.030, 0.244, 0, 0, 0, 0);
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            part(new THREE.BoxGeometry(0.0015, 0.010, 0.0018), MAT.receiver,
                 -0.030 + Math.cos(a) * 0.0117,
                  0.236 + Math.sin(a) * 0.0117,
                  0, 0, 0, -a);
        }
        part(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 20), MAT.receiver,
             -0.030, 0.196,  0.034, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0112, 0.0112, 0.004, 20), MAT.receiver,
             -0.030, 0.196,  0.042, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0088, 0.0088, 0.010, 18), MAT.receiver,
             -0.030, 0.196, -0.032, R, 0, 0);

        // -------- 12. 机械瞄具（备用） --------
        part(boxX(0.018, 0.028, 0.024, 0.003), MAT.receiver,  0.440, 0.124, 0);
        part(new THREE.BoxGeometry(0.0050, 0.024, 0.0050), MAT.receiver,  0.440, 0.148, 0);
        part(new THREE.BoxGeometry(0.0035, 0.026, 0.0028), MAT.receiver,  0.440, 0.148,  0.011);
        part(new THREE.BoxGeometry(0.0035, 0.026, 0.0028), MAT.receiver,  0.440, 0.148, -0.011);
        part(boxX(0.018, 0.024, 0.028, 0.003), MAT.receiver, -0.220, 0.122, 0);
        part(new THREE.BoxGeometry(0.0045, 0.016, 0.0045), MAT.receiver, -0.220, 0.144,  0.008);
        part(new THREE.BoxGeometry(0.0045, 0.016, 0.0045), MAT.receiver, -0.220, 0.144, -0.008);

        // -------- 13. 背带环 --------
        part(new THREE.TorusGeometry(0.0085, 0.0018, 8, IS_TOUCH_LOW ? 14 : 18), MAT.steel,
             0.060, 0.030, 0.032, 0, R, 0);

        // -------- 14. 枪口锚点 --------
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(1.10, AXIS_Y, 0);
        inner.add(muzzlePoint);

        // -------- 15. 瞄准镜中心标记 --------
        const scopeCenter = new THREE.Object3D();
        scopeCenter.name = 'scopeCenter';    // ★ 新增：clone 后按 name 重新绑定
        scopeCenter.position.set(0, 0.196, 0);
        inner.add(scopeCenter);

        // -------- 居中 --------
        const bbox = new THREE.Box3().setFromObject(inner);
        const center = bbox.getCenter(new THREE.Vector3());
        inner.position.set(-center.x, -center.y * 0.85, -center.z * 0.15);

        // -------- 整体缩放 + 旋转 --------
        gun.scale.setScalar(SNIPER_SCALE);
        gun.rotation.y = Math.PI / 2;

        gun.userData.boltGroup   = boltGroup;
        gun.userData.muzzlePoint = muzzlePoint;
        gun.userData.scopeCenter = scopeCenter;
        gun.userData.lensMeshF   = lensF;
        gun.userData.lensMeshB   = lensB;

        gun.updateMatrixWorld(true);
        return gun;
    }

    // ============================================================
    // 第一人称视图模型
    // ============================================================
    function buildSniperViewmodelHD() {
        const g = buildSniperHD();

        // ★ 调整：往前推、往中间收（原来 0.26 / -0.24 / -0.34）
        const BASE_X = 0.20, BASE_Y = -0.16, BASE_Z = -0.58;
        const BASE_RZ = 0.02;

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

    window.__HD_SNIPER = {
        buildWorld:     buildSniperHD,
        buildViewmodel: buildSniperViewmodelHD,
        preload: function () { getMaterials(); getEnvMap(); },
    };

    console.log('[weapon_sniper_hd] 高细节狙击枪已注册（冥驹风格 · 左侧大拉栓）');
})();