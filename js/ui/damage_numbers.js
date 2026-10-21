// ===== js/ui/damage_numbers.js – 伤害飘字（DOM 方案） =====
//
// 每颗弹丸命中僵尸时调用 spawnDamageNumber(point, dmg, isCrit)
// 每个飘字把世界坐标投影到屏幕坐标，往上飘 + 淡出。

(function () {
    'use strict';

    const LIFETIME_MS = 900;      // 单条飘字寿命
    const RISE_SPEED  = 0.0028;   // 每秒上升多少世界单位
    const MAX_COUNT   = 24;       // 同屏最多条数

    const _numbers = [];
    let _container = null;

    function _ensureContainer() {
        if (_container) return _container;
        _container = document.getElementById('damageNumbers');
        return _container;
    }

    function _removeEl(d) {
        if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el);
    }

    // ============================================================
    // 生成一条飘字
    //   worldPos：命中点的世界坐标（THREE.Vector3 或带 x/y/z 的对象）
    //   dmg     ：伤害数值
    //   isCrit  ：是否暴击（决定颜色和大小）
    // ============================================================
    function spawnDamageNumber(worldPos, dmg, isCrit) {
        const container = _ensureContainer();
        if (!container) return;
        if (!worldPos) return;

        // 超量保护：超了删最老的
        while (_numbers.length >= MAX_COUNT) {
            _removeEl(_numbers.shift());
        }

        const el = document.createElement('div');
        el.className = 'dmg-number' + (isCrit ? ' crit' : '');
        el.textContent = '-' + Math.round(dmg) + (isCrit ? ' 💥' : '');
        container.appendChild(el);

        _numbers.push({
            el,
            // 加一点随机偏移，避免同帧多条完全重叠
            x: worldPos.x + (Math.random() - 0.5) * 0.15,
            y: worldPos.y + (Math.random() - 0.5) * 0.08,
            z: worldPos.z + (Math.random() - 0.5) * 0.15,
            born: performance.now(),
            isCrit,
        });
    }
    window.spawnDamageNumber = spawnDamageNumber;

    // ============================================================
    // 每帧更新（由 main_loop.js 调用）
    // ============================================================
    const _projTmp = new THREE.Vector3();

    function updateDamageNumbers() {
        if (_numbers.length === 0) return;
        if (typeof p1 === 'undefined' || !p1 || !p1.cam) return;

        const now = performance.now();
        const cam = p1.cam;
        const W = window.innerWidth;
        const H = window.innerHeight;

        for (let i = _numbers.length - 1; i >= 0; i--) {
            const d = _numbers[i];
            const age = now - d.born;

            if (age >= LIFETIME_MS) {
                _removeEl(d);
                _numbers.splice(i, 1);
                continue;
            }

            // 世界坐标 → NDC（相机坐标系下的 -1..1）
            _projTmp.set(d.x, d.y + age * RISE_SPEED, d.z);
            _projTmp.project(cam);

            // 在相机后面 → 隐藏
            if (_projTmp.z > 1) {
                d.el.style.display = 'none';
                continue;
            }
            d.el.style.display = 'block';

            const sx = (_projTmp.x * 0.5 + 0.5) * W;
            const sy = (-_projTmp.y * 0.5 + 0.5) * H;

            // 后 50% 时间开始淡出
            const alpha = 1 - age / LIFETIME_MS;
            const fade = alpha > 0.5 ? 1 : alpha * 2;

            d.el.style.transform =
                `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
            d.el.style.opacity = String(Math.max(0, fade));
        }
    }
    window.updateDamageNumbers = updateDamageNumbers;

    // ============================================================
    // 清空（换回合 / 换地图时调用）
    // ============================================================
    function clearDamageNumbers() {
        for (const d of _numbers) _removeEl(d);
        _numbers.length = 0;
    }
    window.clearDamageNumbers = clearDamageNumbers;

    console.log('[damage_numbers] 伤害飘字模块已就绪');
})();