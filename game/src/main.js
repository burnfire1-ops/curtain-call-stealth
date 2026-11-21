// CURTAIN CALL — M4 main loop: start -> play -> win/lose -> restart.
// Thin glue over tested world.js; screens + input + audio only.
// Screen flow lives in screens.js (pure, unit-tested); HUD in hud.js;
// audio in audio.js (lazy, never throws without an audio device).
import CONFIG from './config.js';
import { createWorld, step } from './world.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { applyShot } from './shots.js';
import { transition } from './screens.js';
import { createAudio } from './audio.js';
import { drainAudio } from './feel.js';
import { floorAt } from './level.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.VIEW_WIDTH;
canvas.height = CONFIG.VIEW_HEIGHT;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

// Shot mode: one frozen deterministic frame, no animation loop.
if (shot === 'start' || shot === 'play' || shot === 'end' || shot === 'chase'
  || shot === 'foyer' || shot === 'auditorium' || shot === 'backstage') {
  const { world, screen } = applyShot(shot);
  render(ctx, world, screen, 0, false);
} else {
  let world = createWorld();
  let screen = 'start'; // 'start' | 'play' | 'paused' | 'win' | 'lose'
  const input = createInput();
  const audio = createAudio();
  let stepTimer = 0; // seconds since the last guard-footstep sound
  let tReal = 0; // accumulated real time, drives HUD pulse + cone blink

  // Debug handle for scripted playthroughs (M1 harness, M5 checks).
  // Read-only view of live state; the game never reads it back.
  window.__curtainCall = {
    get screen() { return screen; },
    get world() { return world; },
    get audio() { return audio; },
  };

  function restart() {
    world = createWorld();
    screen = 'play';
  }

  // AudioContext is created LAZY on the first user gesture (M4: a
  // headless run without audio must never throw).
  function unlockAudio() {
    audio.unlock();
  }
  window.addEventListener('keydown', unlockAudio);
  canvas.addEventListener('click', () => {
    unlockAudio();
    if (screen === 'start') screen = 'play';
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tReal += dt;

    // Screen flow (screens.js): one key per frame, first match wins.
    for (const key of ['Enter', 'KeyR', 'KeyP']) {
      if (input.wasPressed(key)) {
        const result = transition(screen, key);
        if (result.action === 'restart') restart();
        screen = result.screen;
        break;
      }
    }
    if (input.wasPressed('KeyM')) audio.toggleMute();

    // Feel runs in real time on every screen, so the shake decays
    // instead of freezing mid-air on the win/lose screens.
    world.feel.update(dt);

    if (screen === 'play') {
      const prevStatus = world.status;
      step(world, input.axis(), dt);
      if (world.status === 'won') screen = 'win';
      else if (world.status === 'lost') screen = 'lose';

      // Audio, from game state (never polled from the DOM):
      // tension drone follows the worst suspicion; guard footsteps
      // sound every 0.4s, louder when the nearest guard is close.
      // The footstep pitch follows the floor under the PLAYER
      // (M5 parent decision — the player hears the floor they stand on).
      audio.setTension(world.exposure);
      stepTimer += dt;
      if (stepTimer >= 0.4) {
        stepTimer = 0;
        let nearest = null;
        let nearestDist = Infinity;
        for (const guard of world.guards) {
          const d = Math.hypot(world.player.x - guard.x, world.player.y - guard.y);
          if (d < nearestDist) { nearestDist = d; nearest = guard; }
        }
        if (nearest) audio.footstep(nearestDist, floorAt(world.player.x, world.player.y));
      }
      // One-shot event sounds queued by the world (alarm / prop / caught).
      for (const name of drainAudio(world.feel)) {
        if (name === 'alarm') audio.alarm();
        else if (name === 'prop') audio.propChime();
        else if (name === 'caught') audio.thud();
      }
      // Win/lose stingers fire once, on the status transition.
      if (prevStatus === 'playing' && world.status === 'won') audio.win();
      else if (prevStatus === 'playing' && world.status === 'lost') audio.lose();
    }

    render(ctx, world, screen, tReal, audio.isMuted());
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
