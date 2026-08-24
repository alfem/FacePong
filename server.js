// FacePong server: static file server + WebSocket matchmaking + authoritative sim.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

import { createInitialState, step, serialize } from './src/engine.js';
import { TICK_RATE, DT, SNAPSHOT_RATE } from './src/constants.js';

const PORT = process.env.PORT || 8080;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, 'src', 'client'); // client assets served at /
const SHARED = join(__dirname, 'src'); // engine.js/constants.js live one level up
const AVATAR_MAX = 64 * 1024; // 64KB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function lanIPs() {
  const out = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

// ---- Static file server -----------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    // Client modules import the shared files as `/engine.js` and `/constants.js`
    // (via `../engine.js` from `/`), which live one directory above the client dir.
    let base = ROOT;
    if (urlPath === '/engine.js' || urlPath === '/constants.js') base = SHARED;
    // Resolve within base and reject traversal outside it.
    const filePath = normalize(join(base, urlPath));
    const withinRoot = filePath.startsWith(base + sep) || filePath === base;
    const withinShared = base === SHARED && (filePath.startsWith(SHARED + sep) || filePath === SHARED);
    if (!withinRoot && !withinShared) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

// ---- WebSocket matchmaking + game loop --------------------------------------

const wss = new WebSocketServer({ server });

// Rooms and queues.
const rooms = new Map(); // code -> { players: [ws|null, ws|null], state, inputs, tick }
const queue = []; // ws waiting for an auto-match

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sanitizeName(name) {
  return String(name || 'Player').slice(0, 20);
}

function startMatch(player0, player1, code) {
  const state = createInitialState();
  const inputs = { 0: { targetX: 0.5, shoot: false }, 1: { targetX: 0.5, shoot: false } };
  const players = [
    { ws: player0, name: player0.name, avatar: player0.avatar },
    { ws: player1, name: player1.name, avatar: player1.avatar },
  ];
  send(player0, {
    type: 'start',
    playerId: 0,
    players: [
      { name: players[0].name, avatar: players[0].avatar },
      { name: players[1].name, avatar: players[1].avatar },
    ],
  });
  send(player1, {
    type: 'start',
    playerId: 1,
    players: [
      { name: players[0].name, avatar: players[0].avatar },
      { name: players[1].name, avatar: players[1].avatar },
    ],
  });
  return { code, players, state, inputs, snapshotTimer: 0 };
}

function beginTick(match) {
  match.timer = setInterval(() => {
    const events = step(match.state, match.inputs, DT);
    // Edge-triggered shoot flags: consumed by this tick, cleared for the next.
    match.inputs[0].shoot = false;
    match.inputs[1].shoot = false;
    for (const ev of events) {
      match.players.forEach((p, i) => send(p.ws, { type: ev.type, ...ev, playerId: i }));
    }
    match.snapshotTimer = (match.snapshotTimer + 1) % (TICK_RATE / SNAPSHOT_RATE);
    if (match.snapshotTimer === 0) {
      match.state.seq += 1;
      const snap = serialize(match.state);
      match.players.forEach((p) => send(p.ws, { type: 'snapshot', state: snap, seq: match.state.seq }));
    }
    if (match.state.phase === 'gameover') {
      endMatch(match);
    }
  }, 1000 / TICK_RATE);
}

function endMatch(match) {
  if (match.timer) clearInterval(match.timer);
  if (match.code) rooms.delete(match.code);
  match.players.forEach((p) => {
    if (p.ws) {
      p.ws.match = null;
      p.ws.playerId = null;
    }
  });
}

function handleForfeit(match, leaverIdx) {
  const winner = 1 - leaverIdx;
  send(match.players[winner].ws, { type: 'opponent_left' });
  // Award the win to the remaining player.
  if (match.state.phase !== 'gameover') {
    match.state.phase = 'gameover';
    match.state.winner = winner;
    match.state.players[winner].score = 5;
    send(match.players[winner].ws, {
      type: 'gameover',
      winner,
      scores: match.state.players.map((p) => p.score),
    });
  }
  endMatch(match);
}

wss.on('connection', (ws) => {
  ws.match = null;
  ws.playerId = null;
  ws.name = null;
  ws.avatar = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case 'join': {
        ws.name = sanitizeName(msg.name);
        if (typeof msg.avatar === 'string' && msg.avatar.startsWith('data:image/') && msg.avatar.length <= AVATAR_MAX) {
          ws.avatar = msg.avatar;
        } else {
          ws.avatar = '';
        }
        const code = msg.room ? String(msg.room).toUpperCase().slice(0, 8) : null;
        if (code) {
          const existing = rooms.get(code);
          if (existing) {
            if (existing.players[1]) {
              send(ws, { type: 'error', message: 'Room full' });
              return;
            }
            ws.match = existing;
            ws.playerId = 1;
            const m = existing;
            const first = m.players[0]; // raw ws of the room creator
            m.players = [
              { ws: first, name: first.name, avatar: first.avatar },
              { ws, name: ws.name, avatar: ws.avatar },
            ];
            const roster = m.players.map((p) => ({ name: p.name, avatar: p.avatar }));
            send(first, { type: 'start', playerId: 0, players: roster });
            send(ws, { type: 'start', playerId: 1, players: roster });
            // Initialize the sim now that both players are present.
            m.state = createInitialState();
            m.inputs = { 0: { targetX: 0.5, shoot: false }, 1: { targetX: 0.5, shoot: false } };
            m.snapshotTimer = 0;
            beginTick(m);
          } else {
            const m = { code, players: [ws, null], state: null, inputs: null, timer: null };
            ws.match = m;
            ws.playerId = 0;
            rooms.set(code, m);
            send(ws, { type: 'waiting' });
          }
        } else {
          queue.push(ws);
          send(ws, { type: 'waiting' });
          if (queue.length >= 2) {
            const a = queue.shift();
            const b = queue.shift();
            const m = startMatch(a, b, null);
            a.match = m;
            b.match = m;
            a.playerId = 0;
            b.playerId = 1;
            beginTick(m);
          }
        }
        break;
      }
      case 'input': {
        if (ws.match && ws.playerId != null) {
          ws.match.inputs[ws.playerId].targetX = clamp01(msg.targetX);
        }
        break;
      }
      case 'shoot': {
        if (ws.match && ws.playerId != null) {
          ws.match.inputs[ws.playerId].shoot = true;
        }
        break;
      }
      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    const idx = queue.indexOf(ws);
    if (idx !== -1) queue.splice(idx, 1);
    if (ws.match && ws.playerId != null) {
      handleForfeit(ws.match, ws.playerId);
    }
  });
});

// Clear edge-triggered shoot flags are cleared at the end of each tick (see beginTick).
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

server.listen(PORT, () => {
  console.log(`FacePong running:`);
  console.log(`  http://localhost:${PORT}/`);
  for (const ip of lanIPs()) console.log(`  http://${ip}:${PORT}/   (LAN — use this on your phone)`);
});
