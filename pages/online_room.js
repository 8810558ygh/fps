// ===== pages/online_room.js – 联机房间界面 =====
document.write(`
    <div id="onlineLobbyOverlay" class="overlay">
        <div class="online-room-panel">
            <div class="online-room-header">
                <h2>⚔️ 联机对战房间</h2>
                <div class="online-my-role" id="onlineMyRole" style="display:none;">
                    <span class="my-role-label">你：</span>
                    <span class="my-role-value" id="onlineMyRoleValue">-</span>
                </div>
                <div class="room-code-display" id="onlineRoomCode" onclick="copyOnlineRoomCode()" style="display:none;">
                    <span id="onlineRoomCodeText">----</span>
                    <span style="font-size:12px;opacity:.6;margin-left:8px;">点击复制</span>
                </div>
            </div>

            <div id="onlineEntrySection" class="online-entry-section">
                <div class="entry-hint">创建房间或输入房间码加入</div>
                <div class="entry-buttons">
                    <button class="btn online-create-btn" id="onlineCreateBtn">🏮 创 建 房 间</button>
                </div>
                <div class="entry-divider">或</div>
                <div class="online-join-area">
                    <input type="text" id="onlineJoinInput" placeholder="输入房间码" maxlength="8" autocomplete="off" spellcheck="false">
                    <button class="btn online-join-btn" id="onlineJoinBtn">🎋 加 入</button>
                </div>
                <button class="btn online-back-btn" id="onlineBackBtn">← 返 回 大 厅</button>
            </div>

            <div id="onlineRoomSection" style="display:none;">
                <div class="online-seats">
                    <div class="seat-card blue-seat" id="onlineSeatBlue" onclick="chooseOnlineSeat('blue')">
                        <div class="seat-avatar" id="onlineAvatarBlue">+</div>
                        <div class="seat-name" id="onlineNameBlue">空位</div>
                        <div class="seat-label">🔵 蓝方</div>
                        <div class="seat-you-tag" id="onlineYouBlue" style="display:none;">你</div>
                    </div>
                    <div class="seat-vs">VS</div>
                    <div class="seat-card red-seat" id="onlineSeatRed" onclick="chooseOnlineSeat('red')">
                        <div class="seat-avatar" id="onlineAvatarRed">+</div>
                        <div class="seat-name" id="onlineNameRed">空位</div>
                        <div class="seat-label">🔴 红方</div>
                        <div class="seat-you-tag" id="onlineYouRed" style="display:none;">你</div>
                    </div>
                </div>

                <div class="online-spectators">
                    <div class="spectator-title">👁 观战席（3）</div>
                    <div class="spectator-row" id="spectatorRow">
                        <div class="spec-seat" id="specSeat0" onclick="chooseOnlineSeat('spec0')">
                            <div class="spec-name" id="specName0">空位</div>
                            <div class="seat-you-tag" id="onlineYouSpec0" style="display:none;">你</div>
                        </div>
                        <div class="spec-seat" id="specSeat1" onclick="chooseOnlineSeat('spec1')">
                            <div class="spec-name" id="specName1">空位</div>
                            <div class="seat-you-tag" id="onlineYouSpec1" style="display:none;">你</div>
                        </div>
                        <div class="spec-seat" id="specSeat2" onclick="chooseOnlineSeat('spec2')">
                            <div class="spec-name" id="specName2">空位</div>
                            <div class="seat-you-tag" id="onlineYouSpec2" style="display:none;">你</div>
                        </div>
                    </div>
                </div>

                <div class="online-actions">
                    <button class="btn online-start-btn" id="onlineStartBtn" disabled>等待双方入场</button>
                    <button class="btn online-leave-btn" id="onlineLeaveBtn">离 开 房 间</button>
                </div>

                <div class="online-hint" id="onlineHint">-</div>
            </div>
        </div>
    </div>
`);