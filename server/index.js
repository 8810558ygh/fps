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
const MELEE_SERVER_RANGE = 2.6;

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
  return { ok: true, oldId, newId };
}

function broadcastLobby(room) {
  broadcastRoom(room, { type: 'lobby', room: roomLobby(room) });
}

function leaveRoom(client, notify = true) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room) return;

  room.memberIds.delete(client.id);
  room.states.delete(client.id);
  client.roomId = null;
  client.team = null;
  client.ready = false;

  if (room.memberIds.size === 0) {
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
    client.ready = false;
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

function startMatch(room) {
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
  if (room.phase === 'prep' && now >= room.phaseEnd) {
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

  if (!['prep', 'round', 'roundEnd', 'matchEnd'].includes(room.phase)) return;
  const players = [];
  for (const id of room.memberIds) {
    const client = clients.get(id);
    const state = room.states.get(id);
    if (!client || !state) continue;
    players.push({
      id,
      name: client.name,
      team: client.team,
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
      connected: client.connected !== false,
      hp: state.hp,
      armor: state.armor,
      spawnSlot: state.spawnSlot,
      kills: client.matchKills || 0,
      deaths: client.matchDeaths || 0,
      damage: client.matchDamage || 0,
    });
  }

  broadcastRoom(room, {
    type: 'snapshot',
    serverTime: now,
    phase: room.phase,
    round: room.round,
    blueScore: room.blueScore,
    redScore: room.redScore,
    phaseRemain: Math.max(0, room.phaseEnd - now),
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
  if (room.phase !== 'round') return;
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
  recordDamageInteraction(attacker, target, part, damage, weaponKey);

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

    if (msg.type === 'ready') {
      if (room.phase !== 'lobby') return;
      client.ready = !!msg.ready;
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'setMap') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
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
        broadcastLobby(room);
      }
      return;
    }

    if (msg.type === 'startMatch') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
      if ((room.mode || 'team') !== 'team') {
        send(ws, { type: 'error', message: '生存模式暂未开放，请切换为团队作战' });
        return;
      }
      const members = room.memberIds.size;
      const allReady = room.memberIds.size > 0 && [...room.memberIds].every(id => clients.get(id)?.ready);
      if (members < 2 || !allReady) {
        send(ws, { type: 'error', message: '双方至少各一人，且所有玩家准备后才能开始' });
        return;
      }
      startMatch(room);
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
      state.weapon = String(msg.weapon || 'rifle').slice(0, 16);
      state.crouching = !!msg.crouching;
      state.aiming = !!msg.aiming;
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
      checkElimination(room);
      return;
    }

    if (msg.type === 'fx') {
      broadcastRoom(room, {
        type: 'fx',
        fromId: client.id,
        kind: msg.kind,
        payload: msg.payload || {},
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
      if (room.ownerId !== client.id) return;
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
      for (const id of room.memberIds) {
        const member = clients.get(id);
        if (member) member.ready = false;
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
