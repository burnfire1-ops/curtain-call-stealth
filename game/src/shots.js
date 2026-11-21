// Screenshot mode (?shot=start|play|end|chase|foyer|auditorium|backstage)
// — pattern from the starter's shots.json. Deterministic staged states,
// rendered as one frozen frame so headless screenshots are reproducible.
// Returns the screen to draw.
import { createWorld } from './world.js';

// Stage one guard: position, facing, FSM state, suspicion, last-known.
function stageGuard(world, i, { x, y, dir, state, stateTime, suspicion, lastKnown }) {
  const g = world.guards[i];
  g.x = x;
  g.y = y;
  g.dir = dir;
  g.state = state;
  g.stateTime = stateTime;
  g.suspicion = suspicion;
  g.lastKnown = lastKnown;
  return g;
}

export function applyShot(name) {
  const world = createWorld();
  if (name === 'play') {
    // Mid-action in the Auditorium: player on the carpet behind curtain B,
    // usher 3 CHASING the player's last-known spot — red cone closes in,
    // "!" above the guard, footstep rings on the floor. (M5 final
    // screenshot 2: hiding behind the curtain, red cone near.)
    stageGuard(world, 2, {
      x: 650, y: 450, dir: { x: -0.98, y: -0.18 },
      state: 'chase', stateTime: 0.5, suspicion: 1.0,
      lastKnown: { x: 540, y: 430 },
    });
    world.player.x = 540;
    world.player.y = 430;
    world.player.dir = { x: 1, y: 0 };
    world.rings = [
      { x: 630, y: 450, age: 0.2, kind: 'guard' },
      { x: 610, y: 450, age: 0.5, kind: 'guard' },
    ];
    world.feel.alerts.push({ guard: world.guards[2], age: 0 });
    world.exposure = 1.0;
    return { world, screen: 'play' };
  }
  if (name === 'chase') {
    // Alarm moment: suspicion full, usher 1 CHASES the player's
    // last-known position — cone red. (Candidate for the M5 screenshot
    // 4-alarm.)
    stageGuard(world, 0, {
      x: 420, y: 300, dir: { x: -1, y: 0 },
      state: 'chase', stateTime: 0.5, suspicion: 1.0,
      lastKnown: { x: 360, y: 300 },
    });
    world.player.x = 360;
    world.player.y = 300;
    world.player.dir = { x: 1, y: 0 };
    world.feel.alerts.push({ guard: world.guards[0], age: 0 });
    world.exposure = 1.0;
    return { world, screen: 'play' };
  }
  if (name === 'foyer') {
    // Teach wing: player below the patrol line, usher 1 turning toward
    // the noise in the lit foyer pool, Star Tiara visible in its alcove.
    stageGuard(world, 0, {
      x: 300, y: 300, dir: { x: -0.78, y: 0.62 },
      state: 'suspicious', stateTime: 0.4, suspicion: 0.4,
      lastKnown: { x: 200, y: 380 },
    });
    world.player.x = 200;
    world.player.y = 380;
    world.player.dir = { x: 0, y: -1 };
    world.rings = [{ x: 280, y: 300, age: 0.3, kind: 'guard' }];
    world.exposure = 0.4;
    return { world, screen: 'play' };
  }
  if (name === 'auditorium') {
    // Pressure wing: player on the carpet, usher 3 suspicious, usher 2
    // patrolling the lit wood stage by the Golden Mask.
    stageGuard(world, 2, {
      x: 560, y: 520, dir: { x: -0.7, y: -0.7 },
      state: 'suspicious', stateTime: 0.4, suspicion: 0.6,
      lastKnown: { x: 500, y: 450 },
    });
    world.player.x = 500;
    world.player.y = 450;
    world.player.dir = { x: -1, y: 0 };
    world.rings = [{ x: 540, y: 520, age: 0.4, kind: 'guard' }];
    world.exposure = 0.6;
    return { world, screen: 'play' };
  }
  if (name === 'backstage') {
    // Climax wing: player on the carpet runner by the Violin, usher 5
    // suspicious, lit vault + EXIT top-right.
    stageGuard(world, 4, {
      x: 800, y: 380, dir: { x: 0.24, y: 0.97 },
      state: 'suspicious', stateTime: 0.4, suspicion: 0.5,
      lastKnown: { x: 820, y: 460 },
    });
    world.player.x = 820;
    world.player.y = 460;
    world.player.dir = { x: 1, y: 0 };
    world.rings = [{ x: 800, y: 400, age: 0.4, kind: 'guard' }];
    world.exposure = 0.5;
    return { world, screen: 'play' };
  }
  if (name === 'end') {
    world.status = 'won';
    world.time = 87.4;
    world.props[0].taken = true;
    world.props[1].taken = true;
    return { world, screen: 'win' };
  }
  // Default: start screen.
  return { world, screen: 'start' };
}
