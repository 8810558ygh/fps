// ===== js/loading.js – 深度预加载（真实渲染路径全覆蓋版） =====

(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('[loading] THREE 未加载，跳过');
        return;
    }

    const overlay   = document.getElementById('loadingOverlay');
    const barEl     = document.getElementById('loadingBar');
    const percentEl = document.getElementById('loadingPercent');
    const statusEl  = document.getElementById('loadingStatus');
    const titleEl   = overlay ? overlay.querySelector('.loading-title') : null;
    const playersEl = document.getElementById('loadingPlayers');

    if (!overlay) {
        console.warn('[loading] 未找到 #loadingOverlay，跳过');
        return;
    }

    const state = {
        active: false,
        progress: 0,
        status: '',
        online: false,
        players: {},
    };

    // ============================================================
    // 基础 UI
    // ============================================================
    function show(title) {
        state.active = true;
        state.progress = 0;
        state.status = '准备中...';
        overlay.style.display = 'flex';
        if (titleEl && title) titleEl.textContent = title;
        renderAll();
    }

    function hide() {
        state.active = false;
        state.online = false;
        state.players = {};
        overlay.style.display = 'none';
        if (playersEl) playersEl.style.display = 'none';
    }

    function setProgress(p) {
        state.progress = Math.max(0, Math.min(1, p));
        renderAll();
    }

    function setStatus(text) {
        state.status = text || '';
        renderAll();
    }

    function getProgress() { return state.progress; }

    function renderAll() {
        const pct = Math.round(state.progress * 100);
        if (barEl)     barEl.style.width = pct + '%';
        if (percentEl) percentEl.textContent = pct + '%';
        if (statusEl)  statusEl.textContent = state.status || '';
        renderPlayerList();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function setupPlayers(players) {
        state.online = true;
        state.players = {};
        players.forEach(p => {
            state.players[p.id] = {
                name: p.name || '玩家',
                isSelf: !!p.isSelf,
                progress: 0,
            };
        });
        if (playersEl) playersEl.style.display = 'flex';
        renderPlayerList();
    }

    function setPlayerProgress(peerId, progress) {
        if (!state.players[peerId]) {
            state.players[peerId] = { name: '玩家', isSelf: false, progress: 0 };
        }
        state.players[peerId].progress = Math.max(0, Math.min(1, progress));
        renderPlayerList();
    }

    function renderPlayerList() {
        if (!playersEl) return;
        if (!state.online) {
            playersEl.style.display = 'none';
            return;
        }
        let html = '';
        for (const id in state.players) {
            const p = state.players[id];
            const pct = Math.round((p.progress || 0) * 100);
            const doneCls = pct >= 100 ? ' done' : '';
            html += '<div class="loading-player-row' + doneCls + '">' +
                        '<span class="lp-name">' + escapeHtml(p.name) +
                            (p.isSelf ? '（你）' : '') +
                        '</span>' +
                        '<span class="lp-pct">' + pct + '%</span>' +
                    '</div>';
        }
        playersEl.innerHTML = html;
    }

    function nextFrame() {
        return new Promise(r => requestAnimationFrame(() => r()));
    }

    async function runTasks(tasks, onProgress) {
        const totalWeight = tasks.reduce((s, t) => s + (t.weight || 1), 0) || 1;
        let doneWeight = 0;

        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            state.status = t.name || '加载中';
            state.progress = doneWeight / totalWeight;
            renderAll();

            await nextFrame();

            try {
                if (t.fn) await Promise.resolve(t.fn());
            } catch (e) {
                console.warn('[loading] 任务失败:', t.name, e);
            }

            doneWeight += (t.weight || 1);
            state.progress = doneWeight / totalWeight;
            renderAll();

            if (onProgress) {
                try { onProgress(state.progress); } catch (e) {}
            }

            await nextFrame();
        }

        state.progress = 1;
        state.status = '完成';
        renderAll();
        if (onProgress) {
            try { onProgress(1); } catch (e) {}
        }
    }

    // ============================================================
    // 预热相机（不改动原逻辑）
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
    // 常量：全部武器
    // ============================================================
    const ALL_WEAPON_TYPES = ['rifle', 'sniper', 'shotgun', 'odin', 'knife', 'smoke', 'flash'];

    const WEAPON_NAMES = {
        rifle: '狂徒', sniper: '冥驹', shotgun: '判官',
        odin: '奥丁', knife: '军刀',
        smoke: '烟雾弹', flash: '闪光弹',
    };

    // ============================================================
    // ★ 深度预热 1：音频系统（创建 + 所有音效 + HRTF Panner）
    // ============================================================
    function warmupAudioDeep() {
        try {
            if (typeof audio !== 'function') return;
            const ac = audio();
            if (!ac) return;

            // 静音输出节点（0.0001 而非 0，避免某些浏览器短路）
            const silent = ac.createGain();
            silent.gain.value = 0.0001;
            silent.connect(ac.destination);

            // 每个音效函数跑一遍，触发所有节点的 JIT 编译
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
                    console.warn('[loading] 音效预热失败:', name, e);
                }
            }

            // HRTF PannerNode 首次连接会初始化卷积 IR
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
                console.warn('[loading] PannerNode 预热失败:', e);
            }

            console.log('[loading] 音频深度预热完成');
        } catch (e) {
            console.warn('[loading] 音频预热整体失败:', e);
        }
    }

    // ============================================================
    // ★ 深度预热 2：递归收集所有纹理 + 强制上传 GPU
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

        // ShaderMaterial 的 uniforms 里可能藏纹理
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
        if (typeof renderer.initTexture !== 'function') {
            console.warn('[loading] renderer.initTexture 不可用，跳过');
            return;
        }

        const set = new Set();

        // 遍历所有武器模板
        for (const type of ALL_WEAPON_TYPES) {
            try {
                const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                collectTexturesFromObject(w, set);
                collectTexturesFromObject(v, set);
            } catch (e) {}
        }

        // 遍历整个场景（地图、天空、地面、特效对象池）
        try { collectTexturesFromObject(scene, set); } catch (e) {}

        console.log('[loading] 准备上传纹理数量:', set.size);

        let ok = 0, fail = 0;
        set.forEach(tex => {
            try {
                renderer.initTexture(tex);
                ok++;
            } catch (e) {
                fail++;
            }
        });

        console.log('[loading] 纹理上传完成: ok =', ok, ', fail =', fail);
    }

    // ============================================================
    // ★ 深度预热 3：整体场景编译（基础 shader）
    // ============================================================
    function compileSceneShaders() {
        if (typeof renderer === 'undefined' || !renderer) return;
        if (typeof scene === 'undefined' || !scene) return;

        withWarmupCamera(() => {
            // 阶段 A：把每种武器的模板克隆都放进场景 → compile
            const tempObjects = [];

            ALL_WEAPON_TYPES.forEach(type => {
                try {
                    const w = (typeof _getWorldTemplate === 'function') ? _getWorldTemplate(type) : null;
                    const v = (typeof _getViewTemplate  === 'function') ? _getViewTemplate(type)  : null;
                    [w, v].forEach(tpl => {
                        if (!tpl) return;
                        const clone = tpl.clone(true);
                        clone.position.set(0, 0.5, 0);
                        clone.visible = true;
                        clone.traverse(o => { o.visible = true; });
                        scene.add(clone);
                        tempObjects.push(clone);
                    });
                } catch (e) {}
            });

            scene.updateMatrixWorld(true);

            try {
                renderer.compile(scene, p1.cam);
            } catch (e) {
                console.warn('[loading] scene compile failed:', e);
            }

            // 阶段 B：带阴影渲染一遍
            try {
                const prevAuto  = renderer.shadowMap.autoUpdate;
                const prevNeeds = renderer.shadowMap.needsUpdate;
                renderer.shadowMap.autoUpdate = false;
                renderer.shadowMap.needsUpdate = true;
                renderer.render(scene, p1.cam);
                renderer.shadowMap.autoUpdate = prevAuto;
                renderer.shadowMap.needsUpdate = true;
            } catch (e) {
                console.warn('[loading] scene render failed:', e);
            }

            tempObjects.forEach(o => {
                if (o.parent === scene) scene.remove(o);
            });
        });
    }

    // ============================================================
    // ★ 深度预热 4：单个武器的 viewmodel 在 6 个动画状态下真实渲染
    // ============================================================
    function warmupSingleViewmodel(type) {
        if (typeof window.makeViewmodel !== 'function') return;
        if (typeof p1 === 'undefined' || !p1 || !p1.vm) return;

        let vm = null;
        try {
            vm = window.makeViewmodel(type, p1.mat);
        } catch (e) {
            console.warn('[loading] makeViewmodel 失败:', type, e);
            return;
        }
        if (!vm) return;

        p1.vm.add(vm);

        try {
            // --- 状态 1：基础姿态 ---
            renderer.compile(scene, p1.cam);
            renderer.render(scene, p1.cam);

            // --- 状态 2：ADS 姿态（有 adsPos 的武器） ---
            if (vm.userData.adsPos && vm.userData.adsRot) {
                vm.position.copy(vm.userData.adsPos);
                vm.rotation.copy(vm.userData.adsRot);
                renderer.render(scene, p1.cam);
                vm.position.copy(vm.userData.basePos);
                vm.rotation.copy(vm.userData.baseRot);
            }

            // --- 状态 3：换弹动画（magazineGroup 抬起） ---
            const mag = vm.userData.magazineGroup;
            if (mag) {
                const origPos = mag.position.clone();
                mag.position.y += 0.14;
                mag.position.z += 0.03;
                renderer.render(scene, p1.cam);
                mag.position.copy(origPos);
            }

            // --- 状态 4：拉栓动画（boltGroup 拉到底） ---
            const bolt = vm.userData.boltGroup;
            if (bolt) {
                const origX = bolt.position.x;
                bolt.position.x = -0.18;
                renderer.render(scene, p1.cam);
                bolt.position.x = origX;
            }

            // --- 状态 5：近战挥砍姿态（军刀） ---
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

            // --- 状态 6：投掷物抖动（烟雾 / 闪光） ---
            if (type === 'smoke' || type === 'flash') {
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
        } catch (e) {
            console.warn('[loading] viewmodel 渲染失败:', type, e);
        }

        p1.vm.remove(vm);
    }

    // ============================================================
    // ★ 深度预热 5：单个武器的 world model 真实渲染
    // ============================================================
    function warmupSingleWorldModel(type) {
        if (typeof window.makeWeaponModel !== 'function') return;
        if (typeof p2 === 'undefined' || !p2 || !p2.gunHolder) return;

        let wm = null;
        try {
            wm = window.makeWeaponModel(type, p2.mat);
        } catch (e) {
            return;
        }
        if (!wm) return;

        p2.gunHolder.add(wm);

        try {
            renderer.compile(scene, p1.cam);
            renderer.render(scene, p1.cam);
        } catch (e) {}

        p2.gunHolder.remove(wm);
    }

    // ============================================================
    // ★ 深度预热 6：运行时特效（弹痕 / 火花 / 曳光 / 弹壳）
    // ============================================================
    function warmupEffectMaterials() {
        try {
            // 弹痕：每次命中新建材质，必须真实渲染一次覆盖 shader
            if (typeof window.spawnBulletHole === 'function') {
                withWarmupCamera(() => {
                    const pos = new THREE.Vector3(0, 54.5, 0);
                    const normal = new THREE.Vector3(0, 1, 0);
                    window.spawnBulletHole(pos, normal);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }

            // 火花
            if (typeof window.spawnSparks === 'function') {
                withWarmupCamera(() => {
                    window.spawnSparks(new THREE.Vector3(0, 54.5, 0), 0xff5040);
                    window.spawnSparks(new THREE.Vector3(0, 54.5, 0), 0xffd28a);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }

            // 曳光弹
            if (typeof window.spawnTracer === 'function') {
                withWarmupCamera(() => {
                    const from = new THREE.Vector3(0, 54.5, 0);
                    const to = new THREE.Vector3(5, 54.5, 0);
                    window.spawnTracer(from, to);
                    try { renderer.render(scene, p1.cam); } catch (e) {}
                });
            }

            // 弹壳
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

            console.log('[loading] 特效材质预热完成');
        } catch (e) {
            console.warn('[loading] 特效材质预热失败:', e);
        }
    }

    // ============================================================
    // 烟雾云预热
    // ============================================================
    function warmupSmokeCloud() {
        const buildFn = (typeof window.createSmokeCloud === 'function')
            ? window.createSmokeCloud
            : (typeof createSmokeCloud === 'function' ? createSmokeCloud : null);
        if (!buildFn) return;

        withWarmupCamera(() => {
            let cloud = null;
            try {
                cloud = buildFn(
                    new THREE.Vector3(0, 0, 0),
                    4.0, 4.5, 3.5
                );
            } catch (e) { return; }
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
            cloud.traverse(o => {
                if (o.isMesh) {
                    o.geometry.dispose();
                    o.material.dispose();
                }
            });
        });
    }

    // ============================================================
    // 闪光爆发预热
    // ============================================================
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

    // ============================================================
    // 油桶爆炸预热
    // ============================================================
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

    // ============================================================
    // 闪光指示器预热
    // ============================================================
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

    // ============================================================
    // 瞄准镜 PiP 预热
    // ============================================================
    function warmupScopePip() {
        if (typeof window.warmupScopePip !== 'function') return;
        try {
            window.warmupScopePip();
        } catch (e) {}
    }

    // ============================================================
    // ★ 深度预热 7：物理引擎（step + 创建/删除动态体）
    // ============================================================
    function warmupPhysicsDeep() {
        if (!window.PHYSICS || !window.PHYSICS.isReady()) return;

        try {
            // 强制 solver warmstart
            for (let i = 0; i < 5; i++) {
                window.PHYSICS.stepPhysics(1 / 60);
            }

            const testPos = { x: 0, y: 50, z: 0 };
            const testVel = { x: 0, y: 0, z: 0 };

            // 投掷物 body
            const smokeBody = window.PHYSICS.createProjectileBody(testPos, testVel, 'smoke');
            const flashBody = window.PHYSICS.createProjectileBody(testPos, testVel, 'flash');
            window.PHYSICS.stepPhysics(1 / 60);
            window.PHYSICS.stepPhysics(1 / 60);
            if (smokeBody) window.PHYSICS.removeProjectileBody(smokeBody);
            if (flashBody) window.PHYSICS.removeProjectileBody(flashBody);

            // 弹壳 body
            const shellBody = window.PHYSICS.createShellBody(testPos, testVel);
            window.PHYSICS.stepPhysics(1 / 60);
            if (shellBody) window.PHYSICS.removeShellBody(shellBody);

            console.log('[loading] 物理引擎深度预热完成');
        } catch (e) {
            console.warn('[loading] 物理预热失败:', e);
        }
    }

    // ============================================================
    // ★ 深度预热 8：HUD DOM 样式（触发浏览器样式计算 + layout）
    // ============================================================
    function warmupHudDom() {
        try {
            const ids = [
                'hpText', 'armorText', 'timer', 'fpsCounter',
                'throwCountdown', 'throwCountdownIcon',
                'throwCountdownLabel', 'throwCountdownTime',
                'adsReticle', 'scorePanel', 'aiToggle', 'exitBtn',
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
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    void window.getComputedStyle(el).display;
                    void el.offsetWidth;
                }
            }

            console.log('[loading] HUD DOM 预热完成');
        } catch (e) {
            console.warn('[loading] HUD DOM 预热失败:', e);
        }
    }

    // ============================================================
    // ★ 深度预热 9：最终整体渲染（所有武器一起 + 阴影）
    // ============================================================
    function finalSceneRender() {
        if (typeof renderer === 'undefined' || !renderer) return;

        withWarmupCamera(() => {
            const finalGroup = new THREE.Group();

            ALL_WEAPON_TYPES.forEach(type => {
                try {
                    const wm = window.makeWeaponModel ? window.makeWeaponModel(type, p1.mat) : null;
                    if (wm) {
                        wm.position.set(0, 0.5, 0);
                        finalGroup.add(wm);
                    }
                    const vm = window.makeViewmodel ? window.makeViewmodel(type, p1.mat) : null;
                    if (vm) {
                        vm.position.set(0, 0.5, 0);
                        finalGroup.add(vm);
                    }
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

        // 单独再跑一次带阴影的渲染
        try {
            const prevAuto = renderer.shadowMap.autoUpdate;
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = true;
            renderer.render(scene, p1.cam);
            renderer.shadowMap.autoUpdate = prevAuto;
        } catch (e) {}

        console.log('[loading] 最终场景渲染完成');
    }

    // ============================================================
    // 构建加载任务列表（深度强化版）
    // ============================================================
    function buildGameLoadTasks(mapId) {
        const tasks = [];

        // 1. 音频系统
        tasks.push({
            name: '初始化音频系统',
            weight: 3,
            fn: () => warmupAudioDeep(),
        });

        // 2. 构建地图
        tasks.push({
            name: '构建地图',
            weight: 6,
            fn: () => {
                if (typeof window.loadMap !== 'function') return;
                const cur = (window.getCurrentMapId && window.getCurrentMapId()) || null;
                if (cur !== mapId && mapId) window.loadMap(mapId);
            },
        });

        // 3. 构建所有武器模板
        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '构建武器模板：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => {
                    if (typeof _getWorldTemplate === 'function') _getWorldTemplate(type);
                    if (typeof _getViewTemplate  === 'function') _getViewTemplate(type);
                },
            });
        });

        // 4. 上传所有纹理到 GPU
        tasks.push({
            name: '上传全部纹理到 GPU',
            weight: 8,
            fn: () => forceUploadAllTextures(),
        });

        // 5. 基础场景 shader 编译
        tasks.push({
            name: '编译场景基础着色器',
            weight: 6,
            fn: () => compileSceneShaders(),
        });

        // 6. 每个武器的 viewmodel 在 6 个状态下真实渲染
        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第一人称：' + (WEAPON_NAMES[type] || type),
                weight: 4,
                fn: () => warmupSingleViewmodel(type),
            });
        });

        // 7. 每个武器的 world model 真实渲染
        ALL_WEAPON_TYPES.forEach(type => {
            tasks.push({
                name: '渲染第三人称：' + (WEAPON_NAMES[type] || type),
                weight: 3,
                fn: () => warmupSingleWorldModel(type),
            });
        });

        // 8. 特效材质（弹痕 / 火花 / 曳光 / 弹壳）
        tasks.push({
            name: '预热特效材质',
            weight: 6,
            fn: () => warmupEffectMaterials(),
        });

        // 9. 烟雾云
        tasks.push({
            name: '预热烟雾云',
            weight: 3,
            fn: () => warmupSmokeCloud(),
        });

        // 10. 闪光爆发
        tasks.push({
            name: '预热闪光爆发',
            weight: 2,
            fn: () => warmupFlashBurst(),
        });

        // 11. 油桶爆炸
        tasks.push({
            name: '预热油桶爆炸',
            weight: 3,
            fn: () => warmupExplosion(),
        });

        // 12. 闪光指示器
        tasks.push({
            name: '预热闪光指示器',
            weight: 2,
            fn: () => warmupFlashIndicator(),
        });

        // 13. 瞄准镜 PiP
        tasks.push({
            name: '预热瞄准镜 PiP',
            weight: 3,
            fn: () => warmupScopePip(),
        });

        // 14. 物理引擎
        tasks.push({
            name: '预热物理引擎',
            weight: 4,
            fn: () => warmupPhysicsDeep(),
        });

        // 15. HUD DOM 样式
        tasks.push({
            name: '预热 HUD 样式',
            weight: 2,
            fn: () => warmupHudDom(),
        });

        // 16. 最终整体渲染
        tasks.push({
            name: '最终场景渲染',
            weight: 5,
            fn: () => finalSceneRender(),
        });

        return tasks;
    }

    // ============================================================
    // 单机入口
    // ============================================================
    async function beginSinglePlayerLoading(mode) {
        if (typeof audio === 'function') audio();

        const ll = document.getElementById('lobbyOverlay');
        if (ll) ll.style.display = 'none';

        show('正在载入人机对战');

        const mapId = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
        const tasks = buildGameLoadTasks(mapId);
        await runTasks(tasks);

        await nextFrame();
        await nextFrame();

        hide();

        if (typeof window.enterGame === 'function') {
            window.enterGame(mode);
        }
    }

    // ============================================================
    // 联机入口
    // ============================================================
    async function beginOnlineLoading(mapId, isHost) {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingInProgress) return;
        NET.loadingInProgress = true;
        NET.loadingAllDone = false;
        NET.loadingState = {};

        const ol = document.getElementById('onlineLobbyOverlay');
        const ll = document.getElementById('lobbyOverlay');
        if (ol) ol.style.display = 'none';
        if (ll) ll.style.display = 'none';

        const players = [];
        if (isHost) {
            players.push({ id: NET.myPeerId, name: NET.myName, isSelf: true });
            NET.members.forEach((m, id) => {
                if (id !== NET.myPeerId) {
                    players.push({ id, name: m.name, isSelf: false });
                }
            });
            NET.loadingState[NET.myPeerId] = 0;
        } else {
            const hostId = NET.roomId;
            const hostMember = NET.members.get(hostId);
            players.push({
                id: hostId,
                name: (hostMember && hostMember.name) || '房主',
                isSelf: false,
            });
            players.push({ id: NET.myPeerId, name: NET.myName || '你', isSelf: true });
        }

        show('正在载入战场');
        setupPlayers(players);

        startOnlineLoadingReport(isHost);

        const tasks = buildGameLoadTasks(mapId || (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield');
        await runTasks(tasks);

        stopOnlineLoadingReport();

        if (isHost) {
            NET.loadingState[NET.myPeerId] = 1;
            broadcastLoadingStatus();
            checkAllLoaded();
        } else {
            if (typeof window.NET_sendToHost === 'function') {
                window.NET_sendToHost({ type: 'loadingProgress', progress: 1 });
            }
            setStatus('等待其他玩家...');
        }
    }

    function startOnlineLoadingReport(isHost) {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingReportTimer) clearInterval(NET.loadingReportTimer);

        NET.loadingReportTimer = setInterval(() => {
            const p = getProgress();
            if (isHost) {
                NET.loadingState[NET.myPeerId] = p;
                broadcastLoadingStatus();
            } else {
                if (typeof window.NET_sendToHost === 'function') {
                    window.NET_sendToHost({ type: 'loadingProgress', progress: p });
                }
            }
        }, 200);
    }

    function stopOnlineLoadingReport() {
        const NET = window.NET;
        if (!NET) return;
        if (NET.loadingReportTimer) {
            clearInterval(NET.loadingReportTimer);
            NET.loadingReportTimer = null;
        }
    }

    function broadcastLoadingStatus() {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        if (typeof window.NET_broadcast === 'function') {
            window.NET_broadcast({ type: 'loadingStatus', state: NET.loadingState });
        }
    }

    function handleClientLoadingProgress(fromId, progress) {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        NET.loadingState[fromId] = progress;
        setPlayerProgress(fromId, progress);
        broadcastLoadingStatus();
        checkAllLoaded();
    }

    function handleLoadingStatus(stateMap) {
        const NET = window.NET;
        if (!NET || NET.isHost) return;
        if (!stateMap) return;
        for (const id in stateMap) {
            setPlayerProgress(id, stateMap[id]);
        }
    }

    function handleLoadingComplete() {
        const NET = window.NET;
        if (!NET || NET.isHost) return;
        finishOnlineLoading();
    }

    function checkAllLoaded() {
        const NET = window.NET;
        if (!NET || !NET.isHost) return;
        if (NET.loadingAllDone) return;
        for (const id in NET.loadingState) {
            if (NET.loadingState[id] < 1) return;
        }
        NET.loadingAllDone = true;
        if (typeof window.NET_broadcast === 'function') {
            window.NET_broadcast({ type: 'loadingComplete' });
        }
        finishOnlineLoading();
    }

    function finishOnlineLoading() {
        stopOnlineLoadingReport();
        setStatus('全员就绪');
        setProgress(1);

        setTimeout(() => {
            hide();
            if (typeof window.NET_enterOnlineGame === 'function') {
                window.NET_enterOnlineGame();
            }
            const NET = window.NET;
            if (NET) {
                NET.loadingInProgress = false;
                NET.loadingAllDone = false;
                NET.loadingState = {};
            }
        }, 260);
    }

    function installOnlineStartHook() {
        window.onlineStartGame = function () {
            const NET = window.NET;
            if (!NET || !NET.isHost) return;
            if (!NET.seats.blue || !NET.seats.red) {
                if (typeof toast === 'function') toast('双方入场后才能开始');
                return;
            }
            NET.started = true;

            const mapId = (window.getCurrentMapId && window.getCurrentMapId()) || 'battlefield';
            if (typeof window.NET_broadcast === 'function') {
                window.NET_broadcast({ type: 'gameStart', mapId: mapId });
            }

            beginOnlineLoading(mapId, true);
        };
    }

    function hijackClick(id, handler) {
        const old = document.getElementById(id);
        if (!old) return;
        const clone = old.cloneNode(true);
        old.parentNode.replaceChild(clone, old);
        clone.addEventListener('click', handler);
    }

    function installLobbyHooks() {
        hijackClick('lobbyAiBtn', () => beginSinglePlayerLoading('ai'));
    }

    window.LoadingManager = {
        show,
        hide,
        setProgress,
        setStatus,
        getProgress,
        setupPlayers,
        setPlayerProgress,
        runTasks,
        isActive: () => state.active,
    };

    window.beginSinglePlayerLoading    = beginSinglePlayerLoading;
    window.beginOnlineLoading          = beginOnlineLoading;
    window.handleClientLoadingProgress = handleClientLoadingProgress;
    window.handleLoadingStatus         = handleLoadingStatus;
    window.handleLoadingComplete       = handleLoadingComplete;
    window.finishOnlineLoading         = finishOnlineLoading;

    function init() {
        installLobbyHooks();
        installOnlineStartHook();
        console.log('[loading] 深度预加载管理器已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();