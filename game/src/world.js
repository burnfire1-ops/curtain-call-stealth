// CURTAIN CALL — M3 world: pure game logic, no DOM, no canvas.
// Testable in Node: `node --test tests/world.test.js`.
// Multi-guard: world.guards (array, from level.js); world.guard stays an
// alias of guards[0] so M1/M2 callers keep working. Detection is real:
// vision.canSee feeds suspicion (detection.js) into each guard's FSM
// (guard.js). Caught only when a chasing guard TOUCHES the player.
import CONFIG from './config.js';
import { buildLevel, floorAt } from './level.js';
import { canSee, segmentBlocked } from './vision.js';
import { noiseRadiusAt } from './detection.js';
import { createGuard, stepGuard, forceChase } from './guard.js';
import { createCamera, stepCamera, cameraSees } from './camera.js';
import { createLaser, stepLaser, laserTripsPlayer } from './laser.js';
import {
  createFeel, triggerAlert, triggerProp, triggerCaught,
  triggerCoin, triggerCameraAlarm, markAlert,
  triggerSmoke, triggerLaser,
} from './feel.js';

// Re-exported for callers that used the M1 location (moved to vision.js).
export { segmentBlocked };

// Level (level.js) + live state: 6 ushers, 3 props, rings, noise.
export function createWorld() {
  const level = buildLevel();
  const guards = level.guards.map((spec) =>
    createGuard({ ...spec, speed: CONFIG.GUARD_SPEED }),
  );
  return {
    time: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
    level,
    // Alias of the WORST suspicion (0..1) for the HUD + old callers.
    exposure: 0,
    player: {
      x: level.spawn.x, y: level.spawn.y,
      r: CONFIG.PLAYER_R, dir: { x: 0, y: -1 },
    },
    guards,
    guard: guards[0], // alias — same object, M1/M2 tests mutate it directly
    // M12: two fixed security cameras (level.cameras) + the coin gadget.
    cameras: level.cameras.map((spec) => createCamera(spec)),
    coins: CONFIG.COIN_COUNT, // throws left this run, no refill
    coinFlight: null, // { x0, y0, x1, y1, t, dur } while a coin is in the air
    coinRing: null, // { x, y, radius, age } — gold landing ring, audible 0.5s
    coinCooldown: 0, // seconds until the next throw is allowed
    // M13: the smoke gadget (same throw path as the coin) + the laser
    // tripwires (level.lasers) + the laser meter. Smoke is silent:
    // no ring, no noise — it only ever blocks sight.
    smokes: CONFIG.SMOKE_COUNT, // throws left this run, no refill
    smokeFlight: null, // { x0, y0, x1, y1, t, dur } while a smoke is in the air
    smokeClouds: [], // { x, y, r, age } — live clouds, 4s each
    lasers: level.lasers.map((spec) => createLaser(spec)),
    laserSuspicion: 0, // 0..1 — the laser meter (trip +0.6, decays like suspicion)
    // M12: building alarm — raised when a camera's suspicion hits 1.0,
    // cleared after ALARM_CALM_S with no camera seeing the player.
    alarm: { active: false, unseen: 0 },
    walls: level.walls,
    covers: level.covers,
    props: level.props.map((p) => ({ ...p })),
    exit: level.exit,
    rings: [], // footstep rings { x, y, age, kind: 'guard' }
    noiseRing: null, // { x, y, radius, age } while the player runs
    // M4: run stats for the HUD + win/lose screens, and the feel state
    // (shake, "!" alerts, prop flash, queued sounds for main.js).
    detections: 0, // chase entries — 0 at win time means GHOST
    caughtBy: null, // name of the usher that caught the player
    lastNoise: null, // { floor: 'wood'|'carpet', radius } of the last run
    feel: createFeel(),
  };
}

function circleHitsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Move a circle axis-separated so it slides along walls instead of sticking.
function moveCircle(body, dx, dy, blockers) {
  let x = body.x + dx;
  for (const b of blockers) {
    if (circleHitsRect(x, body.y, body.r, b)) {
      x = dx > 0 ? b.x - body.r : b.x + b.w + body.r;
    }
  }
  let y = body.y + dy;
  for (const b of blockers) {
    if (circleHitsRect(x, y, body.r, b)) {
      y = dy > 0 ? b.y - body.r : b.y + b.h + body.r;
    }
  }
  body.x = x;
  body.y = y;
}

// Kept contract (M1): seen = inside cone AND line of sight (2-point
// raycast) not blocked by a wall or cover. Any guard seeing counts.
// M13: smoke clouds block the sight line like a wall.
export function isSeenByGuard(world) {
  const blockers = world.walls.concat(world.covers);
  return world.guards.some(
    (guard) => canSee(guard, world.player, blockers, world.smokeClouds || []).seen,
  );
}

// M12 coin throw: (tx, ty) is the aim point (mouse, or facing
// direction when the mouse never moved). The coin lands at most
// COIN_THROW_DIST from the player, clamped inside the walls, after
// COIN_FLIGHT_S in the air. False when there is nothing to throw
// (0 coins, cooling down, a coin already flying, not playing) — the
// caller (main.js) just does nothing, the count never goes negative.
export function throwCoin(world, tx, ty) {
  if (world.status !== 'playing') return false;
  if (world.coins <= 0) return false;
  if (world.coinCooldown > 0) return false;
  if (world.coinFlight) return false;
  let dx = tx - world.player.x;
  let dy = ty - world.player.y;
  const len = Math.hypot(dx, dy);
  if (len > CONFIG.COIN_THROW_DIST) {
    dx = (dx / len) * CONFIG.COIN_THROW_DIST;
    dy = (dy / len) * CONFIG.COIN_THROW_DIST;
  } else if (len < 1e-9) {
    dx = CONFIG.COIN_THROW_DIST;
    dy = 0;
  }
  const x1 = Math.max(CONFIG.WALL, Math.min(
    CONFIG.VIEW_WIDTH - CONFIG.WALL, world.player.x + dx));
  const y1 = Math.max(CONFIG.WALL, Math.min(
    CONFIG.VIEW_HEIGHT - CONFIG.WALL, world.player.y + dy));
  world.coins -= 1;
  world.coinCooldown = CONFIG.COIN_COOLDOWN_S;
  world.coinFlight = {
    x0: world.player.x, y0: world.player.y,
    x1, y1, t: 0, dur: CONFIG.COIN_FLIGHT_S,
  };
  return true;
}

// M13 smoke throw: the same throw path as the coin (mouse aim, 200px
// max, clamped inside the walls, 0.35s flight) and the SAME 0.5s
// cooldown — a throw of either kind blocks the next throw of either
// kind. False when there is nothing to throw (0 smokes, cooling
// down, anything already flying, not playing). The landing makes a
// silent 4s cloud, never a ring and never a noise.
export function throwSmoke(world, tx, ty) {
  if (world.status !== 'playing') return false;
  if (world.smokes <= 0) return false;
  if (world.coinCooldown > 0) return false;
  if (world.coinFlight || world.smokeFlight) return false;
  let dx = tx - world.player.x;
  let dy = ty - world.player.y;
  const len = Math.hypot(dx, dy);
  if (len > CONFIG.COIN_THROW_DIST) {
    dx = (dx / len) * CONFIG.COIN_THROW_DIST;
    dy = (dy / len) * CONFIG.COIN_THROW_DIST;
  } else if (len < 1e-9) {
    dx = CONFIG.COIN_THROW_DIST;
    dy = 0;
  }
  const x1 = Math.max(CONFIG.WALL, Math.min(
    CONFIG.VIEW_WIDTH - CONFIG.WALL, world.player.x + dx));
  const y1 = Math.max(CONFIG.WALL, Math.min(
    CONFIG.VIEW_HEIGHT - CONFIG.WALL, world.player.y + dy));
  world.smokes -= 1;
  world.coinCooldown = CONFIG.COIN_COOLDOWN_S;
  world.smokeFlight = {
    x0: world.player.x, y0: world.player.y,
    x1, y1, t: 0, dur: CONFIG.SMOKE_FLIGHT_S,
  };
  return true;
}

// input: { x, y, run } — x/y in [-1, 1], run = Shift held.
export function step(world, input, dt) {
  if (world.status !== 'playing') return;
  world.time += dt;

  // Player movement (normalized diagonal, axis-separated collision).
  const len = Math.hypot(input.x, input.y);
  if (len > 0) {
    const speed = input.run ? CONFIG.RUN_SPEED : CONFIG.PLAYER_SPEED;
    const nx = input.x / len;
    const ny = input.y / len;
    world.player.dir = { x: nx, y: ny };
    moveCircle(
      world.player,
      nx * speed * dt,
      ny * speed * dt,
      world.walls.concat(world.covers),
    );
  }

  // Noise (M3): running on wood is loud (140px), on carpet quiet (40px),
  // walking is silent. Guards inside the radius hear the player's point.
  let noise = null;
  if (len > 0 && input.run) {
    const radius = noiseRadiusAt(world.player.x, world.player.y, true);
    noise = { x: world.player.x, y: world.player.y, radius };
    world.noiseRing = { ...noise, age: 0 };
    // M4: remember the last noise for the HUD (floor + radius).
    world.lastNoise = { floor: floorAt(world.player.x, world.player.y), radius };
  } else if (world.noiseRing) {
    world.noiseRing.age += dt;
    if (world.noiseRing.age > 0.25) world.noiseRing = null;
  }

  // M12 coin: cooldown ticks down; a flying coin lands after
  // COIN_FLIGHT_S (gold ring + clink + an audible window of
  // COIN_HEAR_S, so no guard misses it mid-transition).
  if (world.coinCooldown > 0) {
    world.coinCooldown = Math.max(0, world.coinCooldown - dt);
  }
  let coinNoise = null;
  if (world.coinFlight) {
    world.coinFlight.t += dt;
    if (world.coinFlight.t >= world.coinFlight.dur) {
      const { x1, y1 } = world.coinFlight;
      world.coinFlight = null;
      world.coinRing = { x: x1, y: y1, radius: CONFIG.COIN_HEAR_RADIUS, age: 0 };
      triggerCoin(world.feel);
    }
  }
  if (world.coinRing) {
    world.coinRing.age += dt;
    if (world.coinRing.age >= CONFIG.COIN_HEAR_S) {
      coinNoise = null;
    } else {
      coinNoise = {
        x: world.coinRing.x, y: world.coinRing.y,
        radius: world.coinRing.radius,
      };
    }
    if (world.coinRing.age >= CONFIG.COIN_RING_S) world.coinRing = null;
  }

  // M13 smoke: a flying smoke lands after SMOKE_FLIGHT_S (a silent
  // grey cloud, no ring, no noise) and lives SMOKE_CLOUD_S. Clouds
  // age out on their own — the world never holds a stale one.
  if (world.smokeFlight) {
    world.smokeFlight.t += dt;
    if (world.smokeFlight.t >= world.smokeFlight.dur) {
      const { x1, y1 } = world.smokeFlight;
      world.smokeFlight = null;
      world.smokeClouds.push({
        x: x1, y: y1, r: CONFIG.SMOKE_CLOUD_R, age: 0,
      });
      triggerSmoke(world.feel);
    }
  }
  for (const cloud of world.smokeClouds) cloud.age += dt;
  world.smokeClouds = world.smokeClouds.filter(
    (c) => c.age < CONFIG.SMOKE_CLOUD_S);

  // M13 lasers: pulse the phase clock, then check the player against
  // each live beam. A trip adds LASER_TRIP_SUSPICION to the laser
  // meter (two trips in one ON window reach the alarm); otherwise
  // the meter decays like suspicion. Smoke never blocks a laser —
  // the trip test is a pure segment test, no vision involved.
  let trippedNow = false;
  for (const laser of world.lasers) {
    stepLaser(laser, dt);
    if (laserTripsPlayer(laser, world.player)) {
      trippedNow = true;
      world.laserSuspicion = Math.min(1,
        world.laserSuspicion + CONFIG.LASER_TRIP_SUSPICION);
      triggerLaser(world.feel);
    }
  }
  if (!trippedNow) {
    world.laserSuspicion = Math.max(0,
      world.laserSuspicion - CONFIG.SUSPICION_DECAY * dt);
  }

  // M12 cameras: sweep + suspicion (same meter as guards). A camera
  // at 1.0 raises the building alarm BEFORE the guard loop runs, so
  // the loop's chase-entry check does not double-count the forced
  // chase (detections are counted here, once per guard).
  // M13: the laser meter feeds the same alarm — a laserSuspicion of
  // 1.0 raises the alarm through the same path. `worst` starts at
  // the laser meter, so the exposure bar shows it too.
  const blockers = world.walls.concat(world.covers);
  let worst = world.laserSuspicion;
  let anyCamSees = false;
  for (const cam of world.cameras) {
    const seen = cameraSees(cam, world.player, blockers, world.smokeClouds);
    const dist = Math.hypot(world.player.x - cam.x, world.player.y - cam.y);
    stepCamera(cam, seen.seen, {
      dist, running: input.run, x: world.player.x, y: world.player.y,
    }, dt);
    if (seen.seen) anyCamSees = true;
    if (cam.suspicion > worst) worst = cam.suspicion;
  }
  if (!world.alarm.active) {
    const alarming = world.cameras.find(
      (cam) => cam.suspicion >= CONFIG.CHASE_AT)
      || world.laserSuspicion >= CONFIG.CHASE_AT;
    if (alarming) {
      world.alarm.active = true;
      world.alarm.unseen = 0;
      triggerCameraAlarm(world.feel);
      for (const guard of world.guards) {
        if (guard.state !== 'chase') {
          forceChase(guard, world.player);
          world.detections += 1;
          markAlert(world.feel, guard);
        }
      }
    }
  } else if (anyCamSees) {
    // Cameras still on the player: the alarm tracks live — chasing
    // guards re-aim at the player's current position (the camera
    // feed), they do not walk to a stale point while being watched.
    world.alarm.unseen = 0;
    for (const guard of world.guards) {
      if (guard.state === 'chase') {
        guard.lastKnown = { x: world.player.x, y: world.player.y };
      }
    }
  } else {
    world.alarm.unseen += dt;
    if (world.alarm.unseen >= CONFIG.ALARM_CALM_S) {
      world.alarm.active = false;
      world.alarm.unseen = 0;
    }
  }

  // Perceive (vision) -> suspicion (detection) -> decide + move (guard
  // FSM), independently per guard. `worst` already holds the camera
  // max — exposure is the worst suspicion of guards AND cameras.
  for (const guard of world.guards) {
    const seen = canSee(guard, world.player, blockers, world.smokeClouds);
    const dist = Math.hypot(
      world.player.x - guard.x,
      world.player.y - guard.y,
    );
    // A landed coin outranks footsteps: it is the deliberate
    // distraction, so a running player can still pull a guard away.
    const coinHeard = coinNoise && dist < coinNoise.radius
      ? { x: coinNoise.x, y: coinNoise.y, coin: true }
      : null;
    const heard = coinHeard || (noise && dist < noise.radius
      ? { x: noise.x, y: noise.y }
      : null);
    const ox = guard.x;
    const oy = guard.y;
    const prevState = guard.state;
    stepGuard(guard, {
      seen: seen.seen,
      dist,
      player: world.player,
      running: input.run,
      heard,
      blockers,
    }, dt);
    // M4: a chase ENTRY is one detection (staying in chase does not
    // recount) — it fires the "!" alert + alarm sting via feel.
    if (guard.state === 'chase' && prevState !== 'chase') {
      world.detections += 1;
      triggerAlert(world.feel, guard);
    }
    if (guard.suspicion > worst) worst = guard.suspicion;

    // Footstep rings (M3, visual only): one thin ring per 36px walked.
    guard.stepAcc += Math.hypot(guard.x - ox, guard.y - oy);
    if (guard.stepAcc >= CONFIG.GUARD_STEP_LEN) {
      guard.stepAcc = 0;
      world.rings.push({ x: guard.x, y: guard.y, age: 0, kind: 'guard' });
    }
  }
  world.exposure = worst;

  // Age + prune rings.
  for (const ring of world.rings) ring.age += dt;
  world.rings = world.rings.filter((r) => r.age < CONFIG.RING_FADE_S);

  // Prop pickup: walking onto a prop takes it (win never needs props).
  for (const prop of world.props) {
    if (
      !prop.taken &&
      Math.hypot(world.player.x - prop.x, world.player.y - prop.y) <
        CONFIG.PROP_PICKUP_R + world.player.r
    ) {
      prop.taken = true;
      triggerProp(world.feel); // M4: "+1 PROP" flash + chime
    }
  }

  // Win: reach the stage door.
  if (circleHitsRect(world.player.x, world.player.y, world.player.r, world.exit)) {
    world.status = 'won';
    return;
  }

  // Lose: ANY chasing guard touches the player (distance after the move).
  for (const guard of world.guards) {
    if (guard.state === 'chase') {
      const touchDist = Math.hypot(
        world.player.x - guard.x,
        world.player.y - guard.y,
      );
      if (touchDist < guard.r + world.player.r) {
        world.status = 'lost';
        world.caughtBy = guard.name; // M4: the lose screen names the usher
        triggerCaught(world.feel); // M4: shake + impact sound
        return;
      }
    }
  }
}
