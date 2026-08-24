// WebSocket client wrapper: connect/join, input throttling, message dispatch.

export function createNet({ onStart, onSnapshot, onEffect, onScore, onGameover, onOpponentLeft, onWaiting, onError }) {
  let ws = null;
  let playerId = null;
  let targetX = 0.5;
  let dirty = false;
  let inputTimer = null;
  let pendingJoin = null;

  function connect(url) {
    ws = new WebSocket(url);
    ws.onopen = () => {
      // Flush a queued join once the socket is actually open.
      if (pendingJoin) {
        ws.send(JSON.stringify({ type: 'join', ...pendingJoin }));
        pendingJoin = null;
      }
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      switch (msg.type) {
        case 'waiting': onWaiting && onWaiting(); break;
        case 'start':
          playerId = msg.playerId;
          onStart && onStart(msg);
          break;
        case 'snapshot': onSnapshot && onSnapshot(msg); break;
        case 'effect': onEffect && onEffect(msg); break;
        case 'score': onScore && onScore(msg); break;
        case 'gameover': onGameover && onGameover(msg); break;
        case 'opponent_left': onOpponentLeft && onOpponentLeft(); break;
        case 'error': onError && onError(msg.message); break;
      }
    };
    ws.onclose = () => {
      if (onOpponentLeft) onOpponentLeft();
    };
    ws.onerror = () => {};
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  return {
    get playerId() { return playerId; },
    connect,
    join({ name, avatar, room }) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        send({ type: 'join', name, avatar, room });
      } else {
        pendingJoin = { name, avatar, room };
      }
    },
    setTarget(x) {
      targetX = x;
      dirty = true;
      // Throttle to 30Hz trailing-edge: send latest value only when it changed.
      if (!inputTimer) {
        inputTimer = setInterval(() => {
          if (dirty) send({ type: 'input', targetX });
          dirty = false;
        }, 33);
      }
    },
    shoot() { send({ type: 'shoot' }); },
    disconnect() { if (ws) ws.close(); },
  };
}
