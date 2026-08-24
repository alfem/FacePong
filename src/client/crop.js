// Face capture: file input (camera or gallery) + drag/zoom circular crop -> 256px JPEG data URL.

const MASK_PX = () => Math.min(window.innerWidth * 0.72, 320);
const OUTPUT = 256;

let currentURL = null;
let onDone = null;

const el = {
  overlay: document.getElementById('crop-overlay'),
  stage: document.getElementById('crop-stage'),
  img: document.getElementById('crop-img'),
  input: document.getElementById('file-input'),
};

// Crop transform state (in image pixel space).
let natW = 0;
let natH = 0;
let offsetX = 0;
let offsetY = 0;
let scale = 1;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = reject;
    img.src = url;
  });
}

function resetTransform() {
  // Fit the image so it covers the stage, centered on the mask.
  const stage = el.stage.getBoundingClientRect();
  const cover = Math.max(MASK_PX() / natW, MASK_PX() / natH) * 1.15;
  scale = cover;
  offsetX = (stage.width - natW * scale) / 2;
  offsetY = (stage.height - natH * scale) / 2;
}

function applyTransform() {
  el.img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

// Keep the crop circle inside the drawn image: the image, rendered at (offsetX,
// offsetY) with `scale`, must contain the mask circle centered in the stage.
function clampOffset() {
  const stage = el.stage.getBoundingClientRect();
  const r = MASK_PX() / 2;
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const imgW = natW * scale;
  const imgH = natH * scale;
  offsetX = Math.min(Math.max(offsetX, cx + r - imgW), cx - r);
  offsetY = Math.min(Math.max(offsetY, cy + r - imgH), cy - r);
}

function cropToDataURL() {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  const stage = el.stage.getBoundingClientRect();
  const r = MASK_PX() / 2;
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  // Circle center and radius in image pixel space.
  const imgCX = (cx - offsetX) / scale;
  const imgCY = (cy - offsetY) / scale;
  const imgR = r / scale;
  const size = imgR * 2;
  ctx.drawImage(el.img, imgCX - imgR, imgCY - imgR, size, size, 0, 0, OUTPUT, OUTPUT);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function setupDragPinch() {
  const pointers = new Map(); // id -> {x, y}
  let pinchDist = 0;
  let pinchScale = 1;
  let dragStart = null; // { ox, oy, px, py } for one-finger drags

  el.stage.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      dragStart = { ox: offsetX, oy: offsetY, px: p.x, py: p.y };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchScale = scale;
      dragStart = null;
    }
  }, { passive: false });

  el.stage.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (pointers.has(t.identifier)) pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (pointers.size === 1 && dragStart) {
      const [p] = [...pointers.values()];
      offsetX = dragStart.ox + (p.x - dragStart.px);
      offsetY = dragStart.oy + (p.y - dragStart.py);
      clampOffset();
      applyTransform();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) scale = Math.min(Math.max(pinchScale * (d / pinchDist), 0.5), 6);
      clampOffset();
      applyTransform();
    }
  }, { passive: false });

  el.stage.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) pointers.delete(t.identifier);
    if (pointers.size < 2) { pinchDist = 0; dragStart = null; }
  }, { passive: false });
  el.stage.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) pointers.delete(t.identifier);
    if (pointers.size < 2) { pinchDist = 0; dragStart = null; }
  }, { passive: false });
}

export function requestPhoto() {
  el.input.value = '';
  el.input.click();
}

export function initCrop(done) {
  onDone = done;
  setupDragPinch();

  el.input.addEventListener('change', async () => {
    const file = el.input.files && el.input.files[0];
    if (!file) return;
    const { img, url } = await loadImage(file);
    natW = img.naturalWidth;
    natH = img.naturalHeight;
    el.img.src = url;
    el.overlay.classList.remove('hidden');
    resetTransform();
    applyTransform();
  });

  document.getElementById('crop-cancel').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
  });

  document.getElementById('crop-use').addEventListener('click', () => {
    currentURL = cropToDataURL();
    try { localStorage.setItem('facepong.avatar', currentURL); } catch {}
    el.overlay.classList.add('hidden');
    if (onDone) onDone(currentURL);
  });
}

export function getAvatar() {
  if (currentURL) return currentURL;
  try { return localStorage.getItem('facepong.avatar') || null; } catch { return null; }
}
