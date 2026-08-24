// Input: map the slider zone to normalized targetX (0..1), and the shoot button to
// shoot taps. Uses Pointer Events so mouse (desktop Chrome), touch (phones), and pen
// all work uniformly. Multi-touch: slider and shoot pointers tracked separately.
import { FIELD_ASPECT } from '../constants.js';

export function setupInput({ onTarget, onShoot }) {
  const slider = document.getElementById('slider');
  const shootBtn = document.getElementById('shoot-btn');

  let sliderPointer = null;
  let shootPointer = null;

  // Map a viewport x to normalized playfield targetX using the same letterbox
  // transform the renderer uses, so the paddle lines up with the finger/pointer.
  function targetFromClientX(clientX) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / 1, h / FIELD_ASPECT);
    const offX = (w - scale) / 2;
    const x = (clientX - offX) / scale;
    return Math.max(0, Math.min(1, x));
  }

  function onDown(e) {
    if (shootBtn.contains(e.target)) {
      shootPointer = e.pointerId;
      if (onShoot) onShoot();
    } else if (slider.contains(e.target)) {
      sliderPointer = e.pointerId;
      // Capture so sliding off the zone still tracks movement.
      if (slider.setPointerCapture) {
        try { slider.setPointerCapture(e.pointerId); } catch {}
      }
      if (onTarget) onTarget(targetFromClientX(e.clientX));
    }
  }

  function onMove(e) {
    if (e.pointerId === sliderPointer && onTarget) {
      onTarget(targetFromClientX(e.clientX));
    }
  }

  function onUp(e) {
    if (e.pointerId === sliderPointer) sliderPointer = null;
    if (e.pointerId === shootPointer) shootPointer = null;
  }

  for (const el of [slider, shootBtn]) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    // Suppress default scroll/zoom on these zones.
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  return {};
}
