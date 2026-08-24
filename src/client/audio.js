// Fun synthesized sound effects via the Web Audio API — no external files needed.
// All sounds are generated on the fly with oscillators and a little noise.
let ctx = null;
let muted = false;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = !!m;
}

export function isMuted() {
  return muted;
}

function now() {
  return ctx.currentTime;
}

// Single oscillator note. `freq` -> `endFreq` sweeps the pitch (exponential).
function tone({ freq, endFreq, type = 'sine', dur = 0.15, vol = 0.25, delay = 0 }) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
  }
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Short burst of filtered noise (for whooshes).
function noise({ dur = 0.2, vol = 0.2, delay = 0, filterFreq = 1000 }) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

export function playPaddleHit() {
  tone({ freq: 200 + Math.random() * 80, type: 'square', dur: 0.07, vol: 0.22 });
}

export function playWallHit() {
  tone({ freq: 500 + Math.random() * 120, type: 'triangle', dur: 0.05, vol: 0.18 });
}

export function playShoot() {
  tone({ freq: 220, endFreq: 900, type: 'sawtooth', dur: 0.14, vol: 0.2 });
  noise({ dur: 0.1, vol: 0.1, filterFreq: 2400 });
}

export function playEffect(type) {
  if (type === 'ice') {
    tone({ freq: 1400, endFreq: 400, type: 'sine', dur: 0.3, vol: 0.22 });
    tone({ freq: 2200, endFreq: 1800, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.02 });
  } else if (type === 'oil') {
    tone({ freq: 300, endFreq: 90, type: 'sawtooth', dur: 0.28, vol: 0.2 });
    tone({ freq: 150, endFreq: 400, type: 'square', dur: 0.15, vol: 0.1, delay: 0.1 });
  } else if (type === 'dwarf') {
    tone({ freq: 500, endFreq: 120, type: 'square', dur: 0.22, vol: 0.2 });
  }
}

export function playScore(me) {
  if (me) {
    tone({ freq: 523, dur: 0.1, vol: 0.22 });
    tone({ freq: 659, dur: 0.1, vol: 0.22, delay: 0.08 });
    tone({ freq: 784, dur: 0.16, vol: 0.22, delay: 0.16 });
  } else {
    tone({ freq: 392, dur: 0.12, vol: 0.22 });
    tone({ freq: 330, dur: 0.12, vol: 0.22, delay: 0.1 });
    tone({ freq: 262, dur: 0.2, vol: 0.22, delay: 0.2 });
  }
}

export function playCountdownTick() {
  tone({ freq: 700, type: 'square', dur: 0.06, vol: 0.15 });
}

export function playGo() {
  tone({ freq: 880, type: 'square', dur: 0.2, vol: 0.25 });
  tone({ freq: 1320, type: 'square', dur: 0.15, vol: 0.2, delay: 0.1 });
}

export function playWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.24, delay: i * 0.12 }));
}

export function playLose() {
  [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.22, delay: i * 0.15 }));
}
