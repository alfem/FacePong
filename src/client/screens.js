// DOM screen management: start / queue / game / result, plus toasts.

const screens = {
  start: document.getElementById('screen-start'),
  queue: document.getElementById('screen-queue'),
  result: document.getElementById('screen-result'),
};

export function showScreen(name) {
  for (const key of Object.keys(screens)) screens[key].classList.add('hidden');
  // 'game' is not a DOM overlay — it is the canvas + controls + HUD.
  if (name !== 'game') screens[name].classList.remove('hidden');

  const inGame = name === 'game';
  document.getElementById('controls').classList.toggle('hidden', !inGame);
  document.getElementById('hud').classList.toggle('hidden', !inGame);
}

export function setAvatarPreview(url) {
  const box = document.getElementById('avatar-box');
  const img = document.getElementById('avatar-preview');
  if (url) {
    img.src = url;
    box.classList.add('has-img');
  } else {
    box.classList.remove('has-img');
  }
}

export function setQueueInfo(code, roomURL) {
  document.getElementById('queue-code').textContent = code || '••••';
  document.getElementById('queue-url').textContent = roomURL || '';
}

export function showToast(text, ms = 1600) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth; // reflow to restart the animation
  t.style.animation = '';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

export function setResult(won, scores) {
  document.getElementById('result-title').textContent = won ? 'You win! 🎉' : 'You lose 😅';
  document.getElementById('result-score').textContent = `${scores[0]} — ${scores[1]}`;
}
