// Keyboard input: WASD / arrows to move, Shift to run.
// M12: mouse position on the canvas (the coin-throw aim). DOM-dependent
// (thin adapter); the movement math it feeds lives in world.js and is
// covered by tests/world.test.js.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, cleared each frame
  // M12: last mouse position in canvas pixels (scaled from the
  // element rect, so a CSS-scaled canvas still aims true). `moved`
  // is false until the mouse first moves — main.js falls back to
  // the player's facing direction until then.
  const mouse = { x: 0, y: 0, moved: false };
  if (canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / Math.max(1, rect.width);
      const sy = canvas.height / Math.max(1, rect.height);
      mouse.x = (e.clientX - rect.left) * sx;
      mouse.y = (e.clientY - rect.top) * sy;
      mouse.moved = true;
    });
  }

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
    // M12: last mouse position on the canvas ({ x, y, moved }).
    mouse() {
      return mouse;
    },
    endFrame() {
      pressed.clear();
    },
  };
}
