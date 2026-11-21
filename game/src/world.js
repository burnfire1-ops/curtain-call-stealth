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
import { createGuard, stepGuard } from './guard.js';
import {
  createFeel, triggerAlert, triggerProp, triggerCaught,
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
export function isSeenByGuard(world) {
  const blockers = world.walls.concat(world.covers);
  return world.guards.some(
    (guard) => canSee(guard, world.player, blockers).seen,
  );
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

  // Perceive (vision) -> suspicion (detection) -> decide + move (guard
  // FSM), independently per guard.
  const blockers = world.walls.concat(world.covers);
  let worst = 0;
  for (const guard of world.guards) {
    const seen = canSee(guard, world.player, blockers);
    const dist = Math.hypot(
      world.player.x - guard.x,
      world.player.y - guard.y,
    );
    const heard = noise && dist < noise.radius
      ? { x: noise.x, y: noise.y }
      : null;
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
