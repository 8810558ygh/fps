// ===== js/combat_shared.js – 战斗系统共享 Raycaster / 临时向量 / 伤害解析 =====
// 从 game_combat.js 拆出，不改变任何对外接口

// ============================================================
// 复用 Raycaster 与临时向量
// ============================================================
const _ray        = new THREE.Raycaster();
const _rcOrigin   = new THREE.Vector3();
const _rcTarget   = new THREE.Vector3();
const _rcDir      = new THREE.Vector3();
const _rcEnd      = new THREE.Vector3();
const _rcRandDir  = new THREE.Vector3();
const _rcMuzzle   = new THREE.Vector3();
const _rcUp       = new THREE.Vector3(0, 1, 0);
const _rcAxis     = new THREE.Vector3();
const _rcQ1       = new THREE.Quaternion();
const _rcQ2       = new THREE.Quaternion();

// ============================================================
// ★ 命中部位 → 伤害解析
// ============================================================
function _resolveDamage(weaponCfg, part, distance) {
    if (!weaponCfg) return 0;

    const useFar = (weaponCfg.falloffDistance !== undefined)
        && (distance !== undefined)
        && (distance > weaponCfg.falloffDistance);

    if (part === 'head') {
        const near = weaponCfg.dmgHead || 0;
        const far  = (weaponCfg.dmgHeadFar !== undefined) ? weaponCfg.dmgHeadFar : near;
        return useFar ? far : near;
    }
    if (part === 'leg') {
        const near = weaponCfg.dmgLeg || 0;
        const far  = (weaponCfg.dmgLegFar !== undefined) ? weaponCfg.dmgLegFar : near;
        return useFar ? far : near;
    }
    const near = weaponCfg.dmgBody || 0;
    const far  = (weaponCfg.dmgBodyFar !== undefined) ? weaponCfg.dmgBodyFar : near;
    return useFar ? far : near;
}
window._resolveDamage = _resolveDamage;

// ============================================================
// ★★★ 易伤：统一入口 ★★★
//   - tryFire / tryMelee / barrels 里调用
//   - 在 _addDamage 之前应用，保证"统计值 = 实际扣血值"
// ============================================================
function _applyVulnerabilityBonus(victim, dmg, now) {
    if (!victim) return dmg;
    if (victim.vulnerableUntil > now) return dmg * 2;
    return dmg;
}
window._applyVulnerabilityBonus = _applyVulnerabilityBonus;

// ============================================================
// 伤害统计
// ============================================================
function _ensureDmgEntry(p, targetId) {
    if (!p.damageDealt[targetId]) {
        p.damageDealt[targetId] = { body: 0, head: 0, leg: 0, total: 0 };
    }
    return p.damageDealt[targetId];
}

function _addDamage(p, targetId, part, dmg) {
    const e = _ensureDmgEntry(p, targetId);
    if (part === 'head') e.head += dmg;
    else if (part === 'leg') e.leg += dmg;
    else e.body += dmg;
    e.total += dmg;
}

// ============================================================
// ★ 射速计算（tryFire / aiFire 共用）
//   —— 支持"奥丁转管预热"和"开镜射速倍率"
// ============================================================
function _computeFireInterval(p, w, now) {
    let ms = w.fireMs;

    if (w.spinUpMs && w.minFireMs) {
        // 奥丁：转管预热，越打越快
        if (p.aiming) {
            p.spinUpProgress = 1;
            ms = w.minFireMs;
        } else {
            const since = now - (p.lastShotTime || 0);
            if (since < 200) {
                p.spinUpProgress = Math.min(1, (p.spinUpProgress || 0) + since / w.spinUpMs);
            } else {
                p.spinUpProgress = 0;
            }
            ms = Math.max(
                w.minFireMs,
                w.fireMs - (w.fireMs - w.minFireMs) * p.spinUpProgress
            );
        }
    } else if (p.aiming && w.adsFireRateMul) {
        // 开镜射速倍率（如狂徒开镜 0.9×）
        ms = ms / w.adsFireRateMul;
    }

    return ms;
}
window._computeFireInterval = _computeFireInterval;