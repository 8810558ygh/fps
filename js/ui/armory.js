// ===== js/ui/armory.js – 军械库（3D 武器预览） =====
//
// 设计要点：
//   · 复用主 renderer / 主 canvas（不新建 WebGL 上下文）
//   · main_loop.js 的 render() 会优先调 Armory.render()
//   · 鼠标 1:1 直接映射旋转（Blender 手感），无惯性
//   · 用四元数累积（rotateOnWorldAxis），避免欧拉角万向节问题
//   · ★ 皮肤系统：通过 SKIN_REGISTRY 注册表驱动，加皮肤只需在这里加一行

(function () {
    'use strict';

    // ============================================================
    // ★★★ 皮肤注册表 ★★★
    // ============================================================
    const SKIN_REGISTRY = {

        rifle: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_RIFLE && window.__HD_RIFLE.buildWorld)
                        ? window.__HD_RIFLE.buildWorld()
                        : null;
                },
            },
        ],

        sniper: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_SNIPER && window.__HD_SNIPER.buildWorld)
                        ? window.__HD_SNIPER.buildWorld()
                        : null;
                },
            },
        ],

        shotgun: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_SHOTGUN && window.__HD_SHOTGUN.buildWorld)
                        ? window.__HD_SHOTGUN.buildWorld()
                        : null;
                },
            },
        ],

        odin: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_ODIN && window.__HD_ODIN.buildWorld)
                        ? window.__HD_ODIN.buildWorld()
                        : null;
                },
            },
        ],

        knife: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_KNIFE && window.__HD_KNIFE.buildWorld)
                        ? window.__HD_KNIFE.buildWorld()
                        : null;
                },
            },
        ],

        smoke: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_SMOKE && window.__HD_SMOKE.buildWorld)
                        ? window.__HD_SMOKE.buildWorld()
                        : null;
                },
            },
        ],

        flash: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_FLASH && window.__HD_FLASH.buildWorld)
                        ? window.__HD_FLASH.buildWorld()
                        : null;
                },
            },
        ],

        medkit: [
            {
                id: 'default',
                name: '原版',
                build: () => {
                    return (window.__HD_MEDKIT && window.__HD_MEDKIT.buildWorld)
                        ? window.__HD_MEDKIT.buildWorld()
                        : null;
                },
            },
        ],
    };

    // ============================================================
    // 状态
    // ============================================================
    let _open = false;
    let _scene = null;
    let _cam = null;

    let _currentType = 'rifle';
    let _currentModel = null;

    // 每个武器当前选中的皮肤 id
    const _currentSkinByType = {
        rifle:   'default',
        sniper:  'default',
        shotgun: 'default',
        odin:    'default',
        knife:   'default',
        smoke:   'default',
        flash:   'default',
        medkit:  'default',
    };

    let _dragging = false;
    let _lastX = 0;
    let _lastY = 0;

    const _AXIS_X = new THREE.Vector3(1, 0, 0);
    const _AXIS_Y = new THREE.Vector3(0, 1, 0);

    const ROTATE_SENS = 0.005;

    let _camDist = 2.5;
    let _camDistTarget = 2.5;
    const CAM_DIST_MIN = 1.5;
    const CAM_DIST_MAX = 4.5;

    // ============================================================
    // 场景初始化
    // ============================================================
    function _ensureScene() {
        if (_scene) return;

        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0a1520);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4455, 1.1);
        _scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 1.8);
        key.position.set(3, 5, 4);
        _scene.add(key);

        const fill = new THREE.DirectionalLight(0x88aaff, 0.9);
        fill.position.set(-4, 2, 3);
        _scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffd24a, 1.3);
        rim.position.set(0, 3, -5);
        _scene.add(rim);

        _cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        _cam.position.set(0, 0, _camDist);
        _cam.lookAt(0, 0, 0);
    }

    // ============================================================
    // 渲染左侧皮肤列表
    // ============================================================
    function _renderSkinList() {
        const list = document.getElementById('armorySkinsList');
        if (!list) return;

        const skins = SKIN_REGISTRY[_currentType] || [];
        const currentId = _currentSkinByType[_currentType] || 'default';

        list.innerHTML = '';

        if (skins.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'armory-skin-empty';
            empty.textContent = '暂无皮肤';
            list.appendChild(empty);
            return;
        }

        for (const skin of skins) {
            const el = document.createElement('div');
            el.className = 'armory-skin-item' + (skin.id === currentId ? ' active' : '');
            el.dataset.skinId = skin.id;
            el.textContent = skin.name;
            el.title = skin.name;
            el.addEventListener('click', () => _selectSkin(skin.id));
            list.appendChild(el);
        }
    }

    // ============================================================
    // 选择皮肤
    // ============================================================
    function _selectSkin(skinId) {
        if (_currentSkinByType[_currentType] === skinId) return;
        _currentSkinByType[_currentType] = skinId;

        _loadModel(_currentType);
        _renderSkinList();

        if (typeof audio === 'function') audio();

        console.log('[armory] 切换皮肤:', _currentType, '→', skinId);
    }

    // ============================================================
    // 加载武器模型
    // ============================================================
    function _loadModel(type) {
        if (!_scene) return;

        if (_currentModel) {
            _scene.remove(_currentModel);
            _currentModel = null;
        }

        const skins = SKIN_REGISTRY[type];
        if (!skins || skins.length === 0) {
            console.warn('[armory] 未注册皮肤的武器:', type);
            return;
        }

        const skinId = _currentSkinByType[type] || 'default';
        let skin = skins.find(s => s.id === skinId);
        if (!skin) skin = skins[0];

        let model = null;
        try {
            model = skin.build();
        } catch (e) {
            console.warn('[armory] 构建皮肤失败:', type, skinId, e);
            return;
        }
        if (!model) {
            console.warn('[armory] 模型为空:', type, skinId);
            return;
        }

        // 归零旋转
        model.rotation.set(0, 0, 0);
        model.quaternion.set(0, 0, 0, 1);

        // ============================================================
        // ★ 尺寸归一化
        //   所有武器按最大边 = 1.5 归一化，然后用 SIZE_MUL_BY_TYPE 微调
        //   投掷物 / 医疗包 因为本体小，会被二次缩小
        // ============================================================
        const SIZE_MUL_BY_TYPE = {
            rifle:   1.0,
            sniper:  1.0,
            shotgun: 1.0,
            odin:    1.0,
            knife:   1.0,
            smoke:   0.65,
            flash:   0.65,
            medkit:  0.75,   // ← 比投掷物略大一点，比枪小
        };

        const TARGET_SIZE = 1.5;
        const sizeMul = SIZE_MUL_BY_TYPE[type] || 1.0;

        model.updateMatrixWorld(true);
        let bbox = new THREE.Box3().setFromObject(model);
        let size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.scale.multiplyScalar((TARGET_SIZE / maxDim) * sizeMul);

        // 居中
        model.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        model.position.sub(center);

        _scene.add(model);
        _currentModel = model;

        console.log('[armory] 已加载模型:', type, '皮肤:', skinId);
    }

    // ============================================================
    // 拖拽 / 滚轮绑定
    // ============================================================
    let _bound = false;
    function _bindInteractions() {
        if (_bound) return;
        const el = document.getElementById('armoryViewport');
        if (!el) return;
        _bound = true;

        // ---- 鼠标 ----
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            _dragging = true;
            _lastX = e.clientX;
            _lastY = e.clientY;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!_dragging || !_open || !_currentModel) return;

            const dx = e.clientX - _lastX;
            const dy = e.clientY - _lastY;
            _lastX = e.clientX;
            _lastY = e.clientY;

            if (dx !== 0) _currentModel.rotateOnWorldAxis(_AXIS_Y, dx * ROTATE_SENS);
            if (dy !== 0) _currentModel.rotateOnWorldAxis(_AXIS_X, dy * ROTATE_SENS);
        });
        window.addEventListener('mouseup', () => { _dragging = false; });

        // ---- 触摸 ----
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            _dragging = true;
            _lastX = e.touches[0].clientX;
            _lastY = e.touches[0].clientY;
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchmove', (e) => {
            if (!_dragging || !_currentModel || e.touches.length !== 1) return;

            const dx = e.touches[0].clientX - _lastX;
            const dy = e.touches[0].clientY - _lastY;
            _lastX = e.touches[0].clientX;
            _lastY = e.touches[0].clientY;

            if (dx !== 0) _currentModel.rotateOnWorldAxis(_AXIS_Y, dx * ROTATE_SENS);
            if (dy !== 0) _currentModel.rotateOnWorldAxis(_AXIS_X, dy * ROTATE_SENS);

            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend', () => { _dragging = false; });
        el.addEventListener('touchcancel', () => { _dragging = false; });

        // ---- 滚轮缩放 ----
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            _camDistTarget += e.deltaY * 0.0015;
            if (_camDistTarget < CAM_DIST_MIN) _camDistTarget = CAM_DIST_MIN;
            if (_camDistTarget > CAM_DIST_MAX) _camDistTarget = CAM_DIST_MAX;
        }, { passive: false });
    }

    // ============================================================
    // 每帧渲染（由 main_loop.js 调用）
    // ============================================================
    function render() {
        if (!_open || !_scene || !_cam) return;
        if (typeof renderer === 'undefined' || !renderer) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        if (Math.abs(_cam.aspect - aspect) > 0.001) {
            _cam.aspect = aspect;
            _cam.updateProjectionMatrix();
        }

        _camDist += (_camDistTarget - _camDist) * 0.15;
        _cam.position.set(0, 0, _camDist);
        _cam.lookAt(0, 0, 0);

        renderer.render(_scene, _cam);
    }

    // ============================================================
    // Tab 切换
    // ============================================================
    function _syncTabUI() {
        document.querySelectorAll('.armory-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.type === _currentType);
        });
    }

    function switchType(type) {
        if (_currentType === type) return;
        _currentType = type;
        _loadModel(type);
        _syncTabUI();
        _renderSkinList();
    }

    // ============================================================
    // 打开 / 关闭
    // ============================================================
    function open() {
        if (_open) return;
        _open = true;

        _ensureScene();
        _bindInteractions();

        const lobby = document.getElementById('lobbyOverlay');
        if (lobby) lobby.style.display = 'none';

        const el = document.getElementById('armoryOverlay');
        if (el) el.style.display = 'flex';

        document.body.classList.add('armory-open');

        _loadModel(_currentType);
        _syncTabUI();
        _renderSkinList();

        console.log('[armory] 已打开，当前武器:', _currentType);
    }

    function close() {
        if (!_open) return;
        _open = false;

        const el = document.getElementById('armoryOverlay');
        if (el) el.style.display = 'none';

        document.body.classList.remove('armory-open');

        const lobby = document.getElementById('lobbyOverlay');
        if (lobby) lobby.style.display = 'flex';

        console.log('[armory] 已关闭');
    }

    // ============================================================
    // 入口绑定
    // ============================================================
    function _init() {
        const openBtn = document.getElementById('armoryBtn');
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof audio === 'function') audio();
                open();
            });
        }

        const backBtn = document.getElementById('armoryBackBtn');
        if (backBtn) backBtn.addEventListener('click', close);

        document.querySelectorAll('.armory-tab').forEach(tab => {
            tab.addEventListener('click', () => switchType(tab.dataset.type));
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _open) {
                e.preventDefault();
                close();
            }
        });

        console.log('[armory] 军械库模块已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.Armory = {
        open,
        close,
        render,
        switchType,
        isOpen: () => _open,
        registerSkin: (weaponType, skin) => {
            if (!SKIN_REGISTRY[weaponType]) SKIN_REGISTRY[weaponType] = [];
            SKIN_REGISTRY[weaponType].push(skin);
        },
    };
})();