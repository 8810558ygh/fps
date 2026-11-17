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
  const child = spawn(executable, [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
  ], {
    cwd: __dirname,
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

  const result = {
    code,
    localHost,
    localJoiner,
    joinerServer: joinConnection.currentUrl,
    room,
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
