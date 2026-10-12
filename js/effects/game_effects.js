// ===== js/game_effects.js – 目标缓存 + 枪口锚点 =====
// 曳光 / 火花 / 弹痕 / 刀痕 / 投掷轨迹 / 闪光指示器 已拆到 effects_*.js

// ============================================================
// ★ 性能优化（A4）：getShotTargets 缓存
// ============================================================
const _shotTargetsBase = [];
const _shotTargetsWork = [];
let _shotTargetsDirty = true;

function markShotTargetsDirty() { _shotTargetsDirty = true; }
window.markShotTargetsDirty = markShotTargetsDirty;

function getShotTargets() {
    if (_shotTargetsDirty) {
        _shotTargetsBase.length = 0;
        for (let i = 0; i < wallMeshes.length; i++) _shotTargetsBase.push(wallMeshes[i]);
        for (let i = 0; i < crateMeshes.length; i++) _shotTargetsBase.push(crateMeshes[i]);
        if (typeof window.groundMesh !== 'undefined' && window.groundMesh) {
            _shotTargetsBase.push(window.groundMesh);
        }
        _shotTargetsDirty = false;
    }
    return _shotTargetsBase;
}
window.getShotTargets = getShotTargets;

function prepareShotTargets() {
    _shotTargetsWork.length = 0;
    const base = getShotTargets();
    for (let i = 0; i < base.length; i++) _shotTargetsWork.push(base[i]);
    return _shotTargetsWork;
}
window.prepareShotTargets = prepareShotTargets;

// ===== 枪口世界坐标 =====
function muzzleWorld(p, out) {
    if (p && p.vm && p.vm.children.length > 0) {
        const vmGun = p.vm.children[0];
        const mp = vmGun.getObjectByName('muzzlePoint');
        if (mp) {
            return mp.getWorldPosition(out);
        }
    }
    return out.set(0.28, -0.2, -1.25).applyMatrix4(p.cam.matrixWorld);
}
window.muzzleWorld = muzzleWorld;