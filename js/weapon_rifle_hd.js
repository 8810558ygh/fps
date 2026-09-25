// ===== js/weapon_rifle_hd.js – 高细节 PBR 步枪模型（适配 r128 全局 THREE） =====
//
// 使用方式：
//   1. 本文件必须在 player_model.js 之前加载
//   2. player_model.js 里的 makeWeaponModel / makeViewmodel 需加早返回
//
// 仅覆盖 'rifle'，其他武器不受影响。

(function () {
    'use strict';
    if (typeof THREE === 'undefined') return;

    const IS_TOUCH_LOW = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH);
    const TEX_SIZE = IS_TOUCH_LOW ? 128 : 256;

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
        const n1 = S * S * 0.4;
        for (let i = 0; i < n1; i++) {
            const v = 128 + ((Math.random() - 0.5) * 65) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
        }
        const n2 = S * 8;
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
        for (let i = 0; i < S * 8; i++) {
            const y = Math.random() * S, x0 = Math.random() * S;
            const len = 20 + Math.random() * S * 0.55;
            const v = 128 + ((Math.random() - 0.5) * 90) | 0;
            ctx.strokeStyle = `rgba(${v},${v},${v},${0.10 + Math.random() * 0.28})`;
            ctx.lineWidth = Math.random() * 1.3;
            ctx.beginPath(); ctx.moveTo(x0, y);
            ctx.lineTo(x0 + len, y + (Math.random() - 0.5) * 1.6); ctx.stroke();
        }
        for (let i = 0; i < S; i++) {
            const x = Math.random() * S, y = Math.random() * S;
            const len = 4 + Math.random() * 22;
            const ang = Math.random() * Math.PI * 2;
            const v = 128 + ((Math.random() - 0.5) * 120) | 0;
            ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.3})`;
            ctx.lineWidth = Math.random() * 0.9;
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
        }
        return c;
    }

    function hSteelCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * S * 0.4; i++) {
            const v = 128 + ((Math.random() - 0.5) * 55) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.2, 1.2);
        }
        for (let i = 0; i < S * 1.5; i++) {
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
        for (let i = 0; i < S * S * 0.4; i++) {
            const v = 128 + ((Math.random() - 0.5) * 70) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
        }
        ctx.strokeStyle = 'rgba(180,180,180,0.45)';
        ctx.lineWidth = 1.6;
        const step = Math.max(8, S / 24);
        for (let i = -S; i < S * 2; i += step) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke();
        }
        return c;
    }

    function hRubberCanvas() {
        const S = TEX_SIZE, c = makeCanvas(S), ctx = c.getContext('2d');
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < S * S * 0.8; i++) {
            const v = 128 + ((Math.random() - 0.5) * 130) | 0;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
        }
        return c;
    }

    // ============================================================
    // 纹理缓存（全局只生成一次）
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
            console.warn('[weapon_rifle_hd] 环境贴图生成失败', e);
        }
        return _envMap;
    }

    // ============================================================
    // 材质库（PBR，全局缓存）
    // ============================================================
    let _mat = null;
    function getMaterials() {
        if (_mat) return _mat;
        const tex = getTextures();
        const env = getEnvMap();
        const mk = (base) => { if (env) base.envMap = env; return base; };

        _mat = {
            receiver: new THREE.MeshPhysicalMaterial(mk({
                color: 0x1e2228, metalness: 0.92, roughness: 0.42,
                roughnessMap: tex.rPolymer, normalMap: tex.nPolymer,
                normalScale: new THREE.Vector2(0.55, 0.55),
                clearcoat: 0.38, clearcoatRoughness: 0.48, envMapIntensity: 1.15,
            })),
            steel: new THREE.MeshPhysicalMaterial(mk({
                color: 0x101216, metalness: 1.0, roughness: 0.30,
                roughnessMap: tex.rBrushed, normalMap: tex.nBrushed,
                normalScale: new THREE.Vector2(0.5, 0.5),
                clearcoat: 0.22, clearcoatRoughness: 0.30, envMapIntensity: 1.45,
            })),
            bright: new THREE.MeshPhysicalMaterial(mk({
                color: 0xa8b0ba, metalness: 1.0, roughness: 0.18,
                normalMap: tex.nSteel,
                normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.75,
            })),
            polymer: new THREE.MeshPhysicalMaterial(mk({
                color: 0x24282d, metalness: 0.04, roughness: 0.78,
                roughnessMap: tex.rPolymer, normalMap: tex.nPolymer,
                normalScale: new THREE.Vector2(0.85, 0.85),
                clearcoat: 0.14, clearcoatRoughness: 0.80, envMapIntensity: 0.85,
            })),
            grip: new THREE.MeshPhysicalMaterial(mk({
                color: 0x22262b, metalness: 0.03, roughness: 0.86,
                roughnessMap: tex.rGrip, normalMap: tex.nGrip,
                normalScale: new THREE.Vector2(1.2, 1.2),
                clearcoat: 0.10, clearcoatRoughness: 0.88, envMapIntensity: 0.75,
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
                envMapIntensity: 2.8,
                side: THREE.DoubleSide,
            })),
            dot: new THREE.MeshBasicMaterial({ color: 0xff2418 }),
            slotInner: new THREE.MeshStandardMaterial(mk({
                color: 0x08090b, metalness: 0.55, roughness: 0.65, envMapIntensity: 0.4,
            })),
        };
        return _mat;
    }

    // ============================================================
    // 几何工具：圆角 + 倒角
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

    const CURVE_SEG = IS_TOUCH_LOW ? 4 : 6;
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

    // ============================================================
    // 构建步枪（沿 +X 方向，模型以原点附近为中心）
    // ============================================================
    function buildRifleHD() {
        const MAT = getMaterials();
        const gun = new THREE.Group();

        function part(geo, mat, x, y, z, rx, ry, rz, parent) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            m.rotation.set(rx || 0, ry || 0, rz || 0);
            m.castShadow = true; m.receiveShadow = true;
            (parent || gun).add(m);
            return m;
        }

        const R = Math.PI / 2;
        const AXIS_Y = 0.075;

        // -------- 1. 枪托组 --------
        part(new THREE.CylinderGeometry(0.0185, 0.0185, 0.175, IS_TOUCH_LOW ? 12 : 20), MAT.steel,
             -0.225, AXIS_Y, 0, 0, 0, R);
        for (let i = 0; i < 6; i++) {
            part(new THREE.TorusGeometry(0.0192, 0.0011, 5, IS_TOUCH_LOW ? 10 : 16), MAT.steel,
                 -0.30 + i * 0.028, AXIS_Y, 0, 0, R, 0);
        }
        part(roundedBoxX(0.170, 0.090, 0.048, 0.014), MAT.polymer, -0.345, 0.066, 0);
        part(roundedBoxX(0.155, 0.016, 0.042, 0.005), MAT.polymer, -0.352, 0.022, 0);
        part(roundedBoxX(0.128, 0.028, 0.052, 0.010), MAT.grip,    -0.352, 0.120, 0);
        part(roundedBoxX(0.022, 0.104, 0.048, 0.010), MAT.rubber,  -0.434, 0.066, 0);
        for (let i = 0; i < 6; i++) {
            part(new THREE.BoxGeometry(0.0025, 0.095, 0.049), MAT.rubber,
                 -0.436 + i * 0.0045, 0.066, 0);
        }
        part(new THREE.CylinderGeometry(0.004, 0.004, 0.10, 8), MAT.bright,
             -0.325, 0.100, 0.028, 0, 0, R);
        part(new THREE.TorusGeometry(0.009, 0.0020, 6, IS_TOUCH_LOW ? 12 : 16), MAT.steel,
             -0.30, 0.020, 0.026, 0, R, 0);
        part(new THREE.CylinderGeometry(0.0038, 0.0038, 0.003, 10), MAT.bright,
             -0.446, 0.066, 0, R, 0, 0);

        // -------- 2. 上机匣 --------
        part(roundedBoxX(0.210, 0.062, 0.050, 0.012), MAT.receiver, -0.045, 0.083, 0);
        part(new THREE.CylinderGeometry(0.025, 0.025, 0.210, IS_TOUCH_LOW ? 12 : 18, 1, false, 0, Math.PI),
             MAT.receiver, -0.045, 0.098, 0, 0, 0, R);
        part(roundedBoxX(0.072, 0.036, 0.004, 0.002), MAT.slotInner, -0.018, 0.090, 0.0266);
        part(roundedBoxX(0.070, 0.034, 0.003, 0.002), MAT.receiver,  -0.018, 0.090, 0.0272);
        part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.026, 10), MAT.steel,
             -0.118, 0.104, 0.030, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 10), MAT.steel,
             -0.118, 0.104, 0.043, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0060, 0.0060, 0.044, 10), MAT.steel,
             -0.150, 0.093, 0.032, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0120, 0.0120, 0.016, 10), MAT.steel,
             -0.150, 0.093, 0.060, R, 0, 0);
        for (let i = 0; i < 4; i++) {
            part(new THREE.TorusGeometry(0.0120, 0.0008, 5, 12), MAT.steel,
                 -0.150, 0.093, 0.053 + i * 0.0045, R, 0, 0);
        }

        // -------- 3. 下机匣 --------
        part(roundedBoxX(0.190, 0.048, 0.046, 0.010), MAT.receiver, -0.055, 0.038, 0);
        part(roundedBoxX(0.078, 0.048, 0.044, 0.008), MAT.receiver, -0.018, 0.011, 0, 0, 0, 0.05);
        part(roundedBoxX(0.084, 0.012, 0.050, 0.006), MAT.receiver, -0.020, -0.012, 0, 0, 0, 0.05);
        part(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 10), MAT.bright,
             0.012, 0.040, 0.026, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0050, 0.0050, 0.030, 8), MAT.bright,
             -0.102, 0.058, -0.028, R, 0, 0);
        part(roundedBoxX(0.026, 0.008, 0.006, 0.002), MAT.steel, -0.090, 0.058, -0.042);
        part(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 10), MAT.bright,
             -0.102, 0.058, -0.044, R, 0, 0);
        part(roundedBoxX(0.016, 0.020, 0.030, 0.003), MAT.steel, -0.098, 0.030, 0);

        // -------- 4. 扳机组 --------
        part(new THREE.TorusGeometry(0.029, 0.0042, 6, IS_TOUCH_LOW ? 14 : 20, Math.PI),
             MAT.receiver, -0.093, 0.014, 0, 0, 0, Math.PI);
        part(roundedBoxX(0.005, 0.030, 0.008, 0.002), MAT.receiver, -0.064, 0.006, 0);
        part(roundedBoxX(0.008, 0.028, 0.011, 0.003), MAT.bright,
             -0.094, -0.006, 0, 0, 0, 0.22);
        part(new THREE.CylinderGeometry(0.0018, 0.0018, 0.020, 6), MAT.bright,
             -0.094, -0.024, 0, 0, 0, 0.22);

        // -------- 5. 握把 --------
        const gripGroup = new THREE.Group();
        gripGroup.position.set(-0.134, 0.010, 0);
        gripGroup.rotation.z = -0.30;
        gun.add(gripGroup);
        part(roundedBoxX(0.050, 0.132, 0.042, 0.013), MAT.grip, 0, -0.062, 0, 0, 0, 0, gripGroup);
        for (let i = 0; i < 5; i++) {
            part(roundedBoxX(0.052, 0.006, 0.044, 0.002), MAT.grip,
                 0, -0.018 - i * 0.024, 0, 0, 0, 0, gripGroup);
        }
        part(roundedBoxX(0.054, 0.010, 0.046, 0.004), MAT.polymer, 0, -0.130, 0, 0, 0, 0, gripGroup);
        part(roundedBoxX(0.010, 0.030, 0.048, 0.004), MAT.grip,    0.026, -0.052, 0, 0, 0, 0, gripGroup);

        // -------- 6. 弹匣 --------
        part(roundedBoxX(0.062, 0.155, 0.042, 0.010), MAT.polymer, -0.014, -0.078, 0, 0, 0, 0.055);
        for (let i = 0; i < 4; i++) {
            part(roundedBoxX(0.064, 0.004, 0.044, 0.001), MAT.polymer,
                 -0.012 + i * 0.0035, -0.020 - i * 0.036, 0, 0, 0, 0.055);
        }
        for (let i = 0; i < 3; i++) {
            part(new THREE.CylinderGeometry(0.0035, 0.0035, 0.048, 8), MAT.slotInner,
                 -0.014, -0.060 - i * 0.038, 0, R, 0, 0);
        }
        part(roundedBoxX(0.070, 0.012, 0.048, 0.004), MAT.rubber,
             -0.008, -0.158, 0, 0, 0, 0.055);

        // -------- 7. 皮卡汀尼导轨 --------
        part(roundedBoxX(0.480, 0.011, 0.038, 0.002), MAT.receiver, 0.080, 0.1195, 0);
        const railGeo     = new THREE.BoxGeometry(0.0078, 0.0075, 0.038);
        const railSlotGeo = new THREE.BoxGeometry(0.0045, 0.002, 0.038);
        for (let i = 0; i < 39; i++) {
            const x = -0.155 + i * 0.0125;
            if (x > 0.315) break;
            part(railGeo, MAT.receiver, x, 0.1285, 0);
        }
        for (let i = 0; i < 39; i++) {
            const x = -0.1488 + i * 0.0125;
            if (x > 0.315) break;
            part(railSlotGeo, MAT.slotInner, x, 0.1255, 0);
        }

        // -------- 8. 护木（八角 M-LOK） --------
        const hgGeo = new THREE.CylinderGeometry(0.0335, 0.0305, 0.270, 8, 1, false, Math.PI / 8);
        hgGeo.rotateZ(R);
        part(hgGeo, MAT.polymer, 0.185, AXIS_Y, 0);

        const endCapGeo = new THREE.CylinderGeometry(0.0300, 0.0290, 0.012, 8, 1, false, Math.PI / 8);
        part(endCapGeo, MAT.steel, 0.322, AXIS_Y, 0).rotation.z = R;

        const rearRingGeo = new THREE.CylinderGeometry(0.0355, 0.0355, 0.010, 8, 1, false, Math.PI / 8);
        part(rearRingGeo, MAT.steel, 0.052, AXIS_Y, 0).rotation.z = R;

        const slotW = 0.048, slotH = 0.016, slotDepth = 0.006;
        for (let i = 0; i < 4; i++) {
            const x = 0.098 + i * 0.056;
            part(new THREE.BoxGeometry(slotW, slotH, slotDepth), MAT.slotInner, x, AXIS_Y, 0.0260);
            part(new THREE.BoxGeometry(slotW + 0.004, 0.003, slotDepth), MAT.slotInner, x, AXIS_Y + slotH/2 + 0.0015, 0.0260);
            part(new THREE.BoxGeometry(slotW + 0.004, 0.003, slotDepth), MAT.slotInner, x, AXIS_Y - slotH/2 - 0.0015, 0.0260);
            part(new THREE.BoxGeometry(slotW, slotH, slotDepth), MAT.slotInner, x, AXIS_Y, -0.0260);
            part(new THREE.BoxGeometry(slotW + 0.004, 0.003, slotDepth), MAT.slotInner, x, AXIS_Y + slotH/2 + 0.0015, -0.0260);
            part(new THREE.BoxGeometry(slotW + 0.004, 0.003, slotDepth), MAT.slotInner, x, AXIS_Y - slotH/2 - 0.0015, -0.0260);
        }
        for (let i = 0; i < 4; i++) {
            const x = 0.098 + i * 0.056;
            part(new THREE.BoxGeometry(slotW, slotDepth, slotH), MAT.slotInner, x, AXIS_Y - 0.0260, 0);
            part(new THREE.BoxGeometry(slotW + 0.004, slotDepth, 0.003), MAT.slotInner, x, AXIS_Y - 0.0260, slotH/2 + 0.0015);
            part(new THREE.BoxGeometry(slotW + 0.004, slotDepth, 0.003), MAT.slotInner, x, AXIS_Y - 0.0260, -slotH/2 - 0.0015);
        }

        // -------- 9. 枪管组 --------
        part(new THREE.CylinderGeometry(0.0118, 0.0118, 0.365, IS_TOUCH_LOW ? 14 : 24), MAT.steel,
             0.240, AXIS_Y, 0, 0, 0, R);
        for (let i = 0; i < 10; i++) {
            part(new THREE.TorusGeometry(0.0122, 0.0014, 5, IS_TOUCH_LOW ? 12 : 18), MAT.steel,
                 0.120 + i * 0.022, AXIS_Y, 0, 0, R, 0);
        }
        part(new THREE.CylinderGeometry(0.0165, 0.0140, 0.055, IS_TOUCH_LOW ? 14 : 20), MAT.steel,
             0.085, AXIS_Y, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0195, 0.0195, 0.036, IS_TOUCH_LOW ? 12 : 16), MAT.steel,
             0.348, AXIS_Y, 0, 0, 0, R);
        part(roundedBoxX(0.030, 0.016, 0.020, 0.003), MAT.steel, 0.348, AXIS_Y + 0.018, 0);
        part(new THREE.CylinderGeometry(0.0028, 0.0028, 0.26, 6), MAT.bright,
             0.205, AXIS_Y + 0.0225, 0, 0, 0, R);

        // -------- 10. 消焰器 --------
        part(new THREE.CylinderGeometry(0.0185, 0.0185, 0.064, IS_TOUCH_LOW ? 14 : 20), MAT.steel,
             0.452, AXIS_Y, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0155, 0.0185, 0.014, IS_TOUCH_LOW ? 14 : 20), MAT.steel,
             0.414, AXIS_Y, 0, 0, 0, R);
        for (let i = 0; i < 3; i++) {
            part(new THREE.TorusGeometry(0.0187, 0.0016, 5, IS_TOUCH_LOW ? 12 : 18), MAT.steel,
                 0.432 + i * 0.017, AXIS_Y, 0, 0, R, 0);
        }
        for (let i = 0; i < 3; i++) {
            const x = 0.435 + i * 0.017;
            part(new THREE.BoxGeometry(0.008, 0.006, 0.018), MAT.slotInner, x, AXIS_Y + 0.016, 0, 0, 0, 0.2);
            part(new THREE.BoxGeometry(0.008, 0.006, 0.018), MAT.slotInner, x, AXIS_Y, 0.016, 0, 0, 0);
            part(new THREE.BoxGeometry(0.008, 0.006, 0.018), MAT.slotInner, x, AXIS_Y, -0.016, 0, 0, 0);
        }
        part(new THREE.CylinderGeometry(0.0170, 0.0185, 0.008, IS_TOUCH_LOW ? 14 : 20), MAT.steel,
             0.487, AXIS_Y, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 10), MAT.slotInner,
             0.4895, AXIS_Y, 0, 0, 0, R);

        // -------- 11. 红点瞄准镜 --------
        part(roundedBoxX(0.098, 0.014, 0.042, 0.004), MAT.receiver, -0.048, 0.140, 0);
        part(new THREE.CylinderGeometry(0.0055, 0.0055, 0.048, 8), MAT.bright, -0.090, 0.134, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0055, 0.0055, 0.048, 8), MAT.bright, -0.006, 0.134, 0, R, 0, 0);
        part(roundedBoxX(0.024, 0.030, 0.038, 0.004), MAT.receiver, -0.086, 0.162, 0);
        part(roundedBoxX(0.024, 0.030, 0.038, 0.004), MAT.receiver, -0.010, 0.162, 0);
        const SS = IS_TOUCH_LOW ? 12 : 20;
        part(new THREE.CylinderGeometry(0.0210, 0.0210, 0.104, SS), MAT.receiver, -0.048, 0.180, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0245, 0.0245, 0.016, SS), MAT.receiver,  0.008, 0.180, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0245, 0.0245, 0.018, SS), MAT.receiver, -0.104, 0.180, 0, 0, 0, R);
        part(new THREE.CylinderGeometry(0.0100, 0.0100, 0.012, 12), MAT.receiver, -0.048, 0.203, 0, 0, 0, 0);
        part(new THREE.CylinderGeometry(0.0092, 0.0092, 0.012, 12), MAT.receiver, -0.048, 0.180, 0.030, R, 0, 0);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            part(new THREE.BoxGeometry(0.0015, 0.010, 0.0020), MAT.receiver,
                 -0.048 + Math.cos(a) * 0.0105, 0.203 + Math.sin(a) * 0.0105, 0, 0, 0, -a);
        }

        // ★ 镜片：起名 + 保存引用，供画中画渲染使用
        const lensF = part(new THREE.CircleGeometry(0.0205, 24), MAT.glass,
                           0.0165, 0.180, 0, 0,  R, 0);
        lensF.name = 'scopeLensFront';
        const lensB = part(new THREE.CircleGeometry(0.0195, 24), MAT.glass,
                           -0.1135, 0.180, 0, 0, -R, 0);
        lensB.name = 'scopeLensBack';

        gun.userData.lensMeshF = lensF;
        gun.userData.lensMeshB = lensB;

        // 红点
        part(new THREE.CircleGeometry(0.0018, 12), MAT.dot, 0.0142, 0.180, 0, 0,  R, 0);

        // -------- 12. 备用机械瞄具 --------
        part(roundedBoxX(0.020, 0.030, 0.026, 0.003), MAT.receiver, 0.150, 0.144, 0);
        part(new THREE.BoxGeometry(0.0055, 0.026, 0.0055), MAT.receiver, 0.150, 0.172, 0);
        part(new THREE.BoxGeometry(0.004, 0.028, 0.0030), MAT.receiver, 0.150, 0.172, 0.012);
        part(new THREE.BoxGeometry(0.004, 0.028, 0.0030), MAT.receiver, 0.150, 0.172, -0.012);
        part(roundedBoxX(0.020, 0.026, 0.030, 0.003), MAT.receiver, -0.140, 0.140, 0);
        part(new THREE.BoxGeometry(0.005, 0.016, 0.005), MAT.receiver, -0.140, 0.160, 0.008);
        part(new THREE.BoxGeometry(0.005, 0.016, 0.005), MAT.receiver, -0.140, 0.160, -0.008);

        // -------- 13. 销钉 --------
        part(new THREE.CylinderGeometry(0.0034, 0.0034, 0.050, 8), MAT.bright, -0.132, 0.048, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0034, 0.0034, 0.050, 8), MAT.bright,  0.022, 0.052, 0, R, 0, 0);
        part(new THREE.CylinderGeometry(0.0030, 0.0030, 0.050, 8), MAT.bright, -0.078, 0.062, 0, R, 0, 0);
        for (let i = 0; i < 3; i++) {
            part(new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 8), MAT.bright,
                 -0.12 + i * 0.055, 0.062, 0.0252, R, 0, 0);
        }

        // -------- 14. 背带环 --------
        part(new THREE.TorusGeometry(0.0085, 0.0018, 6, IS_TOUCH_LOW ? 12 : 16), MAT.steel,
             0.030, 0.024, 0.026, 0, R, 0);

        // ★ 让枪管从本地 +X 转到世界 -Z（正前方）
        gun.rotation.y = Math.PI / 2;
        gun.updateMatrixWorld(true);
        return gun;
    }

    // ============================================================
    // 视图模型包装（第一人称）
    //   ★ baseRot / adsRot 必须保留 rotation.y = π/2，
    //     否则 buildRifleHD 设定的朝向会被覆盖，枪管会横躺。
    // ============================================================
    function buildRifleViewmodelHD() {
        const g = buildRifleHD();

        const BASE_X = 0.32, BASE_Y = -0.26, BASE_Z = -0.44;
        const BASE_RZ = 0.02;

        //  红点 (MAT.dot) 在 gun 本地 (0.0142, 0.180, 0)
        //  gun.rotation.y = π/2 后，红点相对 gun 原点 = (0, 0.180, -0.0142)
        //  要让红点落在 cam 中心轴 (x=0, y=0)：
        //    gun.position.x + 0        = 0  → x = 0
        //    gun.position.y + 0.180    = 0  → y = -0.180
        const ADS_X = 0, ADS_Y = -0.180, ADS_Z = -0.30;

        const baseRot = new THREE.Euler(0, Math.PI / 2, BASE_RZ);
        const adsRot  = new THREE.Euler(0, Math.PI / 2, 0);

        g.userData.basePos = new THREE.Vector3(BASE_X, BASE_Y, BASE_Z);
        g.userData.baseRot = baseRot.clone();
        g.userData.adsPos  = new THREE.Vector3(ADS_X, ADS_Y, ADS_Z);
        g.userData.adsRot  = adsRot.clone();

        g.position.copy(g.userData.basePos);
        g.rotation.copy(g.userData.baseRot);

        // 枪口锚点
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.name = 'muzzlePoint';
        muzzlePoint.position.set(0.4895, 0.075, 0);
        g.add(muzzlePoint);

        g.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.frustumCulled = false;
            }
        });
        return g;
    }

    window.__HD_RIFLE = {
        buildWorld:     buildRifleHD,
        buildViewmodel: buildRifleViewmodelHD,
        preload: function () { getMaterials(); getEnvMap(); },
    };

    console.log('[weapon_rifle_hd] 高细节步枪已注册（含 ADS + PiP 镜片引用）');
})();