// ===== pages/armory.js – 军械库页面 =====
document.write(`
    <div id="armoryOverlay" style="display:none;">

        <div class="armory-topbar">
            <button id="armoryBackBtn" class="armory-back-btn">
                <span class="arrow">←</span>
                <span>返 回 大 厅</span>
            </button>
            <h1 class="armory-title">⚔ 军 械 库</h1>
            <div class="armory-topbar-spacer"></div>
        </div>

        <div class="armory-tabs" id="armoryTabs">
            <button class="armory-tab active" data-type="rifle">🔫 狂徒</button>
            <button class="armory-tab" data-type="sniper">🎯 冥驹</button>
            <button class="armory-tab" data-type="shotgun">💥 判官</button>
            <button class="armory-tab" data-type="odin">⚙️ 奥丁</button>
            <button class="armory-tab" data-type="knife">🗡 军刀</button>
            <button class="armory-tab" data-type="smoke">💨 烟雾弹</button>
            <button class="armory-tab" data-type="flash">⚡ 闪光弹</button>
            <button class="armory-tab" data-type="medkit">✚ 医疗包</button>
        </div>

        <div class="armory-body">

            <aside class="armory-skins">
                <div class="armory-skins-title">皮肤</div>
                <div class="armory-skins-list" id="armorySkinsList"></div>
            </aside>

            <div id="armoryViewport" class="armory-viewport">
                <div class="armory-hint">拖动鼠标旋转 · 滚轮缩放</div>
            </div>

        </div>

    </div>
`);