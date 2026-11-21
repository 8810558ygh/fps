'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(process.env.HEROES_DUEL_ROOT || path.resolve(__dirname, '..'));
const PORT = Number(process.env.PORT || 8090);
const TICK_MS = 33;
const PREP_MS = 5000;
const ROUND_END_MS = 2500;
const ROUND_LIMIT_MS = 180000;
const MATCH_POINT = 10;
const MAX_TEAM = 5;
const MAX_SURVIVAL_PLAYERS = 10;
const MELEE_SERVER_RANGE = 2.6;
const SURVIVAL_PREP_MS = 15000;
const SURVIVAL_MAPS = ['battlefield', 'desert', 'indoor_complex'];
const SURVIVAL_PORTAL_RADIUS = 4.0;
const SURVIVAL_REVIVE_HP = 30;
const SURVIVAL_REVIVE_RANGE = 2.5;
const SURVIVAL_HEAL_MS = 1500;
const SURVIVAL_HEAL_RANGE = 3.2;
const SURVIVAL_HEAL_AMOUNT = 50;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (pathname === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, service: 'heroes-duel-lan' }));
    return;
  }

  if (pathname === '/api/rooms') {
    const publicRooms = [];
    for (const room of rooms.values()) {
      if (room.phase !== 'lobby') continue;
      publicRooms.push({
        code: room.code,
        players: room.memberIds.size,
        mapId: room.mapId,
      });
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ rooms: publicRooms }));
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const rel = pathname.replace(/^\/+/, '');
  if (rel.startsWith('server/') || rel.startsWith('node_modules/') || rel === 'package.json') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const filePath = path.resolve(ROOT, rel);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

const wss = new WebSocketServer({
  server,
  path: '/lan',
  perMessageDeflate: false,
});

const rooms = new Map();
let nextClientId = 1;
const clients = new Map();

function safeText(value, max = 20) {
  return String(value || '')
    .replace(/[<>&"']/g, '')
    .trim()
    .slice(0, max);
}

function normalizedIp(ws) {
  let ip = String(ws?._socket?.remoteAddress || '');
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

function emptyDamageStats() {
  return { head: 0, body: 0, leg: 0, barrel: 0, total: 0 };
}

function createRoundStats() {
  return {
    outgoing: new Map(),
    incoming: new Map(),
    kills: [],
    deaths: [],
    selfBarrelDamage: 0,
  };
}

function ensureRoundStats(client) {
  if (!client.roundStats) client.roundStats = createRoundStats();
  return client.roundStats;
}

function addDamageToInteraction(map, playerId, damageType, amount) {
  let stats = map.get(playerId);
  if (!stats) {
    stats = emptyDamageStats();
    map.set(playerId, stats);
  }
  const type = ['head', 'body', 'leg', 'barrel'].includes(damageType)
    ? damageType
    : 'body';
  const value = Math.max(0, Math.round(amount));
  stats[type] += value;
  stats.total += value;
}

function recordDamageInteraction(attacker, target, part, amount, weaponKey) {
  if (!attacker || !target) return;
  if (attacker.connected === false || target.connected === false) return;
  const damageType = weaponKey === 'barrel'
    ? 'barrel'
    : (['head', 'body', 'leg'].includes(part) ? part : 'body');
  if (attacker.id === target.id) {
    if (damageType === 'barrel') {
      ensureRoundStats(attacker).selfBarrelDamage += Math.max(0, Math.round(amount));
    }
    return;
  }
  addDamageToInteraction(ensureRoundStats(attacker).outgoing, target.id, damageType, amount);
  addDamageToInteraction(ensureRoundStats(target).incoming, attacker.id, damageType, amount);
}

function recordKillInteraction(attacker, target) {
  if (!attacker || !target) return;
  const attackerStats = ensureRoundStats(attacker);
  const targetStats = ensureRoundStats(target);
  attackerStats.kills.push(target.id);
  targetStats.deaths.push(attacker.id);
}

function buildRoundReport(room, client) {
  const stats = ensureRoundStats(client);
  const interactionIds = new Set([
    ...stats.outgoing.keys(),
    ...stats.incoming.keys(),
    ...stats.kills,
    ...stats.deaths,
  ]);
  const interactions = [];

  for (const otherId of interactionIds) {
    if (otherId === client.id) continue;
    const other = clients.get(otherId);
    if (!other) continue;
    const outgoing = stats.outgoing.get(otherId) || emptyDamageStats();
    const incoming = stats.incoming.get(otherId) || emptyDamageStats();
    interactions.push({
      playerId: otherId,
      name: other.name,
      team: other.team,
      outgoing,
      incoming,
      killed: stats.kills.includes(otherId),
      killedBy: stats.deaths.includes(otherId),
    });
  }

  interactions.sort((a, b) => (
    (b.outgoing.total + b.incoming.total) - (a.outgoing.total + a.incoming.total)
  ));
  return {
    round: room.round,
    playerId: client.id,
    playerName: client.name,
    team: client.team,
    selfBarrelDamage: stats.selfBarrelDamage || 0,
    interactions,
  };
}

function sendRoundReport(room, client, trigger) {
  if (!client || !client.ws) return null;
  const report = buildRoundReport(room, client);
  send(client.ws, { type: 'roundReport', trigger, report });
  return report;
}

function send(ws, message) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {}
}

function broadcastRoom(room, message, except = null) {
  let serialized = null;
  for (const id of room.memberIds) {
    const client = clients.get(id);
    if (!client || client === except || !client.ws || client.ws.readyState !== client.ws.OPEN) continue;
    if (serialized === null) serialized = JSON.stringify(message);
    try {
      client.ws.send(serialized);
    } catch {}
  }
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-5);
}

function publicPlayer(client) {
  return {
    id: client.id,
    name: client.name,
    team: client.team,
    ready: !!client.ready,
    isAI: !!client.isAI,
    connected: client.connected !== false,
    owner: client.roomId && rooms.get(client.roomId)?.ownerId === client.id,
  };
}

function roomLobby(room) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    mapId: room.mapId,
    mode: room.mode || 'team',
    survival: room.survival ? {
      phase: room.survival.phase,
      wave: room.survival.wave,
      mapIndex: room.survival.mapIndex,
      mapId: room.survival.mapId,
    } : null,
    phase: room.phase,
    players: Array.from(room.memberIds)
      .map(id => clients.get(id))
      .filter(Boolean)
      .map(publicPlayer),
  };
}

function remapRoundInteractionId(room, oldId, newId) {
  const renameMapKey = map => {
    if (!map.has(oldId)) return;
    const previous = map.get(oldId);
    map.delete(oldId);
    const existing = map.get(newId);
    if (!existing) {
      map.set(newId, previous);
      return;
    }
    for (const key of ['head', 'body', 'leg', 'barrel', 'total']) {
      existing[key] += previous[key] || 0;
    }
  };

  for (const id of room.memberIds) {
    const member = clients.get(id);
    if (!member?.roundStats) continue;
    renameMapKey(member.roundStats.outgoing);
    renameMapKey(member.roundStats.incoming);
    member.roundStats.kills = member.roundStats.kills.map(id => id === oldId ? newId : id);
    member.roundStats.deaths = member.roundStats.deaths.map(id => id === oldId ? newId : id);
  }
}

function tryMatchReconnect(room, newClient) {
  if (!room.matchAllowedIps?.has(newClient.ip)) {
    return { ok: false, message: '比赛已经开始，只有本局玩家可以重连' };
  }

  const candidates = Array.from(room.memberIds)
    .map(id => clients.get(id))
    .filter(client => client && client.connected === false && client.ip === newClient.ip);
  if (candidates.length === 0) {
    return { ok: false, message: '该 IP 的本局座位当前已在线，不能重复加入' };
  }

  const oldClient = candidates.find(client => client.name === newClient.name)
    || candidates[0];
  const oldId = oldClient.id;
  const newId = newClient.id;
  const orderedIds = Array.from(room.memberIds).map(id => id === oldId ? newId : id);
  room.memberIds.clear();
  for (const id of orderedIds) room.memberIds.add(id);

  const state = room.states.get(oldId);
  if (state) {
    room.states.delete(oldId);
    room.states.set(newId, state);
  }
  clients.delete(oldId);
  clients.set(newId, newClient);

  newClient.roomId = room.code;
  newClient.team = oldClient.team;
  newClient.ready = false;
  newClient.matchKills = oldClient.matchKills || 0;
  newClient.matchDeaths = oldClient.matchDeaths || 0;
  newClient.matchDamage = oldClient.matchDamage || 0;
  newClient.survivalKills = oldClient.survivalKills || 0;
  newClient.survivalWaveKills = oldClient.survivalWaveKills || 0;
  newClient.survivalCoins = oldClient.survivalCoins || 0;
  newClient.roundStats = oldClient.roundStats || createRoundStats();
  newClient.lastShotAt = oldClient.lastShotAt || 0;
  newClient.lastStateAt = oldClient.lastStateAt || 0;
  newClient.lastBarrelAt = oldClient.lastBarrelAt || 0;
  newClient._prevStateServerAt = oldClient._prevStateServerAt || 0;
  remapRoundInteractionId(room, oldId, newId);

  send(newClient.ws, {
    type: 'reconnected',
    id: newId,
    room: roomLobby(room),
  });
  if (room.survival) broadcastSurvivalState(room);
  return { ok: true, oldId, newId };
}

function broadcastLobby(room) {
  broadcastRoom(room, { type: 'lobby', room: roomLobby(room) });
}

function survivalPortalCenter(mapId) {
  return {
    x: 0,
    z: mapId === 'indoor_complex' ? -9.5 : 0,
  };
}

function isSurvivalAmmoDropWave(room, wave) {
  const survival = room.survival;
  if (!survival) return false;
  const mapsPerLoop = SURVIVAL_MAPS.length;
  const mapWaves = 5;
  const globalWave = Math.max(0, survival.endlessLoop || 0) * mapsPerLoop * mapWaves
    + Math.max(0, survival.mapIndex || 0) * mapWaves
    + Math.max(0, Number(wave) || 0);
  return globalWave % 10 === 3 || globalWave % 10 === 8;
}

function connectedHumanPlayers(room) {
  return Array.from(room.memberIds)
    .map(id => clients.get(id))
    .filter(client => client && !client.isAI && client.connected !== false);
}

function connectedSurvivalPlayers(room) {
  return Array.from(room.memberIds)
    .map(id => clients.get(id))
    .filter(client => client && client.connected !== false);
}

function removeAllAI(room) {
  for (const id of Array.from(room.memberIds)) {
    const member = clients.get(id);
    if (!member?.isAI) continue;
    room.memberIds.delete(id);
    room.states?.delete(id);
    clients.delete(id);
  }
}

function addAIClient(room, team) {
  const survival = room.mode === 'survival';
  const normalizedTeam = survival ? 'blue' : (team === 'red' ? 'red' : 'blue');
  const count = survival ? room.memberIds.size : teamPlayers(room, normalizedTeam).length;
  const limit = survival ? MAX_SURVIVAL_PLAYERS : MAX_TEAM;
  if (count >= limit) return null;
  if (!room.nextAiNumber) {
    room.nextAiNumber = 1;
  }
  let number = room.nextAiNumber++;
  let id = `ai:${room.code}:${number}`;
  while (clients.has(id)) {
    number = room.nextAiNumber++;
    id = `ai:${room.code}:${number}`;
  }
  const aiClient = {
    id,
    ws: null,
    ip: null,
    isAI: true,
    connected: true,
    name: `电脑${number}`,
    roomId: room.code,
    team: normalizedTeam,
    ready: true,
    lastShotAt: 0,
    lastStateAt: 0,
    lastBarrelAt: 0,
    matchKills: 0,
    matchDeaths: 0,
    matchDamage: 0,
    roundStats: createRoundStats(),
  };
  clients.set(id, aiClient);
  room.memberIds.add(id);
  return aiClient;
}

function buildSurvivalSummary(room) {
  const players = connectedSurvivalPlayers(room).map(client => ({
    id: client.id,
    name: client.name,
    kills: client.survivalWaveKills || 0,
    downed: !!room.states.get(client.id)?.downed,
  }));
  const totalKills = players.reduce((sum, player) => sum + player.kills, 0);
  const bestKills = players.length ? Math.max(...players.map(player => player.kills)) : 0;
  const worstKills = players.length ? Math.min(...players.map(player => player.kills)) : 0;
  const uniqueBest = players.filter(player => player.kills === bestKills).length === 1;
  const uniqueWorst = players.filter(player => player.kills === worstKills).length === 1;
  for (const player of players) {
    player.best = player.kills === bestKills;
    player.worst = player.kills === worstKills;
    player.bestLabel = player.best ? (uniqueBest ? '最佳玩家' : '并列最佳') : '';
    player.worstLabel = player.worst
      ? (uniqueWorst ? '最菜玩家' : '并列最菜')
      : '';
  }
  return {
    wave: room.survival?.wave || 0,
    totalKills,
    players,
  };
}

function resetSurvivalRoundState(room) {
  room.finalProjectileFx?.clear();
  let slot = 0;
  for (const id of room.memberIds) {
    const client = clients.get(id);
    if (!client) continue;
    client.survivalWaveKills = 0;
    client.survivalKills = client.survivalKills || 0;
    room.states.set(id, {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      height: 1.84,
      weapon: 'rifle',
      crouching: false,
      alive: true,
      downed: false,
      hp: 100,
      maxHp: 100,
      armor: 50,
      spawnSlot: slot++,
      aimStage: 0,
    });
    client.ready = !!client.isAI;
  }
}

function prepareSurvivalMapState(room) {
  let slot = 0;
  for (const id of room.memberIds) {
    const client = clients.get(id);
    const previous = room.states.get(id);
    if (!client) continue;
    room.states.set(id, {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      height: 1.84,
      weapon: previous?.weapon || 'rifle',
      crouching: false,
      alive: true,
      downed: false,
      hp: Math.max(1, Math.min(300, Number(previous?.hp) || 100)),
      maxHp: Math.max(100, Math.min(300, Number(previous?.maxHp) || 100)),
      armor: 50,
      spawnSlot: slot++,
      aimStage: 0,
    });
  }
}

function broadcastSurvivalState(room) {
  const survival = room.survival;
  if (!survival) return;
  broadcastRoom(room, {
    type: 'survivalState',
    phase: survival.phase,
    wave: survival.wave,
    mapIndex: survival.mapIndex,
    mapId: survival.mapId,
    phaseRemain: Math.max(0, survival.phaseEnd - Date.now()),
    endlessMode: !!survival.endlessMode,
    endlessLoop: survival.endlessLoop || 0,
    portalReady: Array.from(survival.portalReady || []),
    portalRequired: connectedHumanPlayers(room).map(client => client.id),
  });
}

function reviveAllDowned(room, hp = SURVIVAL_REVIVE_HP) {
  if (room.survival?.activeRescue) cancelSurvivalRescue(room, 'auto-revive');
  for (const id of room.memberIds) {
    const client = clients.get(id);
    const state = room.states.get(id);
    if (!client || !state || !state.downed) continue;
    state.downed = false;
    state.alive = true;
    state.hp = hp;
    state.armor = Math.max(state.armor || 0, 0);
    broadcastRoom(room, {
      type: 'survivalPlayerRevived',
      playerId: id,
      hp,
      auto: true,
    });
  }
}

function checkSurvivalWipe(room) {
  if (room.mode !== 'survival' || room.phase !== 'survival') return false;
  if (room.survival?.phase === 'defeat' || room.survival?.phase === 'victory') return false;
  const connected = connectedSurvivalPlayers(room);
  if (connected.length === 0) return false;
  const allDown = connected.every(client => !!room.states.get(client.id)?.downed);
  if (!allDown) return false;

  room.survival.phase = 'defeat';
  room.survival.phaseEnd = Date.now();
  room.phase = 'matchEnd';
  broadcastRoom(room, { type: 'survivalEnd', victory: false });
  return true;
}

function finishSurvivalMapLoad(room, now) {
  const survival = room.survival;
  if (!survival || survival.phase !== 'mapLoading') return;
  const required = connectedHumanPlayers(room).map(client => client.id);
  if (required.length > 0 && !required.every(id => survival.mapReady.has(id))) return;

  survival.phase = 'prep';
  survival.wave = 0;
  survival.phaseEnd = now + SURVIVAL_PREP_MS;
  survival.portalReady.clear();
  survival.mapReady.clear();
  survival.zombies.clear();
  survival.deadZombies.clear();
  survival.activeHeals.clear();
  survival.activeRescue = null;
  prepareSurvivalMapState(room);
  broadcastRoom(room, {
    type: 'survivalMapLoaded',
    mapId: survival.mapId,
    mapIndex: survival.mapIndex,
  });
  broadcastSurvivalState(room);
}

function cancelSurvivalHeal(room, healerId, reason = 'cancelled') {
  const heal = room.survival?.activeHeals?.get(healerId);
  if (!heal) return;
  room.survival.activeHeals.delete(healerId);
  broadcastRoom(room, {
    type: 'survivalHealCancel',
    healerId,
    targetId: heal.targetId,
    reason,
  });
}

function processSurvivalHeals(room, now) {
  const survival = room.survival;
  if (!survival || !['prep', 'wave', 'portal'].includes(survival.phase)) return;
  for (const [healerId, heal] of Array.from(survival.activeHeals.entries())) {
    const healer = clients.get(healerId);
    const target = clients.get(heal.targetId);
    const healerState = room.states.get(healerId);
    const targetState = room.states.get(heal.targetId);
    if (!healer || !target || !healerState || !targetState
        || !healerState.alive || healerState.downed
        || !targetState.alive || targetState.downed) {
      cancelSurvivalHeal(room, healerId, 'invalid-target');
      continue;
    }
    const distance = Math.hypot(
      healerState.x - targetState.x,
      healerState.z - targetState.z
    );
    if (distance > SURVIVAL_HEAL_RANGE) {
      cancelSurvivalHeal(room, healerId, 'out-of-range');
      continue;
    }
    if (now < heal.endAt) continue;
    const maxHp = Math.max(100, Number(targetState.maxHp) || 100);
    const before = targetState.hp;
    targetState.hp = Math.min(maxHp, targetState.hp + SURVIVAL_HEAL_AMOUNT);
    const healed = Math.max(0, Math.round(targetState.hp - before));
    survival.activeHeals.delete(healerId);
    broadcastRoom(room, {
      type: 'survivalHealComplete',
      healerId,
      targetId: target.id,
      hp: targetState.hp,
      amount: healed,
    });
  }
}

function cancelSurvivalRescue(room, reason = 'cancelled') {
  const rescue = room.survival?.activeRescue;
  if (!rescue) return;
  room.survival.activeRescue = null;
  broadcastRoom(room, {
    type: 'survivalRescueCancel',
    rescuerId: rescue.rescuerId,
    targetId: rescue.targetId,
    reason,
  });
}

function processSurvivalRescue(room, now) {
  const survival = room.survival;
  const rescue = survival?.activeRescue;
  if (!survival || !rescue) return;
  if (!['prep', 'wave', 'portal'].includes(survival.phase)) {
    cancelSurvivalRescue(room, 'phase-ended');
    return;
  }
  const rescuerState = room.states.get(rescue.rescuerId);
  const targetState = room.states.get(rescue.targetId);
  if (!rescuerState?.alive || rescuerState.downed
      || !targetState?.downed) {
    cancelSurvivalRescue(room, 'invalid-target');
    return;
  }
  const distance = Math.hypot(
    rescuerState.x - targetState.x,
    rescuerState.z - targetState.z
  );
  if (distance > SURVIVAL_REVIVE_RANGE + 0.35) {
    cancelSurvivalRescue(room, 'out-of-range');
    return;
  }
  if (now < rescue.endAt) return;
  targetState.downed = false;
  targetState.alive = true;
  targetState.hp = SURVIVAL_REVIVE_HP;
  survival.activeRescue = null;
  broadcastRoom(room, {
    type: 'survivalPlayerRevived',
    playerId: rescue.targetId,
    rescuerId: rescue.rescuerId,
    hp: SURVIVAL_REVIVE_HP,
  });
}

function leaveRoom(client, notify = true) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room) return;

  room.memberIds.delete(client.id);
  room.states.delete(client.id);
  client.roomId = null;
  client.team = null;
  client.ready = false;

  const hasHumanMember = Array.from(room.memberIds)
    .some(id => !clients.get(id)?.isAI);
  if (!hasHumanMember) {
    removeAllAI(room);
    rooms.delete(room.code);
    return;
  }

  if (room.ownerId === client.id) {
    room.ownerId = room.memberIds.values().next().value;
  }

  if (notify) {
    broadcastLobby(room);
    broadcastRoom(room, { type: 'roster', phase: room.phase, players: room.memberIds.size });
    checkElimination(room);
  }
}

function teamPlayers(room, team) {
  return Array.from(room.memberIds)
    .map(id => clients.get(id))
    .filter(client => client && client.team === team);
}

function aliveCount(room, team) {
  let alive = 0;
  for (const client of teamPlayers(room, team)) {
    if (client.connected === false) continue;
    const state = room.states.get(client.id);
    if (state && state.alive) alive++;
  }
  return alive;
}

function resetRound(room) {
  room.finalProjectileFx?.clear();
  let blueSlot = 0;
  let redSlot = 0;
  for (const id of room.memberIds) {
    const client = clients.get(id);
    if (!client) continue;
    client.roundStats = createRoundStats();
    const slot = client.team === 'blue' ? blueSlot++ : redSlot++;
    room.states.set(id, {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      height: 1.84,
      weapon: 'rifle',
      crouching: false,
      alive: true,
      hp: 100,
      armor: 50,
      spawnSlot: slot,
    });
    client.ready = !!client.isAI;
  }
}

function beginPrep(room) {
  room.phase = 'prep';
  room.phaseEnd = Date.now() + PREP_MS;
  resetRound(room);
  broadcastRoom(room, {
    type: 'round',
    phase: 'prep',
    round: room.round,
    blueScore: room.blueScore,
    redScore: room.redScore,
    phaseMs: PREP_MS,
  });
}

function startSurvivalMatch(room) {
  if (!room.memberIds.size) return;
  const mapId = 'battlefield';
  const mapIndex = 0;
  for (const id of room.memberIds) {
    const client = clients.get(id);
    if (!client) continue;
    client.team = 'blue';
    client.survivalKills = 0;
    client.survivalWaveKills = 0;
    client.survivalCoins = 0;
  }
  room.phase = 'survival';
  room.matchId = crypto.randomUUID();
  room.matchStartedAt = Date.now();
  room.matchAllowedIps = new Set(
    Array.from(room.memberIds)
      .map(id => clients.get(id)?.ip)
      .filter(Boolean)
  );
  room.survival = {
    phase: 'prep',
    wave: 0,
    mapIndex,
    mapId,
    mapsCleared: 0,
    endlessMode: false,
    endlessLoop: 0,
    phaseEnd: Date.now() + SURVIVAL_PREP_MS,
    portalReady: new Set(),
    mapReady: new Set(),
    zombies: new Map(),
    deadZombies: new Set(),
    queueRemaining: 0,
    activeHeals: new Map(),
    activeRescue: null,
    lastZombieDeath: null,
    lastAmmoDropKey: '',
  };
  resetSurvivalRoundState(room);
  broadcastRoom(room, {
    type: 'matchStart',
    mode: 'survival',
    mapId,
  });
  broadcastSurvivalState(room);
}

function beginLanLoading(room) {
  const players = connectedHumanPlayers(room);
  const progress = {};
  for (const player of players) progress[player.id] = 0;
  room.phase = 'loading';
  room.loading = {
    mapId: room.mode === 'survival' ? 'battlefield' : room.mapId,
    mode: room.mode || 'team',
    progress,
    startedAt: Date.now(),
    allDone: false,
    startAt: 0,
  };
  broadcastRoom(room, {
    type: 'lanLoadingStart',
    mapId: room.loading.mapId,
    mode: room.loading.mode,
    players: players.map(player => ({
      id: player.id,
      name: player.name,
      isSelf: false,
    })),
  });
}

function broadcastLanLoadingStatus(room) {
  if (!room.loading) return;
  broadcastRoom(room, {
    type: 'lanLoadingStatus',
    progress: { ...room.loading.progress },
  });
}

function tickLanLoading(room, now) {
  if (room.phase !== 'loading' || !room.loading) return false;
  const required = connectedHumanPlayers(room).map(client => client.id);
  for (const id of required) {
    if (room.loading.progress[id] === undefined) room.loading.progress[id] = 0;
  }
  const allLoaded = required.length > 0
    && required.every(id => room.loading.progress[id] >= 1);
  if (allLoaded && !room.loading.allDone) {
    room.loading.allDone = true;
    room.loading.startAt = now + 350;
    broadcastRoom(room, { type: 'lanLoadingAllComplete' });
  }
  if (room.loading.allDone && now >= room.loading.startAt) {
    room.loading = null;
    startMatch(room);
  }
  return true;
}

function startMatch(room) {
  if (room.mode === 'survival') {
    startSurvivalMatch(room);
    return;
  }
  const blue = teamPlayers(room, 'blue').length;
  const red = teamPlayers(room, 'red').length;
  if (!blue || !red) return;

  for (const id of room.memberIds) {
    const client = clients.get(id);
    if (!client) continue;
    client.matchKills = 0;
    client.matchDeaths = 0;
    client.matchDamage = 0;
  }
  room.phase = 'prep';
  room.round = 1;
  room.blueScore = 0;
  room.redScore = 0;
  room.roundWinner = null;
  room.roundEndsAt = 0;
  room.returnedIds.clear();
  room.matchId = crypto.randomUUID();
  room.matchStartedAt = Date.now();
  room.matchAllowedIps = new Set(
    Array.from(room.memberIds)
      .map(id => clients.get(id)?.ip)
      .filter(Boolean)
  );
  broadcastRoom(room, { type: 'matchStart', mapId: room.mapId });
  beginPrep(room);
}

function endRound(room, winnerTeam) {
  if (room.phase !== 'round') return;
  if (winnerTeam === 'blue') room.blueScore++;
  else if (winnerTeam === 'red') room.redScore++;

  room.phase = 'roundEnd';
  room.phaseEnd = Date.now() + ROUND_END_MS;
  room.roundWinner = winnerTeam;
  broadcastRoom(room, {
    type: 'roundEnd',
    winnerTeam,
    round: room.round,
    blueScore: room.blueScore,
    redScore: room.redScore,
    phaseMs: ROUND_END_MS,
  });
  for (const id of room.memberIds) {
    sendRoundReport(room, clients.get(id), 'roundEnd');
  }
}

function checkElimination(room) {
  if (room.phase !== 'round') return;
  const blueAlive = aliveCount(room, 'blue');
  const redAlive = aliveCount(room, 'red');
  if (blueAlive === 0 && redAlive === 0) endRound(room, null);
  else if (redAlive === 0) endRound(room, 'blue');
  else if (blueAlive === 0) endRound(room, 'red');
}

function roomTick(room) {
  const now = Date.now();
  if (tickLanLoading(room, now)) return;
  if (room.mode === 'survival' && room.survival) {
    const survival = room.survival;
    if (survival.phase === 'prep' && now >= survival.phaseEnd) {
      survival.wave++;
      survival.phase = 'wave';
      survival.phaseEnd = 0;
      for (const id of room.memberIds) {
        const client = clients.get(id);
        if (client) client.survivalWaveKills = 0;
      }
      broadcastSurvivalState(room);
    } else if (survival.phase === 'mapLoading') {
      finishSurvivalMapLoad(room, now);
    }
    processSurvivalHeals(room, now);
    processSurvivalRescue(room, now);
  } else if (room.phase === 'prep' && now >= room.phaseEnd) {
    room.phase = 'round';
    room.phaseEnd = now + ROUND_LIMIT_MS;
    broadcastRoom(room, {
      type: 'round',
      phase: 'round',
      round: room.round,
      phaseMs: ROUND_LIMIT_MS,
    });
  } else if (room.phase === 'round' && now >= room.phaseEnd) {
    const blueAlive = aliveCount(room, 'blue');
    const redAlive = aliveCount(room, 'red');
    endRound(room, blueAlive === redAlive ? null : (blueAlive > redAlive ? 'blue' : 'red'));
  } else if (room.phase === 'roundEnd' && now >= room.phaseEnd) {
    if (room.blueScore >= MATCH_POINT || room.redScore >= MATCH_POINT) {
      room.phase = 'matchEnd';
      room.phaseEnd = now;
      room.returnedIds.clear();
      broadcastRoom(room, {
        type: 'matchEnd',
        matchId: room.matchId,
        winnerTeam: room.blueScore > room.redScore ? 'blue' : (room.redScore > room.blueScore ? 'red' : null),
        blueScore: room.blueScore,
        redScore: room.redScore,
        mapId: room.mapId,
        rounds: room.round,
        playedAt: new Date(room.matchStartedAt || now).toISOString(),
        durationMs: Math.max(0, now - (room.matchStartedAt || now)),
        players: Array.from(room.memberIds)
          .map(id => clients.get(id))
          .filter(Boolean)
          .map(client => ({
            id: client.id,
            name: client.name,
            team: client.team,
            kills: client.matchKills || 0,
            deaths: client.matchDeaths || 0,
            damage: client.matchDamage || 0,
          })),
      });
    } else {
      room.round++;
      beginPrep(room);
    }
  }

  const survivalMode = room.mode === 'survival' && room.survival;
  if (!survivalMode && !['prep', 'round', 'roundEnd', 'matchEnd'].includes(room.phase)) return;
  const players = [];
  for (const id of room.memberIds) {
    const client = clients.get(id);
    const state = room.states.get(id);
    if (!client || !state) continue;
    players.push({
      id,
      name: client.name,
      team: client.team,
      isAI: !!client.isAI,
      x: state.x, y: state.y, z: state.z,
      yaw: state.yaw, pitch: state.pitch,
      height: state.height,
      weapon: state.weapon,
      aiming: !!state.aiming,
      reloadRemain: state.reloadRemain || 0,
      boltRemain: state.boltRemain || 0,
      meleeRemain: state.meleeRemain || 0,
      meleeHeavy: !!state.meleeHeavy,
      crouching: !!state.crouching,
      alive: !!state.alive,
      downed: !!state.downed,
      connected: client.connected !== false,
      hp: state.hp,
      maxHp: state.maxHp || 100,
      armor: state.armor,
      spawnSlot: state.spawnSlot,
      kills: client.matchKills || 0,
      deaths: client.matchDeaths || 0,
      damage: client.matchDamage || 0,
      survivalKills: client.survivalKills || 0,
      survivalWaveKills: client.survivalWaveKills || 0,
      survivalCoins: client.survivalCoins || 0,
    });
  }

  const phase = survivalMode ? room.survival.phase : room.phase;
  const phaseRemain = survivalMode
    ? Math.max(0, room.survival.phaseEnd - now)
    : Math.max(0, room.phaseEnd - now);
  broadcastRoom(room, {
    type: 'snapshot',
    serverTime: now,
    phase,
    mode: room.mode || 'team',
    mapId: survivalMode ? room.survival.mapId : room.mapId,
    round: room.round,
    blueScore: room.blueScore,
    redScore: room.redScore,
    phaseRemain,
    players,
  });
}

const WEAPON_DAMAGE = {
  rifle: { head: 160, body: 40, leg: 34, fireMs: 103 },
  sniper: { head: 255, body: 150, leg: 120, fireMs: 850 },
  shotgun: { head: 44, body: 22, leg: 19, fireMs: 350 },
  odin: { head: 95, body: 38, leg: 32, fireMs: 65 },
};

function applyDamage(room, attacker, target, weaponKey, part, distance, damageOverride, options = {}) {
  const survivalDamage = room.mode === 'survival'
    && room.phase === 'survival'
    && room.survival
    && !['defeat', 'victory'].includes(room.survival.phase);
  if (room.phase !== 'round' && !survivalDamage) return;
  if (!attacker || !target) return;
  if (attacker.id === target.id && !options.allowSelf) return;
  if (!attacker.team) return;
  if (attacker.team === target.team && !options.allowFriendly) return;

  const attackerState = room.states.get(attacker.id);
  const targetState = room.states.get(target.id);
  if (!attackerState || !targetState) return;
  if (!attackerState.alive && !options.allowDeadAttacker) return;
  if (!targetState.alive) return;

  const dx = attackerState.x - targetState.x;
  const dz = attackerState.z - targetState.z;
  if (Math.hypot(dx, dz) > 160) return;

  let damage = Number(damageOverride);
  if (!Number.isFinite(damage)) {
    const weapon = WEAPON_DAMAGE[weaponKey];
    if (!weapon) return;
    damage = weapon[part] || weapon.body;
    if (weaponKey === 'odin' && Number(distance) > 30) damage = Math.max(1, damage * 0.82);
  }
  damage = Math.max(0, Math.min(300, damage));
  const isEnemyHit = attacker.team !== target.team;
  if (isEnemyHit) {
    attacker.matchDamage = (attacker.matchDamage || 0) + Math.round(damage);
  }
  if (!survivalDamage) recordDamageInteraction(attacker, target, part, damage, weaponKey);

  const absorb = Math.min(targetState.armor, damage * 0.66);
  targetState.armor = Math.max(0, targetState.armor - absorb);
  targetState.hp = Math.max(0, targetState.hp - (damage - absorb));

  broadcastRoom(room, {
    type: 'damage',
    attackerId: attacker.id,
    targetId: target.id,
    part,
    damage: Math.round(damage),
    hp: Math.round(targetState.hp),
    armor: Math.round(targetState.armor),
  });

  if (targetState.hp <= 0) {
    targetState.alive = false;
    if (survivalDamage) {
      targetState.downed = true;
      targetState.hp = 0;
      targetState.aiming = false;
      targetState.aimStage = 0;
      target.survivalDowns = (target.survivalDowns || 0) + 1;
      broadcastRoom(room, {
        type: 'survivalPlayerDowned',
        playerId: target.id,
        attackerId: attacker.id,
        weapon: weaponKey,
      });
      checkSurvivalWipe(room);
      return;
    }
    if (isEnemyHit) attacker.matchKills = (attacker.matchKills || 0) + 1;
    target.matchDeaths = (target.matchDeaths || 0) + 1;
    recordKillInteraction(attacker, target);
    broadcastRoom(room, {
      type: 'kill',
      attackerId: attacker.id,
      targetId: target.id,
    });
    sendRoundReport(room, target, 'death');
    if (!options.deferElimination) checkElimination(room);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const client = {
    id: 'p' + nextClientId++,
    ws,
    ip: normalizedIp(ws),
    connected: true,
    name: '玩家' + nextClientId,
    roomId: null,
    team: null,
    ready: false,
    lastShotAt: 0,
    lastStateAt: 0,
    lastBarrelAt: 0,
    matchKills: 0,
    matchDeaths: 0,
    matchDamage: 0,
    roundStats: createRoundStats(),
  };
  clients.set(client.id, client);
  send(ws, { type: 'welcome', id: client.id, serverTime: Date.now() });

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      client.name = safeText(msg.name, 20) || client.name;
      send(ws, { type: 'hello', id: client.id, name: client.name, serverTime: Date.now() });
      const currentRoom = client.roomId ? rooms.get(client.roomId) : null;
      if (currentRoom) broadcastLobby(currentRoom);
      return;
    }

    if (msg.type === 'createRoom') {
      leaveRoom(client);
      const code = makeCode();
      const room = {
        code,
        ownerId: client.id,
        mapId: ['battlefield', 'desert', 'indoor_complex'].includes(msg.mapId) ? msg.mapId : 'battlefield',
        mode: 'team',
        memberIds: new Set([client.id]),
        states: new Map(),
        returnedIds: new Set(),
        finalProjectileFx: new Set(),
        nextAiNumber: 1,
        phase: 'lobby',
        round: 0,
        blueScore: 0,
        redScore: 0,
        phaseEnd: 0,
      };
      rooms.set(code, room);
      client.roomId = code;
      client.team = 'blue';
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'joinRoom') {
      const code = safeText(msg.code, 5).toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: '房间不存在' });
        return;
      }
      if (room.phase !== 'lobby') {
        const reconnect = tryMatchReconnect(room, client);
        if (!reconnect.ok) {
          send(ws, { type: 'error', message: reconnect.message });
        }
        return;
      }
      leaveRoom(client);
      if (room.mode === 'survival') {
        if (room.memberIds.size >= MAX_SURVIVAL_PLAYERS) {
          send(ws, { type: 'error', message: '生存小队已满（最多 10 人）' });
          return;
        }
        room.memberIds.add(client.id);
        client.roomId = code;
        client.team = 'blue';
        client.ready = false;
        broadcastLobby(room);
        return;
      }
      const blue = teamPlayers(room, 'blue').length;
      const red = teamPlayers(room, 'red').length;
      let team = null;
      if (blue <= red && blue < MAX_TEAM) team = 'blue';
      else if (red < MAX_TEAM) team = 'red';
      if (!team) {
        send(ws, { type: 'error', message: '房间已满' });
        return;
      }
      room.memberIds.add(client.id);
      client.roomId = code;
      client.team = team;
      client.ready = false;
      broadcastLobby(room);
      return;
    }

    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (!room) return;

    if (msg.type === 'switchTeam') {
      if (room.phase !== 'lobby') return;
      if (room.mode === 'survival') return;
      const team = msg.team === 'red' ? 'red' : 'blue';
      if (teamPlayers(room, team).length >= MAX_TEAM) {
        send(ws, { type: 'error', message: '该队伍已满' });
        return;
      }
      client.team = team;
      client.ready = false;
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'addAI') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') {
        return;
      }
      const team = room.mode === 'survival' ? 'blue' : (msg.team === 'red' ? 'red' : 'blue');
      const aiClient = addAIClient(room, team);
      if (!aiClient) {
        send(ws, {
          type: 'error',
          message: room.mode === 'survival'
            ? '生存小队已满（最多 10 人）'
            : '该队伍已满，无法添加电脑玩家',
        });
        return;
      }
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'removeAI') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
      const target = clients.get(String(msg.id || ''));
      if (!target?.isAI || target.roomId !== room.code) return;
      room.memberIds.delete(target.id);
      room.states.delete(target.id);
      clients.delete(target.id);
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'ready') {
      if (room.phase !== 'lobby') return;
      client.ready = !!msg.ready;
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'setMap') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
      if (room.mode === 'survival') return;
      if (['battlefield', 'desert', 'indoor_complex'].includes(msg.mapId)) {
        room.mapId = msg.mapId;
        broadcastLobby(room);
      }
      return;
    }

    if (msg.type === 'setMode') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
      if (['team', 'survival'].includes(msg.mode)) {
        room.mode = msg.mode;
        if (room.mode === 'survival') {
          room.mapId = 'battlefield';
          for (const id of room.memberIds) {
            const member = clients.get(id);
            if (member) {
              member.team = 'blue';
              member.ready = !!member.isAI;
            }
          }
        } else {
          let index = 0;
          for (const id of room.memberIds) {
            const member = clients.get(id);
            if (member) {
              member.team = index++ % 2 === 0 ? 'blue' : 'red';
              member.ready = !!member.isAI;
            }
          }
        }
        broadcastLobby(room);
      }
      return;
    }

    if (msg.type === 'startMatch') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
      const members = room.memberIds.size;
      const allReady = room.memberIds.size > 0 && [...room.memberIds].every(id => clients.get(id)?.ready);
      if (room.mode === 'survival') {
        if (members < 1 || members > MAX_SURVIVAL_PLAYERS || !allReady) {
          send(ws, { type: 'error', message: '所有生存小队成员准备后才能开始' });
          return;
        }
      } else if (!teamPlayers(room, 'blue').length
          || !teamPlayers(room, 'red').length
          || !allReady) {
        send(ws, { type: 'error', message: '双方至少各一人，且所有玩家准备后才能开始' });
        return;
      }
      beginLanLoading(room);
      return;
    }

    if (msg.type === 'lanLoadingProgress' || msg.type === 'lanLoadingComplete') {
      if (room.phase !== 'loading' || !room.loading) return;
      if (room.loading.progress[client.id] === undefined) return;
      const progress = msg.type === 'lanLoadingComplete'
        ? 1
        : Math.max(0, Math.min(1, Number(msg.progress) || 0));
      room.loading.progress[client.id] = Math.max(
        room.loading.progress[client.id],
        progress
      );
      broadcastLanLoadingStatus(room);
      return;
    }

    if (msg.type === 'survivalSnapshot') {
      if (room.mode !== 'survival' || room.ownerId !== client.id || !room.survival) return;
      if (room.survival.phase !== 'wave') return;
      const nextZombies = new Map();
      const list = Array.isArray(msg.zombies) ? msg.zombies.slice(0, 45) : [];
      for (const item of list) {
        const netId = safeText(item.netId, 24);
        if (!netId || room.survival.deadZombies.has(netId)) continue;
        const x = Number(item.x);
        const y = Number(item.y);
        const z = Number(item.z);
        if (![x, y, z].every(Number.isFinite)) continue;
        nextZombies.set(netId, {
          netId,
          type: ['normal', 'small', 'big', 'musician'].includes(item.type)
            ? item.type
            : 'normal',
          hp: Math.max(1, Math.min(10000, Math.round(Number(item.hp) || 1))),
          maxHp: Math.max(1, Math.min(10000, Math.round(Number(item.maxHp) || 1))),
          x, y, z,
          yaw: Number(item.yaw) || 0,
        });
      }
      room.survival.zombies = nextZombies;
      room.survival.queueRemaining = Math.max(0, Math.min(200, Number(msg.queueRemaining) || 0));
      broadcastRoom(room, {
        type: 'survivalSnapshot',
        serverTime: Date.now(),
        zombies: Array.from(nextZombies.values()),
        queueRemaining: room.survival.queueRemaining,
      }, client);
      return;
    }

    if (msg.type === 'survivalZombieHit') {
      if (room.mode !== 'survival' || !room.survival || room.survival.phase !== 'wave') return;
      const zombie = room.survival.zombies.get(String(msg.zombieId || ''));
      if (!zombie || room.survival.deadZombies.has(zombie.netId)) return;
      let attacker = client;
      if (msg.attackerId != null) {
        if (room.ownerId !== client.id) return;
        const requestedAttacker = clients.get(String(msg.attackerId));
        if (!requestedAttacker?.isAI || requestedAttacker.roomId !== room.code) return;
        attacker = requestedAttacker;
      }
      const damage = Math.max(1, Math.min(500, Math.round(Number(msg.damage) || 0)));
      zombie.hp = Math.max(0, zombie.hp - damage);
      let killed = false;
      let coinReward = 0;
      if (zombie.hp <= 0) {
        killed = true;
        room.survival.deadZombies.add(zombie.netId);
        room.survival.lastZombieDeath = {
          x: zombie.x,
          y: zombie.y,
          z: zombie.z,
        };
        attacker.survivalKills = (attacker.survivalKills || 0) + 1;
        attacker.survivalWaveKills = (attacker.survivalWaveKills || 0) + 1;
        coinReward = (zombie.type === 'big' || zombie.type === 'musician') ? 2 : 1;
        attacker.survivalCoins = (attacker.survivalCoins || 0) + coinReward;
      }
      broadcastRoom(room, {
        type: 'survivalZombieDamaged',
        zombieId: zombie.netId,
        hp: zombie.hp,
        killed,
        killerId: killed ? attacker.id : null,
        coinReward,
      });
      return;
    }

    if (msg.type === 'survivalZombieAttack') {
      if (room.mode !== 'survival' || room.ownerId !== client.id || !room.survival) return;
      if (room.survival.phase !== 'wave') return;
      const target = clients.get(String(msg.targetId || ''));
      if (!target) return;
      const targetState = room.states.get(target.id);
      if (!targetState || !targetState.alive || targetState.downed) return;
      applyDamage(
        room,
        client,
        target,
        'zombie',
        'body',
        0,
        Math.max(1, Math.min(100, Number(msg.damage) || 10)),
        {
          allowFriendly: true,
          allowSelf: true,
          allowDeadAttacker: true,
          deferElimination: true,
        }
      );
      const updatedState = room.states.get(target.id);
      if (updatedState) {
        broadcastRoom(room, {
          type: 'survivalPlayerDamaged',
          playerId: target.id,
          hp: updatedState.hp,
          armor: updatedState.armor,
          source: 'zombie',
        });
      }
      return;
    }

    if (msg.type === 'survivalWaveClear') {
      if (room.mode !== 'survival' || room.ownerId !== client.id || !room.survival) return;
      if (room.survival.phase !== 'wave') return;
      const now = Date.now();
      const clearedWave = Math.max(1, Number(msg.wave) || room.survival.wave);
      if (isSurvivalAmmoDropWave(room, clearedWave)) {
        const dropKey = `${room.survival.endlessLoop || 0}:${room.survival.mapIndex || 0}:${clearedWave}`;
        if (room.survival.lastAmmoDropKey !== dropKey) {
          room.survival.lastAmmoDropKey = dropKey;
          const death = room.survival.lastZombieDeath;
          const center = survivalPortalCenter(room.survival.mapId);
          broadcastRoom(room, {
            type: 'survivalAmmoDrop',
            wave: clearedWave,
            x: Number.isFinite(death?.x) ? death.x : center.x,
            y: Number.isFinite(death?.y) ? death.y : 0,
            z: Number.isFinite(death?.z) ? death.z : center.z,
          });
        }
      }
      const summary = buildSurvivalSummary(room);
      broadcastRoom(room, { type: 'survivalWaveSummary', summary });
      room.survival.lastZombieDeath = null;
      room.survival.zombies.clear();
      if (room.survival.wave >= 5) {
        reviveAllDowned(room, SURVIVAL_REVIVE_HP);
        if (room.survival.mapsCleared >= SURVIVAL_MAPS.length - 1
            && !room.survival.endlessMode) {
          room.survival.phase = 'endlessChoice';
          room.survival.phaseEnd = now;
          broadcastSurvivalState(room);
          broadcastRoom(room, {
            type: 'survivalEndlessChoice',
            hostId: room.ownerId,
          });
        } else {
          room.survival.phase = 'portal';
          room.survival.phaseEnd = 0;
          room.survival.portalReady.clear();
          broadcastSurvivalState(room);
        }
      } else {
        room.survival.phase = 'prep';
        room.survival.phaseEnd = now + SURVIVAL_PREP_MS;
        broadcastSurvivalState(room);
      }
      return;
    }

    if (msg.type === 'survivalRescueStart') {
      if (room.mode !== 'survival' || !room.survival) return;
      if (!['prep', 'wave', 'portal'].includes(room.survival.phase)) return;
      const target = clients.get(String(msg.targetId || ''));
      const reject = reason => send(ws, {
        type: 'survivalRescueCancel',
        rescuerId: client.id,
        targetId: String(msg.targetId || ''),
        reason,
      });
      if (!target || target === client) {
        reject('invalid-target');
        return;
      }
      const targetState = room.states.get(target.id);
      const rescuerState = room.states.get(client.id);
      if (!targetState || !targetState.downed || !rescuerState || !rescuerState.alive) {
        reject('invalid-target');
        return;
      }
      const dist = Math.hypot(targetState.x - rescuerState.x, targetState.z - rescuerState.z);
      if (dist > SURVIVAL_REVIVE_RANGE + 0.35) {
        reject('out-of-range');
        return;
      }
      const active = room.survival.activeRescue;
      if (active) {
        if (active.targetId === target.id) {
          send(ws, {
            type: 'survivalRescueStart',
            rescuerId: active.rescuerId,
            targetId: active.targetId,
            durationMs: Math.max(0, active.endAt - Date.now()),
          });
          return;
        }
        cancelSurvivalRescue(room, 'rescuer-busy');
      }
      const now = Date.now();
      room.survival.activeRescue = {
        rescuerId: client.id,
        targetId: target.id,
        startAt: now,
        endAt: now + 5000,
      };
      broadcastRoom(room, {
        type: 'survivalRescueStart',
        rescuerId: client.id,
        targetId: target.id,
        durationMs: 5000,
      });
      return;
    }

    if (msg.type === 'survivalRescueCancel') {
      if (room.mode === 'survival' && room.survival?.activeRescue?.rescuerId === client.id) {
        cancelSurvivalRescue(room, 'released');
      }
      return;
    }

    if (msg.type === 'survivalHealStart') {
      if (room.mode !== 'survival' || !room.survival) return;
      if (!['prep', 'wave', 'portal'].includes(room.survival.phase)) return;
      const target = clients.get(String(msg.targetId || ''));
      if (!target || target === client) return;
      const healerState = room.states.get(client.id);
      const targetState = room.states.get(target.id);
      if (!healerState?.alive || healerState.downed
          || !targetState?.alive || targetState.downed) return;
      const distance = Math.hypot(
        healerState.x - targetState.x,
        healerState.z - targetState.z
      );
      if (distance > SURVIVAL_HEAL_RANGE) return;
      if (targetState.hp >= Math.max(100, Number(targetState.maxHp) || 100)) return;
      for (const [healerId, heal] of room.survival.activeHeals) {
        if (healerId === client.id) continue;
        if (heal.targetId === target.id) {
          send(ws, { type: 'error', message: '该队友正在接受治疗' });
          return;
        }
      }
      room.survival.activeHeals.set(client.id, {
        targetId: target.id,
        startAt: Date.now(),
        endAt: Date.now() + SURVIVAL_HEAL_MS,
      });
      broadcastRoom(room, {
        type: 'survivalHealStart',
        healerId: client.id,
        targetId: target.id,
        durationMs: SURVIVAL_HEAL_MS,
      });
      return;
    }

    if (msg.type === 'survivalHealCancel') {
      if (room.mode === 'survival' && room.survival) {
        cancelSurvivalHeal(room, client.id, 'released');
      }
      return;
    }

    if (msg.type === 'survivalEndlessChoice') {
      if (room.mode !== 'survival' || !room.survival) return;
      if (room.ownerId !== client.id || room.survival.phase !== 'endlessChoice') return;
      if (msg.endless) {
        room.survival.endlessMode = true;
        room.survival.endlessLoop = (room.survival.endlessLoop || 0) + 1;
        room.survival.mapsCleared = 0;
        room.survival.mapIndex = 0;
        room.survival.mapId = 'battlefield';
        room.survival.phase = 'mapLoading';
        room.survival.mapReady.clear();
        room.survival.portalReady.clear();
        room.survival.zombies.clear();
        room.survival.deadZombies.clear();
        room.survival.activeHeals.clear();
        room.survival.activeRescue = null;
        broadcastSurvivalState(room);
        broadcastRoom(room, {
          type: 'survivalMapChange',
          mapId: room.survival.mapId,
          mapIndex: 0,
          endless: true,
          endlessLoop: room.survival.endlessLoop,
        });
      } else {
        room.survival.phase = 'victory';
        room.survival.phaseEnd = Date.now();
        room.phase = 'matchEnd';
        broadcastSurvivalState(room);
        broadcastRoom(room, { type: 'survivalEnd', victory: true });
      }
      return;
    }

    if (msg.type === 'survivalPortalReady') {
      if (room.mode !== 'survival' || !room.survival || room.survival.phase !== 'portal') return;
      const state = room.states.get(client.id);
      if (!state || !state.alive || state.downed) return;
      const center = survivalPortalCenter(room.survival.mapId);
      if (Math.hypot(state.x - center.x, state.z - center.z) > SURVIVAL_PORTAL_RADIUS + 0.5) return;
      room.survival.portalReady.add(client.id);
      const required = connectedHumanPlayers(room).map(player => player.id);
      broadcastRoom(room, {
        type: 'survivalPortalProgress',
        ready: Array.from(room.survival.portalReady),
        required,
      });
      if (required.length > 0 && required.every(id => room.survival.portalReady.has(id))) {
        const nextIndex = (room.survival.mapIndex + 1) % SURVIVAL_MAPS.length;
        room.survival.phase = 'mapLoading';
        room.survival.mapIndex = nextIndex;
        if (nextIndex === 0) {
          room.survival.mapsCleared = 0;
          if (room.survival.endlessMode) room.survival.endlessLoop++;
        } else {
          room.survival.mapsCleared++;
        }
        room.survival.mapId = SURVIVAL_MAPS[nextIndex];
        room.survival.mapReady.clear();
        room.survival.portalReady.clear();
        broadcastRoom(room, {
          type: 'survivalPortalComplete',
        });
        broadcastRoom(room, {
          type: 'survivalMapChange',
          mapId: room.survival.mapId,
          mapIndex: nextIndex,
        });
        broadcastSurvivalState(room);
      }
      return;
    }

    if (msg.type === 'survivalMapReady') {
      if (room.mode !== 'survival' || !room.survival || room.survival.phase !== 'mapLoading') return;
      room.survival.mapReady.add(client.id);
      finishSurvivalMapLoad(room, Date.now());
      return;
    }

    if (msg.type === 'lanAIStates') {
      if (room.ownerId !== client.id) return;
      const survivalMode = room.mode === 'survival' && room.survival;
      if (survivalMode) {
        if (!['prep', 'wave', 'portal'].includes(room.survival.phase)) return;
      } else if (room.mode !== 'team' || !['prep', 'round'].includes(room.phase)) {
        return;
      }
      const list = Array.isArray(msg.states) ? msg.states.slice(0, MAX_TEAM * 2) : [];
      const now = Date.now();
      for (const item of list) {
        const aiClient = clients.get(String(item?.id || ''));
        if (!aiClient?.isAI || aiClient.roomId !== room.code) continue;
        const state = room.states.get(aiClient.id);
        if (!state || !state.alive) continue;
        if (now - (aiClient.lastStateAt || 0) < 16) continue;
        aiClient.lastStateAt = now;

        const x = Number(item.x);
        const y = Number(item.y);
        const z = Number(item.z);
        if (![x, y, z].every(Number.isFinite)) continue;
        if (Math.abs(x) > 180 || Math.abs(y) > 80 || Math.abs(z) > 180) continue;
        const prevAt = aiClient._prevStateServerAt || 0;
        if ((room.phase === 'round' || room.survival?.phase === 'wave') && prevAt > 0) {
          const elapsed = Math.max(0.016, (now - prevAt) / 1000);
          const dist = Math.hypot(x - state.x, y - state.y, z - state.z);
          if (dist / elapsed > 20) continue;
        }

        state.x = x;
        state.y = y;
        state.z = z;
        state.yaw = Number(item.yaw) || 0;
        state.pitch = Number(item.pitch) || 0;
        state.height = Math.max(0.8, Math.min(2.2, Number(item.height) || 1.84));
        state.weapon = String(item.weapon || 'rifle').slice(0, 16);
        state.crouching = !!item.crouching;
        state.aiming = !!item.aiming;
        state.aimStage = Math.max(0, Math.min(2, Number(item.aimStage) || 0));
        state.reloadRemain = Math.max(0, Math.min(10000, Number(item.reloadRemain) || 0));
        aiClient._prevStateServerAt = now;
      }
      return;
    }

    if (msg.type === 'lanAIShot') {
      if (room.ownerId !== client.id) return;
      const survivalShot = room.mode === 'survival' && room.survival?.phase === 'wave';
      if (!survivalShot && (room.mode !== 'team' || room.phase !== 'round')) return;
      const attacker = clients.get(String(msg.attackerId || ''));
      if (!attacker?.isAI || attacker.roomId !== room.code) return;
      const weapon = WEAPON_DAMAGE[msg.weapon];
      if (!weapon) return;
      const now = Date.now();
      if (now - (attacker.lastShotAt || 0) < weapon.fireMs * 0.7) return;
      attacker.lastShotAt = now;

      if (msg.visual) {
        const v = msg.visual;
        if ([v.sx, v.sy, v.sz, v.ex, v.ey, v.ez].every(Number.isFinite)) {
          broadcastRoom(room, {
            type: 'shotVisual',
            shooterId: attacker.id,
            weapon: msg.weapon,
            payload: {
              sx: v.sx, sy: v.sy, sz: v.sz,
              ex: v.ex, ey: v.ey, ez: v.ez,
            },
          }, client);
        }
      }
      const hits = survivalShot
        ? []
        : (Array.isArray(msg.hits) ? msg.hits.slice(0, 16) : []);
      for (const hit of hits) {
        const target = clients.get(String(hit?.targetId || ''));
        if (!target || target.roomId !== room.code) continue;
        const part = ['head', 'body', 'leg'].includes(hit.part) ? hit.part : 'body';
        applyDamage(room, attacker, target, msg.weapon, part, hit.distance);
      }
      return;
    }

    if (msg.type === 'state') {
      if (room.phase === 'lobby' || room.phase === 'matchEnd') return;
      const state = room.states.get(client.id);
      if (!state) return;
      const now = Date.now();
      if (now - client.lastStateAt < 16) return;
      client.lastStateAt = now;

      const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
      if (![x, y, z].every(Number.isFinite)) return;
      if (Math.abs(x) > 180 || Math.abs(y) > 80 || Math.abs(z) > 180) return;
      if (room.phase === 'round' && client.lastStateAt > 0) {
        const elapsed = Math.max(0.016, (now - client._prevStateServerAt) / 1000);
        const dist = Math.hypot(x - state.x, y - state.y, z - state.z);
        if (dist / elapsed > 20) return;
      }
      state.x = x; state.y = y; state.z = z;
      state.yaw = Number(msg.yaw) || 0;
      state.pitch = Number(msg.pitch) || 0;
      state.height = Math.max(0.8, Math.min(2.2, Number(msg.height) || 1.84));
      state.maxHp = Math.max(100, Math.min(300, Number(msg.maxHp) || 100));
      state.weapon = String(msg.weapon || 'rifle').slice(0, 16);
      state.crouching = !!msg.crouching;
      state.aiming = !!msg.aiming;
      state.aimStage = Math.max(0, Math.min(2, Number(msg.aimStage) || 0));
      state.reloadRemain = Math.max(0, Math.min(10000, Number(msg.reloadRemain) || 0));
      state.boltRemain = Math.max(0, Math.min(5000, Number(msg.boltRemain) || 0));
      state.meleeRemain = Math.max(0, Math.min(5000, Number(msg.meleeRemain) || 0));
      state.meleeHeavy = !!msg.meleeHeavy;
      client._prevStateServerAt = now;
      return;
    }

    if (msg.type === 'shot') {
      const now = Date.now();
      const weapon = WEAPON_DAMAGE[msg.weapon];
      if (!weapon) return;
      if (now - client.lastShotAt < weapon.fireMs * 0.7) return;
      client.lastShotAt = now;
      const hits = Array.isArray(msg.hits) ? msg.hits.slice(0, 16) : [];
      if (msg.visual) {
        const v = msg.visual;
        if ([v.sx, v.sy, v.sz, v.ex, v.ey, v.ez].every(Number.isFinite)) {
          broadcastRoom(room, {
            type: 'shotVisual',
            shooterId: client.id,
            weapon: msg.weapon,
            payload: {
              sx: v.sx, sy: v.sy, sz: v.sz,
              ex: v.ex, ey: v.ey, ez: v.ez,
            },
          }, client);
        }
      }
      for (const hit of hits) {
        const target = clients.get(hit.targetId);
        if (!target) continue;
        const part = ['head', 'body', 'leg'].includes(hit.part) ? hit.part : 'body';
        applyDamage(room, client, target, msg.weapon, part, hit.distance);
      }
      return;
    }

    if (msg.type === 'melee') {
      const attackerState = room.states.get(client.id);
      if (!attackerState) return;
      const now = Date.now();
      if (now - client.lastShotAt < 250) return;
      client.lastShotAt = now;
      const requestedTargets = Array.isArray(msg.targets)
        ? msg.targets.slice(0, MAX_TEAM)
        : [{ targetId: msg.targetId, damage: msg.damage }];
      const seenTargets = new Set();
      let applied = false;

      for (const requested of requestedTargets) {
        const target = clients.get(requested.targetId);
        if (!target || seenTargets.has(target.id)) continue;
        const targetState = room.states.get(target.id);
        if (!targetState) continue;
        const dx = attackerState.x - targetState.x;
        const dz = attackerState.z - targetState.z;
        if (Math.hypot(dx, dz) > MELEE_SERVER_RANGE) continue;
        seenTargets.add(target.id);
        applyDamage(
          room,
          client,
          target,
          'melee',
          'body',
          1,
          Math.min(150, Math.max(0, Number(requested.damage) || 50)),
          { deferElimination: true }
        );
        applied = true;
      }
      if (applied) checkElimination(room);
      return;
    }

    if (msg.type === 'barrel') {
      const now = Date.now();
      if (now - client.lastBarrelAt < 300) return;
      client.lastBarrelAt = now;
      const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
      if (![x, y, z].every(Number.isFinite)) return;

      broadcastRoom(room, { type: 'barrel', x, y, z, fromId: client.id }, client);
      for (const target of room.memberIds) {
        const targetClient = clients.get(target);
        const state = room.states.get(target);
        if (!targetClient || targetClient.connected === false || !state || !state.alive) continue;
        const dx = state.x - x;
        const dy = state.y + state.height * 0.5 - y;
        const dz = state.z - z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 6) continue;
        const damage = 200 * Math.pow(1 - dist / 6, 1.5);
        if (damage > 1) {
          applyDamage(
            room,
            client,
            targetClient,
            'barrel',
            'body',
            dist,
            damage,
            {
              allowSelf: true,
              allowFriendly: true,
              allowDeadAttacker: true,
              deferElimination: true,
            }
          );
        }
      }
      if (room.mode === 'survival' && room.survival?.phase === 'wave') {
        for (const zombie of room.survival.zombies.values()) {
          if (room.survival.deadZombies.has(zombie.netId)) continue;
          const dist = Math.hypot(zombie.x - x, zombie.z - z);
          if (dist > 6) continue;
          const damage = 200 * Math.pow(1 - dist / 6, 1.5);
          if (damage <= 1) continue;
          zombie.hp = Math.max(0, zombie.hp - Math.round(damage));
          let killed = false;
          let coinReward = 0;
          if (zombie.hp <= 0) {
            killed = true;
            room.survival.deadZombies.add(zombie.netId);
            client.survivalKills = (client.survivalKills || 0) + 1;
            client.survivalWaveKills = (client.survivalWaveKills || 0) + 1;
            coinReward = (zombie.type === 'big' || zombie.type === 'musician') ? 2 : 1;
            client.survivalCoins = (client.survivalCoins || 0) + coinReward;
          }
          broadcastRoom(room, {
            type: 'survivalZombieDamaged',
            zombieId: zombie.netId,
            hp: zombie.hp,
            killed,
            killerId: killed ? client.id : null,
            coinReward,
          });
        }
      }
      checkElimination(room);
      return;
    }

    if (msg.type === 'fx') {
      const kind = msg.kind;
      const payload = msg.payload || {};
      if (kind === 'smokePop' || kind === 'flashDetonate') {
        const x = Number(payload.px);
        const y = Number(payload.py);
        const z = Number(payload.pz);
        if (![x, y, z].every(Number.isFinite)) return;
        if (payload.id == null) return;
        const id = String(payload.id).slice(0, 96);
        if (!room.finalProjectileFx) room.finalProjectileFx = new Set();
        const key = `${client.id}:${kind}:${id}`;
        if (room.finalProjectileFx.has(key)) return;
        room.finalProjectileFx.add(key);
      }
      broadcastRoom(room, {
        type: 'fx',
        fromId: client.id,
        kind,
        payload,
      }, client);
      return;
    }

    if (msg.type === 'chat') {
      const text = safeText(msg.text, 60);
      if (text) {
        broadcastRoom(room, {
          type: 'chat',
          fromId: client.id,
          fromName: client.name,
          text,
        }, client);
      }
      return;
    }

    if (msg.type === 'returnLobby') {
      if (room.mode !== 'survival'
          && (room.phase === 'matchEnd' || room.phase === 'lobby')) {
        if (room.phase === 'matchEnd') {
          for (const id of Array.from(room.memberIds)) {
            const member = clients.get(id);
            if (member && member.connected !== false) continue;
            room.memberIds.delete(id);
            room.states.delete(id);
            if (member) clients.delete(id);
          }
          room.phase = 'lobby';
          room.round = 0;
          room.blueScore = 0;
          room.redScore = 0;
          room.states.clear();
          room.matchAllowedIps = null;
          room.returnedIds?.clear();
          for (const id of room.memberIds) {
            const member = clients.get(id);
            if (member) member.ready = !!member.isAI;
          }
        }
        client.ready = false;
        send(ws, {
          type: 'returnedToLobby',
          room: roomLobby(room),
        });
        return;
      }
      if (room.ownerId !== client.id) {
        return;
      }
      for (const id of Array.from(room.memberIds)) {
        const member = clients.get(id);
        if (member && member.connected !== false) continue;
        room.memberIds.delete(id);
        room.states.delete(id);
        if (member) clients.delete(id);
      }
      room.phase = 'lobby';
      room.round = 0;
      room.blueScore = 0;
      room.redScore = 0;
      room.states.clear();
      room.survival = null;
      room.matchAllowedIps = null;
      room.returnedIds?.clear();
      for (const id of room.memberIds) {
        const member = clients.get(id);
        if (member) member.ready = !!member.isAI;
      }
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong', t: msg.t, serverTime: Date.now() });
    }
  });

  ws.on('close', () => {
    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (room && room.ownerId === client.id) {
      room.phase = 'closed';
      broadcastRoom(room, { type: 'hostLeft', message: '房主已退出游戏，房间已关闭' });
      for (const id of room.memberIds) {
        const member = clients.get(id);
        if (!member || !member.ws) continue;
        try { member.ws.close(4001, 'Host left'); } catch {}
      }
      rooms.delete(room.code);
      client.roomId = null;
      clients.delete(client.id);
      return;
    }

    if (room && room.phase !== 'lobby') {
      client.connected = false;
      client.ws = null;
      client.ready = false;
      checkElimination(room);
      return;
    }

    leaveRoom(client);
    clients.delete(client.id);
  });
});

setInterval(() => {
  for (const client of clients.values()) {
    if (!client.ws || client.connected === false) continue;
    if (!client.ws.isAlive) {
      try { client.ws.terminate(); } catch {}
      continue;
    }
    client.ws.isAlive = false;
    try { client.ws.ping(); } catch {}
  }
}, 10000);

setInterval(() => {
  for (const room of rooms.values()) roomTick(room);
}, TICK_MS);

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) {
        result.push(`http://${item.address}:${PORT}`);
      }
    }
  }
  return result;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('双雄对决 · 局域网多人服务器已启动');
  console.log(`本机: http://127.0.0.1:${PORT}`);
  for (const url of lanAddresses()) console.log(`局域网: ${url}`);
  console.log('让同一局域网内的玩家打开上面的局域网地址。');
  console.log('');
});
