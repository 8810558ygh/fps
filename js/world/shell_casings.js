// ===== js/shell_casings.js – 弹壳弹出（物理驱动 · 对象池） =====

const SHELL_POOL_SIZE = 32;
const SHELL_LIFE_MS = 4000;
const SHELL_FADE_MS = 800;

const _shellPool = [];
let _shellPoolInited = false;
let _shellPoolIdx = 0;

// ============================================================
// 初始化对象池
// ============================================================
function initShellPool() {
    if (_shellPoolInited) return;
    if (typeof scene === 'undefined' || !scene) return;
    _shellPoolInited = true;

    const caseGeo = new THREE.CylinderGeometry(0.0115, 0.0125, 0.028, 8);
    const capGeo = new THREE.CylinderGeometry(0.0122, 0.0122, 0.004, 8);

    const brassMat = new THREE.MeshStandardMaterial({
        color: 0xcfa245,
        metalness: 0.85,
        roughness: 0.35,
        emissive: 0x3a2408,
        emissiveIntensity: 0.15,
    });
    const capMat = new THREE.MeshStandardMaterial({
        color: 0x8c6b28,
        metalness: 0.7,
        roughness: 0.55,
    });

    for (let i = 0; i < SHELL_POOL_SIZE; i++) {
        const group = new THREE.Group();

        const body = new THREE.Mesh(caseGeo, brassMat);
        group.add(body);

        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = -0.016;
        group.add(cap);

        group.visible = false;
        group.frustumCulled = false;
        group.traverse(o => { if (o.isMesh) o.castShadow = false; });

        scene.add(group);

        _shellPool.push({
            group,
            body: null,
            until: 0,
            active: false,
        });
    }
    console.log('[shells] 弹壳对象池已创建:', SHELL_POOL_SIZE);
}

// ============================================================
// 借一个空闲槽位
// ============================================================
function _acquireShellSlot() {
    for (let i = 0; i < _shellPool.length; i++) {
        const slot = _shellPool[(_shellPoolIdx + i) % _shellPool.length];
        if (!slot.active) {
            _shellPoolIdx = (_shellPoolIdx + i + 1) % _shellPool.length;
            return slot;
        }
    }
    let oldest = _shellPool[0];
    for (let i = 1; i < _shellPool.length; i++) {
        if (_shellPool[i].until < oldest.until) oldest = _shellPool[i];
    }
    if (oldest.body && window.PHYSICS) {
        window.PHYSICS.removeShellBody(oldest.body);
        oldest.body = null;
    }
    return oldest;
}

// ============================================================
// 生成弹壳
// ============================================================
function spawnShellCasing(p, now) {
    if (!p) return;
    if (typeof p.cam === 'undefined' || !p.cam) return;

    initShellPool();
    if (_shellPool.length === 0) return;

    const slot = _acquireShellSlot();
    if (!slot) return;

    const eyePos  = p.cam.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(p.cam.quaternion);
    const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(p.cam.quaternion);
    const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(p.cam.quaternion);

    const spawnPos = eyePos.clone()
        .addScaledVector(forward, 0.35)
        .addScaledVector(right,   0.18)
        .addScaledVector(up,     -0.10);

    const vx = -1.5 + (Math.random() - 0.5) * 0.8;
    const vy =  1.5 + (Math.random() - 0.5) * 0.6;
    const vz =  2.5 + (Math.random() - 0.5) * 0.8;

    const spawnVel = forward.clone().multiplyScalar(vx)
        .addScaledVector(right, vz)
        .addScaledVector(up,    vy);

    let body = null;
    if (window.PHYSICS && typeof window.PHYSICS.createShellBody === 'function') {
        body = window.PHYSICS.createShellBody(spawnPos, spawnVel);
    }

    slot.group.position.copy(spawnPos);
    slot.group.visible = true;
    slot.group.scale.setScalar(1);

    slot.group.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
    );

    slot.group.traverse(o => {
        if (o.isMesh && o.material) {
            o.material.transparent = false;
            o.material.opacity = 1;
        }
    });

    slot.body = body;
    slot.until = now + SHELL_LIFE_MS;
    slot.active = true;
}

window.spawnShellCasing = spawnShellCasing;

// ============================================================
// 每帧更新
// ============================================================
const _shellQuat = new THREE.Quaternion();

function updateShellCasings(dt, now) {
    if (!_shellPoolInited) return;

    for (let i = 0; i < _shellPool.length; i++) {
        const slot = _shellPool[i];
        if (!slot.active) continue;

        if (slot.body) {
            slot.group.position.set(
                slot.body.position.x,
                slot.body.position.y,
                slot.body.position.z
            );
            _shellQuat.set(
                slot.body.quaternion.x,
                slot.body.quaternion.y,
                slot.body.quaternion.z,
                slot.body.quaternion.w
            );
            slot.group.quaternion.copy(_shellQuat);
        }

        const remain = slot.until - now;
        if (remain <= 0) {
            slot.active = false;
            slot.group.visible = false;
            if (slot.body && window.PHYSICS) {
                window.PHYSICS.removeShellBody(slot.body);
                slot.body = null;
            }
            continue;
        }

        if (remain < SHELL_FADE_MS) {
            const fade = remain / SHELL_FADE_MS;
            slot.group.traverse(o => {
                if (o.isMesh && o.material) {
                    o.material.transparent = true;
                    o.material.opacity = fade;
                }
            });
        }
    }
}

window.updateShellCasings = updateShellCasings;

// ============================================================
// 清空
// ============================================================
function clearAllShellCasings() {
    for (let i = 0; i < _shellPool.length; i++) {
        const slot = _shellPool[i];
        if (slot.body && window.PHYSICS) {
            window.PHYSICS.removeShellBody(slot.body);
            slot.body = null;
        }
        if (slot.group) {
            slot.group.visible = false;
            slot.group.traverse(o => {
                if (o.isMesh && o.material) {
                    o.material.transparent = false;
                    o.material.opacity = 1;
                }
            });
        }
        slot.active = false;
        slot.until = 0;
    }
}

window.clearAllShellCasings = clearAllShellCasings;

// 启动时初始化池
if (typeof scene !== 'undefined' && scene) {
    initShellPool();
}