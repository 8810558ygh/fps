// ===== js/survival/zombies/zombie_normal_model.js =====
// Minecraft 风格普通僵尸模型
//
// 接口：
//   window.ZOMBIE_MODEL_NORMAL.build() → {
//       group, body, head, armL, armR, legL, legR,
//       pivots: { head, armL, armR, legL, legR }
//   }
//
// 说明：
//   · group 是 wrapper，外部可直接对 group 做 scale / position / rotation
//   · 内部已经按"总高 1.8m"缩放好（32 像素 = 1.8m）
//   · 模型朝向 -Z（与游戏内玩家/僵尸朝向约定一致）
//   · 纹理 / 材质 / geometry 均全局缓存，多实例共享
//   · 头部缩放 0.80（所见即所得，命中跟随视觉）

(function () {
    'use strict';
    if (typeof THREE === 'undefined') {
        console.error('[zombie_normal_model] 需要 THREE');
        return;
    }

    // ============================================================
    // 尺寸
    // ============================================================
    const PIXEL_SCALE = 1.8 / 32;

    // ★ 头部缩放系数
    const HEAD_SCALE = 0.80;

    // ============================================================
    // 纹理（全局单例）
    // ============================================================
    let _texture = null;
    let _material = null;

    function createZombieTexture() {
        const S = 64;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(S, S);
        const data = img.data;

        let seed = 20240521;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

        function setPx(x, y, r, g, b, a = 255) {
            if (x < 0 || y < 0 || x >= S || y >= S) return;
            const i = (y * S + x) * 4;
            data[i] = cl(r); data[i + 1] = cl(g); data[i + 2] = cl(b); data[i + 3] = a;
        }

        function fill(x0, y0, w, h, base, amp = 10, spotRate = 0.06) {
            for (let y = y0; y < y0 + h; y++) {
                for (let x = x0; x < x0 + w; x++) {
                    const n = (rnd() - 0.5) * 2 * amp;
                    const spot = rnd() < spotRate ? -16 : 0;
                    setPx(x, y, base[0] + n + spot, base[1] + n + spot, base[2] + n + spot);
                }
            }
        }

        const SKIN   = [ 92, 122,  70];
        const SHIRT  = [ 60,  96,  92];
        const SHIRT2 = [ 50,  82,  78];
        const PANTS  = [ 58,  74, 116];

        fill(0, 0, S, S, [42, 48, 42], 6, 0);

        fill(0,  0, 32, 16, SKIN,   13);
        fill(16, 16, 24, 16, SHIRT,  11);
        fill(40, 16, 16, 16, SHIRT2, 11);
        fill(32, 48, 16, 16, SHIRT2, 11);
        fill(0,  16, 16, 16, PANTS,  11);
        fill(16, 48, 16, 16, PANTS,  11);

        // 脸部
        const EYE = [14, 18, 12];
        for (const x of [9, 10, 13, 14]) setPx(x, 12, EYE[0], EYE[1], EYE[2]);
        setPx(8, 12, 64, 88, 48);
        setPx(11, 12, 66, 90, 50);
        setPx(12, 12, 66, 90, 50);
        setPx(15, 12, 64, 88, 48);
        for (let x = 10; x <= 13; x++) setPx(x, 14, 28, 42, 24);
        setPx(9, 15, 44, 60, 32);
        setPx(14, 15, 44, 60, 32);
        setPx(10, 9, 74, 98, 54);
        setPx(13, 9, 74, 98, 54);
        setPx(11, 10, 70, 94, 52);
        setPx(8, 13, 68, 92, 50);
        setPx(15, 13, 68, 92, 50);

        // 污渍
        const stains = [
            [22, 24], [26, 29], [30, 22], [34, 27], [20, 30],
            [46, 26], [50, 30], [53, 23],
            [38, 56], [42, 60], [45, 53],
            [4, 25], [9, 30], [13, 23],
            [22, 56], [26, 60], [30, 53]
        ];
        for (const [sx, sy] of stains) {
            setPx(sx, sy, 40, 56, 52);
            if (rnd() > 0.5) setPx(sx + 1, sy, 46, 62, 58);
        }

        ctx.putImageData(img, 0, 0);

        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }

    function getTexture() {
        if (!_texture) _texture = createZombieTexture();
        return _texture;
    }

    function getMaterial() {
        if (!_material) {
            _material = new THREE.MeshLambertMaterial({ map: getTexture() });
        }
        return _material;
    }

    // ============================================================
    // UV 表
    // ============================================================
    const UV = {
        head: {
            px: [16,  8, 24, 16], nx: [ 0,  8,  8, 16],
            py: [ 8,  0, 16,  8], ny: [16,  0, 24,  8],
            pz: [ 8,  8, 16, 16], nz: [24,  8, 32, 16]
        },
        body: {
            px: [28, 20, 32, 32], nx: [16, 20, 20, 32],
            py: [20, 16, 28, 20], ny: [28, 16, 36, 20],
            pz: [20, 20, 28, 32], nz: [32, 20, 40, 32]
        },
        armR: {
            px: [48, 20, 52, 32], nx: [40, 20, 44, 32],
            py: [44, 16, 48, 20], ny: [48, 16, 52, 20],
            pz: [44, 20, 48, 32], nz: [52, 20, 56, 32]
        },
        armL: {
            px: [40, 52, 44, 64], nx: [32, 52, 36, 64],
            py: [36, 48, 40, 52], ny: [40, 48, 44, 52],
            pz: [36, 52, 40, 64], nz: [44, 52, 48, 64]
        },
        legR: {
            px: [ 8, 20, 12, 32], nx: [ 0, 20,  4, 32],
            py: [ 4, 16,  8, 20], ny: [ 8, 16, 12, 20],
            pz: [ 4, 20,  8, 32], nz: [12, 20, 16, 32]
        },
        legL: {
            px: [24, 52, 28, 64], nx: [16, 52, 20, 64],
            py: [20, 48, 24, 52], ny: [24, 48, 28, 52],
            pz: [20, 52, 24, 64], nz: [28, 52, 32, 64]
        }
    };

    // ============================================================
    // Geometry 缓存
    // ============================================================
    const _geoCache = {};

    function boxGeo(w, h, d, uv) {
        const g = new THREE.BoxGeometry(w, h, d);
        const a = g.attributes.uv;
        const order = [uv.px, uv.nx, uv.py, uv.ny, uv.pz, uv.nz];

        for (let f = 0; f < 6; f++) {
            const [x0, y0, x1, y1] = order[f];
            const u0 = x0 / 64, u1 = x1 / 64;
            const v0 = 1 - y0 / 64, v1 = 1 - y1 / 64;
            const i = f * 4;
            a.setXY(i + 0, u0, v0);
            a.setXY(i + 1, u1, v0);
            a.setXY(i + 2, u0, v1);
            a.setXY(i + 3, u1, v1);
        }
        a.needsUpdate = true;
        return g;
    }

    function getGeo(key, w, h, d, uvKey) {
        if (_geoCache[key]) return _geoCache[key];
        const geo = boxGeo(w, h, d, UV[uvKey]);
        _geoCache[key] = geo;
        return geo;
    }

    // ============================================================
    // 构建
    // ============================================================
    function build() {
        const mat = getMaterial();

        const wrapper = new THREE.Group();
        const inner = new THREE.Group();
        inner.scale.setScalar(PIXEL_SCALE);
        inner.rotation.y = Math.PI;
        wrapper.add(inner);

        function part(geo, x, y, z, partTag) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.userData.part = partTag;
            m.receiveShadow = true;
            return m;
        }

        // 头部（pivot y=24）
        const headPivot = new THREE.Group();
        headPivot.position.set(0, 24, 0);
        inner.add(headPivot);

        const headMesh = part(
            getGeo('head', 8, 8, 8, 'head'),
            0, 4 * HEAD_SCALE, 0,
            'zombie_head'
        );
        headMesh.scale.setScalar(HEAD_SCALE);
        headMesh.castShadow = true;
        headPivot.add(headMesh);

        // 躯干
        const bodyMesh = part(getGeo('body', 8, 12, 4, 'body'), 0, 18, 0, 'zombie_body');
        bodyMesh.castShadow = true;
        inner.add(bodyMesh);

        // 右臂
        const armRPivot = new THREE.Group();
        armRPivot.position.set(-6, 22, 0);
        inner.add(armRPivot);
        const armRMesh = part(getGeo('armR', 4, 12, 4, 'armR'), 0, -6, 0, 'zombie_body');
        armRMesh.castShadow = false;
        armRPivot.add(armRMesh);

        // 左臂
        const armLPivot = new THREE.Group();
        armLPivot.position.set(6, 22, 0);
        inner.add(armLPivot);
        const armLMesh = part(getGeo('armL', 4, 12, 4, 'armL'), 0, -6, 0, 'zombie_body');
        armLMesh.castShadow = false;
        armLPivot.add(armLMesh);

        // 右腿
        const legRPivot = new THREE.Group();
        legRPivot.position.set(-2, 12, 0);
        inner.add(legRPivot);
        const legRMesh = part(getGeo('legR', 4, 12, 4, 'legR'), 0, -6, 0, 'zombie_leg');
        legRMesh.castShadow = false;
        legRPivot.add(legRMesh);

        // 左腿
        const legLPivot = new THREE.Group();
        legLPivot.position.set(2, 12, 0);
        inner.add(legLPivot);
        const legLMesh = part(getGeo('legL', 4, 12, 4, 'legL'), 0, -6, 0, 'zombie_leg');
        legLMesh.castShadow = false;
        legLPivot.add(legLMesh);

        return {
            group: wrapper,
            body: bodyMesh,
            head: headMesh,
            armL: armLMesh,
            armR: armRMesh,
            legL: legLMesh,
            legR: legRMesh,
            pivots: {
                head: headPivot,
                armL: armLPivot,
                armR: armRPivot,
                legL: legLPivot,
                legR: legRPivot,
            },
        };
    }

    // ============================================================
    // 预热
    // ============================================================
    function preload() {
        getMaterial();

        if (typeof scene === 'undefined' || !scene) return;
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

        const dummy = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            getMaterial()
        );
        dummy.position.set(0, 54.5, 0);
        dummy.castShadow = false;
        dummy.receiveShadow = false;
        scene.add(dummy);
        scene.updateMatrixWorld(true);

        try {
            if (typeof renderer.compile === 'function') renderer.compile(scene, p1.cam);
        } catch (e) {}
        try { renderer.render(scene, p1.cam); } catch (e) {}

        scene.remove(dummy);
        try { dummy.geometry.dispose(); } catch (e) {}

        console.log('[zombie_normal_model] preload 完成');
    }

    window.ZOMBIE_MODEL_NORMAL = { build, preload };
    console.log('[zombie_normal_model] Minecraft 风格普通僵尸模型已注册（HEAD_SCALE=' + HEAD_SCALE + '）');
})();