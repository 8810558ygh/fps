// ===== js/online_ui.js – 联机大厅 UI 事件绑定 =====
(function () {
    function bindUI() {
        const createBtn = document.getElementById('onlineCreateBtn');
        const joinBtn = document.getElementById('onlineJoinBtn');
        const joinInput = document.getElementById('onlineJoinInput');
        const backBtn = document.getElementById('onlineBackBtn');
        const startBtn = document.getElementById('onlineStartBtn');
        const leaveBtn = document.getElementById('onlineLeaveBtn');

        if (createBtn) createBtn.addEventListener('click', () => window._NET_createRoom());
        if (joinBtn) joinBtn.addEventListener('click', () => {
            const code = (joinInput?.value || '').trim().toUpperCase();
            if (!code || code.length < 4) { toast('请输入正确的房间码'); return; }
            window._NET_joinRoom(code);
        });
        if (joinInput) {
            joinInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = joinInput.value.trim().toUpperCase();
                    if (!code || code.length < 4) { toast('请输入正确的房间码'); return; }
                    window._NET_joinRoom(code);
                }
            });
            joinInput.addEventListener('input', () => {
                joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
        }
        if (backBtn) backBtn.addEventListener('click', () => {
            document.getElementById('onlineLobbyOverlay').style.display = 'none';
            document.getElementById('lobbyOverlay').style.display = 'flex';
        });
        if (startBtn) startBtn.addEventListener('click', () => window.onlineStartGame());
        if (leaveBtn) leaveBtn.addEventListener('click', () => window.leaveOnlineRoom());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
    else bindUI();
})();