// ===== pages/survival_hud.js – 生存模式 HUD + 战绩面板 + 结束提示 =====
document.write(`
    <div id="survivalHUD" style="display:none;">
        <div class="sv-title">🧟 生存模式</div>
        <div class="sv-wave">第 0 波 / 5</div>
        <div class="sv-zombies">僵尸: 0</div>
        <div class="sv-status">准备中</div>
    </div>

    <div id="survivalWaveSummary" style="display:none;">
        <div class="sv-summary-title">
            第 <span id="svSummaryWave">1</span> 波 · 战 绩
        </div>
        <div class="sv-summary-list" id="svSummaryList"></div>
    </div>

    <div id="survivalEndOverlay" style="display:none;">
        <div class="sv-end-panel">
            <div class="sv-end-icon">💀</div>
            <div class="sv-end-title">失 败</div>
            <div class="sv-end-hint">即将返回大厅...</div>
        </div>
    </div>
`);