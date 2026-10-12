// ===== js/game_projectiles.js – 投掷物系统清理 =====
// 投掷物本体 / 烟雾 / 闪光 / 引信 已拆到 projectiles_*.js

// ============================================================
// 清空所有烟雾
// ============================================================
function clearAllSmokes() {
    for (const s of activeSmokes) {
        if (s.mesh) scene.remove(s.mesh);
        if (s.body) {
            window.PHYSICS.removeProjectileBody(s.body);
            s.body = null;
        }
        if (s.cloudMesh) {
            scene.remove(s.cloudMesh);
            s.cloudMesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        }
    }
    activeSmokes.length = 0;
    if (smokeTrajLine) smokeTrajLine.visible = false;
}

// ============================================================
// 清空所有闪光
// ============================================================
function clearAllFlashes() {
    for (const s of activeFlashes) {
        if (s.mesh) scene.remove(s.mesh);
        if (s.body) {
            window.PHYSICS.removeProjectileBody(s.body);
            s.body = null;
        }
    }
    activeFlashes.length = 0;

    for (let i = 0; i < _flashBurstPool.length; i++) {
        const b = _flashBurstPool[i];
        b.active = false;
        b.shell.visible = false;
        b.shell.material.opacity = 0;
        b.light.intensity = 0;
        b.light.position.set(0, -1000, 0);
    }

    if (flashTrajLine) flashTrajLine.visible = false;
}