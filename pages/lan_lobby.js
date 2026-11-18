// ===== pages/lan_lobby.js – 局域网多人房间与团队 HUD =====
document.write(`
    <div id="lanLobbyOverlay">
        <div class="lan-panel">
            <div class="lan-topbar">
                <button id="lanBackBtn" class="lan-back-btn">← 返回大厅</button>
                <div>
                    <div class="lan-title">局 域 网 团 队 战</div>
                    <div class="lan-subtitle">蓝队 vs 红队 · 每队最多 5 人</div>
                </div>
                <div id="lanConnectionState" class="lan-connection">未连接</div>
            </div>

            <div id="lanEntrySection" class="lan-entry">
                <button id="lanCreateBtn" class="lan-primary-btn">创建房间</button>
                <div class="lan-join-row">
                    <input id="lanRoomCodeInput" maxlength="5" placeholder="输入 5 位房间码"
                           autocomplete="off" spellcheck="false">
                    <button id="lanJoinBtn" class="lan-secondary-btn">加入房间</button>
                </div>
                <div id="lanServerHint" class="lan-server-hint">
                    正在准备局域网连接…
                </div>
            </div>

            <div id="lanRoomSection" class="lan-room" style="display:none;">
                <div class="lan-room-head">
                    <div>房间码 <strong id="lanRoomCode">-----</strong></div>
                    <div id="lanRoomMap">地图：战场</div>
                    <div id="lanRoomOwner">房主：-</div>
                    <div id="lanRoomPing">延迟：-</div>
                </div>

                <div id="lanShareInvite" class="lan-share-invite" style="display:none;">
                    <div class="lan-share-copy">
                        <strong>局域网邀请网址</strong>
                        <small>同一个局域网内的玩家打开这个网址，会自动加入当前房间。</small>
                    </div>
                    <div class="lan-share-row">
                        <input id="lanInviteUrl" type="text" readonly>
                        <button id="lanCopyInviteBtn" class="lan-primary-btn" type="button">复制网址</button>
                    </div>
                    <div id="lanAlternateUrls" class="lan-share-alternate"></div>
                </div>

                <div class="lan-teams">
                    <div class="lan-team blue">
                        <div class="lan-team-title">
                            <span>蓝 队</span>
                            <span id="lanBlueCount">0 / 5</span>
                        </div>
                        <div id="lanBlueList" class="lan-player-list"></div>
                    </div>
                    <div class="lan-versus">VS</div>
                    <div class="lan-team red">
                        <div class="lan-team-title">
                            <span>红 队</span>
                            <span id="lanRedCount">0 / 5</span>
                        </div>
                        <div id="lanRedList" class="lan-player-list"></div>
                    </div>
                </div>

                <div class="lan-actions">
                    <button id="lanSwitchBlue" class="lan-secondary-btn">加入蓝队</button>
                    <button id="lanSwitchRed" class="lan-secondary-btn">加入红队</button>
                    <button id="lanReadyBtn" class="lan-primary-btn">准 备</button>
                    <button id="lanStartBtn" class="lan-primary-btn" style="display:none;">开始比赛</button>
                    <button id="lanLeaveRoomBtn" class="lan-danger-btn">离开房间</button>
                </div>
                <div id="lanRoomMessage" class="lan-room-message"></div>
            </div>
        </div>
    </div>

    <div id="lanMatchHud" style="display:none;">
        <div class="lan-score-side blue">
            <span>蓝队</span>
            <strong id="lanBlueScore">0</strong>
            <small id="lanBlueAlive">存活 0</small>
        </div>
        <div class="lan-round-box">
            <div id="lanRoundTimer">准备 5.0s</div>
            <div id="lanRoundNumber">第 1 回合</div>
        </div>
        <div class="lan-score-side red">
            <span>红队</span>
            <strong id="lanRedScore">0</strong>
            <small id="lanRedAlive">存活 0</small>
        </div>
    </div>

    <div id="lanNotice"></div>

    <div id="lanScoreboard">
        <div class="lan-board-head">蓝队 <span id="lanBoardBlueScore">0</span> : <span id="lanBoardRedScore">0</span> 红队</div>
        <div class="lan-board-columns">
            <div>
                <h3>蓝 队</h3>
                <div id="lanBoardBlueList"></div>
            </div>
            <div>
                <h3>红 队</h3>
                <div id="lanBoardRedList"></div>
            </div>
        </div>
    </div>

    <div id="lanEndOverlay" style="display:none;">
        <div class="lan-end-card">
            <div id="lanEndTitle">比赛结束</div>
            <div id="lanEndScore">0 : 0</div>
            <button id="lanReturnRoomBtn">返回房间</button>
        </div>
    </div>
`);
