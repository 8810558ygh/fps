// ===== js/survival/survival_stats.js – 个人属性系统（真实数据版） =====
//
// 通过金币升级，仅生存模式生效。
//
// 升级曲线：
//   · 血量：+0 / +20 / +50 / +90 / +150（累计）
//   · 伤害：1.0× / 1.25× / 1.5× / 1.75× / 2.0×
//   · 暴击：0% / 20% / 40% / 60% / 80%（暴击伤害 ×2）
// 升级费用：10 / 30 / 50 / 100 金币
//
// 依赖：SurvivalState（金币）、HP_MAX、p1

(function () {
    'use strict';

    const MAX_LEVEL = 5;
    const UPGRADE_COSTS = [10, 30, 50, 100];

    const HP_BONUS_TABLE   = [0, 20, 50, 90, 150];
    const DAMAGE_MUL_TABLE = [1.0, 1.25, 1.5, 1.75, 2.0];
    const CRIT_RATE_TABLE  = [0, 0.20, 0.40, 0.60, 0.80];

    const SurvivalStats = {
        hp: 1,
        damage: 1,
        crit: 1,

        MAX_LEVEL,
        UPGRADE_COSTS,
        HP_BONUS_TABLE,
        DAMAGE_MUL_TABLE,
        CRIT_RATE_TABLE,

        // ---- 每局开始重置 ----
        reset() {
            this.hp = 1;
            this.damage = 1;
            this.crit = 1;
        },

        getLevel(stat) {
            return this[stat] || 1;
        },

        isMaxed(stat) {
            return this.getLevel(stat) >= MAX_LEVEL;
        },

        getUpgradeCost(stat) {
            const lv = this.getLevel(stat);
            if (lv >= MAX_LEVEL) return null;
            return UPGRADE_COSTS[lv - 1];
        },

        canUpgrade(stat) {
            if (this.isMaxed(stat)) return false;
            const cost = this.getUpgradeCost(stat);
            if (cost == null) return false;
            const coins = (typeof SurvivalState !== 'undefined' && SurvivalState)
                ? (SurvivalState.coins || 0) : 0;
            return coins >= cost;
        },

        upgrade(stat) {
            if (!this.canUpgrade(stat)) return false;
            const cost = this.getUpgradeCost(stat);
            if (typeof SurvivalState !== 'undefined' && SurvivalState) {
                SurvivalState.coins = (SurvivalState.coins || 0) - cost;
            }
            this[stat] += 1;

            // 血量升级：立即同步 maxHp + 回血
            if (stat === 'hp' && typeof p1 !== 'undefined' && p1) {
                const oldMax = p1.maxHp || HP_MAX;
                const newMax = this.getMaxHp();
                const delta = newMax - oldMax;
                p1.maxHp = newMax;
                p1.hp = Math.min(newMax, p1.hp + delta);
            }

            return true;
        },

        // ---- 取值 ----
        getHpBonus() {
            return HP_BONUS_TABLE[this.hp - 1] || 0;
        },

        getMaxHp() {
            const base = (typeof HP_MAX !== 'undefined') ? HP_MAX : 100;
            return base + this.getHpBonus();
        },

        getDamageMul() {
            return DAMAGE_MUL_TABLE[this.damage - 1] || 1.0;
        },

        getCritRate() {
            return CRIT_RATE_TABLE[this.crit - 1] || 0;
        },

        // 应用伤害：先乘倍率，再判定暴击
        rollDamage(baseDmg) {
            let dmg = baseDmg * this.getDamageMul();
            let isCrit = false;
            if (this.getCritRate() > 0 && Math.random() < this.getCritRate()) {
                dmg *= 2;
                isCrit = true;
            }
            return { dmg, isCrit };
        },
    };

    window.SurvivalStats = SurvivalStats;

    // ============================================================
    // 面板 UI 元数据
    // ============================================================
    const STAT_META = {
        hp: {
            name: '❤️ 血量',
            describe: (lv) => {
                const bonus = HP_BONUS_TABLE[lv - 1];
                return `HP 上限 +${bonus}`;
            },
        },
        damage: {
            name: '⚔ 伤害',
            describe: (lv) => {
                const mul = DAMAGE_MUL_TABLE[lv - 1];
                return `子弹伤害 ×${mul.toFixed(2)}`;
            },
        },
        crit: {
            name: '💥 暴击',
            describe: (lv) => {
                const rate = CRIT_RATE_TABLE[lv - 1];
                return `暴击率 ${Math.round(rate * 100)}%`;
            },
        },
    };

    const STAT_KEYS = ['hp', 'damage', 'crit'];

    let _open = false;

    function _isSurvivalActive() {
        return typeof gameMode !== 'undefined' && gameMode === 'survival'
            && typeof SurvivalState !== 'undefined' && SurvivalState.active;
    }

    function canOpen() {
        if (typeof running === 'undefined' || !running) return false;
        if (typeof isOver === 'function' && isOver()) return false;
        if (!_isSurvivalActive()) return false;
        return true;
    }

    function _el(id) { return document.getElementById(id); }

    // ============================================================
    // 渲染
    // ============================================================
    function _render() {
        if (!_open) return;

        const coinsEl = _el('statsCoinCount');
        if (coinsEl) {
            const coins = (typeof SurvivalState !== 'undefined' && SurvivalState)
                ? (SurvivalState.coins || 0) : 0;
            coinsEl.textContent = String(coins);
        }

        const list = _el('statsList');
        if (!list) return;

        list.innerHTML = '';

        for (const stat of STAT_KEYS) {
            list.appendChild(_buildRow(stat));
        }
    }

    function _buildRow(stat) {
        const meta = STAT_META[stat];
        const lv = SurvivalStats.getLevel(stat);
        const maxed = SurvivalStats.isMaxed(stat);
        const cost = SurvivalStats.getUpgradeCost(stat);

        const div = document.createElement('div');
        div.className = 'stats-row';

        // ---- 按钮文本 / 类名 / 禁用 ----
        let btnText, btnClass, btnDisabled;
        if (maxed) {
            btnText = '已 满 级';
            btnClass = 'stats-btn maxed';
            btnDisabled = true;
        } else {
            btnText = `${cost} 💰 升级`;
            btnClass = 'stats-btn';
            btnDisabled = !SurvivalStats.canUpgrade(stat);
        }

        // ---- 当前值 → 下一级值 ----
        const currentDesc = meta.describe(lv);
        const nextDesc = maxed ? null : meta.describe(lv + 1);

        let valueHtml = currentDesc;
        if (nextDesc) {
            valueHtml += ` <span style="color:#ffd24a;font-weight:600;">→ ${nextDesc}</span>`;
        }

        div.innerHTML = `
            <div class="stats-name">${meta.name}</div>
            <div class="stats-info">
                <div class="stats-level">等级 <span class="current">${lv}</span> / ${SurvivalStats.MAX_LEVEL}</div>
                <div class="stats-value">${valueHtml}</div>
            </div>
            <button class="${btnClass}" ${btnDisabled ? 'disabled' : ''} data-key="${stat}">${btnText}</button>
        `;

        // ---- 点击升级 ----
        if (!maxed) {
            const btn = div.querySelector('.stats-btn');
            btn.addEventListener('click', () => {
                if (SurvivalStats.upgrade(stat)) {
                    if (typeof sPickup === 'function') sPickup(1);
                    _render();
                } else {
                    if (typeof sEmpty === 'function') sEmpty(1);
                }
            });
        }

        return div;
    }

    // ============================================================
    // 打开 / 关闭
    // ============================================================
    function open() {
        if (_open) return;
        if (!canOpen()) return;
        _open = true;

        if (document.pointerLockElement) document.exitPointerLock();

        if (typeof p1 !== 'undefined' && p1 && p1.input) {
            p1.input.forward = 0;
            p1.input.right   = 0;
            p1.input.fire    = false;
            p1.input.jump    = false;
            p1.input.aim     = false;
        }
        if (typeof mouse !== 'undefined') mouse.leftDown = false;

        const el = _el('survivalStatsPanel');
        if (el) el.style.display = 'flex';

        _render();

        console.log('[stats] 面板打开');
    }

    function close() {
        if (!_open) return;
        _open = false;

        const el = _el('survivalStatsPanel');
        if (el) el.style.display = 'none';

        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice
            && typeof renderer !== 'undefined' && renderer
            && typeof running !== 'undefined' && running) {
            try { renderer.domElement.requestPointerLock(); } catch (e) {}
        }

        console.log('[stats] 面板关闭');
    }

    function toggle() {
        if (_open) close();
        else open();
    }

    function _bindBackgroundClick() {
        const el = _el('survivalStatsPanel');
        if (!el || el._bgBound) return;
        el._bgBound = true;

        el.addEventListener('mousedown', (e) => {
            if (e.target === el) {
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        });
    }

    function _init() {
        _bindBackgroundClick();
        console.log('[stats] 个人属性系统已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    window.StatsPanel = {
        open,
        close,
        toggle,
        canOpen,
        isOpen: () => _open,
    };
})();