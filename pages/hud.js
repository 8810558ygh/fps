// ===== pages/hud.js – 游戏内 HUD 主体 =====
document.write(`
    <canvas id="minimap" style="display:none;"></canvas>
    <div id="timer" class="timer">5:00</div>
    <div id="slowIndicator">🎵 减速 -5%</div>

    <div id="scorePanel">
        <div class="sp-title">战 绩</div>
        <div class="sp-divider"></div>
        <div class="sp-scoreline">
            <div class="sp-score-side blue">
                <span id="spBlueName">蓝队</span>
                <strong id="spBlueScore">0</strong>
            </div>
            <span class="sp-score-separator">:</span>
            <div class="sp-score-side red">
                <strong id="spRedScore">0</strong>
                <span id="spRedName">红队</span>
            </div>
        </div>
        <div class="sp-table-head">
            <span>玩家</span>
            <span>击杀</span>
            <span>死亡</span>
        </div>
        <div id="spPlayerRows" class="sp-player-rows"></div>
        <div class="sp-hint">按住 TAB 显示 · 松开关闭</div>
    </div>

    <div id="throwCountdown" class="throw-countdown">
        <span class="throw-cd-icon" id="throwCountdownIcon">💨</span>
        <span class="throw-cd-label" id="throwCountdownLabel">烟雾倒计时</span>
        <span class="throw-cd-time" id="throwCountdownTime">5.0s</span>
    </div>

    <div id="hud1" class="hud" style="width:100%; left:0;">
        <div class="scope"><div class="ring"></div><div class="sh"></div><div class="sv"></div></div>
        <div class="dmgflash"></div>
        <div class="cross" id="crosshair">
            <div class="hitmark"></div>
            <span class="ch-line ch-up"></span>
            <span class="ch-line ch-down"></span>
            <span class="ch-line ch-left"></span>
            <span class="ch-line ch-right"></span>
            <span class="ch-dot"></span>
        </div>
        <div class="score">0</div>
        <div class="feed"></div>
        <div class="centermsg"></div>
        <div class="subhint">点击屏幕锁定鼠标 · 左键开火 · 右键切换开镜 · B键换枪 · Enter聊天</div>
        <div class="bottom">
            <div class="hp-armor">
                <span class="hp-val">❤️ HP: <span id="hpText">100</span></span>
                <span class="armor-val">🛡️ 护甲: <span id="armorText">50</span></span>
            </div>
            <div class="ammo">30 <span class="rsv">/ 60</span></div>
        </div>
        <div class="wtag"></div>
    </div>

    <!-- ★ 医疗包进度条（屏幕中间偏下） -->
    <div id="medkitProgress">
        <div class="mk-title">✚ 使用医疗包</div>
        <div class="mk-bar-wrap">
            <div class="mk-bar-fill" id="mkBarFill"></div>
        </div>
        <div class="mk-hint">按住左键 · 松开取消</div>
    </div>

    <div id="damageNumbers"></div> 
    <div id="adsReticle"></div>
    <div id="fpsCounter">-- FPS</div>
    <div id="exitBtn" class="exit-btn">退 出</div>

    <div id="aiToggle" class="ai-toggle" style="display:none;">
        <span class="ai-toggle-icon">🤖</span>
        <span class="ai-toggle-label">AI 操纵</span>
        <span class="ai-toggle-state" id="aiToggleState">开</span>
    </div>

    <div id="opponentInfo">
        <span class="op-dot"></span>
        <span class="op-label">对手</span>
        <span class="op-name" id="opponentName">-</span>
        <span class="op-ping" id="opponentPing">-</span>
    </div>
`);
