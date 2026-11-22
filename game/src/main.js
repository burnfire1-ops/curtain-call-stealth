// CURTAIN CALL — M4 main loop: start -> play -> win/lose -> restart.
// Thin glue over tested world.js; screens + input + audio only.
// Screen flow lives in screens.js (pure, unit-tested); HUD in hud.js;
// audio in audio.js (lazy, never throws without an audio device).
import CONFIG from './config.js';
import { createWorld, step, throwCoin, throwSmoke } from './world.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { applyShot } from './shots.js';
import { transition } from './screens.js';
import { createAudio } from './audio.js';
import { drainAudio } from './feel.js';
import { floorAt } from './level.js';
import { scoreBreakdown, updateBest, jobAtPoint, starsForJob } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// M15 DEVIATION (disclosed in the M15 builder report): the brief's
// allowed list does not name main.js, but the canvas BACKING STORE is
// set only here — a 1200px canvas is impossible without this one line.
// Render-only: the playfield grid (VIEW_WIDTH 960) is untouched.
canvas.width = CONFIG.CANVAS_W;
canvas.height = CONFIG.VIEW_HEIGHT;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

// Shot mode: one frozen deterministic frame, no animation loop.
if (shot === 'select' || shot === 'start' || shot === 'play' || shot === 'play2'
  || shot === 'play3' || shot === 'end' || shot === 'end2' || shot === 'end3'
  || shot === 'chase' || shot === 'chase2' || shot === 'chase3'
  || shot === 'foyer' || shot === 'auditorium' || shot === 'backstage') {
  const { world, screen, campaign } = applyShot(shot);
  render(ctx, world, screen, 0, false, campaign);
} else {
  // M14: the campaign lives for the session (in-memory only) — the
  // selected card, which jobs are cleared, and the best score/time per
  // job. `world` is the live game world while playing, and the select
  // backdrop world (the selected job's level) while on the title.
  let campaign = { selected: 0, cleared: [false, false, false], best: [null, null, null] };
  let world = createWorld(0);
  let screen = 'select'; // 'select' | 'play' | 'paused' | 'win' | 'lose'
  const input = createInput(canvas); // M12: canvas passed for mouse aim
  const audio = createAudio();
  let stepTimer = 0; // seconds since the last guard-footstep sound
  let tReal = 0; // accumulated real time, drives HUD pulse + cone blink

  // Debug handle for scripted playthroughs (M1 harness, M5 checks).
  // Read-only view of live state; the game never reads it back.
  window.__curtainCall = {
    get screen() { return screen; },
    get world() { return world; },
    get audio() { return audio; },
    get campaign() { return campaign; },
    get jobIndex() { return world.jobIndex; },
  };

  function restart(jobIndex = world.jobIndex) {
    world = createWorld(jobIndex);
    screen = 'play';
  }

  // Pick a job card on the select screen — the backdrop world follows
  // the selection, so the title already shows the job's level.
  function selectJob(job) {
    campaign.selected = job;
    world = createWorld(job);
    screen = 'select';
  }

  // Record a win in the campaign: the job is cleared, and the best
  // score/time only ever improves (updateBest). Called once, on the
  // playing -> won transition, before the win screen draws.
  function recordWin() {
    const job = world.jobIndex;
    campaign.cleared[job] = true;
    const s = scoreBreakdown(world);
    const taken = world.props.filter((p) => p.taken).length;
    const stars = starsForJob(world.detections, taken, world.props.length,
      world.time, CONFIG.PAR_S[job]);
    campaign.best[job] = updateBest(campaign.best[job], s.total, world.time, stars);
  }

  // AudioContext is created LAZY on the first user gesture (M4: a
  // headless run without audio must never throw).
  function unlockAudio() {
    audio.unlock();
  }
  window.addEventListener('keydown', unlockAudio);
  canvas.addEventListener('click', (e) => {
    unlockAudio();
    if (screen !== 'select') return;
    // M14: click a job card to select it; click the already-selected
    // card to start it. Positions are canvas pixels (same scaling as
    // the mouse aim in input.js).
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const y = (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    const job = jobAtPoint(x, y);
    if (job < 0) return;
    if (job === campaign.selected) restart(job);
    else selectJob(job);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tReal += dt;

    // Screen flow (screens.js): one key per frame, first match wins.
    for (const key of ['Enter', 'KeyR', 'KeyP', 'Digit1', 'Digit2', 'Digit3']) {
      if (input.wasPressed(key)) {
        const result = transition(screen, key, {
          selected: campaign.selected,
          cleared: campaign.cleared,
          jobIndex: world.jobIndex,
        });
        if (result.action === 'restart') restart();
        else if (result.action === 'startJob') restart(result.job);
        else if (result.action === 'next') restart(world.jobIndex + 1);
        else if (result.action === 'select') selectJob(result.job);
        else if (result.action === 'title') selectJob(campaign.selected);
        screen = result.screen;
        break;
      }
    }
    if (input.wasPressed('KeyM')) audio.toggleMute();

    // Feel runs in real time on every screen, so the shake decays
    // instead of freezing mid-air on the win/lose screens.
    world.feel.update(dt);

    if (screen === 'play') {
      // M12: C throws a coin — aim at the mouse; before the mouse
      // ever moves, throw along the facing direction. throwCoin
      // itself enforces count / cooldown / flight, so a spent C is
      // a silent no-op.
      // M13: X throws a smoke the same way (same aim, same shared
      // 0.5s cooldown) — throwSmoke enforces its own count.
      if (input.wasPressed('KeyC') || input.wasPressed('KeyX')) {
        const m = input.mouse();
        const target = m.moved
          ? { x: m.x, y: m.y }
          : {
            x: world.player.x + world.player.dir.x * CONFIG.COIN_THROW_DIST,
            y: world.player.y + world.player.dir.y * CONFIG.COIN_THROW_DIST,
          };
        if (input.wasPressed('KeyC')) throwCoin(world, target.x, target.y);
        else throwSmoke(world, target.x, target.y);
      }

      const prevStatus = world.status;
      step(world, input.axis(), dt);
      if (world.status === 'won') {
        // Record the win once, on the transition — the win screen
        // already shows the updated campaign total + NEXT JOB.
        if (prevStatus === 'playing') recordWin();
        screen = 'win';
      } else if (world.status === 'lost') screen = 'lose';

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
        if (nearest) audio.footstep(nearestDist, floorAt(world.player.x, world.player.y, world.level));
      }
      // One-shot event sounds queued by the world (alarm / prop / caught).
      for (const name of drainAudio(world.feel)) {
        if (name === 'alarm') audio.alarm();
        else if (name === 'prop') audio.propChime();
        else if (name === 'caught') audio.thud();
        else if (name === 'coin') audio.coinClink(); // M12: coin lands
        else if (name === 'smoke') audio.smoke(); // M13: smoke lands
        else if (name === 'laser') audio.laser(); // M13: laser tripped
      }
      // Win/lose stingers fire once, on the status transition.
      if (prevStatus === 'playing' && world.status === 'won') audio.win();
      else if (prevStatus === 'playing' && world.status === 'lost') audio.lose();
    }

    render(ctx, world, screen, tReal, audio.isMuted(), campaign);
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
