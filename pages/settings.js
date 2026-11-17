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
                <button class="stab active" data-tab="profile">玩家资料</button>
                <button class="stab" data-tab="crosshair">准星</button>
                <button class="stab" data-tab="sensitivity">灵敏度</button>
                <button class="stab" data-tab="graphics">画面 / 性能</button>
            </div>

            <div class="settings-content">

                <!-- ============ 玩家资料页 ============ -->
                <div class="settings-page" data-page="profile">
                    <div class="settings-page-inner">

                        <div class="settings-section profile-identity-section">
                            <div class="section-title">玩家身份</div>
                            <div class="profile-identity">
                                <div class="profile-avatar" id="profileAvatar">玩</div>
                                <div class="profile-identity-copy">
                                    <label for="profilePlayerId">游戏 ID</label>
                                    <p>联机大厅和战绩记录中显示的名字。修改后会立即同步到当前房间。</p>
                                    <div class="profile-id-row">
                                        <input id="profilePlayerId" class="profile-id-input" type="text"
                                               maxlength="20" autocomplete="off" spellcheck="false"
                                               placeholder="输入你的玩家 ID">
                                        <button id="profileSaveIdBtn" class="profile-save-btn">保存 ID</button>
                                    </div>
                                    <div id="profileSaveStatus" class="profile-save-status"></div>
                                </div>
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="profile-section-head">
                                <div class="section-title">生涯战绩</div>
                                <button id="profileRefreshBtn" class="profile-text-btn">刷新</button>
                            </div>
                            <div class="profile-stat-grid">
                                <div class="profile-stat-card">
                                    <span>比赛</span>
                                    <strong id="profileTotalGames">0</strong>
                                </div>
                                <div class="profile-stat-card">
                                    <span>胜场</span>
                                    <strong id="profileTotalWins">0</strong>
                                </div>
                                <div class="profile-stat-card">
                                    <span>K / D</span>
                                    <strong id="profileKd">0.00</strong>
                                </div>
                                <div class="profile-stat-card">
                                    <span>击杀 / 死亡</span>
                                    <strong id="profileKillsDeaths">0 / 0</strong>
                                </div>
                                <div class="profile-stat-card">
                                    <span>总伤害</span>
                                    <strong id="profileTotalDamage">0</strong>
                                </div>
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="profile-section-head">
                                <div>
                                    <div class="section-title">最近比赛</div>
                                    <p class="profile-section-hint">每场比赛结束后自动保存到本机</p>
                                </div>
                            </div>
                            <div id="profileMatchList" class="profile-match-list">
                                <div class="profile-empty">还没有比赛记录，完成一局局域网对战后会显示在这里。</div>
                            </div>
                        </div>

                        <div class="settings-section profile-storage-section">
                            <div class="section-title">本机资料文件夹</div>
                            <p class="profile-storage-copy">
                                ID、最近战绩和个人资料会自动保存到这个文件夹。升级或重新安装游戏不会删除它。
                            </p>
                            <div class="profile-path-row">
                                <code id="profileDataPath">正在读取…</code>
                                <button id="profileOpenFolderBtn" class="profile-folder-btn">打开文件夹</button>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- ============ 准星页 ============ -->
                <div class="settings-page" data-page="crosshair" style="display:none;">
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
                            <div class="section-title">性能预设</div>

                            <div class="quality-preset-row" id="qualityPresetRow">
                                <button class="quality-btn" data-quality-preset="performance">
                                    <span>性能优先</span>
                                    <small>低分辨率 · 无阴影</small>
                                </button>
                                <button class="quality-btn active" data-quality-preset="balanced">
                                    <span>均衡</span>
                                    <small>推荐大多数设备</small>
                                </button>
                                <button class="quality-btn" data-quality-preset="quality">
                                    <span>画质优先</span>
                                    <small>完整阴影与特效</small>
                                </button>
                            </div>

                            <div class="quality-hint" id="gfxQualityHint">
                                当前：均衡 · 3D 分辨率 90%
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="section-title">联机性能</div>
                            <div class="set-row">
                                <label>联机性能优化</label>
                                <input type="checkbox" id="gfxLanOptimization" class="switch" checked>
                                <span class="set-val">推荐开启</span>
                            </div>
                            <div class="quality-hint">
                                💡 局域网对局时自动使用 65% 渲染并关闭实时阴影，普通模式仍使用上面的画质设置。
                                性能较弱的电脑建议保持开启。
                            </div>
                        </div>

                        <div class="settings-section">
                            <div class="section-title">渲染</div>

                            <div class="set-row">
                                <label>3D 分辨率</label>
                                <input type="range" id="gfxRenderScale" min="50" max="100" step="5" value="90">
                                <span class="set-val" id="gfxRenderScaleVal">90%</span>
                            </div>

                            <div class="set-row">
                                <label>阴影质量</label>
                                <select id="gfxShadowQuality" class="select-control">
                                    <option value="off">关闭</option>
                                    <option value="low">低</option>
                                    <option value="medium" selected>中</option>
                                    <option value="high">高</option>
                                </select>
                                <span class="set-val" id="gfxShadowQualityVal">中</span>
                            </div>

                            <div class="set-row">
                                <label>远景雾距</label>
                                <input type="range" id="gfxFogDistance" min="70" max="150" step="5" value="120">
                                <span class="set-val" id="gfxFogDistanceVal">120 m</span>
                            </div>

                            <div class="set-row">
                                <label>特效密度</label>
                                <input type="range" id="gfxEffectDensity" min="20" max="100" step="5" value="75">
                                <span class="set-val" id="gfxEffectDensityVal">75%</span>
                            </div>

                            <!-- 同屏僵尸上限 -->
                            <div class="set-row">
                                <label>同屏僵尸上限</label>
                                <input type="range" id="gfxZombieMaxAlive" min="5" max="45" step="1" value="16">
                                <span class="set-val" id="gfxZombieMaxAliveVal">16</span>
                            </div>

                            <div class="quality-hint">
                                💡 “3D 分辨率”对帧率影响最大。设置会在下一局加载时用于完整预热，
                                已进入游戏时也可以立即生效。
                            </div>

                        </div>

                    </div>
                </div>

            </div>

        </div>
    </div>
`);
