// ===== js/world/security_system.js – 设备间监控与配电系统 =====
(function () {
    'use strict';

    const TERMINAL = Object.freeze({ x: -35, z: 26, radius: 2.7 });
    const POWER_PANEL = Object.freeze({ x: 35, z: -26, radius: 2.7 });
    const POWER_HOLD_MS = 2000;
    const LOOK_SEND_MS = 50;
    const YAW_LIMIT = 1.18;
    const BASE_PITCH = -0.17;
    const PITCH_MIN = -1.0;
    const PITCH_MAX = 0.55;
    const LOCAL_CONTROLLER = 'local-security';
    const PEER_HOST_CONTROLLER = 'peer-host';
    const PEER_CLIENT_CONTROLLER = 'peer-client';

    const CAMERAS = Object.freeze([
        { name: '中庭北侧', x: 0, y: 5.18, z: 12.0, yaw: 0 },
        { name: '中庭南侧', x: 0, y: 5.18, z: -12.0, yaw: Math.PI },
        { name: '东北走廊拐角', x: 20, y: 5.18, z: 16.6, yaw: Math.PI / 4 },
        { name: '西南走廊拐角', x: -20, y: 5.18, z: -16.6, yaw: -Math.PI * 3 / 4 },
        { name: '北设备长房', x: 0, y: 5.18, z: 29.0, yaw: 0 },
        { name: '南设备长房', x: 0, y: 5.18, z: -29.0, yaw: Math.PI },
        { name: '东设备长房', x: 40.5, y: 5.18, z: 0, yaw: Math.PI / 2 },
        { name: '西设备长房', x: -40.5, y: 5.18, z: 0, yaw: -Math.PI / 2 },
        { name: '监控室内部', x: -39, y: 5.18, z: 31, yaw: -0.68 },
    ]);

    const STATE = {
        active: false,
        powered: true,
        controllerId: null,
        cameraIndex: 0,
        yaw: CAMERAS[0].yaw,
        pitch: BASE_PITCH,
        lastLookSentAt: 0,
        lastHeldYaw: CAMERAS[0].yaw,
        lastHeldPitch: BASE_PITCH,
        lastPowerAt: 0,
        powerHoldStart: 0,
        powerHoldTriggered: false,
        propPower: null,
        mapProps: null,
        exitReason: '',
        exitRequestedAt: 0,
    };

    const camera = new THREE.PerspectiveCamera(
        typeof BASE_FOV === 'number' ? BASE_FOV : 75,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.05,
        220
    );
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    let hud = null;
    let titleEl = null;
    let cameraCountEl = null;
    let promptEl = null;
    let promptTextEl = null;
    let promptBarEl = null;
    let promptFillEl = null;

    function _clampYaw(index, yaw) {
        const base = CAMERAS[index]?.yaw || 0;
        const value = Number(yaw);
        if (!Number.isFinite(value)) return base;
        return Math.max(base - YAW_LIMIT, Math.min(base + YAW_LIMIT, value));
    }

    function _cameraIndex(value) {
        const index = Math.floor(Number(value) || 0);
        return ((index % CAMERAS.length) + CAMERAS.length) % CAMERAS.length;
    }

    function _distancePlayerTo(player, pos) {
        if (!pos || !player || !player.pos) return Infinity;
        return Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    }

    function _distanceTo(pos) {
        return _distancePlayerTo(p1, pos);
    }

    function _isIndoorMap() {
        return typeof getCurrentMapId === 'function'
            && getCurrentMapId() === 'indoor_complex';
    }

    function _isLanTeam() {
        return typeof gameMode !== 'undefined'
            && gameMode === 'lan'
            && typeof window.LAN !== 'undefined'
            && window.LAN.active
            && window.LAN.mode === 'team';
    }

    function _isLocalAi() {
        return typeof gameMode !== 'undefined' && gameMode === 'ai';
    }

    function _isPeerOnline() {
        return typeof gameMode !== 'undefined'
            && gameMode === 'online'
            && typeof window.NET !== 'undefined'
            && window.NET.role === 'player';
    }

    function _isPeerHost() {
        return _isPeerOnline() && window.NET.isHost;
    }

    function _systemAvailable() {
        if (!_isIndoorMap() || !running || isOver()) return false;
        if (_isLanTeam()) return window.LAN.phase === 'prep' || window.LAN.phase === 'round';
        if (_isPeerOnline()) {
            return (gameState === 'prep' || gameState === 'combat')
                && !window.NET.isSpectator();
        }
        return _isLocalAi() && (gameState === 'prep' || gameState === 'combat');
    }

    function _localControllerId() {
        if (_isLanTeam()) return window.LAN.selfId || null;
        if (_isPeerOnline()) {
            return window.NET.isHost ? PEER_HOST_CONTROLLER : PEER_CLIENT_CONTROLLER;
        }
        return LOCAL_CONTROLLER;
    }

    function _isSelfController() {
        return !!STATE.powered
            && !!STATE.controllerId
            && STATE.controllerId === _localControllerId();
    }

    function _clearPlayerCombatInput() {
        if (typeof keys !== 'undefined') {
            for (const key in keys) keys[key] = false;
        }
        if (typeof mouse !== 'undefined') {
            mouse.leftDown = false;
            mouse.rightDown = false;
            mouse.aim = false;
        }
        if (typeof p1 !== 'undefined' && p1 && p1.input) {
            p1.input.forward = 0;
            p1.input.right = 0;
            p1.input.jump = false;
            p1.input.crouch = false;
            p1.input.fire = false;
            p1.input.aim = false;
        }
        if (typeof p1 !== 'undefined' && p1?._netVelocity?.set) {
            p1._netVelocity.set(0, 0, 0);
        }
    }

    function _ensureDom() {
        if (hud || !document.body) return;

        hud = document.createElement('div');
        hud.id = 'securityCameraHUD';
        hud.innerHTML = [
            '<div class="sec-cam-top">',
            '  <span id="securityCameraTitle">CAM 01 · 中庭北侧</span>',
            '  <span class="sec-cam-live"><i></i> LIVE</span>',
            '</div>',
            '<div class="sec-cam-frame"></div>',
            '<div class="sec-cam-bottom">',
            '  <span>移动鼠标 · 左右转向 / 上下俯仰</span>',
            '  <span><b>左键</b> 切换摄像头</span>',
            '  <span><b>F</b> 退出监控</span>',
            '</div>',
            `<div id="securityCameraCount" class="sec-cam-index">CAM 01 / ${String(CAMERAS.length).padStart(2, '0')}</div>`,
        ].join('');
        document.body.appendChild(hud);
        titleEl = document.getElementById('securityCameraTitle');
        cameraCountEl = document.getElementById('securityCameraCount');

        promptEl = document.createElement('div');
        promptEl.id = 'securityInteractPrompt';
        promptEl.innerHTML = [
            '<div id="securityPromptText"></div>',
            '<div id="securityPromptBar"><span id="securityPromptFill"></span></div>',
        ].join('');
        document.body.appendChild(promptEl);
        promptTextEl = document.getElementById('securityPromptText');
        promptBarEl = document.getElementById('securityPromptBar');
        promptFillEl = document.getElementById('securityPromptFill');
    }

    function _setPrompt(text, progress) {
        _ensureDom();
        if (!promptEl || !promptTextEl) return;
        if (!text) {
            promptEl.classList.remove('visible');
            promptBarEl.style.display = 'none';
            return;
        }
        promptEl.classList.add('visible');
        promptTextEl.textContent = text;
        const showProgress = Number.isFinite(progress);
        promptBarEl.style.display = showProgress ? 'block' : 'none';
        if (showProgress) {
            promptFillEl.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
        }
    }

    function _toast(text, duration) {
        if (typeof toast === 'function') {
            toast(text);
        } else if (typeof lanNotify === 'function') {
            lanNotify(text, duration || 1800);
        }
    }

    function _setPowerVisuals(powered) {
        STATE.propPower = !!powered;
        const props = STATE.mapProps;
        if (!props) return;
        const mode = powered
            ? { screen: 0x143e4b, led: 0x28ff8a, lens: 0x66dfff, panel: 0x2fbf72, housing: 0x4c555d }
            : { screen: 0x111417, led: 0x421818, lens: 0x20272b, panel: 0x6b2c25, housing: 0x24292d };
        for (const material of props.screens || []) material.color.setHex(mode.screen);
        for (const material of props.leds || []) material.color.setHex(mode.led);
        for (const material of props.lenses || []) material.color.setHex(mode.lens);
        if (props.powerLamp) props.powerLamp.color.setHex(mode.panel);
        if (props.housingMaterial) props.housingMaterial.color.setHex(mode.housing);
    }

    function _activateLocalView() {
        if (STATE.active) return;
        STATE.active = true;
        STATE.exitReason = '';
        STATE.cameraIndex = _cameraIndex(STATE.cameraIndex);
        STATE.yaw = _clampYaw(STATE.cameraIndex, STATE.yaw);
        STATE.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, STATE.pitch));
        STATE.lastHeldYaw = STATE.yaw;
        STATE.lastHeldPitch = STATE.pitch;
        STATE.lastLookSentAt = 0;
        STATE.exitRequestedAt = 0;
        _clearPlayerCombatInput();
        if (typeof window.closeWeaponPanel === 'function') window.closeWeaponPanel(false);
        document.body.classList.add('security-camera-active');
        if (document.pointerLockElement !== renderer.domElement
            && typeof requestGamePointerLock === 'function') {
            requestGamePointerLock();
        }
    }

    function _deactivateLocalView(reason, sendExit) {
        if (!STATE.active) {
            document.body.classList.remove('security-camera-active');
            _setPrompt('');
            return;
        }
        STATE.active = false;
        STATE.exitReason = reason || '';
        if (sendExit) STATE.exitRequestedAt = performance.now();
        _clearPlayerCombatInput();
        document.body.classList.remove('security-camera-active');
        _setPrompt('');
        if (sendExit && _isLanTeam() && window.LANNET?.send) {
            window.LANNET.send({ type: 'securityExit' });
        } else if (sendExit && _isPeerOnline()) {
            if (_isPeerHost()) {
                if (STATE.controllerId === PEER_HOST_CONTROLLER) {
                    STATE.controllerId = null;
                    _broadcastPeerState();
                }
            } else {
                _sendPeerRequest('exit');
            }
        }
    }

    function _applyState(next) {
        if (!next) return;
        const powered = next.powered !== false;
        const controllerId = next.controllerId || null;
        const cameraIndex = _cameraIndex(next.cameraIndex);
        const controllerChanged = controllerId !== STATE.controllerId;
        const powerChanged = powered !== STATE.powered;
        const cameraChanged = cameraIndex !== STATE.cameraIndex;

        STATE.powered = powered;
        STATE.controllerId = controllerId;
        if (controllerId !== _localControllerId()) STATE.exitRequestedAt = 0;
        STATE.cameraIndex = cameraIndex;
        if (!STATE.active || !_isSelfController() || cameraChanged || powerChanged) {
            STATE.yaw = _clampYaw(cameraIndex, next.yaw);
            const nextPitch = Number(next.pitch);
            STATE.pitch = Number.isFinite(nextPitch)
                ? Math.max(PITCH_MIN, Math.min(PITCH_MAX, nextPitch))
                : BASE_PITCH;
            STATE.lastHeldYaw = STATE.yaw;
            STATE.lastHeldPitch = STATE.pitch;
        }
        _setPowerVisuals(powered);

        if (STATE.active && (!powered || STATE.controllerId !== _localControllerId())) {
            const reason = !powered
                ? '配电室已切断监控供电'
                : '监控操作已结束';
            _deactivateLocalView(reason, false);
            _toast(reason, 2400);
        } else if (!STATE.active
            && powered
            && STATE.controllerId === _localControllerId()
            && STATE.exitRequestedAt <= 0) {
            _activateLocalView();
        }

        if (powerChanged && STATE.controllerId !== _localControllerId()) {
            _toast(powered ? '监控供电已恢复' : '全区域监控供电已切断', 2200);
        } else if (controllerChanged && STATE.controllerId && STATE.controllerId !== _localControllerId()
            && powered && _systemAvailable()) {
            _toast('监控终端已被队友占用', 1800);
        }
    }

    function _enterCamera() {
        if (!_systemAvailable()) return false;
        if (!STATE.powered) {
            _toast('监控终端无供电', 1500);
            return true;
        }
        if (STATE.controllerId && STATE.controllerId !== _localControllerId()) {
            _toast('监控终端正在被队友使用', 1800);
            return true;
        }
        STATE.exitRequestedAt = 0;

        if (_isLanTeam()) {
            if (!window.LANNET?.send) {
                _toast('未连接到局域网服务器');
                return true;
            }
            window.LANNET.send({ type: 'securityEnter' });
            return true;
        }
        if (_isPeerOnline()) {
            if (_isPeerHost()) {
                if (_distanceTo(TERMINAL) > TERMINAL.radius) {
                    _toast('请靠近监控终端后按 F', 1500);
                    return true;
                }
                STATE.controllerId = PEER_HOST_CONTROLLER;
                STATE.cameraIndex = 0;
                STATE.yaw = CAMERAS[0].yaw;
                STATE.pitch = BASE_PITCH;
                _activateLocalView();
                _broadcastPeerState();
            } else {
                _sendPeerRequest('enter');
            }
            return true;
        }

        STATE.controllerId = LOCAL_CONTROLLER;
        STATE.cameraIndex = 0;
        STATE.yaw = CAMERAS[0].yaw;
        STATE.pitch = BASE_PITCH;
        _activateLocalView();
        return true;
    }

    function _togglePower() {
        if (!_systemAvailable()) return;
        if (_isLanTeam()) {
            window.LANNET?.send?.({ type: 'securityPowerToggle' });
            return;
        }
        if (_isPeerOnline()) {
            if (_isPeerHost()) {
                if (_distanceTo(POWER_PANEL) > POWER_PANEL.radius) return;
                _applyPowerToggle();
                _broadcastPeerState();
            } else {
                _sendPeerRequest('power');
            }
            return;
        }
        STATE.powered = !STATE.powered;
        if (!STATE.powered) STATE.controllerId = null;
        _setPowerVisuals(STATE.powered);
        if (STATE.active && !STATE.powered) {
            _deactivateLocalView('配电室已切断监控供电', false);
        }
        _toast(STATE.powered ? '监控供电已恢复' : '全区域监控供电已切断', 2200);
    }

    function _startPowerHold() {
        if (STATE.powerHoldStart > 0) return;
        STATE.powerHoldStart = performance.now();
        STATE.powerHoldTriggered = false;
    }

    function _cancelPowerHold() {
        STATE.powerHoldStart = 0;
        STATE.powerHoldTriggered = false;
    }

    function _cycleCamera(direction) {
        if (!STATE.active || !_isSelfController()) return;
        STATE.cameraIndex = _cameraIndex(STATE.cameraIndex + direction);
        STATE.yaw = CAMERAS[STATE.cameraIndex].yaw;
        STATE.pitch = BASE_PITCH;
        STATE.lastHeldYaw = STATE.yaw;
        STATE.lastHeldPitch = STATE.pitch;
        if (_isLanTeam()) {
            window.LANNET?.send?.({
                type: 'securityCamera',
                direction,
            });
        } else if (_isPeerOnline()) {
            if (_isPeerHost()) {
                _broadcastPeerState();
            } else {
                _sendPeerRequest('camera', { direction });
            }
        }
    }

    function _handleKeyDown(event) {
        if (STATE.active) {
            if (event.code === 'KeyF' && !event.repeat) {
                _deactivateLocalView('', true);
            }
            return true;
        }
        if (event.code !== 'KeyF' || !_systemAvailable()) return false;

        if (_distanceTo(TERMINAL) <= TERMINAL.radius) {
            return _enterCamera();
        }
        if (_distanceTo(POWER_PANEL) <= POWER_PANEL.radius) {
            if (!event.repeat) _startPowerHold();
            return true;
        }
        return false;
    }

    function _handleKeyUp(event) {
        if (event.code !== 'KeyF') return false;
        if (STATE.powerHoldStart > 0) {
            _cancelPowerHold();
            return true;
        }
        return STATE.active;
    }

    function _handleMouseDown(event) {
        if (!STATE.active) return false;
        if (event.button === 0) _cycleCamera(1);
        return true;
    }

    function _handleMouseUp(event) {
        return STATE.active;
    }

    function _handleWheel(event) {
        return STATE.active;
    }

    function _handleMouseMove(event) {
        if (!STATE.active || document.pointerLockElement !== renderer.domElement) return false;
        if (!_isSelfController()) return true;
        const settings = window.SETTINGS_RT || {};
        const controls = window.SETTINGS && window.SETTINGS.sensitivity
            ? window.SETTINGS.sensitivity
            : {};
        const sensitivity = Number.isFinite(settings.mouseSens) ? settings.mouseSens : 0.0022;
        const verticalMultiplier = Number.isFinite(controls.vertMul) ? controls.vertMul : 1;
        const invertY = !!controls.invertY;
        STATE.yaw = _clampYaw(
            STATE.cameraIndex,
            STATE.yaw - event.movementX * sensitivity * 0.72
        );
        const verticalSign = invertY ? 1 : -1;
        STATE.pitch = Math.max(
            PITCH_MIN,
            Math.min(
                PITCH_MAX,
                STATE.pitch + verticalSign * event.movementY * sensitivity * verticalMultiplier
            )
        );
        return true;
    }

    function _sendLookIfNeeded(now) {
        if (!STATE.active || !_isSelfController()) return;
        if (!_isLanTeam() && !_isPeerOnline()) return;
        if (Math.abs(STATE.yaw - STATE.lastHeldYaw) < 0.0005
            && Math.abs(STATE.pitch - STATE.lastHeldPitch) < 0.0005) return;
        if (now - STATE.lastLookSentAt < LOOK_SEND_MS) return;
        STATE.lastLookSentAt = now;
        STATE.lastHeldYaw = STATE.yaw;
        STATE.lastHeldPitch = STATE.pitch;
        if (_isLanTeam()) {
            window.LANNET?.send?.({
                type: 'securityLook',
                yaw: STATE.yaw,
                pitch: STATE.pitch,
            });
        } else if (!_isPeerHost()) {
            _sendPeerRequest('look', {
                yaw: STATE.yaw,
                pitch: STATE.pitch,
            });
        }
    }

    function _updatePrompt(now) {
        _ensureDom();
        if (STATE.active || !_systemAvailable()) {
            _setPrompt('');
            _cancelPowerHold();
            return;
        }

        const nearTerminal = _distanceTo(TERMINAL) <= TERMINAL.radius;
        const nearPower = _distanceTo(POWER_PANEL) <= POWER_PANEL.radius;
        if (nearPower) {
            if (STATE.powerHoldStart <= 0) {
                _setPrompt(STATE.powered
                    ? '长按 F 切断全部监控供电'
                    : '长按 F 恢复监控供电');
                return;
            }
            const progress = Math.min(1, (now - STATE.powerHoldStart) / POWER_HOLD_MS);
            _setPrompt(STATE.powered ? '正在切断监控供电…' : '正在恢复监控供电…', progress);
            if (progress >= 1 && !STATE.powerHoldTriggered) {
                STATE.powerHoldTriggered = true;
                _togglePower();
                STATE.powerHoldStart = 0;
            }
            return;
        }

        _cancelPowerHold();
        if (nearTerminal) {
            if (!STATE.powered) _setPrompt('监控终端无供电');
            else if (STATE.controllerId && STATE.controllerId !== _localControllerId()) {
                _setPrompt('监控终端正在被队友使用');
            } else {
                _setPrompt('按 F 使用监控终端');
            }
            return;
        }
        _setPrompt('');
    }

    function _updateCameraView() {
        const def = CAMERAS[STATE.cameraIndex] || CAMERAS[0];
        camera.position.set(def.x, def.y, def.z);
        camera.rotation.y = STATE.yaw;
        camera.rotation.x = STATE.pitch;
        camera.fov = typeof BASE_FOV === 'number' ? BASE_FOV : 75;
        camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
        camera.updateProjectionMatrix();

        if (titleEl) {
            titleEl.textContent = `CAM ${String(STATE.cameraIndex + 1).padStart(2, '0')} · ${def.name}`;
        }
        if (cameraCountEl) {
            cameraCountEl.textContent = `CAM ${String(STATE.cameraIndex + 1).padStart(2, '0')} / ${String(CAMERAS.length).padStart(2, '0')}`;
        }
    }

    function _updateMapCameras() {
        const props = STATE.mapProps;
        if (!props || !Array.isArray(props.cameraObjects)) return;
        const activeIndex = STATE.controllerId ? STATE.cameraIndex : -1;
        for (let i = 0; i < props.cameraObjects.length; i++) {
            const object = props.cameraObjects[i];
            if (!object) continue;
            const yaw = i === activeIndex ? STATE.yaw : CAMERAS[i]?.yaw || 0;
            object.rotation.y = yaw;
            if (object.userData.tiltGroup) {
                object.userData.tiltGroup.rotation.x = i === activeIndex
                    ? STATE.pitch
                    : BASE_PITCH;
            }
        }
    }

    function _tick(dt, now) {
        _ensureDom();
        _updatePrompt(now);

        if (STATE.active) {
            const dead = typeof p1 !== 'undefined' && p1
                && (p1.deadUntil === Infinity || now < (p1.deadUntil || 0));
            if (!running || isOver() || !_isIndoorMap() || dead
                || (_isLanTeam() && window.LAN.phase !== 'prep' && window.LAN.phase !== 'round')) {
                _deactivateLocalView(dead ? '你已阵亡，监控连接已断开' : '监控连接已结束', true);
            } else if (!_isSelfController()) {
                _deactivateLocalView('监控操作已结束', false);
            } else {
                _clearPlayerCombatInput();
                _sendLookIfNeeded(now);
                _updateCameraView();
            }
        }

        _updateMapCameras();
    }

    function _buildIndoorProps() {
        if (!currentMapGroup || !_isIndoorMap()) return;

        const materials = {
            dark: new THREE.MeshLambertMaterial({ color: 0x22282e }),
            body: new THREE.MeshLambertMaterial({ color: 0x4c555d }),
            steel: new THREE.MeshLambertMaterial({ color: 0x65717a }),
            screen: new THREE.MeshBasicMaterial({ color: 0x143e4b, toneMapped: false }),
            led: new THREE.MeshBasicMaterial({ color: 0x28ff8a, toneMapped: false }),
            lens: new THREE.MeshBasicMaterial({ color: 0x66dfff, toneMapped: false }),
            power: new THREE.MeshBasicMaterial({ color: 0x2fbf72, toneMapped: false }),
        };
        const props = {
            screens: [materials.screen],
            leds: [materials.led],
            lenses: [],
            housingMaterial: materials.body,
            powerLamp: materials.power,
            cameraObjects: [],
            meshes: [],
        };

        function addBox(parent, geometry, material, x, y, z, collider, dynamic = true) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.userData.noBatch = dynamic;
            parent.add(mesh);
            wallMeshes.push(mesh);
            props.meshes.push(mesh);
            if (collider) {
                const halfW = collider.w / 2;
                const halfD = collider.d / 2;
                const worldX = parent.position.x + x;
                const worldZ = parent.position.z + z;
                colliders.push({
                    x0: worldX - halfW,
                    x1: worldX + halfW,
                    z0: worldZ - halfD,
                    z1: worldZ + halfD,
                    top: y + collider.h / 2,
                    bottom: Math.max(0, y - collider.h / 2),
                });
                addPlatform(worldX, worldZ, collider.w, collider.d, y + collider.h / 2);
            }
            return mesh;
        }

        const monitorGroup = new THREE.Group();
        monitorGroup.position.set(TERMINAL.x, 0, TERMINAL.z + 0.3);
        currentMapGroup.add(monitorGroup);
        addBox(monitorGroup, new THREE.BoxGeometry(4.8, 0.92, 1.9), materials.dark,
            0, 0.46, 0, { w: 4.8, h: 0.92, d: 1.9 }, false);
        addBox(monitorGroup, new THREE.BoxGeometry(4.92, 0.12, 2.02), materials.steel,
            0, 0.98, 0, null, false);
        addBox(monitorGroup, new THREE.BoxGeometry(4.55, 0.14, 0.58), materials.dark,
            0, 1.08, -0.44, null, false);

        for (let i = -1; i <= 1; i++) {
            const screen = addBox(
                monitorGroup,
                new THREE.BoxGeometry(1.16, 0.68, 0.07),
                materials.screen,
                i * 1.35,
                1.62,
                0.60
            );
            screen.rotation.x = -0.08;
            addBox(monitorGroup, new THREE.BoxGeometry(1.3, 0.82, 0.13), materials.dark,
                i * 1.35, 1.62, 0.68, null, false);
        }
        for (let i = 0; i < 8; i++) {
            addBox(monitorGroup, new THREE.BoxGeometry(0.16, 0.055, 0.035), materials.led,
                -1.6 + i * 0.46, 0.86, -0.965);
        }
        for (let i = 0; i < 3; i++) {
            addBox(monitorGroup, new THREE.BoxGeometry(0.62, 0.04, 0.32), materials.steel,
                -1.35 + i * 1.35, 1.17, -0.43, null, false);
        }

        const powerGroup = new THREE.Group();
        powerGroup.position.set(POWER_PANEL.x, 0, POWER_PANEL.z - 2.0);
        currentMapGroup.add(powerGroup);
        addBox(powerGroup, new THREE.BoxGeometry(5.0, 2.85, 1.0), materials.dark,
            0, 1.425, 0, { w: 5.0, h: 2.85, d: 1.0 }, false);
        addBox(powerGroup, new THREE.BoxGeometry(4.35, 2.15, 0.09), materials.steel,
            0, 1.5, 0.54, null, false);
        for (let i = 0; i < 3; i++) {
            addBox(powerGroup, new THREE.BoxGeometry(1.12, 0.5, 0.12), materials.dark,
                -1.35 + i * 1.35, 0.82, 0.63, null, false);
        }
        addBox(powerGroup, new THREE.BoxGeometry(0.28, 0.46, 0.14), materials.power,
            0, 1.55, 0.66);
        addBox(powerGroup, new THREE.BoxGeometry(0.72, 0.16, 0.13), materials.steel,
            0, 2.35, 0.62, null, false);
        for (let i = 0; i < 4; i++) {
            addBox(powerGroup, new THREE.BoxGeometry(0.11, 0.11, 0.12), materials.led,
                -0.48 + i * 0.32, 2.7, 0.57);
        }

        for (let i = 0; i < CAMERAS.length; i++) {
            const def = CAMERAS[i];
            const group = new THREE.Group();
            group.position.set(def.x, 5.48, def.z);
            group.rotation.y = def.yaw;
            group.userData.noBatch = true;
            currentMapGroup.add(group);
            const tiltGroup = new THREE.Group();
            tiltGroup.userData.noBatch = true;
            group.add(tiltGroup);
            group.userData.tiltGroup = tiltGroup;
            addBox(group, new THREE.BoxGeometry(0.12, 0.48, 0.12), materials.dark,
                0, 0.42, 0);
            addBox(tiltGroup, new THREE.BoxGeometry(0.42, 0.28, 0.72), materials.body,
                0, 0.08, 0);
            const lensMaterial = materials.lens.clone();
            lensMaterial.userData = { securityLens: true };
            props.lenses.push(lensMaterial);
            addBox(tiltGroup, new THREE.CylinderGeometry(0.105, 0.105, 0.12, 12), lensMaterial,
                0, 0.08, -0.39);
            const lens = tiltGroup.children[tiltGroup.children.length - 1];
            lens.rotation.x = Math.PI / 2;
            addBox(tiltGroup, new THREE.BoxGeometry(0.06, 0.06, 0.05), materials.led,
                0.15, 0.2, -0.38);
            props.cameraObjects.push(group);
        }

        STATE.mapProps = props;
        STATE.powered = true;
        STATE.controllerId = STATE.active ? STATE.controllerId : null;
        STATE.cameraIndex = 0;
        STATE.yaw = CAMERAS[0].yaw;
        STATE.pitch = BASE_PITCH;
        _setPowerVisuals(true);
    }

    function _resetLocalSystem() {
        if (_isLanTeam()) return;
        STATE.powered = true;
        STATE.controllerId = null;
        STATE.cameraIndex = 0;
        STATE.yaw = CAMERAS[0].yaw;
        STATE.pitch = BASE_PITCH;
        STATE.lastPowerAt = 0;
        STATE.exitRequestedAt = 0;
        _cancelPowerHold();
        _deactivateLocalView('', false);
        _setPowerVisuals(true);
        if (_isPeerHost()) _broadcastPeerState();
    }

    function _peerState() {
        return {
            powered: STATE.powered,
            controllerId: STATE.controllerId,
            cameraIndex: STATE.cameraIndex,
            yaw: STATE.yaw,
            pitch: STATE.pitch,
        };
    }

    function _broadcastPeerState() {
        if (!_isPeerHost() || typeof window.NET_broadcast !== 'function') return;
        window.NET_broadcast({
            type: 'securityState',
            security: _peerState(),
        });
    }

    function _sendPeerRequest(action, extra) {
        if (!_isPeerOnline() || _isPeerHost()
            || typeof window.NET_sendToHost !== 'function') {
            return false;
        }
        return window.NET_sendToHost({
            type: 'securityRequest',
            action,
            ...(extra || {}),
        });
    }

    function _peerPlayerAlive(player) {
        if (!player) return false;
        const now = performance.now();
        return !(player.deadUntil === Infinity || now < (player.deadUntil || 0));
    }

    function _applyPowerToggle() {
        STATE.powered = !STATE.powered;
        STATE.cameraIndex = 0;
        STATE.yaw = CAMERAS[0].yaw;
        STATE.pitch = BASE_PITCH;
        STATE.lastPowerAt = performance.now();
        if (!STATE.powered) STATE.controllerId = null;
        _setPowerVisuals(STATE.powered);
        if (STATE.active && !STATE.powered) {
            _deactivateLocalView('配电室已切断监控供电', false);
        }
        _toast(STATE.powered ? '监控供电已恢复' : '全区域监控供电已切断', 2200);
    }

    function _denyPeerRequest(peerId, message) {
        const entry = window.NET?.connections?.get(peerId);
        if (!entry?.conn?.open) return;
        try {
            entry.conn.send({ type: 'securityDenied', message });
        } catch {}
    }

    function _handlePeerRequest(fromId, data) {
        if (!_isPeerHost() || !_systemAvailable() || !data) return;
        if (fromId === window.NET.myPeerId) return;
        const action = String(data.action || '');
        if (action === 'enter') {
            if (!STATE.powered) {
                _denyPeerRequest(fromId, '监控终端无供电');
                return;
            }
            if (STATE.controllerId && STATE.controllerId !== PEER_CLIENT_CONTROLLER) {
                _denyPeerRequest(fromId, '监控终端正在被队友使用');
                return;
            }
            if (!_peerPlayerAlive(p2) || _distancePlayerTo(p2, TERMINAL) > TERMINAL.radius) {
                _denyPeerRequest(fromId, '请靠近监控终端后按 F');
                return;
            }
            STATE.controllerId = PEER_CLIENT_CONTROLLER;
            STATE.cameraIndex = 0;
            STATE.yaw = CAMERAS[0].yaw;
            STATE.pitch = BASE_PITCH;
            _broadcastPeerState();
            return;
        }
        if (action === 'look') {
            if (STATE.controllerId !== PEER_CLIENT_CONTROLLER) return;
            const index = _cameraIndex(STATE.cameraIndex);
            const yaw = Number(data.yaw);
            const pitch = Number(data.pitch);
            if (Number.isFinite(yaw)) STATE.yaw = _clampYaw(index, yaw);
            if (Number.isFinite(pitch)) {
                STATE.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
            }
            return;
        }
        if (action === 'camera') {
            if (STATE.controllerId !== PEER_CLIENT_CONTROLLER) return;
            const direction = Number(data.direction) < 0 ? -1 : 1;
            STATE.cameraIndex = _cameraIndex(STATE.cameraIndex + direction);
            STATE.yaw = CAMERAS[STATE.cameraIndex].yaw;
            STATE.pitch = BASE_PITCH;
            _broadcastPeerState();
            return;
        }
        if (action === 'exit') {
            if (STATE.controllerId !== PEER_CLIENT_CONTROLLER) return;
            STATE.controllerId = null;
            _broadcastPeerState();
            return;
        }
        if (action === 'power') {
            if (!_peerPlayerAlive(p2) || _distancePlayerTo(p2, POWER_PANEL) > POWER_PANEL.radius) {
                _denyPeerRequest(fromId, '请靠近配电箱后长按 F');
                return;
            }
            if (performance.now() - STATE.lastPowerAt < 900) return;
            _applyPowerToggle();
            _broadcastPeerState();
        }
    }

    function _handlePeerMessage(msg, fromId) {
        if (!_isPeerOnline() || !msg) return false;
        if (msg.type === 'securityRequest') {
            if (_isPeerHost()) _handlePeerRequest(fromId, msg);
            return true;
        }
        if (msg.type === 'securityState') {
            if (!_isPeerHost()) _applyState(msg.security || msg);
            return true;
        }
        if (msg.type === 'securityDenied') {
            if (!_isPeerHost()) _toast(msg.message || '无法使用监控设备', 2200);
            return true;
        }
        return false;
    }

    function _applyPeerState(state) {
        if (!_isPeerOnline() || _isPeerHost() || !state) return;
        _applyState(state);
    }

    function _resetForRound() {
        if (!_isPeerOnline()) return;
        STATE.powered = true;
        STATE.controllerId = null;
        STATE.cameraIndex = 0;
        STATE.yaw = CAMERAS[0].yaw;
        STATE.pitch = BASE_PITCH;
        STATE.lastPowerAt = 0;
        STATE.exitRequestedAt = 0;
        _cancelPowerHold();
        _deactivateLocalView('', false);
        _setPowerVisuals(true);
        if (_isPeerHost()) _broadcastPeerState();
    }

    function _handleLanMessage(msg) {
        if (!msg) return false;
        if (msg.type === 'securityState') {
            _applyState(msg.security || msg);
            return true;
        }
        if (msg.type === 'securityDenied') {
            _toast(msg.message || '无法使用监控设备', 2200);
            return true;
        }
        return false;
    }

    window.SECURITY_HandleKeyDown = _handleKeyDown;
    window.SECURITY_HandleKeyUp = _handleKeyUp;
    window.SECURITY_HandleMouseDown = _handleMouseDown;
    window.SECURITY_HandleMouseUp = _handleMouseUp;
    window.SECURITY_HandleWheel = _handleWheel;
    window.SECURITY_HandleMouseMove = _handleMouseMove;
    window.SECURITY_HandleLANMessage = _handleLanMessage;
    window.SECURITY_HandlePeerMessage = _handlePeerMessage;
    window.SECURITY_ApplyState = _applyState;
    window.SECURITY_ApplyPeerState = _applyPeerState;
    window.SECURITY_GetPeerState = _peerState;
    window.SECURITY_ResetForRound = _resetForRound;
    window.SECURITY_Tick = _tick;
    window.SECURITY_IsActive = () => STATE.active;
    window.SECURITY_ShouldBlockGameplay = () => STATE.active;
    window.SECURITY_GetRenderCamera = () => (STATE.active ? camera : null);
    window.SECURITY_ResetLocal = _resetLocalSystem;
    window.SECURITY_Exit = reason => _deactivateLocalView(reason || '', true);
    window.SECURITY_BuildIndoorProps = _buildIndoorProps;
    window.SECURITY_GetState = () => ({
        active: STATE.active,
        powered: STATE.powered,
        controllerId: STATE.controllerId,
        cameraIndex: STATE.cameraIndex,
        yaw: STATE.yaw,
        pitch: STATE.pitch,
        cameraCount: CAMERAS.length,
        cameraNames: CAMERAS.map(def => def.name),
        cameraModels: STATE.mapProps?.cameraObjects?.length || 0,
    });

    _ensureDom();
})();
