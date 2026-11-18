// ===== js/ui/hud_score.js – TAB 战绩面板 + AI 开关 + TAB 键绑定 =====

// ============================================================
// TAB 战绩面板
// ============================================================
const _scorePanelEl = document.getElementById('scorePanel');
const _spBlueNameEl = document.getElementById('spBlueName');
const _spRedNameEl = document.getElementById('spRedName');
const _spBlueScoreEl = document.getElementById('spBlueScore');
const _spRedScoreEl = document.getElementById('spRedScore');
const _spPlayerRowsEl = document.getElementById('spPlayerRows');

let _scorePanelVisible = false;

const _spCache = {
    blueScore: -1,
    redScore: -1,
    blueLeading: null,
    redLeading: null,
    rowsKey: '',
};

function showScorePanel() {
    if (_scorePanelVisible || !_scorePanelEl) return;
    if (typeof running === 'undefined' || !running) return;
    if (typeof isOver === 'function' && isOver()) return;
    if (typeof gameMode !== 'undefined' && gameMode === 'survival') return;

    _scorePanelVisible = true;
    _scorePanelEl.classList.add('visible');
    _updateScorePanelContent();
}

function hideScorePanel() {
    if (!_scorePanelVisible) return;
    _scorePanelVisible = false;
    if (_scorePanelEl) _scorePanelEl.classList.remove('visible');
}

function _finishScoreboardData(blueScore, redScore, rows) {
    rows.sort((a, b) => (
        (b.kills - a.kills)
        || (a.deaths - b.deaths)
        || a.name.localeCompare(b.name, 'zh-CN')
    ));
    return {
        blueScore: Number(blueScore) || 0,
        redScore: Number(redScore) || 0,
        blueName: '蓝队',
        redName: '红队',
        rows,
    };
}

function _getScoreboardData() {
    if (typeof gameMode !== 'undefined' && gameMode === 'lan') {
        const blueScore = Number(LAN.blueScore) || 0;
        const redScore = Number(LAN.redScore) || 0;
        let rows = Array.from(LAN.playerStates.values()).map(state => ({
            id: state.id,
            name: state.name || '玩家',
            team: state.team === 'red' ? 'red' : 'blue',
            kills: Number(state.kills) || 0,
            deaths: Number(state.deaths) || 0,
            alive: state.alive !== false && state.connected !== false,
            disconnected: state.connected === false,
            self: state.id === LAN.selfId,
        }));

        if (rows.length === 0 && LAN.room && Array.isArray(LAN.room.players)) {
            rows = LAN.room.players.map(player => ({
                id: player.id,
                name: player.name || '玩家',
                team: player.team === 'red' ? 'red' : 'blue',
                kills: 0,
                deaths: 0,
                alive: player.connected !== false,
                disconnected: player.connected === false,
                self: player.id === LAN.selfId,
            }));
        }
        return _finishScoreboardData(blueScore, redScore, rows);
    }

    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.roomId);

    if (isOnline) {
        const p1IsBlue = NET.role === 'spectator'
            ? NET.spectatorTarget === 'blue'
            : NET.mySeat !== 'red';
        const blueScore = p1IsBlue ? (p1.score || 0) : (p2.score || 0);
        const redScore = p1IsBlue ? (p2.score || 0) : (p1.score || 0);
        const blueId = NET.seats?.blue;
        const redId = NET.seats?.red;
        const blueMember = NET.members?.get(blueId);
        const redMember = NET.members?.get(redId);

        return _finishScoreboardData(blueScore, redScore, [
            {
                id: blueId || 'blue',
                name: blueMember?.name || '蓝方玩家',
                team: 'blue',
                kills: blueScore,
                deaths: redScore,
                alive: true,
                self: NET.role !== 'spectator' && NET.mySeat === 'blue',
            },
            {
                id: redId || 'red',
                name: redMember?.name || '红方玩家',
                team: 'red',
                kills: redScore,
                deaths: blueScore,
                alive: true,
                self: NET.role !== 'spectator' && NET.mySeat === 'red',
            },
        ]);
    }

    const blueScore = p1.score || 0;
    const redScore = p2.score || 0;
    const selfName = typeof window.PROFILE_GetId === 'function'
        ? window.PROFILE_GetId()
        : '你';
    const opponentName = (typeof gameMode !== 'undefined' && gameMode === 'ai')
        ? ((typeof aiEnabled !== 'undefined' && !aiEnabled) ? '靶子' : 'AI')
        : '红方玩家';

    return _finishScoreboardData(blueScore, redScore, [
        {
            id: 'p1',
            name: selfName,
            team: 'blue',
            kills: blueScore,
            deaths: redScore,
            alive: p1.deadUntil !== Infinity,
            self: true,
        },
        {
            id: 'p2',
            name: opponentName,
            team: 'red',
            kills: redScore,
            deaths: blueScore,
            alive: p2.deadUntil !== Infinity,
            self: false,
        },
    ]);
}

function _updateScorePanelContent() {
    if (!_scorePanelEl) return;
    const data = _getScoreboardData();

    if (_spBlueNameEl) _spBlueNameEl.textContent = data.blueName;
    if (_spRedNameEl) _spRedNameEl.textContent = data.redName;

    if (_spCache.blueScore !== data.blueScore) {
        if (_spBlueScoreEl) _spBlueScoreEl.textContent = data.blueScore;
        _spCache.blueScore = data.blueScore;
    }
    if (_spCache.redScore !== data.redScore) {
        if (_spRedScoreEl) _spRedScoreEl.textContent = data.redScore;
        _spCache.redScore = data.redScore;
    }

    const blueLead = data.blueScore > data.redScore;
    const redLead = data.redScore > data.blueScore;
    if (_spCache.blueLeading !== blueLead) {
        if (_spBlueScoreEl) _spBlueScoreEl.classList.toggle('leading', blueLead);
        _spCache.blueLeading = blueLead;
    }
    if (_spCache.redLeading !== redLead) {
        if (_spRedScoreEl) _spRedScoreEl.classList.toggle('leading', redLead);
        _spCache.redLeading = redLead;
    }

    const rowsKey = data.rows.map(row => (
        `${row.id}|${row.name}|${row.team}|${row.kills}|${row.deaths}|${row.alive}|${row.self}`
    )).join(';');
    if (rowsKey === _spCache.rowsKey || !_spPlayerRowsEl) return;
    _spCache.rowsKey = rowsKey;
    _spPlayerRowsEl.replaceChildren();

    for (const player of data.rows) {
        const row = document.createElement('div');
        row.className = 'sp-player-row'
            + (player.self ? ' self' : '')
                + (player.alive ? '' : ' dead')
                + (player.disconnected ? ' disconnected' : '');

        const name = document.createElement('span');
        name.className = 'sp-player-name';
        const team = document.createElement('i');
        team.className = `sp-team-mark ${player.team}`;
        team.textContent = player.team === 'red' ? '红' : '蓝';
        const nameText = document.createElement('span');
        nameText.textContent = player.name;
        name.append(team, nameText);

        const kills = document.createElement('strong');
        kills.className = 'sp-kills';
        kills.textContent = player.kills;

        const deaths = document.createElement('strong');
        deaths.className = 'sp-deaths';
        deaths.textContent = player.deaths;

        row.append(name, kills, deaths);
        _spPlayerRowsEl.appendChild(row);
    }
}

function _tickScorePanel() {
    if (!_scorePanelVisible || !_scorePanelEl) return;
    if (typeof running === 'undefined' || !running) {
        hideScorePanel();
        return;
    }
    if (typeof isOver === 'function' && isOver()) {
        hideScorePanel();
        return;
    }
    if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
        hideScorePanel();
        return;
    }
    _updateScorePanelContent();
}

window.showScorePanel = showScorePanel;
window.hideScorePanel = hideScorePanel;

// ============================================================
// AI 操纵开关（人机对战）
// ============================================================
const _aiToggleEl = document.getElementById('aiToggle');
const _aiToggleStateEl = document.getElementById('aiToggleState');

function toggleAiEnabled() {
    if (typeof gameMode === 'undefined' || gameMode !== 'ai') return;
    if (typeof running === 'undefined' || !running) return;
    if (typeof isOver === 'function' && isOver()) return;

    aiEnabled = !aiEnabled;

    if (!aiEnabled && typeof p2 !== 'undefined' && p2 && p2.input) {
        p2.input.forward = 0;
        p2.input.right = 0;
        p2.input.jump = false;
        p2.input.crouch = false;
        p2.input.fire = false;
        p2.input.aim = false;
    }

    if (typeof audio === 'function') audio();
    if (aiEnabled) {
        if (typeof sPickup === 'function') sPickup(1);
    } else if (typeof sEmpty === 'function') {
        sEmpty(1);
    }

    _updateAiToggleUI();
    _updateScorePanelContent();
}
window.toggleAiEnabled = toggleAiEnabled;

function _updateAiToggleUI() {
    if (!_aiToggleEl) return;

    const shouldShow = (typeof gameMode !== 'undefined' && gameMode === 'ai')
        && typeof running !== 'undefined' && running
        && !(typeof isOver === 'function' && isOver());

    if (!shouldShow) {
        if (_aiToggleEl.style.display !== 'none') _aiToggleEl.style.display = 'none';
        return;
    }

    if (_aiToggleEl.style.display !== 'flex') _aiToggleEl.style.display = 'flex';

    if (aiEnabled) {
        _aiToggleEl.classList.add('on');
        _aiToggleEl.classList.remove('off');
        if (_aiToggleStateEl) _aiToggleStateEl.textContent = '开';
    } else {
        _aiToggleEl.classList.add('off');
        _aiToggleEl.classList.remove('on');
        if (_aiToggleStateEl) _aiToggleStateEl.textContent = '关（靶子）';
    }
}

if (_aiToggleEl) {
    const handler = (event) => {
        event.stopPropagation();
        event.preventDefault();
        toggleAiEnabled();
    };
    _aiToggleEl.addEventListener('click', handler);
    _aiToggleEl.addEventListener('touchstart', handler, { passive: false });
}

// ============================================================
// TAB 键绑定
// ============================================================
window.addEventListener('keydown', (event) => {
    if (event.code !== 'Tab') return;
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    event.preventDefault();
    showScorePanel();
}, false);

window.addEventListener('keyup', (event) => {
    if (event.code !== 'Tab') return;
    event.preventDefault();
    hideScorePanel();
}, false);

window.addEventListener('blur', hideScorePanel, false);
