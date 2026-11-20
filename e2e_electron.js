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
  const aiUsesHdWeapon = await host.evaluate('!p2._lanSimpleWeapon');
  const aiCharacterPartCount = await host.evaluate('getPlayerHitMeshes(p2).length');
  if (!aiUsesHdWeapon || aiCharacterPartCount !== 13) {
    throw new Error('AI opponent did not retain the standard HD weapon');
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
    `document.getElementById('lanIdentityOverlay').style.display === 'flex'
      && document.getElementById('lanIdentityRoomCode').textContent === ${JSON.stringify(code)}`,
    10000,
    'browser guest identity prompt'
  );
  const browserIdentityPrompt = await browserGuest.evaluate(`({
    promptVisible: document.getElementById('lanIdentityOverlay').style.display === 'flex',
    roomCode: document.getElementById('lanIdentityRoomCode').textContent,
    joinedBeforeId: !!LAN.room
  })`);
  if (!browserIdentityPrompt.promptVisible
      || browserIdentityPrompt.roomCode !== code
      || browserIdentityPrompt.joinedBeforeId) {
    throw new Error(`Browser guest joined before choosing an ID: ${JSON.stringify(browserIdentityPrompt)}`);
  }
  await browserGuest.evaluate(`
    document.getElementById('lanIdentityInput').value = '网页玩家C';
    document.getElementById('lanIdentitySubmitBtn').click();
    true;
  `);
  await waitForPageExpression(
    browserGuest,
    `PROFILE_GetId() === '网页玩家C'
      && LAN.room && LAN.room.code === ${JSON.stringify(code)} && LAN.room.players.length === 2`,
    10000,
    'browser guest ID and auto join'
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

  await host.evaluate(`(() => {
    const mapSelect = document.getElementById('lanRoomMapSelect');
    mapSelect.value = 'desert';
    mapSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await Promise.all([
    waitForPageExpression(
      host,
      'LAN.room.mapId === "desert" && document.getElementById("lanRoomMapSelect").value === "desert"',
      6000,
      'host room map update'
    ),
    waitForPageExpression(
      joiner,
      'LAN.room.mapId === "desert" && document.getElementById("lanRoomMapSelect").value === "desert"',
      6000,
      'joiner room map sync'
    ),
  ]);
  const roomMapSync = await Promise.all([
    host.evaluate(`({
      mapId: LAN.room.mapId,
      selectedMapId: document.getElementById('lanRoomMapSelect').value,
      optionCount: document.getElementById('lanRoomMapSelect').options.length,
      canEdit: !document.getElementById('lanRoomMapSelect').disabled
    })`),
    joiner.evaluate(`({
      mapId: LAN.room.mapId,
      selectedMapId: document.getElementById('lanRoomMapSelect').value,
      optionCount: document.getElementById('lanRoomMapSelect').options.length,
      canEdit: !document.getElementById('lanRoomMapSelect').disabled
    })`),
  ]);
  if (!roomMapSync[0].canEdit || roomMapSync[1].canEdit
      || roomMapSync.some(state => state.mapId !== 'desert'
        || state.selectedMapId !== 'desert'
        || state.optionCount !== 3)) {
    throw new Error(`Room map permissions or UI did not sync: ${JSON.stringify(roomMapSync)}`);
  }

  await joiner.evaluate("LANNET.send({ type: 'setMap', mapId: 'indoor_complex' }); true");
  await sleep(300);
  if (await joiner.evaluate('LAN.room.mapId') !== 'desert') {
    throw new Error('A non-owner changed the room map');
  }
  await host.evaluate(`(() => {
    const mapSelect = document.getElementById('lanRoomMapSelect');
    mapSelect.value = 'battlefield';
    mapSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await Promise.all([
    waitForPageExpression(host, 'LAN.room.mapId === "battlefield"', 6000, 'host room map restore'),
    waitForPageExpression(joiner, 'LAN.room.mapId === "battlefield"', 6000, 'joiner room map restore'),
  ]);

  await Promise.all([
    host.evaluate("document.getElementById('lanReadyBtn').click(); true"),
    joiner.evaluate("document.getElementById('lanReadyBtn').click(); true"),
  ]);
  await waitForPageExpression(host, 'LAN.room.players.every(player => player.ready)', 6000, 'ready state');

  const defaultRoomMode = await Promise.all([
    host.evaluate(`({
      roomMode: LAN.room.mode,
      selectedMode: document.getElementById('lanRoomModeSelect').value,
      ownerLabelRemoved: !document.getElementById('lanRoomOwner')
    })`),
    joiner.evaluate(`({
      roomMode: LAN.room.mode,
      selectedMode: document.getElementById('lanRoomModeSelect').value,
      ownerLabelRemoved: !document.getElementById('lanRoomOwner')
    })`),
  ]);
  if (defaultRoomMode.some(state => state.roomMode !== 'team'
      || state.selectedMode !== 'team'
      || !state.ownerLabelRemoved)) {
    throw new Error(`Default room mode is invalid: ${JSON.stringify(defaultRoomMode)}`);
  }

  await host.evaluate(`(() => {
    const modeSelect = document.getElementById('lanRoomModeSelect');
    modeSelect.value = 'survival';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await Promise.all([
    waitForPageExpression(
      host,
      'LAN.room.mode === "survival" && document.getElementById("lanRoomModeSelect").value === "survival"',
      6000,
      'host room mode update'
    ),
    waitForPageExpression(
      joiner,
      'LAN.room.mode === "survival" && document.getElementById("lanRoomModeSelect").value === "survival"',
      6000,
      'joiner room mode sync'
    ),
  ]);
  const roomModeSync = await Promise.all([
    host.evaluate(`({
      mode: LAN.room.mode,
      selectedMode: document.getElementById('lanRoomModeSelect').value,
      optionCount: document.getElementById('lanRoomModeSelect').options.length,
      canEdit: !document.getElementById('lanRoomModeSelect').disabled,
      startDisabled: document.getElementById('lanStartBtn').disabled
    })`),
    joiner.evaluate(`({
      mode: LAN.room.mode,
      selectedMode: document.getElementById('lanRoomModeSelect').value,
      optionCount: document.getElementById('lanRoomModeSelect').options.length,
      canEdit: !document.getElementById('lanRoomModeSelect').disabled
    })`),
  ]);
  if (!roomModeSync[0].canEdit || roomModeSync[1].canEdit
      || roomModeSync.some(state => state.mode !== 'survival'
        || state.selectedMode !== 'survival'
        || state.optionCount !== 2)
      || !roomModeSync[0].startDisabled) {
    throw new Error(`Room mode permissions or UI did not sync: ${JSON.stringify(roomModeSync)}`);
  }
  const survivalMapLock = await Promise.all([
    host.evaluate(`({
      roomMap: LAN.room.mapId,
      selectedMap: document.getElementById('lanRoomMapSelect').value,
      disabled: document.getElementById('lanRoomMapSelect').disabled
    })`),
    joiner.evaluate(`({
      roomMap: LAN.room.mapId,
      selectedMap: document.getElementById('lanRoomMapSelect').value,
      disabled: document.getElementById('lanRoomMapSelect').disabled
    })`),
  ]);
  if (survivalMapLock.some(state => state.roomMap !== 'battlefield'
      || state.selectedMap !== 'battlefield'
      || !state.disabled)) {
    throw new Error(`Survival map was not locked to battlefield: ${JSON.stringify(survivalMapLock)}`);
  }

  await joiner.evaluate("LANNET.send({ type: 'setMode', mode: 'team' }); true");
  await sleep(300);
  if (await joiner.evaluate('LAN.room.mode') !== 'survival') {
    throw new Error('A non-owner changed the room mode');
  }
  await host.evaluate(`(() => {
    const modeSelect = document.getElementById('lanRoomModeSelect');
    modeSelect.value = 'team';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await Promise.all([
    waitForPageExpression(host, 'LAN.room.mode === "team"', 6000, 'host room mode restore'),
    waitForPageExpression(joiner, 'LAN.room.mode === "team"', 6000, 'joiner room mode restore'),
  ]);
  await Promise.all([
    host.evaluate("document.getElementById('lanReadyBtn').click(); true"),
    joiner.evaluate("document.getElementById('lanReadyBtn').click(); true"),
  ]);
  await waitForPageExpression(host, 'LAN.room.players.every(player => player.ready)', 6000, 'ready after mode restore');
  await waitForPageExpression(host, '!document.getElementById(\'lanStartBtn\').disabled', 6000, 'start button');
  await host.evaluate("document.getElementById('lanStartBtn').click(); true");
  await Promise.all([
    waitForPageExpression(host, 'LAN.active && LAN.phase !== "lobby"', 8000, 'host match start'),
    waitForPageExpression(joiner, 'LAN.active && LAN.phase !== "lobby"', 8000, 'joiner match start'),
  ]);
  await waitForPageExpression(host, 'LAN.phase === "prep"', 4000, 'LAN preparation phase');
  const prepTimerText = await host.evaluate("document.getElementById('lanRoundTimer').textContent");
  if (!/^准备 \d{2}:\d{2}$/.test(prepTimerText)) {
    throw new Error(`LAN preparation timer format is invalid: ${prepTimerText}`);
  }
  const prepStart = await host.evaluate('({ x: p1.pos.x, y: p1.pos.y, z: p1.pos.z })');
  await host.evaluate('keys.KeyW = true; true');
  await sleep(320);
  await host.evaluate('keys.KeyW = false; true');
  const prepMoved = await host.evaluate(`
    Math.hypot(p1.pos.x - ${prepStart.x}, p1.pos.z - ${prepStart.z}) > 0.05
  `);
  await host.evaluate('keys.Space = true; true');
  await sleep(100);
  await host.evaluate('keys.Space = false; true');
  const prepJumped = await host.evaluate('p1.vy > 0.05 || !p1.onGround');
  await host.evaluate('mouse.leftDown = true; mouse.aim = true; true');
  await sleep(100);
  const prepFireBlocked = await host.evaluate('p1.input.fire === false && p1.input.aim === false');
  await host.evaluate('mouse.leftDown = false; mouse.aim = false; true');
  if (!prepMoved || !prepJumped || !prepFireBlocked) {
    throw new Error(`LAN preparation movement failed: moved=${prepMoved} jumped=${prepJumped} blocked=${prepFireBlocked}`);
  }
  await waitForPageExpression(host, 'LAN.models.size >= 1', 5000, 'remote player model');
  const lanWeaponModels = await host.evaluate(`
    (() => {
      const remote = Array.from(LAN.models.values())[0];
      return {
        ownUsesSimple: !!p1._lanSimpleWeapon,
        remoteUsesSimple: !!remote?._lanSimpleWeapon,
        remoteWeaponKey: remote?._lanSimpleWeaponKey || null,
        remoteGunPartCount: remote?.gunHolder?.children?.[0]?.children?.length || 0
      };
    })()
  `);
  if (lanWeaponModels.ownUsesSimple
      || !lanWeaponModels.remoteUsesSimple
      || lanWeaponModels.remoteWeaponKey !== 'rifle'
      || lanWeaponModels.remoteGunPartCount < 4) {
    throw new Error(`LAN weapon LOD is incorrect: ${JSON.stringify(lanWeaponModels)}`);
  }
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
  const combatTimerText = await host.evaluate("document.getElementById('lanRoundTimer').textContent");
  if (!/^战斗 \d{2}:\d{2}$/.test(combatTimerText) || !combatTimerText.startsWith('战斗 03:') && !combatTimerText.startsWith('战斗 02:')) {
    throw new Error(`LAN combat timer format is invalid: ${combatTimerText}`);
  }
  const shotVisualTest = await host.evaluate(`
    (() => {
      const savedQuaternion = p1.cam.quaternion.clone();
      const savedHandler = LAN_onLocalShot;
      const cameraPosition = p1.cam.getWorldPosition(new THREE.Vector3());
      const muzzlePosition = muzzleWorld(p1, new THREE.Vector3());
      let visual = null;
      LAN_onLocalShot = (hits, weapon, nextVisual) => { visual = nextVisual; };
      try {
        LAN_tryFire(p1, performance.now() + 5000, WEAPONS.rifle);
      } finally {
        LAN_onLocalShot = savedHandler;
        p1.cam.quaternion.copy(savedQuaternion);
        p1.cam.updateMatrixWorld(true);
      }
      if (!visual) return { ok: false };
      return {
        ok: true,
        distanceToMuzzle: Math.hypot(
          visual.sx - muzzlePosition.x,
          visual.sy - muzzlePosition.y,
          visual.sz - muzzlePosition.z
        ),
        distanceToCamera: Math.hypot(
          visual.sx - cameraPosition.x,
          visual.sy - cameraPosition.y,
          visual.sz - cameraPosition.z
        )
      };
    })()
  `);
  if (!shotVisualTest.ok
      || shotVisualTest.distanceToMuzzle > 0.02
      || shotVisualTest.distanceToCamera < 0.1) {
    throw new Error(`LAN shot visual did not start at the muzzle: ${JSON.stringify(shotVisualTest)}`);
  }
  const spectatorTest = await host.evaluate(`
    (() => {
      const savedDeadUntil = p1.deadUntil;
      const savedPosition = p1.cam.position.clone();
      const savedQuaternion = p1.cam.quaternion.clone();
      const savedFov = p1.cam.fov;
      const savedAiming = p1.aiming;
      const savedAimStage = p1.aimStage;
      const savedWeaponKey = p1.weaponKey;
      const makeTeammate = (id, offsetX) => {
        const player = makePlayer(
          900 + offsetX,
          0x3a7bd5,
          { x: p1.pos.x + offsetX, z: p1.pos.z - 2, yaw: 0.3 },
          'rifle',
          true
        );
        player.netId = id;
        player.name = id;
        player.team = p1.team;
        player.baseVisible = true;
        player.hp = 100;
        player.eyeH = 1.6;
        player.yaw = 0.3;
        player.pitch = 0.1;
        player.pos.set(p1.pos.x + offsetX, p1.pos.y, p1.pos.z - 2);
        LAN.models.set(id, player);
        LAN.playerStates.set(id, {
          id,
          name: id,
          team: p1.team,
          alive: true,
          connected: true,
          hp: 100,
          height: 1.84,
          weapon: 'rifle',
          aiming: false,
          aimStage: 0,
          reloadRemain: 0,
          boltRemain: 0,
          meleeRemain: 0,
        });
        return player;
      };

      p1.deadUntil = Infinity;
      LAN.spectateNetId = null;
      LAN.spectateWeaponKey = null;
      const teammateA = makeTeammate('spectateA', 1);
      const teammateB = makeTeammate('spectateB', 2);
      const first = _lanEnsureSpectateTarget().netId;
      LAN_cycleSpectateTarget();
      const second = LAN.spectateNetId;
      const selected = LAN.models.get(second);
      LAN_updateSpectatorCamera(0.016, performance.now());
      const selectedState = LAN.playerStates.get(second);
      selectedState.aiming = true;
      LAN_updateSpectatorCamera(0.016, performance.now());
      updateScopePip();
      const scopedLens = p1.vm.children[0]?.userData?.lensMeshF;
      const pipActive = _pipActive === true;
      const pipUsesScopeTexture = scopedLens && scopedLens.material === _scopeMat;

      selectedState.weapon = 'sniper';
      selectedState.aiming = true;
      selectedState.aimStage = 0;
      for (let i = 0; i < 40; i++) {
        LAN_updateSpectatorCamera(0.05, performance.now());
      }
      updateHUD(performance.now());
      const sniperFov = p1.cam.fov;
      const scopeHudVisible = document.querySelector('#hud1 .scope').style.display === 'block';
      render();
      const sniperVmHidden = !p1.vm.visible;

      const cameraMatches = Math.abs(p1.cam.position.x - selected.pos.x) < 0.001
        && Math.abs(p1.cam.position.y - (selected.pos.y + selected.eyeH)) < 0.001
        && Math.abs(p1.cam.position.z - selected.pos.z) < 0.001;
      const vmHasGun = p1.vm.children.length > 0;
      render();
      const observedBodyHidden = !selected.mesh.visible;

      LAN.models.delete('spectateA');
      LAN.models.delete('spectateB');
      LAN.playerStates.delete('spectateA');
      LAN.playerStates.delete('spectateB');
      _lanDisposeRemote(teammateA);
      _lanDisposeRemote(teammateB);
      LAN.spectateNetId = null;
      _lanClearSpectatorViewModel();
      setWeapon(p1, savedWeaponKey || p1.primaryWeaponKey || 'rifle');
      p1.aiming = savedAiming;
      p1.aimStage = savedAimStage;
      p1.deadUntil = savedDeadUntil;
      p1.cam.position.copy(savedPosition);
      p1.cam.quaternion.copy(savedQuaternion);
      p1.cam.fov = savedFov;
      p1.cam.updateProjectionMatrix();
      updateScopePip();
      updateHUD(performance.now());
      return {
        first,
        second,
        switched: first !== second,
        cameraMatches,
        vmHasGun,
        observedBodyHidden,
        pipActive,
        pipUsesScopeTexture,
        sniperFov,
        scopeHudVisible,
        sniperVmHidden
      };
    })()
  `);
  if (!spectatorTest.switched
      || !spectatorTest.cameraMatches
      || !spectatorTest.vmHasGun
      || !spectatorTest.observedBodyHidden
      || !spectatorTest.pipActive
      || !spectatorTest.pipUsesScopeTexture
      || !spectatorTest.scopeHudVisible
      || !spectatorTest.sniperVmHidden
      || spectatorTest.sniperFov >= 20) {
    throw new Error(`LAN spectator test failed: ${JSON.stringify(spectatorTest)}`);
  }
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
  const matchEndPayload = {
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
  };
  await Promise.all([
    host.evaluate(`LAN_handleMessage(${JSON.stringify(matchEndPayload)}); true`),
    joiner.evaluate(`LAN_handleMessage(${JSON.stringify(matchEndPayload)}); true`),
  ]);
  const returnButtonUi = await Promise.all([
    host.evaluate(`({
      text: document.getElementById('lanReturnRoomBtn').textContent,
      disabled: document.getElementById('lanReturnRoomBtn').disabled
    })`),
    joiner.evaluate(`({
      text: document.getElementById('lanReturnRoomBtn').textContent,
      disabled: document.getElementById('lanReturnRoomBtn').disabled
    })`),
  ]);
  if (returnButtonUi.some(ui => ui.text !== '返回房间' || ui.disabled)) {
    throw new Error(`Return-to-room button is not available for every player: ${JSON.stringify(returnButtonUi)}`);
  }
  await joiner.evaluate(`
    _lanHandleReturnedToLobby({
      room: { ...LAN.room, phase: 'lobby' }
    });
    true;
  `);
  const returnedRoomUi = await joiner.evaluate(`({
    endVisible: document.getElementById('lanEndOverlay').style.display !== 'none',
    roomVisible: document.getElementById('lanRoomSection').style.display !== 'none',
    readyDisabled: document.getElementById('lanReadyBtn').disabled,
    teamSwitchDisabled: document.getElementById('lanSwitchBlue').disabled
  })`);
  if (returnedRoomUi.endVisible || !returnedRoomUi.roomVisible
      || returnedRoomUi.readyDisabled || returnedRoomUi.teamSwitchDisabled) {
    throw new Error(`Player did not return to an actionable room: ${JSON.stringify(returnedRoomUi)}`);
  }
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

  await Promise.all([
    host.evaluate('running = false; gameState = "idle"; true'),
    joiner.evaluate('running = false; gameState = "idle"; true'),
  ]);
  await host.evaluate("LANNET.send({ type: 'returnLobby' }); true");
  await Promise.all([
    waitForPageExpression(host, 'LAN.room && LAN.room.phase === "lobby"', 8000, 'host return to survival lobby'),
    waitForPageExpression(joiner, 'LAN.room && LAN.room.phase === "lobby"', 8000, 'joiner return to survival lobby'),
  ]);

  await host.evaluate(`(() => {
    const select = document.getElementById('lanRoomModeSelect');
    select.value = 'survival';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await Promise.all([
    waitForPageExpression(host, 'LAN.room.mode === "survival"', 6000, 'host survival mode'),
    waitForPageExpression(joiner, 'LAN.room.mode === "survival"', 6000, 'joiner survival mode'),
  ]);
  const survivalLobbyUi = await joiner.evaluate(`({
    blueSlots: document.getElementById('lanBlueList').children.length,
    redVisible: getComputedStyle(document.querySelector('.lan-team.red')).display !== 'none',
    teamSwitchVisible: getComputedStyle(document.getElementById('lanSwitchBlue')).display !== 'none',
    title: document.querySelector('.lan-team.blue .lan-team-title span:first-child').textContent
  })`);
  if (survivalLobbyUi.blueSlots !== 10
      || survivalLobbyUi.redVisible
      || survivalLobbyUi.teamSwitchVisible
      || !survivalLobbyUi.title.includes('生 存')) {
    throw new Error(`Survival lobby UI is invalid: ${JSON.stringify(survivalLobbyUi)}`);
  }

  await Promise.all([
    host.evaluate("document.getElementById('lanReadyBtn').click(); true"),
    joiner.evaluate("document.getElementById('lanReadyBtn').click(); true"),
  ]);
  await waitForPageExpression(host, '!document.getElementById("lanStartBtn").disabled', 6000, 'survival start button');
  await host.evaluate("document.getElementById('lanStartBtn').click(); true");
  await Promise.all([
    waitForPageExpression(
      host,
      'LAN.mode === "survival" && LAN_SURVIVAL_STATE.active && SurvivalState.active',
      10000,
      'host survival start'
    ),
    waitForPageExpression(
      joiner,
      'LAN.mode === "survival" && LAN_SURVIVAL_STATE.active && SurvivalState.active',
      10000,
      'joiner survival start'
    ),
  ]);
  await waitForPageExpression(
    host,
    '!document.querySelector("#hud1 .centermsg").textContent.includes("回合")',
    4000,
    'survival center text'
  );
  await host.evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyB',
      bubbles: true,
      cancelable: true
    }));
    true;
  `);
  await waitForPageExpression(
    host,
    'document.getElementById("survivalShop").style.display === "flex" && document.getElementById("weaponPanel").style.display !== "flex"',
    3000,
    'survival shop B key'
  );
  await host.evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyB',
      bubbles: true,
      cancelable: true
    }));
    true;
  `);
  await waitForPageExpression(
    host,
    'document.getElementById("survivalShop").style.display === "none"',
    3000,
    'survival shop close'
  );

  await Promise.all([
    waitForPageExpression(host, 'SurvivalState.phase === "wave" && SurvivalState.wave === 1', 20000, 'survival wave 1'),
    waitForPageExpression(joiner, 'SurvivalState.phase === "wave" && SurvivalState.wave === 1', 20000, 'joiner wave 1'),
  ]);
  await Promise.all([
    waitForPageExpression(host, 'getZombiesAliveCount() > 0', 8000, 'host zombies'),
    waitForPageExpression(joiner, 'getZombiesAliveCount() > 0', 8000, 'joiner zombies'),
  ]);
  await sleep(500);
  const survivalZombieSync = await Promise.all([
    host.evaluate(`getAllZombies().filter(z => z.alive).map(z => ({
      netId: z.netId,
      x: Number(z.pos.x.toFixed(1)),
      z: Number(z.pos.z.toFixed(1))
    }))`),
    joiner.evaluate(`getAllZombies().filter(z => z.alive).map(z => ({
      netId: z.netId,
      x: Number(z.pos.x.toFixed(1)),
      z: Number(z.pos.z.toFixed(1))
    }))`),
  ]);
  const hostIds = new Set(survivalZombieSync[0].map(z => z.netId));
  if (hostIds.size === 0 || !survivalZombieSync[1].some(z => hostIds.has(z.netId))) {
    throw new Error(`Survival zombie snapshots did not sync: ${JSON.stringify(survivalZombieSync)}`);
  }
  const survivalKillZombieId = survivalZombieSync[1][0].netId;
  await joiner.evaluate(`LANNET.send({
    type: 'survivalZombieHit',
    zombieId: ${JSON.stringify(survivalKillZombieId)},
    damage: 999,
    part: 'head'
  }); true`);
  await waitForPageExpression(
    joiner,
    'SurvivalState.coins > 0 && p1.survivalKills > 0',
    5000,
    'survival zombie kill reward'
  );
  await host.evaluate(`(() => {
    clearAllZombies();
    LAN_SURVIVAL_STATE.waveQueue = [];
    SurvivalState.waveQueue = [];
    LAN_SURVIVAL_STATE.lastWaveClearSent = SurvivalState.wave;
    return true;
  })()`);
  await joiner.evaluate(`
    if (typeof clearDamageNumbers === 'function') clearDamageNumbers();
    true;
  `);
  const damageNumberTest = await host.evaluate(`(() => {
    if (typeof clearDamageNumbers === 'function') clearDamageNumbers();
    p1.yaw = 0;
    p1.pitch = 0;
    p1.cam.rotation.y = 0;
    p1.cam.rotation.x = 0;
    p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
    p1.cam.updateMatrixWorld(true);
    const zombie = spawnZombie(p1.pos.x, p1.pos.z - 2, SurvivalState.wave, 'normal');
    if (!zombie) return { spawned: false, numbers: 0 };
    zombie.netId = 'local-damage-test';
    zombie.pos.set(p1.pos.x, p1.pos.y, p1.pos.z - 2);
    zombie.mesh.position.copy(zombie.pos);
    zombie.mesh.updateMatrixWorld(true);
    LAN_tryFire(p1, performance.now() + 5000, WEAPONS.rifle);
    return {
      spawned: true,
      numbers: document.querySelectorAll('#damageNumbers .dmg-number').length
    };
  })()`);
  if (!damageNumberTest.spawned || damageNumberTest.numbers < 1) {
    throw new Error(`Local zombie damage number missing: ${JSON.stringify(damageNumberTest)}`);
  }
  const remoteDamageNumbers = await joiner.evaluate(
    'document.querySelectorAll("#damageNumbers .dmg-number").length'
  );
  if (remoteDamageNumbers !== 0) {
    throw new Error(`Remote zombie damage numbers leaked to another player: ${remoteDamageNumbers}`);
  }
  await host.evaluate(`
    if (typeof clearDamageNumbers === 'function') clearDamageNumbers();
    clearAllZombies();
    true;
  `);

  const joinerRoomId = await host.evaluate(
    "LAN.room.players.find(player => player.name === '测试玩家B').id"
  );
  await host.evaluate(`(() => {
    const target = LAN.playerStates.get(${JSON.stringify(joinerRoomId)});
    const damage = Math.max(1, Math.min(100, target.armor + target.hp - 50));
    LANNET.send({
      type: 'survivalZombieAttack',
      targetId: ${JSON.stringify(joinerRoomId)},
      damage
    });
    return true;
  })()`);
  await waitForPageExpression(
    joiner,
    'Math.abs(LAN.playerStates.get(LAN.selfId).hp - 50) <= 2',
    4000,
    'joiner wounded for heal'
  );
  await waitForPageExpression(
    joiner,
    'LAN_SURVIVAL_STATE.lastDamageFlashAt > 0',
    3000,
    'survival incoming damage flash'
  );
  await host.evaluate(`(() => {
    const target = LAN.playerStates.get(${JSON.stringify(joinerRoomId)});
    p1.medkits = 1;
    setWeapon(p1, 'medkit');
    p1.pos.set(target.x + 1.4, target.y, target.z);
    const dx = target.x - p1.pos.x;
    const dz = target.z - p1.pos.z;
    p1.yaw = Math.atan2(-dx, -dz);
    p1.pitch = 0;
    p1.vy = 0;
    p1.onGround = true;
    p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
    p1.cam.rotation.y = p1.yaw;
    p1.cam.rotation.x = p1.pitch;
    return true;
  })()`);
  await sleep(350);
  await host.evaluate('mouse.rightDown = true; keys.KeyW = true; true');
  await sleep(500);
  const healStartDebug = await host.evaluate(`({
    isMedkit: p1.isMedkit,
    medkits: p1.medkits,
    rightDown: mouse.rightDown,
    healingTeammate: p1.healingTeammate,
    targetId: LAN_SURVIVAL_debugHealTarget()?.netId || null,
    target: LAN.playerStates.get(${JSON.stringify(joinerRoomId)}),
    healer: LAN.playerStates.get(LAN.selfId),
    camera: {
      x: p1.cam.position.x,
      y: p1.cam.position.y,
      z: p1.cam.position.z
    }
  })`);
  if (!healStartDebug.healingTeammate) {
    throw new Error(`Teammate heal did not start: ${JSON.stringify(healStartDebug)}`);
  }
  const healerStartPosition = await host.evaluate('({ x: p1.pos.x, z: p1.pos.z })');
  await waitForPageExpression(
    host,
    'p1.healingTeammate === true && document.getElementById("medkitProgress").style.display === "flex"',
    3000,
    'healer progress UI'
  );
  await waitForPageExpression(
    joiner,
    'p1.beingHealed === true && document.getElementById("medkitProgress").style.display === "flex"',
    3000,
    'patient progress UI'
  );
  await sleep(300);
  await joiner.evaluate('p1.pos.x += 0.5; true');
  await sleep(350);
  const healerPositionDuring = await host.evaluate('({ x: p1.pos.x, z: p1.pos.z })');
  await host.evaluate('keys.KeyW = false; true');
  await waitForPageExpression(
    joiner,
    'p1.hp >= 99 && p1.beingHealed === false',
    5000,
    'teammate heal complete'
  );
  await host.evaluate('mouse.rightDown = false; true');
  const teammateHealTest = await host.evaluate(`({
    medkits: p1.medkits,
    healedTeammate: !p1.healingTeammate,
    moved: Math.hypot(${healerPositionDuring.x} - ${healerStartPosition.x}, ${healerPositionDuring.z} - ${healerStartPosition.z})
  })`);
  if (teammateHealTest.medkits !== 0
      || !teammateHealTest.healedTeammate
      || teammateHealTest.moved > 0.08) {
    throw new Error(`Teammate heal failed: ${JSON.stringify(teammateHealTest)}`);
  }

  await host.evaluate(`(() => {
    const target = LAN.playerStates.get(${JSON.stringify(joinerRoomId)});
    const damage = Math.max(1, Math.min(100, target.armor + target.hp - 50));
    LANNET.send({
      type: 'survivalZombieAttack',
      targetId: ${JSON.stringify(joinerRoomId)},
      damage
    });
    return true;
  })()`);
  await waitForPageExpression(
    joiner,
    'Math.abs(LAN.playerStates.get(LAN.selfId).hp - 50) <= 2',
    4000,
    'joiner wounded for range interrupt'
  );
  await host.evaluate(`(() => {
    const target = LAN.playerStates.get(${JSON.stringify(joinerRoomId)});
    p1.medkits = 1;
    setWeapon(p1, 'medkit');
    p1.pos.set(target.x + 1.4, target.y, target.z);
    const dx = target.x - p1.pos.x;
    const dz = target.z - p1.pos.z;
    p1.yaw = Math.atan2(-dx, -dz);
    p1.pitch = 0;
    p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
    p1.cam.rotation.y = p1.yaw;
    p1.cam.rotation.x = p1.pitch;
    mouse.rightDown = true;
    return true;
  })()`);
  await waitForPageExpression(
    host,
    'p1.healingTeammate === true',
    3000,
    'range interrupt heal start'
  );
  await joiner.evaluate(`(() => {
    const anchor = getSurvivalMapAnchor();
    p1.pos.set(anchor.x, anchor.y, anchor.z);
    return true;
  })()`);
  await sleep(500);
  const healRangeDebug = await host.evaluate(`({
    healer: LAN.playerStates.get(LAN.selfId),
    target: LAN.playerStates.get(${JSON.stringify(joinerRoomId)}),
    healing: p1.healingTeammate,
    cancelReason: LAN_SURVIVAL_STATE.lastHealCancelReason
  })`);
  if (healRangeDebug.cancelReason !== 'out-of-range') {
    throw new Error(`Range heal did not cancel on server: ${JSON.stringify(healRangeDebug)}`);
  }
  await waitForPageExpression(
    host,
    'p1.healingTeammate === false && LAN_SURVIVAL_STATE.lastHealCancelReason === "out-of-range"',
    5000,
    'heal interrupted by range'
  );
  await host.evaluate('mouse.rightDown = false; true');
  const healRangeInterrupt = await joiner.evaluate(
    'p1.beingHealed === false && p1.hp < 99'
  );
  if (!healRangeInterrupt) {
    throw new Error('Out-of-range healing did not interrupt on both clients');
  }
  await host.evaluate(`LANNET.send({
    type: 'survivalZombieAttack',
    targetId: ${JSON.stringify(joinerRoomId)},
    damage: 500
  });
  LANNET.send({
    type: 'survivalZombieAttack',
    targetId: ${JSON.stringify(joinerRoomId)},
    damage: 500
  }); true`);
  await sleep(1000);
  const downedDebug = {
    host: await host.evaluate(`({
      mode: LAN.mode,
      survivalPhase: SurvivalState.phase,
      connected: LANNET.connected,
      target: LAN.playerStates.get(${JSON.stringify(joinerRoomId)})
    })`),
    joiner: await joiner.evaluate(`({
      mode: LAN.mode,
      survivalPhase: SurvivalState.phase,
      connected: LANNET.connected,
      selfId: LAN.selfId,
      state: LAN.playerStates.get(LAN.selfId),
      downed: p1.downed,
      hp: p1.hp
    })`),
  };
  if (!downedDebug.joiner.state?.downed) {
    throw new Error(`Survival downed state did not sync: ${JSON.stringify(downedDebug)}`);
  }
  await waitForPageExpression(
    joiner,
    'LAN.playerStates.get(LAN.selfId).downed === true && p1.downed === true',
    6000,
    'joiner downed'
  );
  await waitForPageExpression(
    host,
    `LAN.models.get(${JSON.stringify(joinerRoomId)})?.mesh.rotation.x < -0.5`,
    4000,
    'downed body pose'
  );
  await joiner.evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyB',
      bubbles: true,
      cancelable: true
    }));
    true;
  `);
  const downedBKeyUi = await joiner.evaluate(`({
    shop: document.getElementById('survivalShop').style.display,
    weaponPanel: document.getElementById('weaponPanel').style.display
  })`);
  if (downedBKeyUi.shop === 'flex' || downedBKeyUi.weaponPanel === 'flex') {
    throw new Error(`Downed B key opened an invalid panel: ${JSON.stringify(downedBKeyUi)}`);
  }

  await host.evaluate(`(() => {
    const target = LAN.models.get(${JSON.stringify(joinerRoomId)});
    p1.pos.set(target.pos.x + 0.6, target.pos.y, target.pos.z);
    p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
    return true;
  })()`);
  await sleep(300);
  await host.evaluate('keys.KeyE = true; true');
  await sleep(1000);
  const rescueNotInstant = await joiner.evaluate(
    'LAN.playerStates.get(LAN.selfId).downed === true'
  );
  if (!rescueNotInstant) {
    throw new Error('Rescue completed before the five-second timer');
  }
  await waitForPageExpression(
    joiner,
    'LAN.playerStates.get(LAN.selfId).downed === false && LAN.playerStates.get(LAN.selfId).hp === 30',
    8000,
    'five second revive'
  );
  await host.evaluate('keys.KeyE = false; true');

  await host.evaluate(`LANNET.send({
    type: 'survivalZombieAttack',
    targetId: ${JSON.stringify(joinerRoomId)},
    damage: 500
  });
  LANNET.send({
    type: 'survivalZombieAttack',
    targetId: ${JSON.stringify(joinerRoomId)},
    damage: 500
  }); true`);
  await waitForPageExpression(
    joiner,
    'LAN.playerStates.get(LAN.selfId).downed === true',
    5000,
    'joiner downed for repeat rescue'
  );
  await host.evaluate('keys.KeyE = true; true');
  await sleep(1000);
  if (!(await joiner.evaluate('LAN.playerStates.get(LAN.selfId).downed === true'))) {
    throw new Error('Repeated rescue completed too early');
  }
  await waitForPageExpression(
    joiner,
    'LAN.playerStates.get(LAN.selfId).downed === false && LAN.playerStates.get(LAN.selfId).hp === 30',
    8000,
    'repeat rescue completed'
  );
  await host.evaluate('keys.KeyE = false; true');

  await host.evaluate("LANNET.send({ type: 'survivalWaveClear', wave: 1 }); true");
  await Promise.all([
    waitForPageExpression(host, 'SurvivalState.phase === "prep" && SurvivalState.wave === 1', 6000, 'host wave summary'),
    waitForPageExpression(joiner, 'document.getElementById("survivalWaveSummary").style.display === "block"', 6000, 'joiner wave summary'),
  ]);
  const survivalSummaryUi = await host.evaluate(`({
    visible: document.getElementById('survivalWaveSummary').style.display === 'block',
    rows: Array.from(document.querySelectorAll('#svSummaryList .sv-summary-row')).map(row => ({
      text: row.textContent,
      tag: row.querySelector('.sv-summary-tag')?.textContent || ''
    }))
  })`);
  if (!survivalSummaryUi.visible || survivalSummaryUi.rows.length !== 2) {
    throw new Error(`Survival summary UI is invalid: ${JSON.stringify(survivalSummaryUi)}`);
  }

  for (let wave = 2; wave <= 5; wave++) {
    await waitForPageExpression(
      host,
      `SurvivalState.phase === "wave" && SurvivalState.wave === ${wave}`,
      20000,
      `survival wave ${wave}`
    );
    if (wave === 5) {
      await host.evaluate(`LANNET.send({
        type: 'survivalZombieAttack',
        targetId: ${JSON.stringify(joinerRoomId)},
        damage: 500
      });
      LANNET.send({
        type: 'survivalZombieAttack',
        targetId: ${JSON.stringify(joinerRoomId)},
        damage: 500
      }); true`);
      await waitForPageExpression(
        joiner,
        'LAN.playerStates.get(LAN.selfId).downed === true',
        5000,
        'joiner downed before wave five clear'
      );
    }
    await host.evaluate(`LANNET.send({ type: 'survivalWaveClear', wave: ${wave} }); true`);
  }
  await Promise.all([
    waitForPageExpression(host, 'SurvivalState.phase === "portal"', 10000, 'host portal phase'),
    waitForPageExpression(joiner, 'SurvivalState.phase === "portal"', 10000, 'joiner portal phase'),
  ]);
  await waitForPageExpression(
    joiner,
    'LAN.playerStates.get(LAN.selfId).downed === false && LAN.playerStates.get(LAN.selfId).hp === 30',
    5000,
    'wave five automatic revive'
  );

  await Promise.all([
    host.evaluate(`(() => {
      const anchor = getSurvivalMapAnchor();
      p1.pos.set(anchor.x, anchor.y, anchor.z);
      p1.vy = 0;
      p1.prevY = anchor.y;
      p1.onGround = true;
      return true;
    })()`),
    joiner.evaluate(`(() => {
      const anchor = getSurvivalMapAnchor();
      p1.pos.set(anchor.x, anchor.y, anchor.z);
      p1.vy = 0;
      p1.prevY = anchor.y;
      p1.onGround = true;
      return true;
    })()`),
  ]);
  await sleep(350);
  const portalConfirmResults = await Promise.all([
    host.evaluate('LAN_SURVIVAL_tryPortalConfirm(); true'),
    joiner.evaluate('LAN_SURVIVAL_tryPortalConfirm(); true'),
  ]);
  await sleep(1000);
  const portalDebug = {
    confirmResults: portalConfirmResults,
    host: await host.evaluate(`({
      phase: LAN_SURVIVAL_STATE.phase,
      ready: Array.from(LAN_SURVIVAL_STATE.portalReady),
      required: LAN_SURVIVAL_STATE.portalRequired,
      pos: { x: p1.pos.x, z: p1.pos.z },
      state: LAN.playerStates.get(LAN.selfId)
    })`),
    joiner: await joiner.evaluate(`({
      phase: LAN_SURVIVAL_STATE.phase,
      ready: Array.from(LAN_SURVIVAL_STATE.portalReady),
      required: LAN_SURVIVAL_STATE.portalRequired,
      pos: { x: p1.pos.x, z: p1.pos.z },
      state: LAN.playerStates.get(LAN.selfId)
    })`),
  };
  if (portalDebug.host.phase !== 'mapLoading') {
    throw new Error(`Portal confirmation did not complete: ${JSON.stringify(portalDebug)}`);
  }
  await waitForPageExpression(host, 'LAN_SURVIVAL_STATE.phase === "mapLoading"', 8000, 'portal map loading');
  await Promise.all([
    waitForPageExpression(
      host,
      'getCurrentMapId() === "desert" && SurvivalState.phase === "prep"',
      25000,
      'host loaded desert'
    ),
    waitForPageExpression(
      joiner,
      'getCurrentMapId() === "desert" && SurvivalState.phase === "prep"',
      25000,
      'joiner loaded desert'
    ),
  ]);
  const survivalTest = {
    zombieNetIds: Array.from(hostIds),
    damageNumberTest,
    remoteDamageNumbers,
    damageFlashAt: await joiner.evaluate('LAN_SURVIVAL_STATE.lastDamageFlashAt'),
    teammateHealTest,
    healRangeInterrupt,
    summary: survivalSummaryUi,
    mapAfterPortal: await host.evaluate('getCurrentMapId()'),
    autoReviveHp: await joiner.evaluate('LAN.playerStates.get(LAN.selfId).hp'),
  };
  await Promise.all([
    host.evaluate(`
      LAN_handleMessage({
        type: 'survivalEndlessChoice',
        hostId: LAN.room.ownerId
      });
      true;
    `),
    joiner.evaluate(`
      LAN_handleMessage({
        type: 'survivalEndlessChoice',
        hostId: LAN.room.ownerId
      });
      true;
    `),
  ]);
  const endlessChoiceUi = await Promise.all([
    host.evaluate(`({
      visible: document.getElementById('lanEndlessChoiceOverlay').style.display === 'flex',
      finishEnabled: !document.getElementById('lanEndlessFinishBtn').disabled,
      continueEnabled: !document.getElementById('lanEndlessContinueBtn').disabled,
      waitVisible: document.querySelector('#lanEndlessChoiceOverlay .lan-endless-wait').style.display === 'block'
    })`),
    joiner.evaluate(`({
      visible: document.getElementById('lanEndlessChoiceOverlay').style.display === 'flex',
      actionsVisible: document.querySelector('#lanEndlessChoiceOverlay .lan-endless-actions').style.display !== 'none',
      waitVisible: document.querySelector('#lanEndlessChoiceOverlay .lan-endless-wait').style.display === 'block'
    })`),
  ]);
  if (!endlessChoiceUi[0].visible || !endlessChoiceUi[0].finishEnabled
      || !endlessChoiceUi[0].continueEnabled || endlessChoiceUi[0].waitVisible
      || !endlessChoiceUi[1].visible || endlessChoiceUi[1].actionsVisible
      || !endlessChoiceUi[1].waitVisible) {
    throw new Error(`Host endless choice UI is invalid: ${JSON.stringify(endlessChoiceUi)}`);
  }
  await host.evaluate("LAN_handleMessage({ type: 'survivalEnd', victory: true }); true");
  await waitForPageExpression(
    host,
    'document.getElementById("survivalEndOverlay").classList.contains("victory") && LAN_SURVIVAL_STATE.lastEndAnimation === "victory"',
    3000,
    'victory animation'
  );
  const victoryAnimation = await host.evaluate(`({
    visible: document.getElementById('survivalEndOverlay').style.display === 'flex',
    className: document.getElementById('survivalEndOverlay').className,
    choiceHidden: document.getElementById('lanEndlessChoiceOverlay').style.display === 'none'
  })`);
  await host.evaluate("LAN_handleMessage({ type: 'survivalEnd', victory: false }); true");
  const defeatAnimation = await host.evaluate(`({
    visible: document.getElementById('survivalEndOverlay').style.display === 'flex',
    className: document.getElementById('survivalEndOverlay').className,
    marker: LAN_SURVIVAL_STATE.lastEndAnimation
  })`);
  if (!victoryAnimation.visible || !victoryAnimation.className.includes('victory')
      || !victoryAnimation.choiceHidden
      || !defeatAnimation.visible || !defeatAnimation.className.includes('defeat')
      || defeatAnimation.marker !== 'defeat') {
    throw new Error(`Survival end animations failed: ${JSON.stringify({ victoryAnimation, defeatAnimation })}`);
  }

  const result = {
    code,
    inviteUrl,
    browserIdentityPrompt,
    localHost,
    localJoiner,
    joinerServer: joinConnection.currentUrl,
    room,
    roomMapSync,
    roomModeSync,
    lobbyLayout,
    prepTimerText,
    prepMoved,
    prepJumped,
    prepFireBlocked,
    combatTimerText,
    lanWeaponModels,
    profileId: savedProfile.playerId,
    dataFolder: dataDirectories.get('host'),
    profileUi,
    aiScoreboardUi,
    aiUsesHdWeapon,
    aiCharacterPartCount,
    meleeConeTargetCount,
    aiPerformanceBase,
    aiPerformanceAfterWeaponSwitch,
    deathReportUi,
    survivorReportUi,
    barrelTest,
    scoreboardUi,
    spectatorTest,
    shotVisualTest,
    performanceSample,
    performanceWithoutRemotes,
    performanceUnoptimized,
    storedMatch,
    returnButtonUi,
    returnedRoomUi,
    survivalTest,
    endlessChoiceUi,
    victoryAnimation,
    defeatAnimation,
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
