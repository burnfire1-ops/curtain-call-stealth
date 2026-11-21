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
    // M12: coin showcase — the player threw a coin toward the stage
    // (gold ring at the landing point), CAM 1's teal cone is sweeping
    // onto the player, and USHER 2 is walking to investigate the
    // clink (Search, last-known = the coin). COINS ×2 in the HUD.
    // M13: a smoke cloud hangs by curtain B (SMOKE ×1), LASER 1 is
    // live across the vault corridor, LASER 2 is down (dashed), the
    // minimap shows every dot, and the stage word reads HUNTED.
    const cam1 = world.cameras[0];
    cam1.angle = Math.atan2(230 - cam1.y, 500 - cam1.x);
    cam1.dir = { x: Math.cos(cam1.angle), y: Math.sin(cam1.angle) };
    cam1.suspicion = 0.6;
    cam1.state = 'spotted';
    world.coinRing = { x: 600, y: 140, radius: 200, age: 0.1 };
    world.coins = 2;
    world.smokes = 1;
    world.smokeClouds = [{ x: 640, y: 320, r: 90, age: 0.5 }];
    world.lasers[0].on = true;
    world.lasers[0].phaseT = 0.5;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 1.0;
    world.time = 45; // SCORE 700 live (Ghost 500 + Time 200, no props yet)
    stageGuard(world, 1, {
      x: 560, y: 210, dir: { x: 0.55, y: -0.83 },
      state: 'search', stateTime: 0.5, suspicion: 0.2,
      lastKnown: { x: 600, y: 140 },
    });
    world.guards[1].searchTimeLeft = 2.0;
    world.player.x = 500;
    world.player.y = 230;
    world.player.dir = { x: 1, y: 0 };
    world.rings = [
      { x: 550, y: 220, age: 0.2, kind: 'guard' },
      { x: 540, y: 230, age: 0.5, kind: 'guard' },
    ];
    world.exposure = 0.6;
    return { world, screen: 'play' };
  }
  if (name === 'chase') {
    // Alarm moment: CAM 1's suspicion is full, so the building alarm
    // is active (red ALARM! pill) and usher 1 CHASES the player's
    // last-known position — cone red, teal camera cone on the player.
    const cam1 = world.cameras[0];
    cam1.angle = Math.atan2(300 - cam1.y, 360 - cam1.x);
    cam1.dir = { x: Math.cos(cam1.angle), y: Math.sin(cam1.angle) };
    cam1.suspicion = 1.0;
    cam1.state = 'spotted';
    world.alarm = { active: true, unseen: 0 };
    // M13: LASER 1 is live across the vault corridor (the alarm shot
    // shows the full sensor set — camera + laser + chasing guard).
    world.lasers[0].on = true;
    world.lasers[0].phaseT = 0.8;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 0.3;
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
