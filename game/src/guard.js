// CURTAIN CALL — M2 guard FSM: Patrol -> Suspicious -> Chase -> Search.
// game-ai: FSM for 4 states with obvious transitions; perception is read
// from the caller (vision + detection already ran), never raycast here.
// The guard is NEVER omniscient: Chase and Search target the LAST-KNOWN
// position, not the player's live position. Hysteresis (enter != exit
// thresholds) + MIN_STATE_TIME stop threshold flicker. Pure logic, no DOM.
import CONFIG from './config.js';
import { updateSuspicion } from './detection.js';

export function createGuard({ x, y, waypoints, speed = CONFIG.GUARD_SPEED, name = 'USHER' }) {
  return {
    name, // 'USHER 1' .. 'USHER 5' — set by world.js from the level spec
    x, y, r: CONFIG.GUARD_R,
    dir: { x: 1, y: 0 },
    waypoints, wpIndex: 1, // heading to waypoint 1 first
    speed,
    state: 'patrol', // 'patrol' | 'suspicious' | 'chase' | 'search'
    stateTime: 0,
    suspicion: 0, // 0..1, owned by detection.js
    lastKnown: null, // { x, y } — last position the player was SEEN at
    searchTimeLeft: 0,
    stepAcc: 0, // px walked since the last footstep ring (world.js reads it)
  };
}

function nearestWaypointIndex(guard) {
  let best = 0;
  let bestD = Infinity;
  guard.waypoints.forEach((wp, i) => {
    const d = (wp.x - guard.x) ** 2 + (wp.y - guard.y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Route every state entry through here (game-ai: the initial state must
// go through the same change_state as every other transition).
function changeState(guard, next) {
  guard.state = next;
  guard.stateTime = 0;
  if (next === 'search') guard.searchTimeLeft = CONFIG.SEARCH_TIME;
  if (next === 'patrol') {
    guard.suspicion = 0;
    guard.wpIndex = nearestWaypointIndex(guard);
  }
}

function faceToward(guard, target) {
  if (!target) return;
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const d = Math.hypot(dx, dy);
  if (d > 1e-9) guard.dir = { x: dx / d, y: dy / d };
}

// Circle vs rect (mirror of world.js circleHitsRect — kept local so
// guard.js stays importable without the world module).
function hitsBlocker(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Move toward target, axis-separated so the guard slides along a cover
// instead of sticking. Returns 'arrived' | 'moving' | 'blocked'.
// blockers default to [] so M2 callers without blockers behave identically.
function moveToward(guard, target, speed, dt, blockers = []) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = speed * dt;
  if (dist <= Math.max(4, stepLen)) {
    guard.x = target.x;
    guard.y = target.y;
    return 'arrived';
  }
  guard.dir = { x: dx / dist, y: dy / dist };
  // 'blocked' means NO axis actually moved: a zero-length y-step onto the
  // same spot must not count as movement (it would mask a blocked x-step
  // and leave a searching guard waiting at a cover forever).
  const ox = guard.x;
  const oy = guard.y;
  const nx = guard.x + guard.dir.x * stepLen;
  if (!blockers.some((b) => hitsBlocker(nx, guard.y, guard.r, b))) {
    guard.x = nx;
  }
  const ny = guard.y + guard.dir.y * stepLen;
  if (!blockers.some((b) => hitsBlocker(guard.x, ny, guard.r, b))) {
    guard.y = ny;
  }
  return (guard.x !== ox || guard.y !== oy) ? 'moving' : 'blocked';
}

// Ping-pong patrol between waypoints (M1 behavior, kept). A patrol route
// that hits a cover is a level-authoring error: the guard waits at the
// cover (visible in a playtest) instead of silently reversing.
function patrolMove(guard, dt, blockers = []) {
  const target = guard.waypoints[guard.wpIndex];
  if (moveToward(guard, target, guard.speed, dt, blockers) === 'arrived') {
    guard.wpIndex = guard.wpIndex === 0 ? 1 : 0;
    faceToward(guard, guard.waypoints[guard.wpIndex]);
  }
}

// perception: { seen, dist, player: { x, y }, running,
//   heard?: { x, y } — noise point, when the player ran within earshot,
//   blockers?: rects — covers/walls the guard must not walk through }
// — produced by vision.canSee + world.js, never computed here.
export function stepGuard(guard, perception, dt) {
  guard.stateTime += dt;

  // Suspicion meter (detection.js) + last-known position update.
  guard.suspicion = updateSuspicion(guard.suspicion, perception.seen, {
    dist: perception.dist,
    running: perception.running,
    x: perception.player.x,
    y: perception.player.y,
  }, dt);
  if (perception.seen) {
    guard.lastKnown = { x: perception.player.x, y: perception.player.y };
  }

  // Heard a noise (M3): turn toward the noise point. A patrolling guard
  // goes suspicious; a suspicious guard keeps looking while the noise
  // continues (stateTime refresh) — but only while suspicion is low: once
  // the meter itself holds the guard suspicious, normal transitions
  // (including chase at 1.0) must not be starved by the refresh.
  if (perception.heard) {
    guard.lastKnown = { x: perception.heard.x, y: perception.heard.y };
    if (guard.state === 'patrol' && guard.stateTime >= CONFIG.MIN_STATE_TIME) {
      changeState(guard, 'suspicious');
      faceToward(guard, guard.lastKnown);
    } else if (guard.state === 'suspicious' && guard.suspicion < CONFIG.SUSPICIOUS_EXIT) {
      guard.stateTime = 0;
    }
  }

  const blockers = perception.blockers || [];
  const minTime = guard.stateTime >= CONFIG.MIN_STATE_TIME;
  switch (guard.state) {
    case 'patrol': {
      if (guard.suspicion >= CONFIG.CHASE_AT && minTime) {
        changeState(guard, 'chase');
      } else if (guard.suspicion >= CONFIG.SUSPICIOUS_AT && minTime) {
        changeState(guard, 'suspicious');
        faceToward(guard, guard.lastKnown);
      } else {
        patrolMove(guard, dt, blockers);
      }
      break;
    }
    case 'suspicious': {
      // Stands still, turned toward where the player was glimpsed.
      faceToward(guard, guard.lastKnown);
      if (guard.suspicion >= CONFIG.CHASE_AT && minTime) {
        changeState(guard, 'chase');
      } else if (guard.suspicion < CONFIG.SUSPICIOUS_EXIT && minTime) {
        changeState(guard, 'patrol');
      }
      break;
    }
    case 'chase': {
      moveToward(guard, guard.lastKnown, CONFIG.GUARD_CHASE_SPEED, dt, blockers);
      // SINGLE exit, by suspicion threshold only (min-time gated). An
      // earlier draft also exited on arrival at last-known, but that let
      // the guard flip chase -> search -> suspicious -> chase at the
      // min-time cadence whenever sight flickered while it stood on the
      // spot (14 transitions in 6s in the flicker test). Standing on the
      // spot in chase for the ~0.4s it takes suspicion to fall 1.0 -> 0.6
      // reads as scanning the spot, and the threshold alone governs.
      if (guard.suspicion < CONFIG.CHASE_EXIT && minTime) {
        changeState(guard, 'search');
      }
      break;
    }
    case 'search': {
      if (guard.suspicion >= CONFIG.CHASE_AT && minTime) {
        changeState(guard, 'chase');
      } else if (guard.suspicion >= CONFIG.SUSPICIOUS_AT && minTime) {
        changeState(guard, 'suspicious');
        faceToward(guard, guard.lastKnown);
      } else {
        const move = moveToward(guard, guard.lastKnown, guard.speed, dt, blockers);
        // 'blocked' counts as arrived for the look-around timer: a guard
        // whose last-known point sits behind a cover would otherwise wait
        // in search forever (the timer only runs after arrival).
        if (move === 'arrived' || move === 'blocked') {
          // Looks around at the last-known spot, then gives up.
          guard.searchTimeLeft -= dt;
          const a = Math.atan2(guard.dir.y, guard.dir.x) + CONFIG.SEARCH_TURN_RATE * dt;
          guard.dir = { x: Math.cos(a), y: Math.sin(a) };
          if (guard.searchTimeLeft <= 0) changeState(guard, 'patrol');
        }
      }
      break;
    }
    default:
      break;
  }
}
