'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const executable = path.join(__dirname, 'dist', 'win-unpacked', '双雄对决.exe');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heroes-duel-e2e-'));
const processes = [];
const sockets = [];
const clients = [];
const dataDirectories = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs, label) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

async function pageTarget(port) {
  return waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    return targets.find(target => target.type === 'page');
  }, 30000, `DevTools page on ${port}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    sockets.push(this.socket);
    clients.push(this);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }
    return result.result.value;
  }
}

async function waitForPageExpression(client, expression, timeoutMs, label) {
  return waitFor(() => client.evaluate(`Boolean(${expression})`), timeoutMs, label);
}

function launch(name, port) {
  const userData = path.join(tempRoot, name);
  const playerData = path.join(tempRoot, `${name}-player-data`);
  dataDirectories.set(name, playerData);
  const child = spawn(executable, [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
  ], {
    cwd: __dirname,
    env: {
      ...process.env,
      HEROES_DUEL_DATA_DIR: playerData,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  processes.push(child);
  return child;
}

async function main() {
  if (!fs.existsSync(executable)) {
    throw new Error(`Packaged executable not found: ${executable}`);
  }

  launch('host', 9331);
  launch('joiner', 9332);

  const hostTarget = await pageTarget(9331);
  const joinerTarget = await pageTarget(9332);
  const host = new CdpClient(hostTarget.webSocketDebuggerUrl);
  const joiner = new CdpClient(joinerTarget.webSocketDebuggerUrl);
  await Promise.all([host.open(), joiner.open()]);
  await Promise.all([
    host.call('Runtime.enable'),
    joiner.call('Runtime.enable'),
  ]);

  await Promise.all([
    waitForPageExpression(host, 'window.LANNET && window.LAN && window.electronAPI', 20000, 'host game scripts'),
    waitForPageExpression(joiner, 'window.LANNET && window.LAN && window.electronAPI', 20000, 'joiner game scripts'),
  ]);
  await Promise.all([
    waitForPageExpression(host, 'window.PROFILE && PROFILE.ready', 10000, 'host profile'),
    waitForPageExpression(joiner, 'window.PROFILE && PROFILE.ready', 10000, 'joiner profile'),
  ]);

  await host.evaluate(`
    SETTINGS_Open();
    document.getElementById('profilePlayerId').value = '测试玩家A';
    document.getElementById('profileSaveIdBtn').click();
    true;
  `);
  await joiner.evaluate(`
    SETTINGS_Open();
    document.getElementById('profilePlayerId').value = '测试玩家B';
    document.getElementById('profileSaveIdBtn').click();
    true;
  `);
  await Promise.all([
    waitForPageExpression(host, 'PROFILE_GetId() === "测试玩家A"', 5000, 'host ID save'),
    waitForPageExpression(joiner, 'PROFILE_GetId() === "测试玩家B"', 5000, 'joiner ID save'),
  ]);
  await Promise.all([
    host.evaluate('SETTINGS_Close(); true'),
    joiner.evaluate('SETTINGS_Close(); true'),
  ]);

  const hostProfileFile = path.join(dataDirectories.get('host'), 'profile.json');
  const savedProfile = JSON.parse(fs.readFileSync(hostProfileFile, 'utf8'));
  if (savedProfile.playerId !== '测试玩家A') {
    throw new Error('Profile ID was not persisted to profile.json');
  }

  await Promise.all([
    host.evaluate('lanShowLobby(); true'),
    joiner.evaluate('lanShowLobby(); true'),
  ]);
  await Promise.all([
    waitForPageExpression(host, 'LANNET.connected', 10000, 'host local server connection'),
    waitForPageExpression(joiner, 'LANNET.connected', 10000, 'joiner local server connection'),
  ]);

  const localHost = await host.evaluate('location.host');
  const localJoiner = await joiner.evaluate('location.host');
  if (localHost === localJoiner) throw new Error('Test clients unexpectedly share one local server');

  await host.evaluate("document.getElementById('lanCreateBtn').click(); true");
  await waitForPageExpression(host, 'LAN.room && LAN.room.players.length === 1', 10000, 'room creation');
  const code = await host.evaluate('LAN.room.code');

  await joiner.evaluate(`
    document.getElementById('lanRoomCodeInput').value = ${JSON.stringify(code)};
    document.getElementById('lanJoinBtn').click();
    true;
  `);
  await waitForPageExpression(
    joiner,
    'LAN.room && LAN.room.players.length === 2',
    20000,
    'room join through discovery'
  );
  await waitForPageExpression(host, 'LAN.room && LAN.room.players.length === 2', 10000, 'host room update');

  const joinConnection = await joiner.evaluate(`({
    currentUrl: LANNET.currentUrl,
    ownOrigin: location.origin,
    connected: LANNET.connected
  })`);
  if (!joinConnection.connected) throw new Error('Joiner lost the host connection');
  if (joinConnection.currentUrl.includes(localJoiner)) {
    throw new Error('Joiner remained connected to its own local server');
  }

  const room = await host.evaluate(`({
    code: LAN.room.code,
    players: LAN.room.players.map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      owner: player.owner
    }))
  })`);
  if (new Set(room.players.map(player => player.team)).size !== 2) {
    throw new Error('Players were not split across both teams');
  }
  if (!room.players.some(player => player.name === '测试玩家A')) {
    throw new Error('Saved player ID was not sent to the room');
  }

  await Promise.all([
    host.evaluate("document.getElementById('lanReadyBtn').click(); true"),
    joiner.evaluate("document.getElementById('lanReadyBtn').click(); true"),
  ]);
  await waitForPageExpression(host, 'LAN.room.players.every(player => player.ready)', 6000, 'ready state');
  await waitForPageExpression(host, '!document.getElementById(\'lanStartBtn\').disabled', 6000, 'start button');
  await host.evaluate("document.getElementById('lanStartBtn').click(); true");
  await Promise.all([
    waitForPageExpression(host, 'LAN.active && LAN.phase !== "lobby"', 8000, 'host match start'),
    waitForPageExpression(joiner, 'LAN.active && LAN.phase !== "lobby"', 8000, 'joiner match start'),
  ]);
  await waitForPageExpression(
    host,
    'LAN.playerStates.size === 2 && [...LAN.playerStates.values()].every(player => Number.isFinite(player.kills))',
    5000,
    'match stat snapshot'
  );

  const hostSelfId = await host.evaluate('LAN.selfId');
  const targetId = room.players.find(player => player.id !== hostSelfId).id;
  await waitForPageExpression(host, 'LAN.phase === "round"', 8000, 'round combat start');
  await host.evaluate(`
    LANNET.send({
      type: 'shot',
      weapon: 'sniper',
      hits: [{ targetId: ${JSON.stringify(targetId)}, part: 'body', distance: 1 }],
      visual: null
    });
    true;
  `);
  await waitForPageExpression(
    host,
    `LAN.playerStates.get(LAN.selfId).kills === 1 && LAN.playerStates.get(${JSON.stringify(targetId)}).deaths === 1`,
    5000,
    'server-authoritative kill stats'
  );
  const statsPlayers = await host.evaluate(`
    Array.from(LAN.playerStates.values()).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      kills: player.kills,
      deaths: player.deaths,
      damage: player.damage
    }))
  `);
  const hostTeam = statsPlayers.find(player => player.id === hostSelfId).team;
  const matchId = `e2e-${Date.now()}`;
  await host.evaluate(`
    LAN_handleMessage(${JSON.stringify({
      type: 'matchEnd',
      matchId,
      winnerTeam: hostTeam,
      blueScore: 10,
      redScore: 4,
      mapId: 'battlefield',
      rounds: 14,
      playedAt: new Date().toISOString(),
      durationMs: 90000,
      players: statsPlayers,
    })});
    true;
  `);
  const matchesFile = path.join(dataDirectories.get('host'), 'matches.json');
  const storedMatch = await waitFor(() => {
    const stored = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));
    return stored.matches.find(match => match.matchId === matchId);
  }, 5000, 'match history persistence');
  await host.evaluate('SETTINGS_Open(); true');
  await waitForPageExpression(
    host,
    'document.getElementById("profileTotalGames").textContent === "1"',
    5000,
    'profile summary UI'
  );
  const profileUi = await host.evaluate(`({
    games: document.getElementById('profileTotalGames').textContent,
    kd: document.getElementById('profileKd').textContent,
    dataPath: document.getElementById('profileDataPath').textContent,
    recentRows: document.querySelectorAll('#profileMatchList .profile-match-row').length
  })`);
  await host.evaluate('SETTINGS_Close(); true');

  const result = {
    code,
    localHost,
    localJoiner,
    joinerServer: joinConnection.currentUrl,
    room,
    profileId: savedProfile.playerId,
    dataFolder: dataDirectories.get('host'),
    profileUi,
    storedMatch,
    matchStarted: true,
    latency: await joiner.evaluate('LANNET.latency'),
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await closeAll();
    process.exit(0);
  })
  .catch(async error => {
    console.error(error.stack || error.message);
    await closeAll();
    process.exit(1);
  });

async function closeAll() {
  for (const client of clients) {
    try { await Promise.race([client.call('Browser.close'), sleep(1000)]); } catch {}
  }
  for (const socket of sockets) {
    try { socket.close(); } catch {}
  }
  await sleep(1200);
  for (const child of processes) {
    if (child.exitCode === null) {
      try { child.kill(); } catch {}
    }
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if (processes.every(child => child.exitCode !== null)) break;
    await sleep(100);
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
