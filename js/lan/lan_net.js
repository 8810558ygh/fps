// ===== js/lan/lan_net.js – 局域网 WebSocket 连接 =====

const LANNET = {
    ws: null,
    connected: false,
    connecting: false,
    manualClose: false,
    latency: 0,
    reconnectTimer: 0,
    pingTimer: 0,
    _lastPingAt: 0,

    url() {
        if (location.protocol === 'file:') return null;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}/lan`;
    },

    connect() {
        if (this.connected || this.connecting) return;
        const url = this.url();
        if (!url) {
            this.setStatus('请通过 npm start 启动局域网服务器', false);
            return;
        }

        this.connecting = true;
        this.manualClose = false;
        this.setStatus('正在连接局域网服务器…', false);

        try {
            this.ws = new WebSocket(url);
        } catch {
            this.connecting = false;
            this.scheduleReconnect();
            return;
        }

        this.ws.addEventListener('open', () => {
            this.connected = true;
            this.connecting = false;
            this.setStatus('已连接 · 延迟 -', true);
            this.send({
                type: 'hello',
                name: this.getNickname(),
            });
            this.startPing();
        });

        this.ws.addEventListener('message', event => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            if (data.type === 'pong') {
                this.latency = Math.max(0, Math.round(performance.now() - data.t));
                this.setStatus(`已连接 · 延迟 ${this.latency}ms`, true);
            }
            if (typeof window.LAN_handleMessage === 'function') {
                window.LAN_handleMessage(data);
            }
        });

        this.ws.addEventListener('close', () => {
            this.connected = false;
            this.connecting = false;
            this.stopPing();
            this.setStatus('连接已断开', false);
            if (!this.manualClose) this.scheduleReconnect();
        });

        this.ws.addEventListener('error', () => {
            this.setStatus('无法连接局域网服务器', false);
        });
    },

    disconnect() {
        this.manualClose = true;
        this.stopPing();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            try { this.ws.close(); } catch {}
        }
        this.ws = null;
        this.connected = false;
    },

    scheduleReconnect() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 1500);
    },

    send(message) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch {
            return false;
        }
    },

    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (!this.connected) return;
            this.send({ type: 'ping', t: performance.now() });
        }, 1500);
    },

    stopPing() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = 0;
    },

    getNickname() {
        let name = localStorage.getItem('pvp_nick');
        if (!name) {
            name = '玩家' + Math.floor(1000 + Math.random() * 9000);
            localStorage.setItem('pvp_nick', name);
        }
        return name;
    },

    setStatus(text, online) {
        const el = document.getElementById('lanConnectionState');
        if (el) {
            el.textContent = text;
            el.classList.toggle('online', !!online);
        }
        const ping = document.getElementById('lanRoomPing');
        if (ping && this.latency) ping.textContent = `延迟：${this.latency}ms`;
    },
};

window.LANNET = LANNET;
