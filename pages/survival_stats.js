// ===== pages/survival_stats.js – 个人属性面板 =====
document.write(`
    <div id="survivalStatsPanel" style="display:none;">
        <div class="stats-panel">

            <div class="stats-topbar">
                <h2 class="stats-title">⚔ 个 人 属 性</h2>
                <div class="stats-topbar-right">
                    <div class="stats-coins">
                        <span class="coin-icon">💰</span>
                        <span id="statsCoinCount">0</span>
                    </div>
                    <button id="statsBackToShopBtn" class="stats-shop-btn">🛒 商 店</button>
                </div>
            </div>

            <div class="stats-hint">点击空白处关闭</div>

            <div class="stats-list" id="statsList"></div>

        </div>
    </div>
`);