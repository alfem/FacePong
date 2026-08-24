// Solo-mode bot opponent: a pure input producer (never touches physics directly),
// so it exercises the exact same engine the server runs in two-player mode.
import { PADDLE_Y, FIELD_ASPECT } from '../constants.js';

export function createBot() {
  let lastAim = -1;
  let aimX = 0.5;
  let shootCooldown = 0;
  let noise = 0;

  return function botInput(state, dt, selfIdx) {
    const ball = state.ball;
    const paddleY = selfIdx === 0 ? PADDLE_Y : FIELD_ASPECT - PADDLE_Y;
    const me = state.players[selfIdx];

    // Re-aim at most every 150ms (reaction delay) — and only when the ball is coming.
    const comingAtMe =
      (selfIdx === 0 && ball.vy < 0) || (selfIdx === 1 && ball.vy > 0);
    const now = state.t;
    if (now - lastAim > 0.15 && comingAtMe) {
      lastAim = now;
      // Predict the ball's x at the paddle's y, reflecting off side walls.
      const vy = ball.vy || 0.0001;
      const timeToReach = Math.max(0, (paddleY - ball.y) / vy);
      const x = mirrorX(ball.x + ball.vx * timeToReach);
      noise = (Math.random() - 0.5) * 0.06;
      aimX = Math.max(0.03, Math.min(0.97, x + noise));
    }

    // Shoot occasionally when an item is ready.
    let shoot = false;
    shootCooldown -= dt;
    if (me.item != null && me.reload <= 0 && shootCooldown <= 0 && comingAtMe) {
      if (Math.random() < 0.02) {
        shoot = true;
        shootCooldown = 2 + Math.random() * 3;
      }
    }

    return { targetX: aimX, shoot };
  };
}

// Reflect x in [0,1] as if bouncing off the side walls.
function mirrorX(x) {
  while (x < 0 || x > 1) {
    if (x < 0) x = -x;
    else if (x > 1) x = 2 - x;
  }
  return x;
}
