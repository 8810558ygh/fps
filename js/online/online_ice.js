// ===== js/online_ice.js – ICE 服务器配置 =====
// 从 online_core.js 拆出，不改变任何对外接口

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
        username: 'iVhu6xd1fzssTwtLVCDSl1bfyFR0tbp20zbmIPPG-1i7kl79Iljkr5veYYSlbt2QAAAAAGrKT1d4dWFu',
        credential: '1ed8b33e-c4b9-11f1-8719-42684a6cc554',
        urls: [
            "turn:hk-turn1.xirsys.com:80?transport=udp",
            "turn:hk-turn1.xirsys.com:3478?transport=udp",
            "turn:hk-turn1.xirsys.com:80?transport=tcp",
            "turn:hk-turn1.xirsys.com:3478?transport=tcp",
            "turns:hk-turn1.xirsys.com:443?transport=tcp",
            "turns:hk-turn1.xirsys.com:5349?transport=tcp"
        ]
    }
];