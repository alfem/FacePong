// FacePong client bootstrap: screen routing, solo (bot) loop, and networked mode.
import { createInitialState, step } from '../engine.js';
import { DT } from '../constants.js';
import { render, avatarImage } from './render.js';
import { setupInput } from './input.js';
import { initCrop, requestPhoto, getAvatar } from './crop.js';
import { showScreen, setAvatarPreview, setQueueInfo, showToast, setResult } from './screens.js';
import { createNet } from './net.js';
import { createBot } from './bot.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Global play state.
let mode = 'idle'; // 'solo' | 'net' | 'idle'
let state = createInitialState();
let myIdx = 0;
let avatars = [null, null];
let name = '';
let currentRoom = null;
let lastSnapshot = null;
let humanTargetX = 0.5; // solo-mode paddle target, fed through inputs

const net = createNet({
  onWaiting() { showScreen('queue'); },
  onStart(msg) {
    myIdx = msg.playerId;
    avatars = [avatarImage(msg.players[0].avatar), avatarImage(msg.players[1].avatar)];
    state = createInitialState();
    lastSnapshot = null;
    showScreen('game');
  },
  onSnapshot(msg) { lastSnapshot = msg; },
  onEffect(msg) {
    if (msg.target === myIdx) {
      const names = { ice: 'Frozen! ❄️', oil: 'Slippery oil! 🛢️', dwarf: 'Shrunk! 🐜' };
      showToast(names[msg.effect] || msg.effect);
    } else {
      const names = { ice: 'You froze them! ❄️', oil: 'You oiled them! 🛢️', dwarf: 'You shrunk them! 🐜' };
      showToast(names[msg.effect] || msg.effect);
    }
  },
  onScore(msg) {
    showToast(msg.scorer === myIdx ? 'Point! 🎯' : 'They scored 😬');
  },
  onGameover(msg) {
    mode = 'idle';
    setResult(msg.winner === myIdx, msg.scores);
    showScreen('result');
  },
  onOpponentLeft() {
    if (mode === 'net') {
      mode = 'idle';
      showToast('Opponent left', 2000);
      showScreen('start');
    }
  },
  onError(message) {
    showToast(message || 'Error', 2000);
    showScreen('start');
  },
});

// ---- Input wiring ----
const input = setupInput({
  onTarget(x) {
    if (mode === 'solo') {
      humanTargetX = x;
    } else if (mode === 'net') {
      net.setTarget(x);
    }
  },
  onShoot() {
    if (mode === 'solo') {
      pendingSoloShoot = true;
    } else if (mode === 'net') {
      net.shoot();
    }
  },
});

// ---- Solo loop (fixed-timestep accumulator) ----
let soloAccum = 0;
let soloLast = 0;
let soloRunning = false;
let pendingSoloShoot = false;
const botInput = createBot();

function soloFrame(now) {
  if (!soloRunning) return;
  requestAnimationFrame(soloFrame);
  let delta = (now - soloLast) / 1000;
  soloLast = now;
  if (delta > 0.25) delta = 0.25; // clamp after tab switch
  soloAccum += delta;
  const inputs = { 0: { targetX: humanTargetX, shoot: pendingSoloShoot }, 1: botInput(state, delta, 1) };
  pendingSoloShoot = false;
  while (soloAccum >= DT) {
    const events = step(state, inputs, DT);
    for (const ev of events) handleSoloEvent(ev);
    inputs[0].shoot = false;
    inputs[1] = botInput(state, DT, 1);
    soloAccum -= DT;
  }
  draw();
}

function handleSoloEvent(ev) {
  if (ev.type === 'score') showToast(ev.scorer === 0 ? 'Point! 🎯' : 'Bot scored 😬');
  else if (ev.type === 'effect') {
    const names = { ice: 'Frozen! ❄️', oil: 'Slippery oil! 🛢️', dwarf: 'Shrunk! 🐜' };
    showToast(ev.target === 0 ? names[ev.effect] : 'You ' + ev.effect + 'ed the bot!');
  } else if (ev.type === 'gameover') {
    soloRunning = false;
    setResult(ev.winner === 0, ev.scores);
    showScreen('result');
  }
}

function startSolo() {
  mode = 'solo';
  myIdx = 0;
  state = createInitialState();
  avatars = [avatarImage(getAvatar()), avatarImage(getAvatar())];
  pendingSoloShoot = false;
  soloAccum = 0;
  soloLast = performance.now();
  soloRunning = true;
  showScreen('game');
  requestAnimationFrame(soloFrame);
}

// ---- Networked mode ----
function startNet(room) {
  mode = 'net';
  currentRoom = room || null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  net.connect(`${proto}//${location.host}`);
  net.join({ name, avatar: getAvatar() || '', room: room || undefined });
  showScreen('queue');
  if (room) setQueueInfo(room, `${location.origin}${location.pathname}?room=${room}`);
}

// ---- Rendering ----
function draw() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  let s = state;
  if (mode === 'net' && lastSnapshot) s = lastSnapshot.state;
  render(ctx, canvas, s, { myIdx, avatars, cssW, cssH });
  updateShootButton(s);
}

const ITEM_ICONS = { ice: '❄️', oil: '🛢️', dwarf: '🐜' };
function updateShootButton(s) {
  const icon = document.getElementById('shoot-icon');
  const item = s.players[myIdx].item;
  const reload = s.players[myIdx].reload;
  icon.textContent = item ? ITEM_ICONS[item] : '';
  icon.style.backgroundImage = 'none';
  const ring = document.getElementById('shoot-ring');
  // Ring shrinks with reload cooldown.
  const frac = item ? 1 : Math.max(0, 1 - reload / 1.5);
  ring.style.clipPath = `inset(${(1 - frac) * 100}% 0 0 0)`;
}

// Continuous draw loop for idle/queue/result screens too (keeps canvas clean).
function idleFrame() {
  requestAnimationFrame(idleFrame);
  if (mode !== 'solo') draw();
}
requestAnimationFrame(idleFrame);

// ---- Boot wiring ----
function init() {
  const avatar = getAvatar();
  setAvatarPreview(avatar);

  initCrop((url) => {
    setAvatarPreview(url);
  });

  document.getElementById('btn-photo').addEventListener('click', requestPhoto);

  document.getElementById('btn-solo').addEventListener('click', () => {
    name = document.getElementById('name').value.trim() || 'Player';
    startSolo();
  });

  document.getElementById('btn-find').addEventListener('click', () => {
    name = document.getElementById('name').value.trim() || 'Player';
    const room = document.getElementById('room').value.trim().toUpperCase();
    startNet(room || null);
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    net.disconnect();
    mode = 'idle';
    showScreen('start');
  });

  document.getElementById('btn-again').addEventListener('click', () => {
    if (currentRoom) startNet(currentRoom);
    else startNet(null);
  });

  document.getElementById('btn-solo-again').addEventListener('click', startSolo);

  // Pause solo sim when the tab is backgrounded (rAF stops anyway; clamp on return).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) soloLast = performance.now();
  });

  // Room from URL (?room=CODE) -> auto-join.
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) document.getElementById('room').value = urlRoom.toUpperCase();

  showScreen('start');
}

// Debug/testing hook (harmless in production).
window.__fp = { startSolo, startNet, get mode() { return mode; }, get state() { return state; } };

try {
  init();
} catch (err) {
  console.error('init failed', err);
  window.__initError = err && (err.stack || err.message || String(err));
}
