// Shared numeric constants for FacePong.
// Imported verbatim by both Node (server) and the browser (client).

export const FIELD_ASPECT = 16 / 9; // logical playfield height = width * aspect (portrait)

export const BALL_R = 0.018; // ball radius, in units of playfield width
export const BALL_SPEED = 0.81; // initial ball speed (units/s)
export const BALL_SPEEDUP = 0.045; // speed gained per paddle hit
export const BALL_SPEED_MAX = 1.53; // speed cap
export const BALL_MIN_COMPONENT = 0.35; // min |vx|/speed and |vy|/speed, keeps the ball diagonal

export const PADDLE_WIDTH = 0.22; // paddle (circular face) diameter, in units of width
export const PADDLE_Y = 0.1; // paddle center-y measured from the bottom/top edge
export const PADDLE_SPEED = 1.4; // max paddle pursuit speed (units/s)

export const PADDLE_SPEED_OIL = 3 * PADDLE_SPEED; // oil: 3x paddle speed
export const PADDLE_WIDTH_DWARF = 0.5 * PADDLE_WIDTH; // dwarf: half paddle width

export const ICE_DURATION = 2.0; // freeze duration (from spec)
export const OIL_DURATION = 4.0; // oil duration (unspecified -> picked)
export const DWARF_DURATION = 4.0; // dwarf duration (unspecified -> picked)

export const ITEM_R = 0.03; // projectile radius
export const ITEM_SPEED = 1.1; // projectile speed (units/s)
export const ITEM_RELOAD = 1.5; // seconds until the next random item is granted

export const WIN_SCORE = 5;
export const COUNTDOWN = 5; // seconds
export const POINT_PAUSE = 1.2; // seconds after a score before the ball relaunches

export const TICK_RATE = 60; // simulation Hz
export const SNAPSHOT_RATE = 30; // server broadcast Hz
export const DT = 1 / TICK_RATE;

export const ITEM_TYPES = ['ice', 'oil', 'dwarf'];
