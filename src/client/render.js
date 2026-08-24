// Canvas rendering: letterbox transform, worldToScreen, faces-as-paddles, HUD.
import { FIELD_ASPECT, PADDLE_Y } from '../constants.js';
import { effectiveWidth } from '../engine.js';

// Avatar images keyed by data URL (cached after first load).
const avatarCache = new Map();

export function avatarImage(url) {
  if (!url) return null;
  if (!avatarCache.has(url)) {
    const img = new Image();
    img.src = url;
    avatarCache.set(url, img);
  }
  return avatarCache.get(url);
}

// Compute the letterbox transform for a canvas of css size w x h.
// Returns { scale, offX, offY, canvasW, canvasH, dpr } and the scale factor maps
// world units (x in [0,1], y in [0,FIELD_ASPECT]) to css pixels.
export function computeTransform(w, h, dpr) {
  const scale = Math.min(w / 1, h / FIELD_ASPECT);
  const offX = (w - scale * 1) / 2;
  const offY = (h - scale * FIELD_ASPECT) / 2;
  return { scale, offX, offY, dpr };
}

// Map a world point to css pixels.
// World y=0 is player 0's side (the bottom). Canvas y grows downward, so to put
// player 0 at the bottom we must flip the axis for the player-0 view. Player 1
// (myIdx 1) instead sees themselves at the bottom, which is world y=FIELD_ASPECT,
// so their view draws y as-is.
export function worldToScreen(x, y, myIdx, tr) {
  const yy = myIdx === 0 ? FIELD_ASPECT - y : y;
  return {
    x: tr.offX + x * tr.scale,
    y: tr.offY + yy * tr.scale,
  };
}

function circlePath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
}

function drawFace(ctx, cx, cy, r, img, ringColor) {
  ctx.save();
  circlePath(ctx, cx, cy, r);
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, '#3a4568');
    g.addColorStop(1, '#151b30');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${r}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🙂', cx, cy + r * 0.05);
  }
  ctx.restore();
  circlePath(ctx, cx, cy, r);
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.strokeStyle = ringColor;
  ctx.stroke();
}

// Draw effect overlays on a paddle.
function drawEffects(ctx, cx, cy, r, effects) {
  if (effects.ice > 0) {
    circlePath(ctx, cx, cy, r);
    ctx.fillStyle = 'rgba(120, 200, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(190, 230, 255, 0.9)';
    ctx.stroke();
  }
  if (effects.oil > 0) {
    circlePath(ctx, cx, cy, r);
    ctx.fillStyle = 'rgba(255, 160, 40, 0.18)';
    ctx.fill();
  }
}

function drawItem(ctx, it, myIdx, tr) {
  const s = worldToScreen(it.x, it.y, myIdx, tr);
  const r = it.r * tr.scale;
  const colors = { ice: '#6fd0ff', oil: '#ffb347', dwarf: '#c78dff' };
  ctx.save();
  circlePath(ctx, s.x, s.y, r);
  ctx.fillStyle = colors[it.type] || '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  const icons = { ice: '❄️', oil: '🛢️', dwarf: '🐜' };
  ctx.font = `${r}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icons[it.type] || '★', s.x, s.y + r * 0.05);
  ctx.restore();
}

export function render(ctx, canvas, state, opts) {
  const { myIdx = 0, avatars = [null, null], cssW, cssH } = opts;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Resize backing store to css size * dpr.
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tr = computeTransform(cssW, cssH, dpr);

  // Background.
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, cssW, cssH);

  // Playfield.
  const pfW = tr.scale;
  const pfH = tr.scale * FIELD_ASPECT;
  ctx.fillStyle = '#10162b';
  ctx.fillRect(tr.offX, tr.offY, pfW, pfH);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(tr.offX, tr.offY, pfW, pfH);

  // Center line.
  ctx.beginPath();
  ctx.setLineDash([8, 10]);
  ctx.moveTo(tr.offX, tr.offY + pfH / 2);
  ctx.lineTo(tr.offX + pfW, tr.offY + pfH / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Paddles (faces). Player 0 bottom, player 1 top in canonical orientation.
  const ringColors = ['#ff3d6e', '#ffb347'];
  for (let idx = 0; idx < 2; idx++) {
    const p = state.players[idx];
    const r = (effectiveWidth(p) / 2) * tr.scale;
    const y = idx === 0 ? PADDLE_Y : FIELD_ASPECT - PADDLE_Y;
    const s = worldToScreen(p.x, y, myIdx, tr);
    // The face always belongs to the canonical player idx; worldToScreen already
    // handles which side (top/bottom) that player is drawn on for this viewer.
    const faceIdx = idx;
    drawFace(ctx, s.x, s.y, r, avatars[faceIdx], ringColors[faceIdx]);
    drawEffects(ctx, s.x, s.y, r, p.effects);
  }

  // Ball.
  const bs = worldToScreen(state.ball.x, state.ball.y, myIdx, tr);
  const br = state.ball.r * tr.scale;
  circlePath(ctx, bs.x, bs.y, br);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Items (projectiles).
  for (const it of state.items) drawItem(ctx, it, myIdx, tr);

  // HUD: scores + countdown number.
  const scoreTop = document.getElementById('score-top');
  const scoreBottom = document.getElementById('score-bottom');
  const cd = document.getElementById('countdown');
  const myScore = state.players[myIdx].score;
  const oppScore = state.players[1 - myIdx].score;
  scoreTop.textContent = oppScore;
  scoreBottom.textContent = myScore;
  cd.textContent = state.phase === 'countdown' ? Math.ceil(state.countdown) : '';
}
