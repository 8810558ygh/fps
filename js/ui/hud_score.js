// ===== js/hud_score.js – TAB 战绩面板 + AI 开关 + TAB 键绑定 =====
// 从 hud.js 拆出，不改变任何对外接口

// ============================================================
// ★ TAB 战绩面板 DOM 缓存
// ============================================================
const _scorePanelEl  = document.getElementById('scorePanel');
const _spBlueNameEl  = document.getElementById('spBlueName');
const _spRedNameEl   = document.getElementById('spRedName');
const _spBlueScoreEl = document.getElementById('spBlueScore');
const _spRedScoreEl  = document.getElementById('spRedScore');

let _scorePanelVisible = false;

const _spCache = {
    blueName: '',
    redName: '',
    blueScore: -1,
    redScore: -1,
    blueLeading: null,
    redLeading: null,
};

function showScorePanel() {
    if (_scorePanelVisible) return;
    if (!_scorePanelEl) return;
    if (typeof running === 'undefined' || !running) return;
    if (typeof isOver === 'function' && isOver()) return;

    // ★ 生存模式：没有战绩，直接禁用
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

function _getScoreboardData() {
    const isOnline = (typeof gameMode !== 'undefined' && gameMode === 'online'
                      && typeof NET !== 'undefined' && NET.roomId);

    let blueScore = 0, redScore = 0;
    let blueName  = '蓝方', redName = '红方';

    if (isOnline) {
        if (NET.role === 'spectator') {
            const p1IsBlue = (NET.spectatorTarget === 'blue');
            blueScore = p1IsBlue ? p1.score : p2.score;
            redScore  = p1IsBlue ? p2.score : p1.score;
            blueName  = '蓝方';
            redName   = '红方';
        } else {
            const mySeat = NET.mySeat;
            const myName = (typeof NET.getMyName === 'function') ? NET.getMyName() : '你';
            const opName = (typeof NET.getOpponentName === 'function') ? NET.getOpponentName() : '对手';
            if (mySeat === 'blue') {
                blueScore = p1.score;
                redScore  = p2.score;
                blueName  = myName;
                redName   = opName;
            } else {
                blueScore = p2.score;
                redScore  = p1.score;
                blueName  = opName;
                redName   = myName;
            }
        }
    } else {
        blueScore = p1.score;
        redScore  = p2.score;
        if (typeof gameMode !== 'undefined' && gameMode === 'ai') {
            blueName = '你';
            redName  = (typeof aiEnabled !== 'undefined' && !aiEnabled) ? '靶子' : 'AI';
        } else {
            blueName = '蓝方';
            redName  = '红方';
        }
    }

    return { blueScore, redScore, blueName, redName };
}

function _updateScorePanelContent() {
    if (!_scorePanelEl) return;
    const d = _getScoreboardData();

    if (_spCache.blueName !== d.blueName) {
        if (_spBlueNameEl) _spBlueNameEl.textContent = d.blueName;
        _spCache.blueName = d.blueName;
    }
    if (_spCache.redName !== d.redName) {
        if (_spRedNameEl) _spRedNameEl.textContent = d.redName;
        _spCache.redName = d.redName;
    }
    if (_spCache.blueScore !== d.blueScore) {
        if (_spBlueScoreEl) _spBlueScoreEl.textContent = d.blueScore;
        _spCache.blueScore = d.blueScore;
    }
    if (_spCache.redScore !== d.redScore) {
        if (_spRedScoreEl) _spRedScoreEl.textContent = d.redScore;
        _spCache.redScore = d.redScore;
    }

    const blueLead = d.blueScore > d.redScore;
    const redLead  = d.redScore > d.blueScore;
    if (_spCache.blueLeading !== blueLead) {
        if (_spBlueScoreEl) _spBlueScoreEl.classList.toggle('leading', blueLead);
        _spCache.blueLeading = blueLead;
    }
    if (_spCache.redLeading !== redLead) {
        if (_spRedScoreEl) _spRedScoreEl.classList.toggle('leading', redLead);
        _spCache.redLeading = redLead;
    }
}

function _tickScorePanel() {
    if (!_scorePanelVisible) return;
    if (!_scorePanelEl) return;
    if (typeof running === 'undefined' || !running) { hideScorePanel(); return; }
    if (typeof isOver === 'function' && isOver()) { hideScorePanel(); return; }
    // ★ 生存模式：强制关闭
    if (typeof gameMode !== 'undefined' && gameMode === 'survival') { hideScorePanel(); return; }
    _updateScorePanelContent();
}

window.showScorePanel = showScorePanel;
window.hideScorePanel = hideScorePanel;

// ============================================================
// ★ AI 操纵开关（人机对战）
// ============================================================
const _aiToggleEl      = document.getElementById('aiToggle');
const _aiToggleStateEl = document.getElementById('aiToggleState');

function toggleAiEnabled() {
    if (typeof gameMode === 'undefined' || gameMode !== 'ai') return;
    if (typeof running === 'undefined' || !running) return;
    if (typeof isOver === 'function' && isOver()) return;

    aiEnabled = !aiEnabled;

    if (!aiEnabled && typeof p2 !== 'undefined' && p2 && p2.input) {
        p2.input.forward = 0;
        p2.input.right   = 0;
        p2.input.jump    = false;
        p2.input.crouch  = false;
        p2.input.fire    = false;
        p2.input.aim     = false;
    }

    if (typeof audio === 'function') audio();
    if (aiEnabled) {
        if (typeof sPickup === 'function') sPickup(1);
    } else {
        if (typeof sEmpty === 'function') sEmpty(1);
    }

    _updateAiToggleUI();
    _updateScorePanelContent();
}
window.toggleAiEnabled = toggleAiEnabled;

function _updateAiToggleUI() {
    if (!_aiToggleEl) return;

    const shouldShow =
        (typeof gameMode !== 'undefined' && gameMode === 'ai') &&
        typeof running !== 'undefined' && running &&
        !(typeof isOver === 'function' && isOver());

    if (!shouldShow) {
        if (_aiToggleEl.style.display !== 'none') {
            _aiToggleEl.style.display = 'none';
        }
        return;
    }

    if (_aiToggleEl.style.display !== 'flex') {
        _aiToggleEl.style.display = 'flex';
    }

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
    const _handler = (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleAiEnabled();
    };
    _aiToggleEl.addEventListener('click', _handler);
    _aiToggleEl.addEventListener('touchstart', _handler, { passive: false });
}

// ============================================================
// ★ TAB 键绑定
// ============================================================
window.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    if (typeof isChatOpen === 'function' && isChatOpen()) return;
    e.preventDefault();
    showScorePanel();
}, false);

window.addEventListener('keyup', (e) => {
    if (e.code !== 'Tab') return;
    e.preventDefault();
    hideScorePanel();
}, false);

window.addEventListener('blur', hideScorePanel, false);