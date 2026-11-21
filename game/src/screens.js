// CURTAIN CALL — M4 screen flow: title -> play -> pause -> win/lose.
// game-ui-ux: screens modelled as a tiny state machine, not booleans —
// one function owns every transition, so the flow is unit-testable and
// main.js only interprets its result. Pure, no DOM.
// Returns { screen } or { screen, action: 'restart' } (main.js rebuilds
// the world and switches to 'play' when it sees the restart action).
// Keys are e.code values from input.js (Enter, KeyR, KeyP).
export function transition(screen, key) {
  if (screen === 'start') {
    return key === 'Enter' ? { screen: 'play' } : { screen: 'start' };
  }
  if (screen === 'play') {
    if (key === 'KeyP') return { screen: 'paused' };
    if (key === 'KeyR') return { screen: 'play', action: 'restart' };
    return { screen: 'play' };
  }
  if (screen === 'paused') {
    if (key === 'KeyP') return { screen: 'play' };
    if (key === 'KeyR') return { screen: 'play', action: 'restart' };
    return { screen: 'paused' };
  }
  // 'win' | 'lose': R or Enter restarts; P does nothing here.
  if (key === 'KeyR' || key === 'Enter') {
    return { screen: 'play', action: 'restart' };
  }
  return { screen };
}
