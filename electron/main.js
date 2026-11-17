'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const http = require('http');
const { spawn } = require('child_process');

const DISCOVERY_PORT = 41234;
const DISCOVERY_MAGIC = 'HEROES_DUEL_LAN_V1';

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;
let discoverySocket = null;
let broadcastSocket = null;
let broadcastTimer = null;
let shuttingDown = false;

const discoveredRooms = new Map();

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function waitForHealth(port, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (shuttingDown) return reject(new Error('Application is closing'));
      const req = http.get({
        host: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: 1000,
      }, res => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('timeout', () => req.destroy());
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Embedded server did not start'));
        return;
      }
      setTimeout(check, 150);
    };
    check();
  });
}

async function startEmbeddedServer() {
  serverPort = await findFreePort();
  const appRoot = app.getAppPath();
  const serverScript = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'index.js')
    : path.join(appRoot, 'server', 'index.js');

  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(serverPort),
      HEROES_DUEL_ROOT: appRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', data => {
    console.log('[embedded-server]', data.toString().trim());
  });
  serverProcess.stderr.on('data', data => {
    console.error('[embedded-server]', data.toString().trim());
  });
  serverProcess.on('exit', () => {
    serverProcess = null;
  });

  await waitForHealth(serverPort);
}

function localEndpoint() {
  return {
    httpUrl: `http://127.0.0.1:${serverPort}`,
    wsUrl: `ws://127.0.0.1:${serverPort}/lan`,
    local: true,
  };
}

function setupDiscovery() {
  discoveredRooms.set('__local_info__', localEndpoint());

  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discoverySocket.on('message', (buffer, rinfo) => {
    let data;
    try {
      data = JSON.parse(buffer.toString('utf8'));
    } catch {
      return;
    }
    if (!data || data.magic !== DISCOVERY_MAGIC || !Array.isArray(data.codes)) return;
    const endpoint = {
      httpUrl: `http://${rinfo.address}:${data.port}`,
      wsUrl: `ws://${rinfo.address}:${data.port}/lan`,
      local: rinfo.address === '127.0.0.1',
      lastSeen: Date.now(),
    };
    for (const code of data.codes) {
      if (typeof code === 'string') discoveredRooms.set(code, endpoint);
    }
  });
  discoverySocket.on('error', error => {
    console.warn('[discovery] socket error:', error.message);
  });
  discoverySocket.bind(DISCOVERY_PORT);

  broadcastSocket = dgram.createSocket('udp4');
  broadcastSocket.bind(() => {
    try { broadcastSocket.setBroadcast(true); } catch {}
  });

  const pollRooms = () => {
    if (shuttingDown) return;
    const req = http.get({
      host: '127.0.0.1',
      port: serverPort,
      path: '/api/rooms',
      timeout: 1000,
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const { rooms } = JSON.parse(body);
          const codes = (rooms || []).map(room => room.code);
          for (const room of rooms || []) {
            discoveredRooms.set(room.code, localEndpoint());
          }
          if (codes.length > 0 && broadcastSocket) {
            const packet = Buffer.from(JSON.stringify({
              magic: DISCOVERY_MAGIC,
              port: serverPort,
              codes,
            }));
            broadcastSocket.send(packet, 0, packet.length, DISCOVERY_PORT, '255.255.255.255', () => {});
          }
        } catch {}
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => {});
  };
  pollRooms();
  broadcastTimer = setInterval(pollRooms, 700);
}

function resolveRoom(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const endpoint = discoveredRooms.get(normalized);
  if (!endpoint) return null;
  if (endpoint.lastSeen && Date.now() - endpoint.lastSeen > 5000) {
    discoveredRooms.delete(normalized);
    return null;
  }
  return { ...endpoint };
}

async function createWindow() {
  await startEmbeddedServer();
  setupDiscovery();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#07111c',
    title: '双雄对决',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('lan:resolve-room', (_event, code) => resolveRoom(code));
ipcMain.handle('lan:local-info', () => localEndpoint());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch(error => {
    console.error('[electron] startup failed:', error);
    app.quit();
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(broadcastTimer);
  try { discoverySocket?.close(); } catch {}
  try { broadcastSocket?.close(); } catch {}
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
}

app.on('before-quit', shutdown);
app.on('window-all-closed', () => {
  app.quit();
});

