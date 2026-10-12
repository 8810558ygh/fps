// ===== js/online_net.js – NET 对象 + 状态查询 + 通用工具 =====
// 从 online_core.js 拆出，不改变任何对外接口

const NET = {
    peer: null, isHost: false, myPeerId: null, roomId: null,
    mySeat: null, myName: null, members: new Map(),
    seats: { blue: null, red: null, specs: [null, null, null] },
    connections: new Map(), started: false,
    role: null,
    spectatorTarget: 'blue',
    lastHostState: null,
    hostSeat: null,

    inputSeq: 0,
    pendingWeaponSwitch: null,
    pendingReload: false,
    pendingFuseStart: null,
    pendingFuseRelease: false,
    pendingMelee: false,
    pendingMeleeHeavy: false,

    // ★ 滑索挂载事件：{ lineIdx, t, dir } 或 null
    pendingZiplineMount: null,
    // ★ 滑索脱离事件：true（只清滑索状态，不涉及易伤）
    pendingZiplineDismount: false,
    // ★ 硬直/易伤开始事件：落地时上报
    //   { stunDuration, vulnDuration } 或 null
    pendingVulnerableStart: null,

    tick: 0,

    remotePlayerState: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
        hp: 100, armor: 50, score: 0,
        weapon: 'rifle', ammo: 0, reserve: 0,
        fov: 78, aimStage: 0,
        aiming: false, crouching: false,
        dead: false, visible: true,
        isMelee: false, isSmoke: false, isFlash: false,
        lastUpdate: 0
    },
    ping: 0,

    _heartbeatTimer: null,
    _pingTimer: null,
    _hostBroadcastTimer: null,
    _hostBroadcastRaf: null,
    _assignedPeers: new Set(),
    _lastSentInput: null,
    _lastDrift: 0,
    _lastHardSyncLogTime: 0,
    connType: null
};
window.NET = NET;

// ============================================================
// ★ 统一状态查询接口
// ============================================================
NET.isSpectator = function () {
    return typeof gameMode !== 'undefined'
        && gameMode === 'online'
        && NET.role === 'spectator';
};

NET.isClientPlayer = function () {
    return typeof gameMode !== 'undefined'
        && gameMode === 'online'
        && NET.role === 'player'
        && !NET.isHost;
};

// ============================================================
// 名字工具
// ============================================================
function getMyName() {
    let n = localStorage.getItem('pvp_nick');
    if (!n) {
        const animals = ['猛虎', '狂狮', '猎鹰', '苍狼', '赤蛇', '暴熊', '冰狐', '雷豹', '疾风', '夜枭'];
        const a = animals[Math.floor(Math.random() * animals.length)];
        n = a + '_' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('pvp_nick', n);
    }
    return n;
}

NET.getOpponentName = function () {
    let oppId = null;
    if (NET.mySeat === 'blue') oppId = NET.seats.red;
    else if (NET.mySeat === 'red') oppId = NET.seats.blue;
    else oppId = (NET.seats.blue && NET.seats.blue !== NET.myPeerId) ? NET.seats.blue : NET.seats.red;
    if (!oppId) return '对手';
    const m = NET.members.get(oppId);
    return m ? m.name : '对手';
};
NET.getMyName = function () { return NET.myName || '我'; };

function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

// ============================================================
// Toast 提示
// ============================================================
function toast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    let t = document.getElementById('onlineToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'onlineToast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px;pointer-events:none;transition:opacity .3s';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

// ============================================================
// 对手信息栏
// ============================================================
function updateOpponentInfo() {
    const nameEl = document.getElementById('opponentName');
    const pingEl = document.getElementById('opponentPing');
    if (nameEl) nameEl.textContent = NET.getOpponentName();
    if (pingEl) {
        if (NET.ping <= 0) { pingEl.textContent = '-'; pingEl.classList.remove('warn', 'bad'); }
        else {
            pingEl.textContent = NET.ping + 'ms';
            pingEl.classList.remove('warn', 'bad');
            if (NET.ping > 150) pingEl.classList.add('bad');
            else if (NET.ping > 80) pingEl.classList.add('warn');
        }
    }
}
window.NET_updateOpponentInfo = updateOpponentInfo;

// ============================================================
// 连接类型检测（p2p / relay）
// ============================================================
function detectConnectionType(conn) {
    if (!conn || !conn.peerConnection) return;

    setTimeout(() => {
        const pc = conn.peerConnection;
        if (!pc || typeof pc.getStats !== 'function') return;

        pc.getStats().then(stats => {
            let relay = false, p2p = false, host = false;

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    const local  = stats.get(report.localCandidateId);
                    const remote = stats.get(report.remoteCandidateId);
                    if (!local || !remote) return;

                    if (local.candidateType === 'relay' || remote.candidateType === 'relay') relay = true;
                    else if (local.candidateType === 'srflx' || remote.candidateType === 'srflx') p2p = true;
                    else host = true;
                }
            });

            NET.connType = relay ? 'relay' : (p2p ? 'p2p' : (host ? 'host' : 'unknown'));
            console.log('[NET] 连接类型:', NET.connType);
        }).catch(e => console.warn('[NET] getStats 失败:', e));
    }, 2000);
}
window.detectConnectionType = detectConnectionType;