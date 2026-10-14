// ===== pages/survival_shop.js – 生存模式商店面板 =====
document.write(`
    <div id="survivalShop" style="display:none;">
        <div class="shop-panel">

            <div class="shop-topbar">
                <h2 class="shop-title">🛒 生 存 商 店</h2>
                <div class="shop-coins">
                    <span class="coin-icon">💰</span>
                    <span id="shopCoinCount">0</span>
                </div>
            </div>

            <div class="shop-section-title">武 器</div>
            <div class="shop-row" id="shopGunsRow"></div>

            <div class="shop-section-title">子 弹</div>
            <div class="shop-row" id="shopAmmoRow"></div>

            <div class="shop-section-title">道 具</div>
            <div class="shop-row shop-row-1" id="shopMedkitRow"></div>

        </div>
    </div>
`);