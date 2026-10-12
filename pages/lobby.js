// ===== pages/lobby.js – 大厅覆盖层 =====
document.write(`
    <div id="lobbyOverlay" class="overlay">
        <div class="lobby-glow"></div>

        <div id="settingsBtn" title="设置">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
                <path d="M19.4 13a7.8 7.8 0 000-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 00-1.7-1L14.8 3h-4l-.5 2.6a7.7 7.7 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.8 7.8 0 000 2L4.6 14.6l2 3.4 2.4-1a7.7 7.7 0 001.7 1L11.2 21h4l.5-2.6a7.7 7.7 0 001.7-1l2.4 1 2-3.4L19.4 13z"/>
            </svg>
        </div>

        <div id="armoryBtn" title="军械库">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.62l7 3.5v7.06l-7-3.5V9.62zm9 10.56v-7.06l7-3.5v7.06l-7 3.5z"/>
            </svg>
        </div>

        <h1 class="lobby-title"><span class="b">双雄</span>对决</h1>
        <div class="lobby-sub">ROUND-BASED SHOOTING ARENA</div>
        <div class="lobby-desc">
            <p>每回合 5 秒准备阶段 · 击杀 / 被击杀即结束本回合</p>
            <p>先达到 10 次击杀者获胜</p>
        </div>

        <div class="lobby-map-select">
            <div class="map-select-title">🗺 选择地图</div>
            <div class="map-select-row" id="mapSelectRow"></div>
        </div>

        <div class="lobby-buttons">
            <button class="btn lobby-btn lobby-btn-ai" id="lobbyAiBtn">人 机 对 战</button>
            <button class="btn lobby-btn lobby-btn-survival" id="lobbySurvivalBtn">生 存 模 式</button>
            <button class="btn lobby-btn lobby-btn-online" id="lobbyOnlineBtn">联 机 对 战</button>
        </div>
        <div class="lobby-footer">Three.js · 程序化音效与纹理</div>
    </div>
`);