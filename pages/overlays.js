// ===== pages/overlays.js – 结算 / 武器面板 / 加载页 =====
document.write(`
    <div id="endOverlay" class="overlay">
        <h1 id="endTitle"><span class="b">蓝色</span>玩家获胜！</h1>
        <div class="finalscore" id="endScore">10 : 9</div>
        <button class="btn" id="againBtn">再 来 一 局</button>
    </div>

    <div id="weaponPanel" class="overlay" style="display:none; background:rgba(0,0,0,0.75); z-index:60; justify-content:center; align-items:center;">
        <div style="background:#1a2533; padding:30px 40px; border-radius:12px; border:1px solid #3a4a5e; text-align:center; max-width: 92vw;">
            <h2 style="color:#ffd24a; margin-bottom:20px;">选择武器（准备阶段限定）</h2>
            <div style="display:flex; gap:20px; flex-wrap:wrap; justify-content:center;">
                <button class="weapon-btn" data-weapon="rifle" style="padding:12px 30px; background:#2a3a4a; border:1px solid #5a7a9a; border-radius:8px; color:#fff; font-size:18px; cursor:pointer;">
                    <div>狂徒</div><div style="font-size:12px; color:#9ab;">25发 · 高伤</div>
                </button>
                <button class="weapon-btn" data-weapon="sniper" style="padding:12px 30px; background:#2a3a4a; border:1px solid #5a7a9a; border-radius:8px; color:#fff; font-size:18px; cursor:pointer;">
                    <div>冥驹</div><div style="font-size:12px; color:#9ab;">5发 · 一枪致命</div>
                </button>
                <button class="weapon-btn" data-weapon="shotgun" style="padding:12px 30px; background:#2a3a4a; border:1px solid #5a7a9a; border-radius:8px; color:#fff; font-size:18px; cursor:pointer;">
                    <div>判官</div><div style="font-size:12px; color:#9ab;">5发 · 散射</div>
                </button>
                <button class="weapon-btn" data-weapon="odin" style="padding:12px 30px; background:#2a3a4a; border:1px solid #5a7a9a; border-radius:8px; color:#fff; font-size:18px; cursor:pointer;">
                    <div>奥丁</div><div style="font-size:12px; color:#9ab;">100发 · 越打越快</div>
                </button>
            </div>
            <button id="weaponCloseBtn" style="margin-top:22px; padding:10px 34px; background:#2a3a4a; border:1px solid #5a7a9a; border-radius:8px; color:#fff; font-size:16px; cursor:pointer;">关 闭</button>
            <div style="margin-top:10px; color:#8a9aaa; font-size:14px;">按 <kbd>B</kbd> 键关闭</div>
        </div>
    </div>

    <div id="loadingOverlay" style="display:none;">
        <div class="loading-panel">
            <div class="loading-title">正在载入</div>
            <div class="loading-bar-wrap">
                <div class="loading-bar" id="loadingBar"></div>
            </div>
            <div class="loading-percent" id="loadingPercent">0%</div>
            <div class="loading-status" id="loadingStatus">准备中...</div>
            <div class="loading-players" id="loadingPlayers" style="display:none;"></div>
        </div>
    </div>
`);