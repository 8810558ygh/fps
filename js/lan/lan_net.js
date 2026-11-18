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
    currentUrl: null,
    _connectWaiters: [],

    url() {
        if (location.protocol === 'file:') return null;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}/lan`;
    },

    connect(urlOverride) {
        const url = urlOverride || this.currentUrl || this.url();
        if (this.connected && this.currentUrl === url) return Promise.resolve(true);
        if (this.connecting && this.currentUrl === url) {
            return new Promise(resolve => this._connectWaiters.push(resolve));
        }
        if (!url) {
            this.setStatus('请通过 npm start 启动局域网服务器', false);
            return Promise.resolve(false);
        }

        this.currentUrl = url;
        this.connecting = true;
        this.manualClose = false;
        this.setStatus('正在连接局域网服务器…', false);

        try {
            this.ws = new WebSocket(url);
        } catch {
            this.connecting = false;
            this.scheduleReconnect();
            return Promise.resolve(false);
        }

        const socket = this.ws;
        socket.addEventListener('open', () => {
            if (this.ws !== socket) return;
            this.connected = true;
            this.connecting = false;
            this.setStatus('已连接 · 延迟 -', true);
            this.send({
                type: 'hello',
                name: this.getNickname(),
            });
            this.startPing();
            const waiters = this._connectWaiters.splice(0);
            waiters.forEach(resolve => resolve(true));
        });

        socket.addEventListener('message', event => {
            if (this.ws !== socket) return;
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

        socket.addEventListener('close', event => {
            if (this.ws !== socket) return;
            this.connected = false;
            this.connecting = false;
            this.stopPing();
            this.setStatus('连接已断开', false);
            if (!this.manualClose) {
                window.dispatchEvent(new CustomEvent('lan-connection-lost', {
                    detail: {
                        code: event.code,
                        reason: event.reason || '',
                        url: this.currentUrl,
                    },
                }));
            }
            if (!this.manualClose) this.scheduleReconnect();
            const waiters = this._connectWaiters.splice(0);
            waiters.forEach(resolve => resolve(false));
        });

        socket.addEventListener('error', () => {
            if (this.ws !== socket) return;
            this.setStatus('无法连接局域网服务器', false);
        });
        return new Promise(resolve => this._connectWaiters.push(resolve));
    },

    async connectToRoom(code, timeoutMs = 4000) {
        if (!window.electronAPI || typeof window.electronAPI.resolveRoom !== 'function') {
            return true;
        }

        const startedAt = performance.now();
        let endpoint = null;
        while (!endpoint && performance.now() - startedAt < timeoutMs) {
            endpoint = await window.electronAPI.resolveRoom(code);
            if (!endpoint) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        if (!endpoint || !endpoint.wsUrl) return false;
        if (this.connected && this.currentUrl === endpoint.wsUrl) return true;

        const oldSocket = this.ws;
        this.manualClose = true;
        this.connected = false;
        this.connecting = false;
        this.stopPing();
        this.ws = null;
        if (oldSocket) {
            try { oldSocket.close(); } catch {}
        }
        this.manualClose = false;
        return this.connect(endpoint.wsUrl);
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
        this.reconnectTimer = setTimeout(() => this.connect(this.currentUrl), 1500);
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
        let name = typeof window.PROFILE_GetId === 'function'
            ? window.PROFILE_GetId()
            : localStorage.getItem('pvp_nick');
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
