// ===== pages/settings.js – 全屏设置页 =====
document.write(`
    <div id="settingsOverlay" style="display:none;">
        <div class="settings-page-wrap">

            <div class="settings-topbar">
                <button id="settingsCloseBtn" class="settings-back-btn">
                    <span class="arrow">←</span>
                    <span>返 回</span>
                </button>
                <h1 class="settings-title">⚙ 设 置</h1>
                <button id="settingsResetBtn" class="settings-reset-btn">恢复默认</button>
            </div>

            <div class="settings-tabs" id="settingsTabs">
                <button class="stab active" data-tab="crosshair">准星</button>
                <button class="stab" data-tab="sensitivity">灵敏度</button>
                <button class="stab" data-tab="graphics">画面</button>
            </div>

            <div class="settings-content">

                <!-- ============ 准星页 ============ -->
                <div class="settings-page" data-page="crosshair">
                    <div class="settings-page-inner">

                        <div class="settings-section">
                            <div class="section-title">预览</div>
                            <div class="ch-preview-box">
                                <div class="ch-preview">
                                    <span class="ch-line ch-up"></span>
                                    <span class="ch-line ch-down"></span>
                                    <span class="ch-line ch-left"></span>
                                    <span class="ch-line ch-right"></span>
                                    <span class="ch-dot"></span>
                                </div>
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="section-title">外观</div>

                            <div class="set-row">
                                <label>颜色</label>
                                <div class="color-wrap">
                                    <button class="swatch" data-color="#ffffff" style="--c:#ffffff"></button>
                                    <button class="swatch" data-color="#00ff88" style="--c:#00ff88"></button>
                                    <button class="swatch" data-color="#ff3355" style="--c:#ff3355"></button>
                                    <button class="swatch" data-color="#00e5ff" style="--c:#00e5ff"></button>
                                    <button class="swatch" data-color="#ffd24a" style="--c:#ffd24a"></button>
                                    <input type="color" id="chColor" value="#ffffff">
                                </div>
                            </div>

                            <div class="set-row">
                                <label>中心点</label>
                                <input type="range" id="chDot" min="0" max="8" step="1" value="4">
                                <span class="set-val" id="chDotVal">4 px</span>
                            </div>
                            <div class="set-row">
                                <label>长度</label>
                                <input type="range" id="chLen" min="0" max="24" step="1" value="13">
                                <span class="set-val" id="chLenVal">13 px</span>
                            </div>
                            <div class="set-row">
                                <label>粗细</label>
                                <input type="range" id="chThick" min="1" max="6" step="1" value="2">
                                <span class="set-val" id="chThickVal">2 px</span>
                            </div>
                            <div class="set-row">
                                <label>间隙</label>
                                <input type="range" id="chGap" min="0" max="16" step="1" value="0">
                                <span class="set-val" id="chGapVal">0 px</span>
                            </div>
                            <div class="set-row">
                                <label>透明度</label>
                                <input type="range" id="chOpacity" min="10" max="100" step="5" value="95">
                                <span class="set-val" id="chOpacityVal">0.95</span>
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="section-title">描边</div>

                            <div class="set-row">
                                <label>黑色描边</label>
                                <input type="checkbox" id="chOutline" class="switch">
                                <span class="set-val">增强可见性</span>
                            </div>
                            <div class="set-row">
                                <label>描边厚度</label>
                                <input type="range" id="chOutlineThick" min="1" max="3" step="1" value="1">
                                <span class="set-val" id="chOutlineThickVal">1 px</span>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- ============ 灵敏度页 ============ -->
                <div class="settings-page" data-page="sensitivity" style="display:none;">
                    <div class="settings-page-inner">

                        <div class="settings-section">
                            <div class="section-title">鼠标</div>

                            <div class="set-row">
                                <label>灵敏度</label>
                                <input type="range" id="sensMouse" min="1" max="100" step="1" value="22">
                                <span class="set-val" id="sensMouseVal">22</span>
                            </div>
                            <div class="set-row">
                                <label>开镜倍率</label>
                                <input type="range" id="sensAds" min="30" max="200" step="5" value="100">
                                <span class="set-val" id="sensAdsVal">1.00×</span>
                            </div>
                            <div class="set-row">
                                <label>垂直倍率</label>
                                <input type="range" id="sensVert" min="50" max="200" step="5" value="100">
                                <span class="set-val" id="sensVertVal">1.00×</span>
                            </div>
                            <div class="set-row">
                                <label>反转 Y 轴</label>
                                <input type="checkbox" id="sensInvertY" class="switch">
                                <span class="set-val">上下颠倒</span>
                            </div>
                        </div>

                        <div class="settings-section" id="touchSection" style="display:none;">
                            <div class="section-title">触屏</div>

                            <div class="set-row" id="touchRow">
                                <label>触摸灵敏度</label>
                                <input type="range" id="sensTouch" min="1" max="100" step="1" value="60">
                                <span class="set-val" id="sensTouchVal">60</span>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- ============ 画面页 ============ -->
                <div class="settings-page" data-page="graphics" style="display:none;">
                    <div class="settings-page-inner">

                        <div class="settings-section">
                            <div class="section-title">画质</div>

                            <div class="set-row">
                                <label>阴影</label>
                                <input type="checkbox" id="gfxShadows" class="switch" checked>
                                <span class="set-val" id="gfxShadowsVal">开</span>
                            </div>

                            <div style="
                                margin-top: 10px;
                                padding: 10px 14px;
                                background: rgba(255, 210, 74, 0.06);
                                border-left: 3px solid rgba(255, 210, 74, 0.6);
                                border-radius: 6px;
                                font-size: 12px;
                                color: #9fb2c8;
                                line-height: 1.7;
                                letter-spacing: 0.5px;
                            ">
                                💡 关闭阴影可显著提升低端设备的帧率。<br>
                                关闭后场景中所有物体将不再投射或接收阴影。
                            </div>

                        </div>

                    </div>
                </div>

            </div>

        </div>
    </div>
`);