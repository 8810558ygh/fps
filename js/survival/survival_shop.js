// ===== js/survival/survival_shop.js – 生存模式商店 =====
//
// 规则：
//   · B 键随时打开（仅生存模式）
//   · 枪：50 金币解锁；已解锁的点击即换枪
//   · 子弹：狂徒/奥丁 1💰/发，冥驹/判官 2💰/发
//   · 未解锁的枪不能买对应子弹
//   · 解锁枪自动解锁对应子弹
//   · ★ 子弹起卖门槛 = 一个弹匣的全额金币
//        金币 < 门槛 → 拒绝，一颗都不卖
//        金币 ≥ 门槛 → 能加几发加几发，按实际发数扣钱
//
// 依赖：SurvivalState（survival_state.js）
//       WEAPONS / setWeapon / p1（player.js）
//       toast（online_net.js）

(function () {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const GUN_PRICE = 50;

    const AMMO_PRICE = {
        rifle:   1,
        odin:    1,
        sniper:  2,
        shotgun: 2,
    };

    const GUN_NAMES = {
        rifle:   '狂徒',
        sniper:  '冥驹',
        shotgun: '判官',
        odin:    '奥丁',
    };

    const GUN_ORDER = ['rifle', 'sniper', 'shotgun', 'odin'];

    let _open = false;

    // ============================================================
    // 是否允许打开
    // ============================================================
    function canOpenShop() {
        if (typeof running === 'undefined' || !running) return false;
        if (typeof isOver === 'function' && isOver()) return false;
        if (typeof gameMode === 'undefined' || gameMode !== 'survival') return false;
        if (typeof SurvivalState === 'undefined' || !SurvivalState.active) return false;
        return true;
    }

    // ============================================================
    // 打开 / 关闭
    // ============================================================
    function openShop() {
        if (_open) return;
        if (!canOpenShop()) return;
        _open = true;

        if (document.pointerLockElement) document.exitPointerLock();

        if (typeof p1 !== 'undefined' && p1 && p1.input) {
            p1.input.forward = 0;
            p1.input.right   = 0;
            p1.input.fire    = false;
            p1.input.jump    = false;
            p1.input.aim     = false;
        }
        if (typeof mouse !== 'undefined') {
            mouse.leftDown = false;
        }

        const el = document.getElementById('survivalShop');
        if (el) el.style.display = 'flex';

        renderShop();
        console.log('[shop] 打开');
    }

    function closeShop() {
        if (!_open) return;
        _open = false;

        const el = document.getElementById('survivalShop');
        if (el) el.style.display = 'none';

        if (typeof isTouchDevice !== 'undefined' && !isTouchDevice) {
            if (typeof renderer !== 'undefined' && renderer
                && typeof running !== 'undefined' && running) {
                try { renderer.domElement.requestPointerLock(); } catch (e) {}
            }
        }

        console.log('[shop] 关闭');
    }

    function toggleShop() {
        if (_open) closeShop();
        else openShop();
    }

    // ============================================================
    // 渲染
    // ============================================================
    function renderShop() {
        renderCoins();
        renderGuns();
        renderAmmo();
    }

    function renderCoins() {
        const el = document.getElementById('shopCoinCount');
        if (el) el.textContent = String(SurvivalState.coins || 0);
    }

    function isUnlocked(key) {
        return !!(SurvivalState.unlockedWeapons
            && SurvivalState.unlockedWeapons.includes(key));
    }

    function getCurrentWeaponKey() {
        if (typeof p1 === 'undefined' || !p1) return null;
        if (p1.isMelee) return 'knife';
        if (p1.isSmoke) return 'smoke';
        if (p1.isFlash) return 'flash';
        return p1.weaponKey;
    }

    function renderGuns() {
        const row = document.getElementById('shopGunsRow');
        if (!row) return;
        row.innerHTML = '';

        const current = getCurrentWeaponKey();

        for (const key of GUN_ORDER) {
            const unlocked  = isUnlocked(key);
            const equipped  = (key === current);

            const card = document.createElement('div');
            card.className = 'shop-card shop-gun-card';
            if (!unlocked) card.classList.add('locked');
            if (equipped)  card.classList.add('equipped');

            let sub;
            if (!unlocked)         sub = `🔒 ${GUN_PRICE} 💰`;
            else if (equipped)     sub = '⭐ 已装备';
            else                   sub = '点击装备';

            card.innerHTML =
                `<div class="shop-card-name">${GUN_NAMES[key]}</div>` +
                `<div class="shop-card-sub">${sub}</div>`;

            card.addEventListener('click', () => onGunClick(key));
            row.appendChild(card);
        }
    }

    function renderAmmo() {
        const row = document.getElementById('shopAmmoRow');
        if (!row) return;
        row.innerHTML = '';

        for (const key of GUN_ORDER) {
            const unlocked = isUnlocked(key);
            const price    = AMMO_PRICE[key] || 1;
            const w        = (typeof WEAPONS !== 'undefined') ? WEAPONS[key] : null;
            const mag      = w ? w.mag : 0;
            const fullCost = mag * price;

            let reserveText = '';
            let subText     = '';

            if (!unlocked) {
                subText = '🔒 需先解锁武器';
            } else {
                const cur     = getAmmoReserve(key);
                const maxRes  = getMaxReserve(key);
                reserveText   = `${cur} / ${maxRes}`;
                subText       = `一匣 ${mag} 发 · 起卖 ${fullCost} 💰`;
            }

            const card = document.createElement('div');
            card.className = 'shop-card shop-ammo-card';
            if (!unlocked) card.classList.add('locked');

            card.innerHTML =
                `<div class="shop-card-name">${GUN_NAMES[key]} 子弹</div>` +
                `<div class="shop-card-sub">${subText}</div>` +
                `<div class="shop-card-info">${reserveText}</div>`;

            card.addEventListener('click', () => onAmmoClick(key));
            row.appendChild(card);
        }
    }

    // ============================================================
    // 弹药工具（读取时做双向同步）
    // ============================================================
    function getMaxReserve(key) {
        const w = WEAPONS[key];
        if (!w) return 0;
        return w.reserveMax || (w.mag * 3);
    }

    function _isHolding(key) {
        if (typeof p1 === 'undefined' || !p1) return false;
        return (p1.weaponKey === key
            && !p1.isMelee && !p1.isSmoke && !p1.isFlash);
    }

    function getAmmoReserve(key) {
        if (typeof p1 === 'undefined' || !p1) return 0;

        const w = WEAPONS[key];
        if (!w || !w.mag) return 0;

        if (!p1.weaponAmmo) p1.weaponAmmo = {};

        // 保证 weaponAmmo 条目存在
        if (!p1.weaponAmmo[key]) {
            p1.weaponAmmo[key] = {
                ammo: w.mag,
                reserve: w.startReserve,
            };
        }

        if (_isHolding(key)) {
            // ★ 手里拿着 → p.reserve 是权威值，同步到 weaponAmmo
            p1.weaponAmmo[key].reserve = p1.reserve;
            p1.weaponAmmo[key].ammo    = p1.ammo;
            return p1.reserve;
        }

        // 手里没拿 → weaponAmmo 是权威值
        return p1.weaponAmmo[key].reserve;
    }

    // 写入备弹：同时更新 weaponAmmo + （若在手里）p.reserve
    function _setAmmoReserve(key, value) {
        if (typeof p1 === 'undefined' || !p1) return;
        if (!p1.weaponAmmo) p1.weaponAmmo = {};
        if (!p1.weaponAmmo[key]) {
            p1.weaponAmmo[key] = { ammo: 0, reserve: 0 };
        }
        p1.weaponAmmo[key].reserve = value;

        if (_isHolding(key)) {
            p1.reserve = value;
        }
    }

    // ============================================================
    // 点击：枪
    // ============================================================
    function onGunClick(key) {
        const unlocked = isUnlocked(key);

        // ---- 未解锁 → 尝试购买 ----
        if (!unlocked) {
            if ((SurvivalState.coins || 0) < GUN_PRICE) {
                toast(`金币不足，需要 ${GUN_PRICE} 💰`);
                if (typeof sEmpty === 'function') sEmpty(1);
                return;
            }
            SurvivalState.coins -= GUN_PRICE;
            unlockWeapon(key);
            if (typeof sPickup === 'function') sPickup(1);
            renderShop();
            return;
        }

        // ---- 已解锁 → 换枪 ----
        const current = getCurrentWeaponKey();
        if (current === key) return;

        // setWeapon 内部会先把【当前枪】的 p.ammo / p.reserve 存进 weaponAmmo，
        // 再从 weaponAmmo[key] 恢复目标枪弹药 → 天然防刷弹
        setWeapon(p1, key);
        if (typeof sPickup === 'function') sPickup(1);

        closeShop();
    }

    // ============================================================
    // ★ 点击：子弹
    //
    //   门槛：一个弹匣的全额金币（mag × price）
    //        —— 金币不够门槛，直接拒绝，一颗都不卖
    //   扣费：只按【实际增加的发数】扣钱
    //        —— 例如差 10 发、门槛 25、金币 30 → 加 10 发扣 10💰
    // ============================================================
    function onAmmoClick(key) {
        if (!isUnlocked(key)) {
            toast('请先解锁该武器');
            if (typeof sEmpty === 'function') sEmpty(1);
            return;
        }

        const w = WEAPONS[key];
        if (!w || !w.mag) return;

        const price  = AMMO_PRICE[key] || 1;
        const maxRes = getMaxReserve(key);
        const curRes = getAmmoReserve(key);
        const space  = maxRes - curRes;

        if (space <= 0) {
            toast('备弹已满');
            if (typeof sEmpty === 'function') sEmpty(1);
            return;
        }

        // ★ 门槛：一个弹匣的全额金币
        const magPrice = w.mag * price;

        if ((SurvivalState.coins || 0) < magPrice) {
            toast(`金币不足，起卖 ${magPrice} 💰（一匣 ${w.mag} 发）`);
            if (typeof sEmpty === 'function') sEmpty(1);
            return;
        }

        // ★ 能加几发加几发（不超过上限），按实际发数扣钱
        const wantBuy = Math.min(w.mag, space);
        const cost    = wantBuy * price;

        SurvivalState.coins -= cost;
        _setAmmoReserve(key, curRes + wantBuy);

        if (typeof sPickup === 'function') sPickup(1);

        toast(`+${wantBuy} 发（${cost} 💰）`);

        renderShop();
    }

    // ============================================================
    // 解锁
    // ============================================================
    function unlockWeapon(key) {
        if (!SurvivalState.unlockedWeapons) SurvivalState.unlockedWeapons = ['rifle'];
        if (SurvivalState.unlockedWeapons.includes(key)) return;

        SurvivalState.unlockedWeapons.push(key);

        // ★ 解锁即初始化弹药（如果还没有）
        if (typeof p1 !== 'undefined' && p1) {
            if (!p1.weaponAmmo) p1.weaponAmmo = {};
            if (!p1.weaponAmmo[key]) {
                const w = WEAPONS[key];
                if (w && w.mag) {
                    p1.weaponAmmo[key] = {
                        ammo: w.mag,
                        reserve: w.startReserve,
                    };
                }
            }
        }

        toast(`✅ ${GUN_NAMES[key] || key} 已解锁`);

        if (typeof feed === 'function' && typeof p1 !== 'undefined' && p1) {
            feed(p1, `🗝 解锁 <b style="color:#ffd24a">${GUN_NAMES[key] || key}</b>`);
        }
        console.log('[shop] 解锁武器:', key, '→', SurvivalState.unlockedWeapons.slice());
    }

    // ============================================================
    // 对外暴露
    // ============================================================
    window.Shop = {
        open:     openShop,
        close:    closeShop,
        toggle:   toggleShop,
        isOpen:   () => _open,
        canOpen:  canOpenShop,
        render:   renderShop,
    };

    console.log('[shop] 商店模块已加载');
})();