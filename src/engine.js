// FacePong shared physics + game-state machine.
// PURE module: no DOM, no Node APIs. Imported verbatim by both server.js (Node)
// and the browser client. Runs the authoritative simulation in two-player mode
// and the solo simulation (vs bot) in the browser.

import {
  FIELD_ASPECT,
  BALL_R,
  BALL_SPEED,
  BALL_SPEEDUP,
  BALL_SPEED_MAX,
  BALL_MIN_COMPONENT,
  PADDLE_WIDTH,
  PADDLE_Y,
  PADDLE_SPEED,
  PADDLE_SPEED_OIL,
  PADDLE_WIDTH_DWARF,
  ICE_DURATION,
  OIL_DURATION,
  DWARF_DURATION,
  ITEM_R,
  ITEM_SPEED,
  ITEM_RELOAD,
  WIN_SCORE,
  COUNTDOWN,
  POINT_PAUSE,
  ITEM_TYPES,
} from './constants.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Item effect -> duration (seconds)
const EFFECT_DURATION = { ice: ICE_DURATION, oil: OIL_DURATION, dwarf: DWARF_DURATION };

export function createInitialState() {
  const player = () => ({
    x: 0.5,
    targetX: 0.5,
    score: 0,
    effects: { ice: 0, oil: 0, dwarf: 0 },
    item: null,
    reload: ITEM_RELOAD,
  });
  return {
    t: 0,
    seq: 0,
    phase: 'countdown', // 'countdown' | 'playing' | 'point' | 'gameover'
    countdown: COUNTDOWN,
    ball: { x: 0.5, y: FIELD_ASPECT / 2, vx: 0, vy: 0, r: BALL_R },
    players: [player(), player()],
    items: [], // in-flight projectiles: { owner, type, x, y, vy, r }
    winner: null,
  };
}

export function effectiveSpeed(p) {
  if (p.effects.ice > 0) return 0;
  return p.effects.oil > 0 ? PADDLE_SPEED_OIL : PADDLE_SPEED;
}

export function effectiveWidth(p) {
  return p.effects.dwarf > 0 ? PADDLE_WIDTH_DWARF : PADDLE_WIDTH;
}

function paddleY(idx) {
  return idx === 0 ? PADDLE_Y : FIELD_ASPECT - PADDLE_Y;
}

function randomItem() {
  return ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
}

// Keep the ball on a healthy diagonal so it always advances: neither velocity
// component may fall below a fraction of the ball's speed. This prevents both a
// near-vertical "ping-pong" loop and a near-horizontal skim that stalls play.
// Clamp |vx| into the valid band and derive |vy| from the magnitude constraint,
// so the result always satisfies |vx|,|vy| >= BALL_MIN_COMPONENT * speed.
function enforceBallAngle(b, speed) {
  const min = speed * BALL_MIN_COMPONENT;
  const max = Math.sqrt(speed * speed - min * min);
  const vxSign = b.vx < 0 ? -1 : 1;
  const vySign = b.vy < 0 ? -1 : 1;
  const ax = Math.min(Math.max(Math.abs(b.vx), min), max);
  b.vx = vxSign * ax;
  b.vy = vySign * Math.sqrt(speed * speed - ax * ax);
}

function launchBall(state) {
  const b = state.ball;
  b.x = 0.5;
  b.y = FIELD_ASPECT / 2;
  // Random direction toward a random player, then clamp to a healthy diagonal.
  const angle = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * (Math.PI / 2);
  const dir = Math.random() < 0.5 ? -1 : 1; // -1 = toward player 0 (bottom), 1 = toward player 1 (top)
  b.vx = Math.sin(angle) * BALL_SPEED;
  b.vy = Math.cos(angle) * BALL_SPEED * dir;
  enforceBallAngle(b, BALL_SPEED);
}

// Advance the simulation by dt seconds. Mutates `state` and returns discrete events
// for UI/toasts and (in 2P mode) server forwarding.
export function step(state, inputs, dt) {
  const events = [];
  state.t += dt;

  // Apply fresh paddle targets from inputs (authoritative in 2P, local in solo).
  if (inputs) {
    for (let i = 0; i < state.players.length; i++) {
      const inp = inputs[i];
      if (inp && typeof inp.targetX === 'number') {
        state.players[i].targetX = clamp(inp.targetX, 0, 1);
      }
    }
  }

  // Reload + effect timers always tick down.
  for (const p of state.players) {
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        p.reload = 0;
        p.item = randomItem();
      }
    }
    for (const k of Object.keys(p.effects)) {
      if (p.effects[k] > 0) p.effects[k] = Math.max(0, p.effects[k] - dt);
    }
  }

  // Paddles move in every phase except gameover (so players can react during countdown).
  if (state.phase !== 'gameover') {
    movePaddles(state, dt);
  }

  switch (state.phase) {
    case 'countdown': {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.countdown = 0;
        state.phase = 'playing';
        launchBall(state);
      }
      break;
    }

    case 'playing': {
      handleShooting(state, inputs, events);
      stepBall(state, events, dt);
      stepItems(state, events, dt);
      break;
    }

    case 'point': {
      // Ball is parked; wait out the pause, then relaunch.
      state.countdown -= dt; // reuse countdown as the pause timer
      if (state.countdown <= 0) {
        state.phase = 'playing';
        launchBall(state);
      }
      break;
    }

    case 'gameover':
      break;
  }

  return events;
}

function movePaddles(state, dt) {
  state.players.forEach((p, idx) => {
    const sp = effectiveSpeed(p);
    const r = effectiveWidth(p) / 2;
    if (sp > 0) {
      const dx = p.targetX - p.x;
      const maxStep = sp * dt;
      p.x += clamp(dx, -maxStep, maxStep);
      p.x = clamp(p.x, r, 1 - r);
    }
    // Frozen: do nothing (paddle stays put regardless of targetX).
  });
}

function handleShooting(state, inputs, events) {
  state.players.forEach((p, idx) => {
    const inp = inputs && inputs[idx];
    if (!inp || !inp.shoot) return;
    if (p.item == null || p.reload > 0) return;
    const dir = idx === 0 ? 1 : -1; // player 0 fires up, player 1 fires down
    state.items.push({
      owner: idx,
      type: p.item,
      x: p.x,
      y: paddleY(idx) + dir * (effectiveWidth(p) / 2 + ITEM_R + 0.005),
      vy: dir * ITEM_SPEED,
      r: ITEM_R,
    });
    p.item = null;
    p.reload = ITEM_RELOAD;
  });
}

function stepBall(state, events, dt) {
  const b = state.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Side walls.
  if (b.x - b.r < 0) {
    b.x = b.r;
    b.vx = Math.abs(b.vx);
  } else if (b.x + b.r > 1) {
    b.x = 1 - b.r;
    b.vx = -Math.abs(b.vx);
  }

  // Paddle collisions (circle-circle; paddles are circular faces).
  state.players.forEach((p, idx) => {
    const pr = effectiveWidth(p) / 2;
    const py = paddleY(idx);
    const dx = b.x - p.x;
    const dy = b.y - py;
    const dist = Math.hypot(dx, dy);
    const minDist = b.r + pr;
    if (dist < minDist && dist > 1e-6) {
      const nx = dx / dist;
      const ny = dy / dist;
      b.x = p.x + nx * minDist;
      b.y = py + ny * minDist;
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 2 * dot * nx;
      b.vy -= 2 * dot * ny;
      // Slight speed-up per hit, capped; clamp the angle so the ball keeps advancing.
      const speed = Math.min(Math.hypot(b.vx, b.vy) + BALL_SPEEDUP, BALL_SPEED_MAX);
      enforceBallAngle(b, speed);
    }
  });

  // Scoring: world y=0 is player 0's side (bottom), y=FIELD_ASPECT is player 1's
  // side (top). Ball past the top means player 1 missed -> player 0 scores; past
  // the bottom means player 0 missed -> player 1 scores.
  if (b.y + b.r > FIELD_ASPECT) {
    scorePoint(state, 0, events); // player 1 (top) missed -> player 0 scores
  } else if (b.y - b.r < 0) {
    scorePoint(state, 1, events); // player 0 (bottom) missed -> player 1 scores
  }
}

function stepItems(state, events, dt) {
  const survivors = [];
  for (const it of state.items) {
    it.y += it.vy * dt;
    const enemy = state.players[1 - it.owner];
    const enemyY = paddleY(1 - it.owner);
    const enemyR = effectiveWidth(enemy) / 2;
    const dx = it.x - enemy.x;
    const dy = it.y - enemyY;
    const dist = Math.hypot(dx, dy);
    if (dist < it.r + enemyR) {
      applyEffect(state, 1 - it.owner, it.type);
      events.push({ type: 'effect', target: 1 - it.owner, effect: it.type });
      continue; // projectile consumed
    }
    if (it.y > -0.2 && it.y < FIELD_ASPECT + 0.2) {
      survivors.push(it);
    }
  }
  state.items = survivors;
}

function applyEffect(state, targetIdx, effect) {
  state.players[targetIdx].effects[effect] = EFFECT_DURATION[effect];
}

function scorePoint(state, scorerIdx, events) {
  state.players[scorerIdx].score += 1;
  const scores = state.players.map((p) => p.score);
  events.push({ type: 'score', scorer: scorerIdx, scores });
  if (state.players[scorerIdx].score >= WIN_SCORE) {
    state.phase = 'gameover';
    state.winner = scorerIdx;
    events.push({ type: 'gameover', winner: scorerIdx, scores });
  } else {
    state.phase = 'point';
    state.countdown = POINT_PAUSE;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.x = 0.5;
    state.ball.y = FIELD_ASPECT / 2;
    state.items = [];
  }
}

export function serialize(state) {
  // All fields are JSON-safe; return a shallow copy of the mutable containers.
  return {
    t: state.t,
    seq: state.seq,
    phase: state.phase,
    countdown: state.countdown,
    ball: { ...state.ball },
    players: state.players.map((p) => ({
      x: p.x,
      targetX: p.targetX,
      score: p.score,
      effects: { ...p.effects },
      item: p.item,
      reload: p.reload,
    })),
    items: state.items.map((it) => ({ ...it })),
    winner: state.winner,
  };
}

export function deserialize(obj) {
  return obj;
}
