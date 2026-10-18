import * as UI from 'Helix/UserInterface';

// Hover is independent of a held interaction; leaving must never release it.
export function setHover (win, id, enter, leave) {
  return UI.setOnHover(win, id, (event) => {
    if (event.phase === 'enter') return enter(event);
    if (event.phase === 'leave') return leave(event);
  });
}

// Value controls respond immediately to a press and keep capture outside their
// bounds. One contact owns a control; a second finger cannot finish its edit.
export function bindValueDrag (win, id, {onStart, onChange, onEnd, onCancel}) {
  let owner = null;
  return UI.setOnPress(win, id, (event) => {
    if (event.phase === 'start') {
      if (owner !== null) return;
      owner = event.interactionId;
      if (onStart) onStart(event);
      return onChange(event.local);
    }
    if (owner === null || event.interactionId !== owner) return;
    if (event.phase === 'change') return onChange(event.local);
    if (event.phase === 'end') {
      owner = null;
      onChange(event.local);
      if (onEnd) return onEnd(event);
    }
    if (event.phase === 'cancel') {
      owner = null;
      if (onCancel) return onCancel(event);
    }
  });
}

export function scrollDelta (event, step) {
  const delta = Number(event.scroll?.y);
  if (!Number.isFinite(delta)) return 0;
  return delta * (event.unit === 'step' ? step : 1);
}
