'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DISCOVERY_PORT = 41234;
const DISCOVERY_MAGIC = 'HEROES_DUEL_LAN_V1';
const PROFILE_SCHEMA_VERSION = 1;
const MAX_MATCH_HISTORY = 500;

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;
let discoverySocket = null;
let broadcastSocket = null;
let broadcastTimer = null;
let shuttingDown = false;
let playerDataDirectory = '';
let profileRecord = null;
let matchHistoryRecord = null;
let profileWasCreated = false;

const discoveredRooms = new Map();

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizePlayerId(value) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, 20).join('');
}

function defaultPlayerId() {
  return `玩家${Math.floor(1000 + Math.random() * 9000)}`;
}

function initializePlayerData() {
  const preferredDirectory = process.env.HEROES_DUEL_DATA_DIR
    ? path.resolve(process.env.HEROES_DUEL_DATA_DIR)
    : path.join(app.getPath('documents'), '双雄对决');

  try {
    fs.mkdirSync(preferredDirectory, { recursive: true });
    playerDataDirectory = preferredDirectory;
  } catch (error) {
    console.warn('[profile] documents directory unavailable:', error.message);
    playerDataDirectory = path.join(app.getPath('userData'), 'player-data');
    fs.mkdirSync(playerDataDirectory, { recursive: true });
  }

  const profilePath = path.join(playerDataDirectory, 'profile.json');
  const matchesPath = path.join(playerDataDirectory, 'matches.json');
  const readmePath = path.join(playerDataDirectory, '说明.txt');
  const now = new Date().toISOString();

  let createdProfile = false;
  const loadedProfile = readJsonFile(profilePath, null);
  if (loadedProfile && normalizePlayerId(loadedProfile.playerId)) {
    profileRecord = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      playerKey: String(loadedProfile.playerKey || crypto.randomUUID()),
      playerId: normalizePlayerId(loadedProfile.playerId),
      createdAt: loadedProfile.createdAt || now,
      updatedAt: loadedProfile.updatedAt || now,
    };
  } else {
    createdProfile = true;
    profileRecord = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      playerKey: crypto.randomUUID(),
      playerId: defaultPlayerId(),
      createdAt: now,
      updatedAt: now,
    };
  }
  writeJsonAtomic(profilePath, profileRecord);

  const loadedMatches = readJsonFile(matchesPath, null);
  matchHistoryRecord = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    matches: Array.isArray(loadedMatches?.matches)
      ? loadedMatches.matches.slice(-MAX_MATCH_HISTORY)
      : [],
  };
  writeJsonAtomic(matchesPath, matchHistoryRecord);

  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, [
      '《双雄对决》玩家资料文件夹',
      '',
      'profile.json：玩家 ID 等个人资料。',
      'matches.json：最近的局域网比赛战绩，最多保留 500 场。',
      '',
      '游戏内可在“设置 → 玩家资料”修改 ID 并查看战绩。',
      '升级或重新安装游戏不会自动删除这个文件夹。',
      '关闭游戏后再手动编辑 JSON 文件，避免写入冲突。',
      '',
    ].join('\r\n'), 'utf8');
  }

  return { createdProfile };
}

function playerProfilePayload(isNew = false) {
  return {
    id: profileRecord.playerId,
    playerKey: profileRecord.playerKey,
    directory: playerDataDirectory,
    isNew,
    electron: true,
  };
}

function updatePlayerId(value) {
  const id = normalizePlayerId(value);
  if (!id) return { ok: false, message: '玩家 ID 不能为空' };
  if (id.length > 20) return { ok: false, message: '玩家 ID 不能超过 20 个字符' };
  profileRecord.playerId = id;
  profileRecord.updatedAt = new Date().toISOString();
  writeJsonAtomic(path.join(playerDataDirectory, 'profile.json'), profileRecord);
  return { ok: true, profile: playerProfilePayload(false) };
}

function appendMatchHistory(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, message: '战绩数据无效' };
  }

  const matchId = String(record.matchId || '').slice(0, 80);
  if (matchId && matchHistoryRecord.matches.some(match => match.matchId === matchId)) {
    return { ok: true, duplicate: true };
  }

  const result = ['win', 'loss', 'draw'].includes(record.result)
    ? record.result
    : 'draw';
  const team = ['blue', 'red'].includes(record.team) ? record.team : null;
  const numeric = (value, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : 0;
  };
  const playedAt = Number.isFinite(Date.parse(record.playedAt))
    ? new Date(record.playedAt).toISOString()
    : new Date().toISOString();

  const match = {
    matchId: matchId || crypto.randomUUID(),
    playedAt,
    playerId: normalizePlayerId(record.playerId) || profileRecord.playerId,
    mapId: String(record.mapId || 'unknown').slice(0, 40),
    team,
    result,
    blueScore: numeric(record.blueScore, 999),
    redScore: numeric(record.redScore, 999),
    rounds: numeric(record.rounds, 999),
    kills: numeric(record.kills, 99999),
    deaths: numeric(record.deaths, 99999),
    damage: numeric(record.damage, 99999999),
    durationSeconds: numeric(record.durationSeconds, 86400),
  };

  matchHistoryRecord.matches.push(match);
  matchHistoryRecord.matches = matchHistoryRecord.matches.slice(-MAX_MATCH_HISTORY);
  writeJsonAtomic(path.join(playerDataDirectory, 'matches.json'), matchHistoryRecord);
  return { ok: true, match };
}

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
  profileWasCreated = initializePlayerData().createdProfile;
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
ipcMain.handle('profile:get', () => playerProfilePayload(profileWasCreated));
ipcMain.handle('profile:set-id', (_event, playerId) => updatePlayerId(playerId));
ipcMain.handle('profile:matches', (_event, limit = 20) => {
  const count = Math.max(1, Math.min(100, Number(limit) || 20));
  return {
    directory: playerDataDirectory,
    matches: matchHistoryRecord.matches.slice(-count).reverse(),
  };
});
ipcMain.handle('profile:add-match', (_event, record) => appendMatchHistory(record));
ipcMain.handle('profile:open-folder', async () => {
  const error = await shell.openPath(playerDataDirectory);
  return { ok: !error, message: error || '' };
});

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

