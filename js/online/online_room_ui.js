// ===== js/online_room_ui.js – 房间 UI 渲染 =====
// 从 online_core.js 拆出，不改变任何对外接口

function setSeatYouTag(elId, show) {
    const el = document.getElementById(elId);
    if (el) el.style.display = show ? 'block' : 'none';
}

function updateMyRoleBadge() {
    const badge = document.getElementById('onlineMyRole');
    const val = document.getElementById('onlineMyRoleValue');
    if (!badge || !val) return;
    if (!NET.roomId) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-flex';
    const seat = NET.mySeat;
    let text = '观战';
    if (seat === 'blue') text = '🔵 蓝方';
    else if (seat === 'red') text = '🔴 红方';
    else if (seat && seat.startsWith('spec')) text = `👁 观众 #${parseInt(seat.slice(4)) + 1}`;
    else text = '未入座（观战）';
    val.textContent = text;
}

function renderRoomUI() {
    const codeText = document.getElementById('onlineRoomCodeText');
    const codeWrap = document.getElementById('onlineRoomCode');
    if (codeText) codeText.textContent = NET.roomId || '----';
    if (codeWrap) codeWrap.style.display = NET.roomId ? 'inline-block' : 'none';

    const entrySec = document.getElementById('onlineEntrySection');
    const roomSec = document.getElementById('onlineRoomSection');
    if (NET.roomId) {
        if (entrySec) entrySec.style.display = 'none';
        if (roomSec) roomSec.style.display = 'block';
    } else {
        if (entrySec) entrySec.style.display = 'block';
        if (roomSec) roomSec.style.display = 'none';
    }

    updateMyRoleBadge();

    const blue = NET.seats.blue;
    const blueCard = document.getElementById('onlineSeatBlue');
    const blueAvatar = document.getElementById('onlineAvatarBlue');
    const blueName = document.getElementById('onlineNameBlue');
    if (blue) {
        const m = NET.members.get(blue) || { name: '玩家' };
        blueCard.classList.add('occupied');
        blueAvatar.textContent = m.name.charAt(0).toUpperCase();
        blueName.textContent = m.name;
        setSeatYouTag('onlineYouBlue', blue === NET.myPeerId);
        if (blue === NET.myPeerId) blueCard.classList.add('is-me');
        else blueCard.classList.remove('is-me');
    } else {
        blueCard.classList.remove('occupied', 'is-me');
        blueAvatar.textContent = '+';
        blueName.textContent = '空位';
        setSeatYouTag('onlineYouBlue', false);
    }

    const red = NET.seats.red;
    const redCard = document.getElementById('onlineSeatRed');
    const redAvatar = document.getElementById('onlineAvatarRed');
    const redName = document.getElementById('onlineNameRed');
    if (red) {
        const m = NET.members.get(red) || { name: '玩家' };
        redCard.classList.add('occupied');
        redAvatar.textContent = m.name.charAt(0).toUpperCase();
        redName.textContent = m.name;
        setSeatYouTag('onlineYouRed', red === NET.myPeerId);
        if (red === NET.myPeerId) redCard.classList.add('is-me');
        else redCard.classList.remove('is-me');
    } else {
        redCard.classList.remove('occupied', 'is-me');
        redAvatar.textContent = '+';
        redName.textContent = '空位';
        setSeatYouTag('onlineYouRed', false);
    }

    for (let i = 0; i < 3; i++) {
        const seatEl = document.getElementById('specSeat' + i);
        const nameEl = document.getElementById('specName' + i);
        const pid = NET.seats.specs[i];
        if (pid) {
            const m = NET.members.get(pid) || { name: '观众' };
            seatEl.classList.add('occupied');
            nameEl.textContent = m.name;
            setSeatYouTag('onlineYouSpec' + i, pid === NET.myPeerId);
            if (pid === NET.myPeerId) seatEl.classList.add('is-me');
            else seatEl.classList.remove('is-me');
        } else {
            seatEl.classList.remove('occupied', 'is-me');
            nameEl.textContent = '空位';
            setSeatYouTag('onlineYouSpec' + i, false);
        }
    }

    const startBtn = document.getElementById('onlineStartBtn');
    if (startBtn) {
        const canStart = NET.isHost && NET.seats.blue && NET.seats.red;
        if (canStart) { startBtn.disabled = false; startBtn.textContent = '开 始 对 战'; }
        else if (!NET.isHost) { startBtn.disabled = true; startBtn.textContent = '等待房主开始'; }
        else { startBtn.disabled = true; startBtn.textContent = '等待双方入场'; }
    }

    const hint = document.getElementById('onlineHint');
    if (hint) {
        if (!NET.isHost) hint.textContent = '你已加入房间，等待房主开始';
        else if (!NET.seats.blue || !NET.seats.red) hint.textContent = '把房间码分享给好友，双方入座后可开始';
        else hint.textContent = '双方就位，点击"开始对战"';
    }
}
window.renderOnlineRoomUI = renderRoomUI;