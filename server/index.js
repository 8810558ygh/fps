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
const ROUND_LIMIT_MS = 300000;
const MATCH_POINT = 10;
const MAX_TEAM = 5;

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
    owner: client.roomId && rooms.get(client.roomId)?.ownerId === client.id,
  };
}

function roomLobby(room) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    mapId: room.mapId,
    phase: room.phase,
    players: Array.from(room.memberIds)
      .map(id => clients.get(id))
      .filter(Boolean)
      .map(publicPlayer),
  };
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
      crouching: !!state.crouching,
      alive: !!state.alive,
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

function applyDamage(room, attacker, target, weaponKey, part, distance, damageOverride) {
  if (room.phase !== 'round') return;
  if (!attacker || !target || attacker.id === target.id) return;
  if (!attacker.team || attacker.team === target.team) return;

  const attackerState = room.states.get(attacker.id);
  const targetState = room.states.get(target.id);
  if (!attackerState || !targetState || !attackerState.alive || !targetState.alive) return;

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
  attacker.matchDamage = (attacker.matchDamage || 0) + Math.round(damage);

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
    attacker.matchKills = (attacker.matchKills || 0) + 1;
    target.matchDeaths = (target.matchDeaths || 0) + 1;
    broadcastRoom(room, {
      type: 'kill',
      attackerId: attacker.id,
      targetId: target.id,
    });
    checkElimination(room);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const client = {
    id: 'p' + nextClientId++,
    ws,
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
        send(ws, { type: 'error', message: '比赛已经开始，暂时不能加入' });
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

    if (msg.type === 'startMatch') {
      if (room.ownerId !== client.id || room.phase !== 'lobby') return;
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
      const target = clients.get(msg.targetId);
      if (!target) return;
      const attackerState = room.states.get(client.id);
      const targetState = room.states.get(target.id);
      if (!attackerState || !targetState) return;
      const now = Date.now();
      if (now - client.lastShotAt < 250) return;
      client.lastShotAt = now;
      const dx = attackerState.x - targetState.x;
      const dz = attackerState.z - targetState.z;
      if (Math.hypot(dx, dz) > 3.0) return;
      applyDamage(room, client, target, 'melee', 'body', 1, Math.min(150, Number(msg.damage) || 50));
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
        if (target === client.id) continue;
        const targetClient = clients.get(target);
        const state = room.states.get(target);
        if (!targetClient || !state || !state.alive) continue;
        if (targetClient.team === client.team) continue;
        const dx = state.x - x;
        const dy = state.y + state.height * 0.5 - y;
        const dz = state.z - z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 6) continue;
        const damage = 200 * Math.pow(1 - dist / 6, 1.5);
        if (damage > 1) applyDamage(room, client, targetClient, 'barrel', 'body', dist, damage);
      }
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
      room.phase = 'lobby';
      room.round = 0;
      room.blueScore = 0;
      room.redScore = 0;
      room.states.clear();
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
    leaveRoom(client);
    clients.delete(client.id);
  });
});

setInterval(() => {
  for (const client of clients.values()) {
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
