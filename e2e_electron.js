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
  const spectatorTest = await host.evaluate(`
    (() => {
      const savedDeadUntil = p1.deadUntil;
      const savedPosition = p1.cam.position.clone();
      const savedQuaternion = p1.cam.quaternion.clone();
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
      setWeapon(p1, p1.primaryWeaponKey || 'rifle');
      p1.deadUntil = savedDeadUntil;
      p1.cam.position.copy(savedPosition);
      p1.cam.quaternion.copy(savedQuaternion);
      return { first, second, switched: first !== second, cameraMatches, vmHasGun, observedBodyHidden };
    })()
  `);
  if (!spectatorTest.switched
      || !spectatorTest.cameraMatches
      || !spectatorTest.vmHasGun
      || !spectatorTest.observedBodyHidden) {
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
