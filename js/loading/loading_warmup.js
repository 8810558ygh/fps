// ===== js/loading_warmup.js – 所有预热函数 =====
// 暴露：window.LoadingWarmup

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('[loading_warmup] THREE 未加载，跳过');
        return;
    }

    // ★ 加入 medkit 预加载
    const ALL_WEAPON_TYPES = ['rifle', 'sniper', 'shotgun', 'odin', 'knife', 'smoke', 'flash', 'medkit'];

    const WEAPON_NAMES = {
        rifle: '狂徒', sniper: '冥驹', shotgun: '判官',
        odin: '奥丁', knife: '军刀',
        smoke: '烟雾弹', flash: '闪光弹',
        medkit: '医疗包',
    };

    // ============================================================
    // 预热相机
    // ============================================================
    function withWarmupCamera(fn) {
        if (typeof p1 === 'undefined' || !p1 || !p1.cam) {
            try { fn(); } catch (e) {}
            return;
        }
        const cam = p1.cam;
        const origPos    = cam.position.clone();
        const origRotX   = cam.rotation.x;
        const origRotY   = cam.rotation.y;
        const origRotZ   = cam.rotation.z;
        const origFov    = cam.fov;
        const origAspect = cam.aspect;
        const origNear   = cam.near;
        const origFar    = cam.far;

        cam.position.set(0, 55, 0);
        cam.rotation.set(-Math.PI / 2, 0, 0);
        cam.fov = 100;
        cam.aspect = 1;
        cam.near = 0.1;
        cam.far = 500;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);

        try {
            fn();
        } finally {
            cam.position.copy(origPos);
            cam.rotation.set(origRotX, origRotY, origRotZ);
            cam.fov = origFov;
            cam.aspect = origAspect;
            cam.near = origNear;
            cam.far = origFar;
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld(true);
        }
    }

    // ============================================================
    // 音频系统
    // ============================================================
    function warmupAudioDeep() {
        try {
            if (typeof audio !== 'function') return;
            const ac = audio();
            if (!ac) return;

            const silent = ac.createGain();
            silent.gain.value = 0.0001;
            silent.connect(ac.destination);

            const soundFns = [
                ['sShootRifle',    () => sShootRifle(silent)],
                ['sShootSniper',   () => sShootSniper(silent)],
                ['sShootShotgun',  () => sShootShotgun(silent)],
                ['sShootOdin',     () => sShootOdin(silent)],
                ['sMelee-light',   () => sMelee(silent, false)],
                ['sMelee-heavy',   () => sMelee(silent, true)],
                ['sHit',           () => sHit(silent)],
                ['sKill',          () => sKill(silent)],
                ['sDeath',         () => sDeath(silent)],
                ['sReload',        () => sReload(silent)],
                ['sEmpty',         () => sEmpty(silent)],
                ['sPickup',        () => sPickup(silent)],
                ['sWin',           () => sWin(silent)],
                ['sFootstep',      () => sFootstep(silent)],
                ['sLanding',       () => sLanding(silent, 1.0)],
                ['sSmokeThrow',    () => sSmokeThrow(silent)],
                ['sSmokePop',      () => sSmokePop(silent)],
                ['sFlashThrow',    () => sFlashThrow(silent)],
                ['sFlashDetonate', () => sFlashDetonate(silent)],
                ['sExplosion',     () => sExplosion(silent)],
            ];
            for (const [name, fn] of soundFns) {
                try { fn(); } catch (e) {
                    console.warn('[loading_warmup] 音效预热失败:', name, e);
                }
            }

            try {
                const panner = ac.createPanner();
                panner.panningModel = 'HRTF';
                panner.distanceModel = 'inverse';
                panner.refDistance = 1;
                panner.maxDistance = 100;
                panner.rolloffFactor = 1;
                if (panner.positionX) {
                    panner.positionX.value = 0;
                    panner.positionY.value = 0;
                    panner.positionZ.value = 0;
                } else {
                    panner.setPosition(0, 0, 0);
                }
                const g = ac.createGain();
                g.gain.value = 0.0001;
                g.connect(panner);
                panner.connect(ac.destination);

                const osc = ac.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = 440;
                osc.connect(g);
                osc.start();
                osc.stop(ac.currentTime + 0.02);

                setTimeout(() => {
                    try { osc.disconnect(); } catch (e) {}
                    try { g.disconnect(); } catch (e) {}
                    try { panner.disconnect(); } catch (e) {}
                    try { silent.disconnect(); } catch (e) {}
                }, 500);
            } catch (e) {
                console.warn('[loading_warmup] PannerNode 预热失败:', e);
            }

            console.log('[loading_warmup] 音频深度预热完成');
        } catch (e) {
            console.warn('[loading_warmup] 音频预热整体失败:', e);
        }
    }

    // ============================================================
    // 纹理上传
    // ============================================================
    function collectTexturesFromMaterial(mat, set) {
        if (!mat) return;
        const keys = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
            'emissiveMap', 'envMap', 'alphaMap', 'lightMap', 'specularMap',
            'displacementMap', 'bumpMap', 'clearcoatMap',
            'clearcoatNormalMap', 'clearcoatRoughnessMap',
            'sheenColorMap', 'sheenRoughnessMap',
            'transmissionMap', 'thicknessMap',
        ];
        for (const k of keys) {
            const t = mat[k];
            if (t && t.isTexture) set.add(t);
        }
        if (mat.uniforms) {
            for (const uk in mat.uniforms) {
                const u = mat.uniforms[uk];
                if (u && u.value && u.value.isTexture) set.add(u.value);
            }
        }
    }

    function collectTexturesFromObject(obj, set) {
        if (!obj) return;
        obj.traverse(o => {
            if (!o.isMesh && !o.isPoints && !o.isLine) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => collectTexturesFromMaterial(m, set));
        });
    }

    function forceUploadAllTextures() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof renderer.initTexture !== 'function') return;

        const set = new Set();
        for (const type of ALL_WEAPON_TYPES) {
            try {
                const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                collectTexturesFromObject(w, set);
                collectTexturesFromObject(v, set);
            } catch (e) {}
        }
        try { collectTexturesFromObject(scene, set); } catch (e) {}

        console.log('[loading_warmup] 准备上传纹理数量:', set.size);

        let ok = 0, fail = 0;
        set.forEach(tex => {
            try {
                renderer.initTexture(tex);
                ok++;
            } catch (e) { fail++; }
        });
        console.log('[loading_warmup] 纹理上传完成: ok =', ok, ', fail =', fail);
    }

    // ============================================================
    // 场景 shader 编译（完整版：连武器一起）
    // ============================================================
    function compileSceneShaders() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof scene === 'undefined' || !scene) return;

        withWarmupCamera(() => {
            const tempObjects = [];

            ALL_WEAPON_TYPES.forEach(type => {
                try {
                    const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                    const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                    [w, v].forEach(tpl => {
                        if (!tpl) return;
                        const _savedUD = tpl.userData;
                        tpl.userData = {};
                        const clone = tpl.clone(true);
                        tpl.userData = _savedUD;

                        clone.position.set(0, 0.5, 0);
                        clone.visible = true;
                        clone.traverse(o => { o.visible = true; });
                        scene.add(clone);
                        tempObjects.push(clone);
                    });
                } catch (e) {}
            });

            scene.updateMatrixWorld(true);

            try { renderer.compile(scene, p1.cam); } catch (e) {}
            try {
                const prevAuto  = renderer.shadowMap.autoUpdate;
                renderer.shadowMap.autoUpdate = false;
                renderer.shadowMap.needsUpdate = true;
                renderer.render(scene, p1.cam);
                renderer.shadowMap.autoUpdate = prevAuto;
                renderer.shadowMap.needsUpdate = true;
            } catch (e) {}

            tempObjects.forEach(o => {
                if (o.parent === scene) scene.remove(o);
            });
        });
    }

    function warmupMapOnly() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof scene === 'undefined' || !scene) return;

        withWarmupCamera(() => {
            scene.updateMatrixWorld(true);
            try { renderer.compile(scene, p1.cam); } catch (e) {}
            try {
                const prevAuto  = renderer.shadowMap.autoUpdate;
                renderer.shadowMap.autoUpdate = false;
                renderer.shadowMap.needsUpdate = true;
                renderer.render(scene, p1.cam);
                renderer.shadowMap.autoUpdate = prevAuto;
                renderer.shadowMap.needsUpdate = true;
            } catch (e) {}
        });
    }

    // ============================================================
    // 单个武器 viewmodel
    // ============================================================
    function warmupSingleViewmodel(type) {
        if (typeof window.makeViewmodel !== 'function') return;
        if (typeof p1 === 'undefined' || !p1 || !p1.vm) return;

        let vm = null;
        try { vm = window.makeViewmodel(type, p1.mat); } catch (e) { return; }
        if (!vm) return;

        p1.vm.add(vm);
        try {
            renderer.compile(scene, p1.cam);
            renderer.render(scene, p1.cam);

            if (vm.userData.adsPos && vm.userData.adsRot) {
                vm.position.copy(vm.userData.adsPos);
                vm.rotation.copy(vm.userData.adsRot);
                renderer.render(scene, p1.cam);
                vm.position.copy(vm.userData.basePos);
                vm.rotation.copy(vm.userData.baseRot);
            }
            const mag = vm.userData.magazineGroup;
            if (mag) {
                const origPos = mag.position.clone();
                mag.position.y += 0.14;
                mag.position.z += 0.03;
                renderer.render(scene, p1.cam);
                mag.position.copy(origPos);
            }
            const bolt = vm.userData.boltGroup;
            if (bolt) {
                const origX = bolt.position.x;
                bolt.position.x = -0.18;
                renderer.render(scene, p1.cam);
                bolt.position.x = origX;
            }
            if (type === 'knife') {
                const bp = vm.userData.basePos;
                const br = vm.userData.baseRot;
                if (bp && br) {
                    vm.position.set(bp.x + 0.22, bp.y + 0.10, bp.z + 0.10);
                    vm.rotation.set(br.x + 0.18, br.y - 0.45, br.z + 0.45);
                    renderer.render(scene, p1.cam);
                    vm.position.set(bp.x - 0.72, bp.y - 0.10, bp.z - 0.18);
                    vm.rotation.set(br.x - 0.04, br.y + 1.10, br.z - 0.70);
                    renderer.render(scene, p1.cam);
                    vm.position.copy(bp);
                    vm.rotation.copy(br);
                }
            }
            if (type === 'smoke' || type === 'flash' || type === 'medkit') {
                const bp = vm.userData.basePos;
                const br = vm.userData.baseRot;
                if (bp && br) {
                    vm.position.set(bp.x + 0.005, bp.y + 0.008, bp.z);
                    vm.rotation.set(br.x + 0.03, br.y + 0.04, br.z);
                    renderer.render(scene, p1.cam);
                    vm.position.copy(bp);
                    vm.rotation.copy(br);
                }
            }
        } catch (e) {}

        p1.vm.remove(vm);
    }

    // ============================================================
    // 单个武器 world model
    // ============================================================
    function warmupSingleWorldModel(type) {
        if (typeof window.makeWeaponModel !== 'function') return;
        if (typeof p2 === 'undefined' || !p2 || !p2.gunHolder) return;

        let wm = null;
        try { wm = window.makeWeaponModel(type, p2.mat); } catch (e) { return; }
        if (!wm) return;

        p2.gunHolder.add(wm);
        try {
            renderer.compile(scene, p1.cam);
            renderer.render(scene, p1.cam);
        } catch (e) {}
        p2.gunHolder.remove(wm);
    }

    // ============================================================
    // 特效材质
    // ============================================================
    function warmupEffectMaterials() {
        try {
            if (typeof window.spawnBulletHole === 'function') {
                withWarmupCamera(() => {
                    window.spawnBulletHole(new THREE.Vector3(0, 54.5, 0), new THREE.Vector3(0, 1, 0));
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }
            if (typeof window.spawnSparks === 'function') {
                withWarmupCamera(() => {
                    window.spawnSparks(new THREE.Vector3(0, 54.5, 0), 0xff5040);
                    window.spawnSparks(new THREE.Vector3(0, 54.5, 0), 0xffd28a);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }
            if (typeof window.spawnTracer === 'function') {
                withWarmupCamera(() => {
                    window.spawnTracer(
                        new THREE.Vector3(0, 54.5, 0),
                        new THREE.Vector3(5, 54.5, 0)
                    );
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }
            if (typeof window.spawnShellCasing === 'function'
                && typeof window.updateShellCasings === 'function') {
                withWarmupCamera(() => {
                    const fakeNow = performance.now();
                    if (typeof p1 !== 'undefined' && p1) {
                        window.spawnShellCasing(p1, fakeNow);
                    }
                    window.updateShellCasings(0.016, fakeNow + 16);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                    window.updateShellCasings(1.0, fakeNow + 5000);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }
            console.log('[loading_warmup] 特效材质预热完成');
        } catch (e) {
            console.warn('[loading_warmup] 特效材质预热失败:', e);
        }
    }

    function warmupSmokeCloud() {
        const buildFn = (typeof window.createSmokeCloud === 'function')
            ? window.createSmokeCloud
            : (typeof createSmokeCloud === 'function' ? createSmokeCloud : null);
        if (!buildFn) return;

        withWarmupCamera(() => {
            let cloud = null;
            try { cloud = buildFn(new THREE.Vector3(0, 0, 0), 4.0, 4.5, 3.5); } catch (e) { return; }
            if (!cloud) return;

            if (cloud.userData && cloud.userData.layers) {
                for (const m of cloud.userData.layers) {
                    m.material.opacity = m.userData.baseOpacity || 0.5;
                }
            }
            cloud.position.set(0, 54.5, 0);
            scene.add(cloud);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            scene.remove(cloud);
            cloud.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        });
    }

    function warmupFlashBurst() {
        if (typeof window.spawnFlashBurst !== 'function') return;
        if (typeof window.updateFlashBursts !== 'function') return;
        withWarmupCamera(() => {
            const fakeNow = performance.now();
            window.spawnFlashBurst(new THREE.Vector3(0, 54.5, 0));
            window.updateFlashBursts(0.016, fakeNow + 200);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            window.updateFlashBursts(1.0, fakeNow + 1000);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupExplosion() {
        if (typeof window.spawnExplosionVisual !== 'function') return;
        if (typeof window.updateExplosionVisuals !== 'function') return;
        withWarmupCamera(() => {
            const fakeNow = performance.now();
            window.spawnExplosionVisual(0, 54.5, 0);
            window.updateExplosionVisuals(0.016, fakeNow + 250);
            try { renderer.render(scene, p1.cam); } catch (e) {}
            window.updateExplosionVisuals(1.0, fakeNow + 1000);
            try { renderer.render(scene, p1.cam); } catch (e) {}
        });
    }

    function warmupFlashIndicator() {
        if (typeof p1 === 'undefined' || !p1 || !p1.flashIndicator) return;
        withWarmupCamera(() => {
            const fi = p1.flashIndicator;
            const ud = fi.userData || {};
            const origVisible  = fi.visible;
            const origSphereOp = ud.sphere ? ud.sphere.material.opacity : 0;
            const origHaloOp   = ud.halo   ? ud.halo.material.opacity   : 0;
            const origLightI   = ud.light  ? ud.light.intensity         : 0;

            fi.visible = true;
            if (ud.sphere) ud.sphere.material.opacity = 0.85;
            if (ud.halo)   ud.halo.material.opacity   = 0.45;
            if (ud.light)  ud.light.intensity         = 5;

            try { renderer.render(scene, p1.cam); } catch (e) {}

            fi.visible = origVisible;
            if (ud.sphere) ud.sphere.material.opacity = origSphereOp;
            if (ud.halo)   ud.halo.material.opacity   = origHaloOp;
            if (ud.light)  ud.light.intensity         = origLightI;
        });
    }

    function warmupScopePip() {
        if (typeof window.warmupScopePip !== 'function') return;
        try { window.warmupScopePip(); } catch (e) {}
    }

    function warmupPhysicsDeep() {
        if (!window.PHYSICS || !window.PHYSICS.isReady()) return;
        try {
            for (let i = 0; i < 5; i++) window.PHYSICS.stepPhysics(1 / 60);
            const testPos = { x: 0, y: 50, z: 0 };
            const testVel = { x: 0, y: 0, z: 0 };
            const smokeBody = window.PHYSICS.createProjectileBody(testPos, testVel, 'smoke');
            const flashBody = window.PHYSICS.createProjectileBody(testPos, testVel, 'flash');
            window.PHYSICS.stepPhysics(1 / 60);
            window.PHYSICS.stepPhysics(1 / 60);
            if (smokeBody) window.PHYSICS.removeProjectileBody(smokeBody);
            if (flashBody) window.PHYSICS.removeProjectileBody(flashBody);
            const shellBody = window.PHYSICS.createShellBody(testPos, testVel);
            window.PHYSICS.stepPhysics(1 / 60);
            if (shellBody) window.PHYSICS.removeShellBody(shellBody);
            console.log('[loading_warmup] 物理引擎深度预热完成');
        } catch (e) {
            console.warn('[loading_warmup] 物理预热失败:', e);
        }
    }

    function warmupZombies() {
        if (typeof window.initZombiePool !== 'function') return;
        try {
            window.initZombiePool();
            withWarmupCamera(() => {
                const zombies = (typeof window.getAllZombies === 'function')
                    ? window.getAllZombies() : [];
                const displaced = [];
                const N = Math.min(zombies.length, 6);
                for (let i = 0; i < N; i++) {
                    const z = zombies[i];
                    displaced.push({ z, pos: z.mesh.position.clone(), visible: z.mesh.visible });
                    z.mesh.position.set((i - (N-1)/2) * 1.5, 54.5, 0);
                    z.mesh.visible = true;
                }
                try { renderer.compile(scene, p1.cam); } catch (e) {}
                try { renderer.render(scene, p1.cam); } catch (e) {}
                for (const d of displaced) {
                    d.z.mesh.position.copy(d.pos);
                    d.z.mesh.visible = d.visible;
                }
            });
            console.log('[loading_warmup] 僵尸池预热完成');
        } catch (e) {
            console.warn('[loading_warmup] 僵尸预热失败:', e);
        }
    }

    function warmupSurvivalPortal() {
        if (typeof window.warmupSurvivalPortal !== 'function') return;
        try { window.warmupSurvivalPortal(); } catch (e) {}
    }

    function warmupHudDom() {
        try {
            const ids = [
                'hpText', 'armorText', 'timer', 'fpsCounter',
                'throwCountdown', 'throwCountdownIcon',
                'throwCountdownLabel', 'throwCountdownTime',
                'adsReticle', 'scorePanel', 'aiToggle', 'exitBtn',
                'survivalWaveSummary', 'survivalEndOverlay',
                'medkitProgress', 'mkBarFill',
            ];
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                void window.getComputedStyle(el).display;
                void el.offsetWidth;
            }
            const selectors = [
                '#hud1 .ammo', '#hud1 .hp-val', '#hud1 .armor-val',
                '#hud1 .scope', '#hud1 .cross', '#hud1 .wtag',
                '#hud1 .feed', '#hud1 .centermsg', '#hud1 .dmgflash',
                '#hud1 .hitmark', '#hud1 .subhint',
                '#survivalWaveSummary .sv-summary-title',
                '#survivalWaveSummary .sv-summary-row',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    void window.getComputedStyle(el).display;
                    void el.offsetWidth;
                }
            }
            console.log('[loading_warmup] HUD DOM 预热完成');
        } catch (e) {
            console.warn('[loading_warmup] HUD DOM 预热失败:', e);
        }
    }

    function finalSceneRender() {
        if (typeof renderer === 'undefined' || !renderer) return;
        withWarmupCamera(() => {
            const finalGroup = new THREE.Group();
            ALL_WEAPON_TYPES.forEach(type => {
                try {
                    const wm = window.makeWeaponModel ? window.makeWeaponModel(type, p1.mat) : null;
                    if (wm) { wm.position.set(0, 0.5, 0); finalGroup.add(wm); }
                    const vm = window.makeViewmodel ? window.makeViewmodel(type, p1.mat) : null;
                    if (vm) { vm.position.set(0, 0.5, 0); finalGroup.add(vm); }
                } catch (e) {}
            });
            scene.add(finalGroup);
            finalGroup.updateMatrixWorld(true);
            try {
                renderer.compile(scene, p1.cam);
                renderer.render(scene, p1.cam);
            } catch (e) {}
            scene.remove(finalGroup);
        });
        try {
            const prevAuto = renderer.shadowMap.autoUpdate;
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = true;
            renderer.render(scene, p1.cam);
            renderer.shadowMap.autoUpdate = prevAuto;
        } catch (e) {}
        console.log('[loading_warmup] 最终场景渲染完成');
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.LoadingWarmup = {
        ALL_WEAPON_TYPES,
        WEAPON_NAMES,
        withWarmupCamera,

        warmupAudioDeep,
        forceUploadAllTextures,
        compileSceneShaders,
        warmupMapOnly,
        warmupSingleViewmodel,
        warmupSingleWorldModel,
        warmupEffectMaterials,
        warmupSmokeCloud,
        warmupFlashBurst,
        warmupExplosion,
        warmupFlashIndicator,
        warmupScopePip,
        warmupPhysicsDeep,
        warmupZombies,
        warmupSurvivalPortal,
        warmupHudDom,
        finalSceneRender,
    };

    console.log('[loading_warmup] 预热函数模块已就绪');
})();