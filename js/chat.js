// ===== js/chat.js – 聊天系统（含透视特殊代码 + 强化嘲讽 + 联机同步） =====

const chat = {
    open: false,
    messages: [],
    maxVisible: 6,
    maxAge: 10000,
    maxLength: 60,
};

// ============================================================
// AI 嘲讽池
// ============================================================

const CHAT_AI_TAUNTS_NORMAL = [
    '菜', '真菜啊', '菜鸡', '菜得抠脚', '就这？', '就这水平？',
    'cb', 'easy', 'EZ Clap', 'GGEZ', 'ez peasy', '太弱了',
    '一般般', '继续啊', '再来', '慢了啊', '你这也叫枪法？',
    '这准星是装饰品吗', '看到人了吗就开枪', '靶子都比你准',
];

const CHAT_AI_TAUNTS_STREAK = [
    '连输两局了哦', '手残吧', '小学生吧', '建议删号重开',
    '打人机都输？', '要不换个游戏？', '你妈生你的时候没给你装手',
    '我闭着眼都能赢', '毫无挑战', '能不能认真点',
    '陪你练枪这么难吗', '辣眼睛', '笑死我了',
    '你键盘是坏的？', '鼠标没电了吧',
];

const CHAT_AI_TAUNTS_DOMINANT = [
    '你还要玩吗？', '这局送分太舒服了', '回去练个十年再来',
    '实在不行就投了吧', '下次别选人机了', '太菜了，我都困了',
    '你确定你在操作？', '要不要我放水？', '这是教学局吗',
    '对面是不是挂机了', '差距有点大啊', '快结束了呢',
];

const CHAT_AI_REPLIES = ['？', '哦', '呵', '。。。', '是吗', '继续', '就这？', '等着', '闭嘴'];

// ============================================================
// 特殊代码
// ============================================================

const XRAY_ON_CMDS = [
    '打开透视', '开透视', '透视开', '透视打开',
    'xray on', 'xray', 'XRAY', 'XrayOn',
];
const XRAY_OFF_CMDS = [
    '关闭透视', '关透视', '透视关', '透视关闭',
    'xray off', 'XrayOff',
];

let aiStreak = 0;
let xrayEnabled = false;

// ============================================================
// DOM 缓存
// ============================================================
let chatMessagesEl = null;
let chatInputEl = null;
let chatBoxEl = null;

// ============================================================
// 初始化
// ============================================================
function initChat() {
    chatMessagesEl = document.getElementById('chatMessages');
    chatInputEl = document.getElementById('chatInput');
    chatBoxEl = document.getElementById('chatBox');
    if (!chatInputEl || !chatMessagesEl) return;

    chatInputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();

        if (e.key === 'Enter') {
            e.preventDefault();
            const raw = chatInputEl.value;
            const text = raw.trim().slice(0, chat.maxLength);

            if (text) {
                if (handleSpecialCommand(text)) {
                    // 特殊代码已处理，不发送
                } else {
                    // 本地显示
                    addChatMessage(1, text);

                    // ★ 联机模式：把消息同步给对手
                    if (typeof gameMode !== 'undefined' && gameMode === 'online'
                        && typeof NET_sendChat === 'function') {
                        NET_sendChat(text);
                    }

                    // 人机模式：AI 概率回应
                    if (typeof gameMode !== 'undefined' && gameMode === 'ai' && running) {
                        if (Math.random() < 0.4) {
                            setTimeout(() => {
                                if (!running) return;
                                const reply = CHAT_AI_REPLIES[Math.floor(Math.random() * CHAT_AI_REPLIES.length)];
                                addChatMessage(2, reply);
                            }, 700 + Math.random() * 900);
                        }
                    }
                }
            }
            closeChat();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeChat();
        }
    });

    chatInputEl.addEventListener('keyup', (e) => e.stopPropagation());
    chatInputEl.addEventListener('keypress', (e) => e.stopPropagation());
    chatInputEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

// ============================================================
// 特殊代码处理
// ============================================================
function handleSpecialCommand(text) {
    const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

    if (XRAY_ON_CMDS.some(c => c.toLowerCase() === t)) {
        xrayEnabled = true;
        addLocalSystemMessage('★ 透视已开启');
        sPickup(1);
        return true;
    }
    if (XRAY_OFF_CMDS.some(c => c.toLowerCase() === t)) {
        xrayEnabled = false;
        applyNormalMaterials();
        addLocalSystemMessage('★ 透视已关闭');
        sEmpty(1);
        return true;
    }
    return false;
}

// ============================================================
// 透视
// ============================================================
function ensureXrayMat(o) {
    if (!o.userData._origMat) o.userData._origMat = o.material;
    if (!o.userData._xrayMat) {
        const m = o.material.clone();
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = true;
        m.opacity = 0.92;
        m.color = new THREE.Color(0xff3355);
        if (m.emissive !== undefined) {
            m.emissive = new THREE.Color(0xff2244);
            m.emissiveIntensity = 0.85;
        }
        o.userData._xrayMat = m;
    }
}

function applyXrayMaterials() {
    if (typeof p2 === 'undefined' || !p2 || !p2.mesh) return;
    p2.mesh.traverse(o => {
        if (!o.isMesh) return;
        ensureXrayMat(o);
        o.material = o.userData._xrayMat;
        o.renderOrder = 9999;
    });
    p2._xrayApplied = true;
}

function applyNormalMaterials() {
    if (typeof p2 === 'undefined' || !p2 || !p2.mesh) return;
    p2.mesh.traverse(o => {
        if (!o.isMesh) return;
        if (o.userData._origMat) o.material = o.userData._origMat;
        o.renderOrder = 0;
    });
    p2._xrayApplied = false;
}

const _xrayEye = new THREE.Vector3();
const _xrayTarget = new THREE.Vector3();
const _xrayDir = new THREE.Vector3();
const _xrayRay = new THREE.Raycaster();

function isOpponentOccluded() {
    if (!p2 || !p2.baseVisible) return false;
    p1.cam.getWorldPosition(_xrayEye);

    const scaleY = p2.height / HEIGHT_STAND;
    const checkPoints = [
        p2.pos.y + 0.95 * scaleY,
        p2.pos.y + 1.62 * scaleY,
    ];

    const targets = wallMeshes.concat(crateMeshes);
    for (const y of checkPoints) {
        _xrayTarget.set(p2.pos.x, y, p2.pos.z);
        _xrayDir.copy(_xrayTarget).sub(_xrayEye);
        const dist = _xrayDir.length();
        if (dist < 0.5) return false;
        _xrayDir.normalize();

        _xrayRay.set(_xrayEye, _xrayDir);
        _xrayRay.near = 0;
        _xrayRay.far = dist - 0.15;

        const hits = _xrayRay.intersectObjects(targets, false);
        if (hits.length === 0) return false;
    }
    return true;
}

function updateXrayVisibility() {
    if (typeof p2 === 'undefined' || !p2 || !p2.mesh) return;

    if (!xrayEnabled) {
        if (p2._xrayApplied) applyNormalMaterials();
        return;
    }
    if (!p2.baseVisible || !p2.mesh.visible) {
        if (p2._xrayApplied) applyNormalMaterials();
        return;
    }

    const occluded = isOpponentOccluded();
    if (occluded && !p2._xrayApplied) applyXrayMaterials();
    else if (!occluded && p2._xrayApplied) applyNormalMaterials();
}

function isXrayOn() { return xrayEnabled; }

// ============================================================
// 聊天 UI
// ============================================================
function openChat() {
    if (chat.open) return;
    if (!chatInputEl) return;
    if (!running || isOver()) return;

    chat.open = true;
    chatInputEl.style.display = 'block';
    chatInputEl.value = '';

    if (document.pointerLockElement) document.exitPointerLock();

    setTimeout(() => {
        if (chat.open) chatInputEl.focus();
    }, 60);
}

function closeChat() {
    if (!chat.open) return;
    chat.open = false;

    if (chatInputEl) {
        chatInputEl.value = '';
        chatInputEl.style.display = 'none';
        chatInputEl.blur();
    }

    if (typeof isTouchDevice !== 'undefined' && !isTouchDevice &&
        running && !isOver() && typeof renderer !== 'undefined') {
        if (document.pointerLockElement !== renderer.domElement) {
            try { renderer.domElement.requestPointerLock(); } catch (err) {}
        }
    }
}

// ============================================================
// 消息管理
// ============================================================
function addChatMessage(fromId, text) {
    if (!text) return;
    const msg = { fromId, text, time: performance.now() };
    chat.messages.push(msg);
    renderChatMessages();

    setTimeout(() => {
        const idx = chat.messages.indexOf(msg);
        if (idx >= 0) {
            chat.messages.splice(idx, 1);
            renderChatMessages();
        }
    }, chat.maxAge);
}

function addLocalSystemMessage(text) {
    const msg = { fromId: 0, text, time: performance.now() };
    chat.messages.push(msg);
    renderChatMessages();

    setTimeout(() => {
        const idx = chat.messages.indexOf(msg);
        if (idx >= 0) {
            chat.messages.splice(idx, 1);
            renderChatMessages();
        }
    }, chat.maxAge);
}

function renderChatMessages() {
    if (!chatMessagesEl) return;
    const visible = chat.messages.slice(-chat.maxVisible);

    // 联机模式：用真名显示对手
    let enemyName = '对手';
    if (typeof gameMode !== 'undefined' && gameMode === 'online'
        && typeof NET !== 'undefined' && NET.getOpponentName) {
        enemyName = NET.getOpponentName();
    }

    chatMessagesEl.innerHTML = visible.map(m => {
        let cls, name;
        if (m.fromId === 0) {
            cls = 'system';
            name = '★';
        } else if (m.fromId === 1) {
            cls = 'self';
            name = '你';
        } else {
            cls = 'enemy';
            name = enemyName;
        }
        const safe = escapeHtml(m.text);
        return `<div class="chat-msg ${cls}"><span class="chat-name">${name}:</span>${safe}</div>`;
    }).join('');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// ============================================================
// AI 嘲讽（只在人机模式触发）
// ============================================================
function aiTaunt() {
    if (typeof gameMode === 'undefined' || gameMode !== 'ai') return;
    if (!running) return;

    aiStreak++;

    setTimeout(() => {
        if (!running) return;
        let pool;
        if (aiStreak >= 4) pool = CHAT_AI_TAUNTS_DOMINANT;
        else if (aiStreak >= 2) pool = CHAT_AI_TAUNTS_STREAK;
        else pool = CHAT_AI_TAUNTS_NORMAL;

        const text = pool[Math.floor(Math.random() * pool.length)];
        addChatMessage(2, text);

        if (aiStreak >= 3 && Math.random() < 0.5) {
            setTimeout(() => {
                if (!running) return;
                const extra = pool[Math.floor(Math.random() * pool.length)];
                if (extra !== text) addChatMessage(2, extra);
            }, 700 + Math.random() * 600);
        }
    }, 900);
}

function resetAiStreakOnPlayerKill() {
    aiStreak = 0;
}

// ============================================================
// 清空
// ============================================================
function clearChat() {
    chat.messages.length = 0;
    renderChatMessages();
    closeChat();
    aiStreak = 0;
    if (xrayEnabled) {
        xrayEnabled = false;
        applyNormalMaterials();
    }
}

// ============================================================
// 暴露
// ============================================================
window.addChatMessage = addChatMessage;
window.aiTaunt = aiTaunt;
window.openChat = openChat;
window.closeChat = closeChat;
window.clearChat = clearChat;
window.isChatOpen = () => chat.open;
window.isXrayOn = isXrayOn;
window.resetAiStreakOnPlayerKill = resetAiStreakOnPlayerKill;
window.updateXrayVisibility = updateXrayVisibility;
window.renderChatMessages = renderChatMessages;

// 启动
initChat();