'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const packagedMode = process.env.HEROES_DUEL_E2E_PACKAGED === '1';
const packagedDirectory = process.env.HEROES_DUEL_E2E_PACKAGED_DIR
  ? path.resolve(process.env.HEROES_DUEL_E2E_PACKAGED_DIR)
  : path.join(__dirname, 'dist', 'win-unpacked');
const executable = packagedMode
  ? path.join(packagedDirectory, '双雄对决.exe')
  : require('electron');
const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
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
      throw new Error(
        result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Evaluation failed'
      );
    }
    return result.result.value;
  }
}

async function waitForPageExpression(client, expression, timeoutMs, label) {
  return waitFor(() => client.evaluate(`Boolean(${expression})`), timeoutMs, label);
}

async function samplePerformance(client, durationMs = 3000) {
  return client.evaluate(`
    new Promise(resolve => {
      const gl = renderer.getContext();
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      const startedAt = performance.now();
      let frames = 0;
      function sample(now) {
        frames++;
        if (now - startedAt < ${durationMs}) {
          requestAnimationFrame(sample);
          return;
        }
        resolve({
          fps: Number((frames * 1000 / (now - startedAt)).toFixed(1)),
          frameMs: Number(((now - startedAt) / frames).toFixed(2)),
          pixelRatio: renderer.getPixelRatio(),
          drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
          cssViewport: [innerWidth, innerHeight],
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          shadows: renderer.shadowMap.enabled,
          autoOptimization: SETTINGS.performance.autoOptimization,
          renderer: rendererName,
          hardwareConcurrency: navigator.hardwareConcurrency
        });
      }
      requestAnimationFrame(sample);
    })
  `);
}

function launch(name, port) {
  const userData = path.join(tempRoot, name);
  const portableDirectory = path.join(tempRoot, `${name}-portable`);
  const playerData = path.join(portableDirectory, '双雄对决资料');
  dataDirectories.set(name, playerData);
  const launchArguments = [
    ...(packagedMode ? [] : [__dirname]),
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
  ];
  const child = spawn(executable, launchArguments, {
    cwd: __dirname,
    env: {
      ...process.env,
      PORTABLE_EXECUTABLE_DIR: portableDirectory,
      HEROES_DUEL_DISABLE_MIGRATION: '1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  processes.push(child);
  return child;
}

function launchBrowser(name, port, url) {
  const userData = path.join(tempRoot, `${name}-browser`);
  const child = spawn(edgeExecutable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
    url,
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
    waitForPageExpression(host, 'window.PROFILE && PROFILE.ready', 10000, 'host profile'),
    waitForPageExpression(joiner, 'window.PROFILE && PROFILE.ready', 10000, 'joiner profile'),
  ]);
  await host.evaluate("enterGame('ai'); true");
  await waitForPageExpression(host, 'running && gameMode === "ai"', 10000, 'AI match start');
  const aiSimpleWeaponApplied = await host.evaluate('!!p2._lanSimpleWeapon');
  const aiCharacterPartCount = await host.evaluate('getPlayerHitMeshes(p2).length');
  if (!aiSimpleWeaponApplied || aiCharacterPartCount !== 13) {
    throw new Error('AI opponent character model was simplified or weapon was not optimized');
  }
  const meleeConeTargetCount = await host.evaluate(`
    (() => {
      const savedPosition = p1.cam.position.clone();
      const savedQuaternion = p1.cam.quaternion.clone();
      p1.cam.position.set(0, 1.6, 0);
      p1.cam.quaternion.set(0, 0, 0, 1);
      p1.cam.updateMatrixWorld(true);
      const makeTarget = (x, z) => ({
        team: 'red',
        baseVisible: true,
        hp: 100,
        height: 1.84,
        pos: new THREE.Vector3(x, 0, z)
      });
      const count = findMeleeTargetsInCone(
        p1,
        [makeTarget(-0.5, -1.5), makeTarget(0.5, -1.5), makeTarget(0, 1.5)],
        []
      ).length;
      p1.cam.position.copy(savedPosition);
      p1.cam.quaternion.copy(savedQuaternion);
      p1.cam.updateMatrixWorld(true);
      return count;
    })()
  `);
  if (meleeConeTargetCount !== 2) {
    throw new Error(`Melee cone did not collect all forward targets: ${meleeConeTargetCount}`);
  }
  await sleep(1500);
  const aiPerformanceBase = await samplePerformance(host, 2500);
  const aiScoreboardUi = await host.evaluate(`
    (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Tab',
        bubbles: true,
        cancelable: true
      }));
      const result = {
        visible: document.getElementById('scorePanel').classList.contains('visible'),
        rows: Array.from(document.querySelectorAll('#spPlayerRows .sp-player-row')).map(row => ({
          name: row.querySelector('.sp-player-name')?.textContent || '',
          kills: row.querySelector('.sp-kills')?.textContent || '',
          deaths: row.querySelector('.sp-deaths')?.textContent || ''
        })),
        containsHealth: document.getElementById('scorePanel').textContent.includes('HP')
      };
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'Tab',
        bubbles: true,
        cancelable: true
      }));
      return result;
    })()
  `);
  if (!aiScoreboardUi.visible || aiScoreboardUi.rows.length !== 2 || aiScoreboardUi.containsHealth) {
    throw new Error('AI TAB scoreboard is not using the unified K/D layout');
  }
  await host.evaluate("setWeapon(p2, 'shotgun'); true");
  await sleep(500);
  const aiPerformanceAfterWeaponSwitch = await samplePerformance(host, 2500);
  await host.evaluate('exitToLobby(); true');

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
  await waitForPageExpression(
    host,
    'document.getElementById("lanShareInvite").style.display !== "none" && document.getElementById("lanInviteUrl").value.includes("lanRoom=")',
    5000,
    'LAN invite URL'
  );
  const inviteUrl = await host.evaluate("document.getElementById('lanInviteUrl').value");
  if (!inviteUrl.startsWith('http://') || !inviteUrl.includes(code)) {
    throw new Error(`LAN invite URL is invalid: ${inviteUrl}`);
  }
  launchBrowser('browser-guest', 9333, inviteUrl);
  const browserTarget = await pageTarget(9333);
  const browserGuest = new CdpClient(browserTarget.webSocketDebuggerUrl);
  await browserGuest.open();
  await browserGuest.call('Runtime.enable');
  await waitForPageExpression(
    browserGuest,
    'window.LAN && window.LANNET && !window.electronAPI',
    20000,
    'browser guest scripts'
  );
  await waitForPageExpression(
    browserGuest,
    `LAN.room && LAN.room.code === ${JSON.stringify(code)} && LAN.room.players.length === 2`,
    10000,
    'browser guest auto join'
  );
  await browserGuest.call('Browser.close');
  await waitForPageExpression(host, 'LAN.room && LAN.room.players.length === 1', 8000, 'browser guest leave');

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
  const lobbyLayout = await host.evaluate(`({
    playerRowHeights: Array.from(document.querySelectorAll('.lan-player-row')).map(row =>
      Math.round(row.getBoundingClientRect().height)
    ),
    emptySlotHeights: Array.from(document.querySelectorAll('.lan-empty-slot')).map(row =>
      Math.round(row.getBoundingClientRect().height)
    ),
    blueSlots: document.getElementById('lanBlueList').children.length,
    redSlots: document.getElementById('lanRedList').children.length,
    panelWidth: Math.round(document.querySelector('.lan-panel').getBoundingClientRect().width)
  })`);
  if (lobbyLayout.playerRowHeights.some(height => height < 60)
      || lobbyLayout.emptySlotHeights.some(height => height < 60)
      || lobbyLayout.blueSlots !== 5
      || lobbyLayout.redSlots !== 5) {
    throw new Error(`LAN lobby slots are too small: ${JSON.stringify(lobbyLayout)}`);
  }

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

  await sleep(1500);
  const performanceSample = await samplePerformance(host);

  await host.evaluate(`
    LAN.active = false;
    LAN_foreachRemote(player => { player.baseVisible = false; player.mesh.visible = false; });
    true;
  `);
  const performanceWithoutRemotes = await samplePerformance(host, 2000);
  await host.evaluate(`
    LAN_foreachRemote((player, state) => {
      player.baseVisible = !!state.alive;
      player.mesh.visible = !!state.alive;
    });
    LAN.active = true;
    true;
  `);

  await host.evaluate(`
    SETTINGS.performance.autoOptimization = false;
    SETTINGS_ApplyGraphics(true);
    true;
  `);
  const performanceUnoptimized = await samplePerformance(host, 2000);
  await host.evaluate(`
    SETTINGS.performance.autoOptimization = true;
    SETTINGS_ApplyGraphics(true);
    true;
  `);

  const hostSelfId = await host.evaluate('LAN.selfId');
  const targetId = room.players.find(player => player.id !== hostSelfId).id;
  await waitForPageExpression(host, 'LAN.phase === "round"', 8000, 'round combat start');
  const barrelTest = await host.evaluate(`
    (() => {
      const occupied = [p1.pos, ...Array.from(LAN.models.values()).map(player => player.pos)];
      const barrel = activeBarrels.find(item => !item.exploded && occupied.every(pos =>
        Math.hypot(pos.x - item.x, pos.z - item.z) > 8
      )) || activeBarrels.find(item => !item.exploded);
      if (!barrel) return { ok: false, reason: 'no active barrel' };
      p1.cam.position.set(barrel.x, barrel.y + 0.7, barrel.z + 4);
      p1.cam.lookAt(new THREE.Vector3(barrel.x, barrel.y, barrel.z));
      p1.cam.updateMatrixWorld(true);
      const sniper = getWeaponConfig('sniper');
      const originalBroadcast = window.LAN_broadcastBarrel;
      let broadcast = null;
      window.LAN_broadcastBarrel = (x, y, z) => { broadcast = { x, y, z }; };
      LAN_tryFire(p1, performance.now(), sniper);
      LAN_tryFire(p1, performance.now() + 1000, sniper);
      window.LAN_broadcastBarrel = originalBroadcast;
      return {
        ok: barrel.exploded && !!broadcast,
        broadcast,
        x: barrel.x,
        z: barrel.z,
        hp: barrel.hp
      };
    })()
  `);
  if (!barrelTest.ok) throw new Error(`LAN barrel did not explode: ${JSON.stringify(barrelTest)}`);
  await sleep(1000);
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
  await waitForPageExpression(joiner, '!!LAN.roundReportCache && LAN.phase === "roundEnd"', 4000, 'death report');
  const deathReportUi = await joiner.evaluate(`({
    visible: !!document.getElementById('roundReport'),
    text: document.getElementById('roundReport')?.textContent || '',
    cachedInteractions: LAN.roundReportCache?.interactions?.length || 0,
    hasPartRows: ['头 部', '身 体', '腿 部'].every(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label)),
    hasAISections: ['人物伤害', '输出总伤害', '承受总伤害'].every(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label)),
    hasRemovedSummary: ['本回合总输出', '本回合总承受', '回合状态', '交火报告'].some(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label))
  })`);
  if (!deathReportUi.visible
      || !deathReportUi.text.includes('伤害报告')
      || !deathReportUi.text.includes('150')
      || !deathReportUi.hasPartRows
      || !deathReportUi.hasAISections
      || deathReportUi.hasRemovedSummary) {
    throw new Error('Death round report did not include the fatal interaction');
  }
  await waitForPageExpression(host, 'LAN.phase === "prep"', 5000, 'next preparation');
  const survivorReportUi = await host.evaluate(`({
    visible: !!document.getElementById('roundReport'),
    text: document.getElementById('roundReport')?.textContent || '',
    cachedInteractions: LAN.roundReportCache?.interactions?.length || 0,
    hasPartRows: ['头 部', '身 体', '腿 部'].every(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label)),
    hasAISections: ['人物伤害', '输出总伤害', '承受总伤害'].every(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label)),
    hasRemovedSummary: ['本回合总输出', '本回合总承受', '回合状态', '交火报告'].some(label =>
      (document.getElementById('roundReport')?.textContent || '').includes(label))
  })`);
  if (!survivorReportUi.visible
      || !survivorReportUi.text.includes('伤害报告')
      || !survivorReportUi.text.includes('150')
      || !survivorReportUi.hasPartRows
      || !survivorReportUi.hasAISections
      || survivorReportUi.hasRemovedSummary) {
    throw new Error('Survivor round report was not shown during preparation');
  }
  await host.evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    true;
  `);
  const scoreboardUi = await host.evaluate(`({
    rows: Array.from(document.querySelectorAll('#spPlayerRows .sp-player-row')).map(row => ({
      name: row.querySelector('.sp-player-name')?.textContent || '',
      kills: row.querySelector('.sp-kills')?.textContent || '',
      deaths: row.querySelector('.sp-deaths')?.textContent || ''
    })),
    containsHealth: document.getElementById('scorePanel').textContent.includes('HP')
  })`);
  if (scoreboardUi.rows.length !== 2 || scoreboardUi.containsHealth) {
    throw new Error('TAB scoreboard rows are incomplete or still contain health');
  }
  await host.evaluate(`
    window.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    true;
  `);

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
    inviteUrl,
    localHost,
    localJoiner,
    joinerServer: joinConnection.currentUrl,
    room,
    lobbyLayout,
    profileId: savedProfile.playerId,
    dataFolder: dataDirectories.get('host'),
    profileUi,
    aiScoreboardUi,
    aiSimpleWeaponApplied,
    aiCharacterPartCount,
    meleeConeTargetCount,
    aiPerformanceBase,
    aiPerformanceAfterWeaponSwitch,
    deathReportUi,
    survivorReportUi,
    barrelTest,
    scoreboardUi,
    performanceSample,
    performanceWithoutRemotes,
    performanceUnoptimized,
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
