// CURTAIN CALL — M3 level: static data for the single 3-wing level.
// level-design: room graph (wings, exits, what each grants) + beat list
// + reachability check live next to the level they describe. Pure data
// + pure queries, no DOM, no canvas. world.js turns this into live state.
import CONFIG from './config.js';

const W = CONFIG.VIEW_WIDTH;
const H = CONFIG.VIEW_HEIGHT;
const T = CONFIG.WALL;

// Foyer (teach) | Auditorium (pressure) | Backstage/Vault (climax).
// One level, 960x600, flow left -> right, spawn bottom-left, exit top-right.
export function buildLevel() {
  return {
    spawn: { x: 80, y: 520 },
    exit: { x: 860, y: 40, w: 60, h: 60 }, // stage door, top-right (M1 position, kept)
    // Outer walls (border) + one pocket wall that makes the tiara alcove.
    walls: [
      { x: 0, y: 0, w: W, h: T }, // top
      { x: 0, y: H - T, w: W, h: T }, // bottom
      { x: 0, y: 0, w: T, h: H }, // left
      { x: W - T, y: 0, w: T, h: H }, // right
      { x: 20, y: 160, w: 140, h: 20 }, // pocket wall: tiara alcove, entered from the east
    ],
    // Covers block movement AND sight (curtains + one prop crate).
    covers: [
      { kind: 'curtain', x: 380, y: 60, w: 40, h: 160 }, // curtain A (M1, kept)
      { kind: 'curtain', x: 560, y: 320, w: 40, h: 160 }, // curtain B (M1, kept)
      { kind: 'crate', x: 780, y: 300, w: 60, h: 60 }, // prop crate, backstage cover
    ],
    // Props on OPTIONAL branches that rejoin the main path (no soft-lock).
    props: [
      { id: 'tiara', name: 'Star Tiara', x: 70, y: 90, taken: false },
      { id: 'mask', name: 'Golden Mask', x: 520, y: 90, taken: false },
      { id: 'violin', name: "Lead's Violin", x: 880, y: 500, taken: false },
    ],
    // 1 Foyer + 2 Auditorium + 2 Backstage. Patrol routes never cross a
    // cover (M2 debt: guards have no pathfinding, only collision).
    guards: [
      {
        name: 'USHER 1', x: 140, y: 300,
        waypoints: [{ x: 140, y: 300 }, { x: 360, y: 300 }],
      },
      {
        name: 'USHER 2', x: 420, y: 120,
        waypoints: [{ x: 420, y: 120 }, { x: 620, y: 120 }],
      },
      {
        name: 'USHER 3', x: 420, y: 520,
        waypoints: [{ x: 420, y: 520 }, { x: 620, y: 520 }],
      },
      {
        name: 'USHER 4', x: 720, y: 200,
        waypoints: [{ x: 720, y: 200 }, { x: 900, y: 200 }],
      },
      {
        name: 'USHER 5', x: 720, y: 380,
        waypoints: [{ x: 720, y: 380 }, { x: 900, y: 380 }],
      },
    ],
    // Binary lighting (tesis differentiator 4): warm pools = danger
    // (suspicion x1.0), dark wings = safe (suspicion x0.35).
    lightPools: [
      { id: 'foyer', x: 330, y: 260, w: 160, h: 80 }, // foyer pool, on guard 1's route (teach)
      { id: 'stage', x: 440, y: 40, w: 180, h: 110 }, // stage pool, wood + Golden Mask
      { id: 'vault', x: 780, y: 20, w: 160, h: 100 }, // vault pool, around the exit (climax)
    ],
    // Floor that talks (tesis differentiator 3): carpet = silent,
    // wood = noisy. Everything not carpet is stage wood.
    carpetZones: [
      { x: 400, y: 320, w: 260, h: 240 }, // auditorium seats
      { x: 700, y: 420, w: 200, h: 120 }, // backstage runner
    ],
    // Pacing beats (level-design Pattern 2): teach -> pressure -> rest
    // (dark passage, no patrol) -> climax. Intensity 0..1.
    beats: [
      { room: 'foyer', type: 'teach', intensity: 0.1 },
      { room: 'auditorium', type: 'pressure', intensity: 0.5 },
      { room: 'dark-passage', type: 'rest', intensity: 0.1 },
      { room: 'backstage', type: 'climax', intensity: 1.0 },
    ],
  };
}

// Static level data, shared by the queries below (single source of truth).
const LEVEL = buildLevel();

function inRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// Binary light: 1.0 inside a pool, LIGHT_DARK in the dark wings.
export function lightAt(x, y) {
  for (const pool of LEVEL.lightPools) {
    if (inRect(x, y, pool)) return CONFIG.LIGHT_POOL;
  }
  return CONFIG.LIGHT_DARK;
}

// Floor material at a point: 'carpet' inside a carpet zone, 'wood' else.
export function floorAt(x, y) {
  for (const zone of LEVEL.carpetZones) {
    if (inRect(x, y, zone)) return 'carpet';
  }
  return 'wood';
}

// Pacing check (level-design Pattern 2, ported): empty = the beat list
// passes — opens with teach, rest right before the climax, at most 2
// high-intensity beats in a row.
export function pacingProblems(beats, high = 0.7, maxHighRun = 2) {
  const problems = [];
  let run = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    run = beat.intensity >= high ? run + 1 : 0;
    if (run > maxHighRun) {
      problems.push(`${beat.room}: ${run} high-intensity beats in a row`);
    }
    if (beat.type === 'climax' && (i === 0 || beats[i - 1].type !== 'rest')) {
      problems.push(`${beat.room}: no rest beat right before the climax`);
    }
  }
  if (beats.length > 0 && beats[0].type !== 'teach') {
    problems.push(`${beats[0].room}: the level does not open with a teach beat`);
  }
  return problems;
}

// Reachability (level-design Pattern 3, goal_reachable, grid BFS):
// can a player-sized circle travel from `from` to `to` through the
// level geometry (walls + covers), ignoring guards? Blockers are
// inflated by the player radius; cells are tested by center.
export function goalReachable(level, from, to) {
  const CELL = 10;
  const cols = Math.ceil(W / CELL);
  const rows = Math.ceil(H / CELL);
  const blockers = level.walls.concat(level.covers);
  const inflate = CONFIG.PLAYER_R;
  const blocked = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    for (const b of blockers) {
      if (
        cx >= b.x - inflate && cx < b.x + b.w + inflate &&
        cy >= b.y - inflate && cy < b.y + b.h + inflate
      ) return true;
    }
    return false;
  };
  const key = (cx, cy) => `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)}`;
  if (blocked(from.x, from.y) || blocked(to.x, to.y)) return false;
  const seen = new Set([key(from.x, from.y)]);
  const queue = [{ x: from.x, y: from.y }];
  const target = key(to.x, to.y);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (key(cur.x, cur.y) === target) return true;
    for (const [dx, dy] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (!seen.has(k) && !blocked(nx, ny)) {
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}
