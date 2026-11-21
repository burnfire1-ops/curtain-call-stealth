// Keyboard input: WASD / arrows to move, Shift to run.
// DOM-dependent (thin adapter); the movement math it feeds lives in
// world.js and is covered by tests/world.test.js.
export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, cleared each frame

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    // Normalized movement axis + run flag, read once per frame.
    axis() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      return { x, y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    },
    // True once for the frame the key went down.
    wasPressed(code) {
      return pressed.has(code);
    },
    endFrame() {
      pressed.clear();
    },
  };
}
