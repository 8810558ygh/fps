// ===== js/online_spectator.js – 观战视角 + 提示 UI =====
// 从 online_game.js 拆出，不改变任何对外接口

function updateSpectatorView(dt) {
    if (NET.role !== 'spectator') return;
    if (!NET.spectatorBlueData || !NET.spectatorRedData) return;
    if (typeof p1 === 'undefined' || typeof p2 === 'undefined') return;

    const watching = NET.spectatorTarget;
    const watchData = watching === 'blue' ? NET.spectatorBlueData : NET.spectatorRedData;
    const otherData = watching === 'blue' ? NET.spectatorRedData : NET.spectatorBlueData;
    const otherIsBlue = watching !== 'blue';

    p1.pos.set(watchData.x, watchData.y, watchData.z);
    p1.yaw = watchData.yaw; p1.pitch = watchData.pitch;
    p1.height = watchData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
    p1.eyeH = stanceEye(p1.height);
    p1.hp = watchData.hp; p1.armor = watchData.armor; p1.score = watchData.score;
    p1.ammo = watchData.ammo || 0; p1.reserve = watchData.reserve || 0;
    p1.aiming = !!watchData.aiming; p1.aimStage = watchData.aimStage || 0;
    p1.baseVisible = watchData.visible;
    p1.deadUntil = watchData.dead ? Infinity : 0;
    p1.smokeCharges = watchData.smokeCharges || 0;
    p1.flashCharges = watchData.flashCharges || 0;
    p1.meleeIsHeavy = !!watchData.meleeIsHeavy;
    p1.reloadEnd = watchData.reloadRemain > 0 ? performance.now() + watchData.reloadRemain : 0;
    p1.boltEnd = watchData.boltRemain > 0 ? performance.now() + watchData.boltRemain : 0;
    p1.meleeEnd = watchData.meleeEndRemain > 0 ? performance.now() + watchData.meleeEndRemain : 0;
    p1.flashUntil = watchData.flashRemain > 0 ? performance.now() + watchData.flashRemain : 0;

    const wantKey = watchData.isMelee ? 'knife' : (watchData.isSmoke ? 'smoke' : (watchData.isFlash ? 'flash' : watchData.weapon));
    const curKey = p1.isMelee ? 'knife' : (p1.isSmoke ? 'smoke' : (p1.isFlash ? 'flash' : p1.weaponKey));
    if (wantKey !== curKey) {
        applyWeaponToPlayer(p1, wantKey, true);
    }

    p1.cam.position.set(watchData.x, watchData.y + p1.eyeH, watchData.z);
    p1.cam.rotation.y = watchData.yaw;
    p1.cam.rotation.x = watchData.pitch;

    const targetFov = watchData.fov || BASE_FOV;
    if (Math.abs(p1.cam.fov - targetFov) > 0.05) {
        const k = Math.min(1, (dt || 0.016) * 11);
        p1.cam.fov += (targetFov - p1.cam.fov) * k;
        p1.cam.updateProjectionMatrix();
    }

    p1.mesh.visible = false;

    p2.pos.set(otherData.x, otherData.y, otherData.z);
    p2.yaw = otherData.yaw; p2.pitch = otherData.pitch;
    p2.mesh.position.copy(p2.pos);
    p2.mesh.rotation.y = otherData.yaw;
    p2.hp = otherData.hp;
    p2.armor = otherData.armor;
    p2.score = otherData.score;
    p2.baseVisible = otherData.visible;
    p2.height = otherData.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
    p2.mesh.scale.y = p2.height / HEIGHT_STAND;
    p2.mat.color.setHex(otherIsBlue ? 0x3a7bd5 : 0xd54a3a);
    p2.meleeIsHeavy = !!otherData.meleeIsHeavy;
    p2.reloadEnd = otherData.reloadRemain > 0 ? performance.now() + otherData.reloadRemain : 0;
    p2.boltEnd = otherData.boltRemain > 0 ? performance.now() + otherData.boltRemain : 0;
    p2.meleeEnd = otherData.meleeEndRemain > 0 ? performance.now() + otherData.meleeEndRemain : 0;
    p2.flashUntil = otherData.flashRemain > 0 ? performance.now() + otherData.flashRemain : 0;

    const otherKey = otherData.isMelee ? 'knife' : (otherData.isSmoke ? 'smoke' : (otherData.isFlash ? 'flash' : otherData.weapon));
    const p2Key = p2.isMelee ? 'knife' : (p2.isSmoke ? 'smoke' : (p2.isFlash ? 'flash' : p2.weaponKey));
    if (otherKey !== p2Key) {
        applyWeaponToPlayer(p2, otherKey, false);
    }

    if (typeof updateThirdPersonWeapon === 'function') {
        updateThirdPersonWeapon(p1, dt, performance.now());
        updateThirdPersonWeapon(p2, dt, performance.now());
    }

    if (typeof updateSniperViewmodel === 'function') {
        updateSniperViewmodel(p1, dt, performance.now());
    }
}
window.NET_updateSpectatorView = updateSpectatorView;

function showSpectatorHint() {
    let el = document.getElementById('spectatorHint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'spectatorHint';
        el.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            z-index: 15; background: rgba(13, 19, 30, 0.9);
            border: 1px solid rgba(255, 210, 74, 0.5); border-radius: 10px;
            padding: 10px 24px; color: #ffd24a; font-size: 14px; letter-spacing: 2px;
            pointer-events: none; box-shadow: 0 6px 24px rgba(0,0,0,0.6);
        `;
        document.body.appendChild(el);
    }
    el.textContent = '👁 观战中 · 左键切换视角 · Enter 聊天';
    el.style.display = 'block';

    let tag = document.getElementById('spectatorTargetTag');
    if (!tag) {
        tag = document.createElement('div');
        tag.id = 'spectatorTargetTag';
        tag.style.cssText = `
            position: fixed; top: 14px; right: 14px; z-index: 15;
            background: rgba(13, 19, 30, 0.85);
            border: 1px solid rgba(107, 179, 255, 0.5); border-radius: 10px;
            padding: 8px 16px; color: #fff; font-size: 14px; pointer-events: none;
        `;
        document.body.appendChild(tag);
    }
    updateSpectatorTag(tag);
}

function updateSpectatorTag(tag) {
    if (!tag) tag = document.getElementById('spectatorTargetTag');
    if (!tag) return;
    const t = NET.spectatorTarget;
    const icon = t === 'blue' ? '🔵' : '🔴';
    const label = t === 'blue' ? '蓝方视角' : '红方视角';
    tag.innerHTML = `<span style="color:#9fb2c8;font-size:12px;margin-right:6px;">观战</span><span style="color:${t === 'blue' ? '#6db3ff' : '#ff7a6d'};font-weight:700;">${icon} ${label}</span>`;
}

window.NET_spectatorToggle = function () {
    if (NET.role !== 'spectator') return;
    NET.spectatorTarget = NET.spectatorTarget === 'blue' ? 'red' : 'blue';
    updateSpectatorTag();
    toast('切换到' + (NET.spectatorTarget === 'blue' ? '蓝方' : '红方') + '视角');
};