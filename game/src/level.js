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
    name: 'THE MIDNIGHT THEATRE',
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
    // 1 Foyer + 2 Auditorium + 2 Backstage + 1 top strip (M7). Patrol
    // routes never cross a cover (M2 debt: guards have no pathfinding,
    // only collision).
    // M6: MIRA's west waypoint moved 420 -> 440 (420-14 overlapped curtain
    // A, so the guard waited blocked forever); MIRA/SELMA stagger — they
    // start at their EAST waypoint facing west, so the patrols are not
    // one synchronized wave the player can outrun in a straight line.
    // M7: OTTO stagger REVERTED (parent decision — it broke the Foyer
    // teach contract + the carpet-quiet test); OTTO starts west again,
    // facing east. PETRA added on the top strip (y=60, x 500-900)
    // to close the top-wall highway (M6 §4.2): a player hugging the
    // top wall now meets a horizontal cone on the same strip. PETRA
    // starts west facing east, like CORVIN/IVO.
    guards: [
      {
        name: 'CORVIN', x: 140, y: 300,
        waypoints: [{ x: 140, y: 300 }, { x: 360, y: 300 }],
      },
      {
        name: 'MIRA', x: 620, y: 120, dir: { x: -1, y: 0 },
        waypoints: [{ x: 440, y: 120 }, { x: 620, y: 120 }],
      },
      {
        name: 'OTTO', x: 420, y: 520,
        waypoints: [{ x: 420, y: 520 }, { x: 620, y: 520 }],
      },
      {
        name: 'SELMA', x: 900, y: 200, dir: { x: -1, y: 0 },
        waypoints: [{ x: 720, y: 200 }, { x: 900, y: 200 }],
      },
      {
        name: 'IVO', x: 720, y: 380,
        waypoints: [{ x: 720, y: 380 }, { x: 900, y: 380 }],
      },
      {
        name: 'PETRA', x: 500, y: 60,
        waypoints: [{ x: 500, y: 60 }, { x: 900, y: 60 }],
      },
    ],
    // M12 security cameras (level-design: fixed sensors, each with a
    // blind window — the sine sweep dwells at its extremes, and the
    // crate + curtains block their cones like they block guards).
    // CAM 1 on the north wall by the stage (base south, sweeps the
    // Golden Mask + stage pool); CAM 2 on the east wall in Backstage
    // (base west, sweeps the vault corridor between SELMA/IVO). Neither
    // cone reaches the Probe T route (top wall y=32 / wait point
    // (200,170)) — the timed win stays winnable.
    cameras: [
      { name: 'CAM 1', x: 520, y: 60, baseAngleDeg: 90 },
      { name: 'CAM 2', x: 900, y: 300, baseAngleDeg: 180 },
    ],
    // M13 laser tripwires (level-design: timed gates, never walls —
    // the player crosses freely while OFF and pays while ON; neither
    // beam touches the Probe T route (top wall y=32 / x=200 west
    // side), so the timed win stays winnable; both are bypassable —
    // LASER 1 by crossing west of x=660, LASER 2 by crossing north
    // of y=160 or south of y=280).
    // LASER 1: across the vault corridor between SELMA (y=200) and IVO
    // (y=380) — the east crossing to the Violin. LASER 2: vertical
    // gate in the Auditorium, on the eastward path from the Foyer —
    // it guards the direct route without touching the Mask approach
    // (y=90) or any patrol route.
    lasers: [
      { name: 'LASER 1', x1: 660, y1: 290, x2: 940, y2: 290 },
      { name: 'LASER 2', x1: 460, y1: 160, x2: 460, y2: 280 },
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

// M14 — JOB 2: THE GALLERY AFTER DARK. Surveillance-heavy (4 guards,
// 3 cameras, 3 lasers), a different shape from Job 1: the flow runs
// DOWN the west edge then EAST along the bottom, and the exit sits
// bottom-right instead of top-right, so the whole map reads differently.
// Spawn (80,300) mid-west; the two alcove walls make the Script (NW)
// and Rose (NE) props optional branches off the north hall, like the
// tiara alcove in Job 1. The golden path (Probe T2) hugs the west and
// south walls, where no camera cone and no laser beam reaches — the
// timed win stays winnable. The top strip is closed the same way as
// Job 1 (PETRA patrols y=60), so the naive Probe A loses there too.
// Level-design: teach (north gallery, one vertical guard) -> pressure
// (middle hall, crossing guard + 2 lasers) -> rest (west passage, no
// patrol) -> climax (exit approach, camera 2 + laser 3 + guard 3).
// The 'stage' pool id is the wood floor rect drawFloor() needs.
export function buildLevel2() {
  return {
    name: 'THE GALLERY AFTER DARK',
    spawn: { x: 80, y: 300 },
    exit: { x: 860, y: 480, w: 60, h: 60 }, // stage door, bottom-right
    walls: [
      { x: 0, y: 0, w: W, h: T }, // top
      { x: 0, y: H - T, w: W, h: T }, // bottom
      { x: 0, y: 0, w: T, h: H }, // left
      { x: W - T, y: 0, w: T, h: H }, // right
      { x: 20, y: 180, w: 140, h: 20 }, // pocket wall: Script alcove, entered from the east
      { x: 800, y: 180, w: 140, h: 20 }, // pocket wall: Rose alcove, entered from the west
    ],
    covers: [
      { kind: 'curtain', x: 340, y: 80, w: 40, h: 140 }, // curtain A, north hall
      { kind: 'curtain', x: 760, y: 200, w: 40, h: 160 }, // curtain B, east wing
      { kind: 'crate', x: 460, y: 420, w: 60, h: 60 }, // prop crate, south hall
    ],
    props: [
      { id: 'script', name: 'The Gilded Script', x: 90, y: 90, taken: false },
      { id: 'baton', name: 'The Silver Baton', x: 520, y: 90, taken: false },
      { id: 'rose', name: 'The Velvet Rose', x: 880, y: 90, taken: false },
    ],
    // Patrol routes never cross a cover (M2 debt: guards have no
    // pathfinding). G1 vertical x=300 (north hall teach); G2 horizontal
    // y=300 (middle hall, east end 740 stops clear of curtain B at
    // x=760); G3 vertical x=700 (east wing, the exit-approach guard);
    // G4 horizontal y=60 (top strip — closes the top-wall highway).
    // G2/G4 start at their EAST waypoint facing west (the M6 stagger),
    // G1/G3 start north facing south.
    guards: [
      {
        name: 'ALBA', x: 300, y: 120, dir: { x: 0, y: 1 },
        waypoints: [{ x: 300, y: 120 }, { x: 300, y: 480 }],
      },
      {
        name: 'DORIN', x: 740, y: 300, dir: { x: -1, y: 0 },
        waypoints: [{ x: 420, y: 300 }, { x: 740, y: 300 }],
      },
      {
        name: 'ELIF', x: 700, y: 100, dir: { x: 0, y: 1 },
        waypoints: [{ x: 700, y: 100 }, { x: 700, y: 460 }],
      },
      {
        name: 'NERO', x: 880, y: 60, dir: { x: -1, y: 0 },
        waypoints: [{ x: 500, y: 60 }, { x: 880, y: 60 }],
      },
    ],
    // CAM 1 on the north wall (base south, sweeps the Baton + gallery);
    // CAM 2 on the east wall (base west, sweeps the exit approach —
    // its sweep dwells away from the approach, the Probe T2 timing
    // window); CAM 3 on the east wall (base west, sweeps the Rose
    // alcove). None reaches the west/south golden path.
    cameras: [
      { name: 'CAM 1', x: 480, y: 60, baseAngleDeg: 90 },
      { name: 'CAM 2', x: 900, y: 360, baseAngleDeg: 180 },
      { name: 'CAM 3', x: 900, y: 120, baseAngleDeg: 180 },
    ],
    // L1 horizontal across the middle hall (y=300, x380..700); L2
    // vertical on the Baton approach (x=600, y80..220); L3 horizontal
    // on the south-east shortcut (y=460, x700..940). None touches the
    // golden path (it crosses y=300 at x=80, west of L1, and stays at
    // y=540, south of L3).
    lasers: [
      { name: 'LASER 1', x1: 380, y1: 300, x2: 700, y2: 300 },
      { name: 'LASER 2', x1: 600, y1: 80, x2: 600, y2: 220 },
      { name: 'LASER 3', x1: 700, y1: 460, x2: 940, y2: 460 },
    ],
    lightPools: [
      { id: 'stage', x: 400, y: 40, w: 200, h: 100 }, // gallery pool, wood + Baton
      { id: 'hall', x: 600, y: 240, w: 180, h: 120 }, // middle hall pool
      { id: 'exit', x: 780, y: 480, w: 160, h: 100 }, // exit pool, around the door
    ],
    carpetZones: [
      { x: 400, y: 320, w: 260, h: 240 }, // south hall seats
      { x: 120, y: 420, w: 200, h: 120 }, // west passage runner
    ],
    beats: [
      { room: 'gallery', type: 'teach', intensity: 0.1 },
      { room: 'hall', type: 'pressure', intensity: 0.6 },
      { room: 'west-passage', type: 'rest', intensity: 0.1 },
      { room: 'exit-approach', type: 'climax', intensity: 1.0 },
    ],
    // Only two room labels: a third east label straddles the select /
    // win panels at every candidate position (checked against the panel
    // rects), and the east side is already marked by the exit halo.
    roomLabels: [
      { text: 'GALLERY', x: 660, y: 130 },
      { text: 'WEST WING', x: 180, y: 420 },
    ],
  };
}

// M16 — JOB 3: THE VAULT AT MIDNIGHT. Camera+laser focus (5 guards,
// 3 cameras, 3 lasers), a mirror-diagonal flow Job 1/2 never used:
// spawn bottom-right, exit top-left. The golden path (Probe T3) goes
// up the east edge for the Key, west across the north hall past CAM 1,
// around the west end of the double-laser corridor for the Ledger,
// south and west along the bottom for the Crown, then north up the
// west wall to the exit — every leg times a patrol or a camera sweep.
// VERA x=700 (not 820 — the Key alcove wall W2 blocks x=820);
// ODETTE x=560 (not 500 — the crate at x460..520 blocks x=500);
// the crate sits at y400..460 so NOOR's y=480 route clears it by
// 20px. The 'stage' pool id is the wood floor rect drawFloor() needs.
export function buildLevel3() {
  return {
    name: 'THE VAULT AT MIDNIGHT',
    spawn: { x: 880, y: 520 },
    exit: { x: 80, y: 40, w: 60, h: 60 }, // stage door, top-left
    walls: [
      { x: 0, y: 0, w: W, h: T }, // top
      { x: 0, y: H - T, w: W, h: T }, // bottom
      { x: 0, y: 0, w: T, h: H }, // left
      { x: W - T, y: 0, w: T, h: H }, // right
      { x: 20, y: 180, w: 140, h: 20 }, // pocket wall: Crown alcove, entered from the east
      { x: 800, y: 180, w: 140, h: 20 }, // pocket wall: Key alcove, entered from the west
    ],
    covers: [
      { kind: 'curtain', x: 340, y: 80, w: 40, h: 140 }, // curtain A, north hall
      { kind: 'curtain', x: 760, y: 200, w: 40, h: 160 }, // curtain B, east wing
      { kind: 'crate', x: 460, y: 400, w: 60, h: 60 }, // prop crate, south hall
    ],
    props: [
      { id: 'key', name: 'Obsidian Key', x: 880, y: 90, taken: false },
      { id: 'ledger', name: 'Jade Ledger', x: 520, y: 300, taken: false },
      { id: 'crown', name: 'Midnight Crown', x: 90, y: 90, taken: false },
    ],
    // Patrol routes never cross a cover. VERA vertical x=700 (north
    // hall teach); LUKA horizontal y=300 (the Ledger sits ON his
    // route — grab it in the gap); ODETTE vertical x=560 (middle
    // hall); BASIL horizontal y=60 (top strip — closes the top-wall
    // highway); NOOR horizontal y=480 (bottom strip — closes the
    // bottom-wall highway). LUKA/BASIL start at their EAST waypoint
    // facing west (the M6 stagger), VERA/ODETTE start north facing
    // south, NOOR starts west facing east.
    guards: [
      {
        name: 'VERA', x: 700, y: 120, dir: { x: 0, y: 1 },
        waypoints: [{ x: 700, y: 120 }, { x: 700, y: 480 }],
      },
      {
        name: 'LUKA', x: 740, y: 300, dir: { x: -1, y: 0 },
        waypoints: [{ x: 420, y: 300 }, { x: 740, y: 300 }],
      },
      {
        name: 'ODETTE', x: 560, y: 100, dir: { x: 0, y: 1 },
        waypoints: [{ x: 560, y: 100 }, { x: 560, y: 460 }],
      },
      {
        name: 'BASIL', x: 880, y: 60, dir: { x: -1, y: 0 },
        waypoints: [{ x: 300, y: 60 }, { x: 880, y: 60 }],
      },
      {
        name: 'NOOR', x: 200, y: 480, dir: { x: 1, y: 0 },
        waypoints: [{ x: 200, y: 480 }, { x: 600, y: 480 }],
      },
    ],
    // CAM 1 on the north wall (base south, sweeps the north hall —
    // the Key-to-Ledger crossing times its sweep); CAM 2 on the east
    // wall (base west, sweeps the Key approach — a player due east of
    // it is never in its cone); CAM 3 on the north wall (base south,
    // sweeps the exit approach — its sweep extreme is 0.817 vs the
    // cone's cos35 0.819, so the exit timing window is real).
    cameras: [
      { name: 'CAM 1', x: 480, y: 60, baseAngleDeg: 90 },
      { name: 'CAM 2', x: 900, y: 300, baseAngleDeg: 180 },
      { name: 'CAM 3', x: 300, y: 60, baseAngleDeg: 90 },
    ],
    // L1+L2: the double-laser corridor (y=200 and y=280, x380..700) —
    // the direct Key-to-Ledger route crosses both; the golden path
    // goes around the west end (x<380), like Job 1's LASER 1 bypass.
    // L3: vertical gate on the west passage (x=240, y160..420) — the
    // north leg runs at x~172, 68px clear; the Crown-to-exit leg
    // crosses it only south of y=420.
    lasers: [
      { name: 'LASER 1', x1: 380, y1: 200, x2: 700, y2: 200 },
      { name: 'LASER 2', x1: 380, y1: 280, x2: 700, y2: 280 },
      { name: 'LASER 3', x1: 240, y1: 160, x2: 240, y2: 420 },
    ],
    lightPools: [
      { id: 'stage', x: 400, y: 40, w: 200, h: 100 }, // north hall pool, wood + Key approach
      { id: 'hall', x: 600, y: 240, w: 180, h: 120 }, // middle hall pool
      { id: 'exit', x: 40, y: 20, w: 160, h: 100 }, // exit pool, around the door
    ],
    carpetZones: [
      { x: 400, y: 320, w: 260, h: 240 }, // south hall seats
      { x: 120, y: 420, w: 200, h: 120 }, // west passage runner
    ],
    beats: [
      { room: 'vault-antechamber', type: 'teach', intensity: 0.1 },
      { room: 'double-laser-corridor', type: 'pressure', intensity: 0.6 },
      { room: 'west-passage', type: 'rest', intensity: 0.1 },
      { room: 'exit-approach', type: 'climax', intensity: 1.0 },
    ],
    // Only two room labels (same reason as Job 2: a third label
    // straddles a panel at every candidate position).
    roomLabels: [
      { text: 'VAULT', x: 700, y: 500 },
      { text: 'NORTH HALL', x: 620, y: 130 },
    ],
  };
}

// Static level data, shared by the queries below (single source of truth).
const LEVEL = buildLevel();
const LEVEL2 = buildLevel2();
const LEVEL3 = buildLevel3();

// M14: the campaign levels, in job order — Job 1 is LEVELS[0], Job 2
// is LEVELS[1]. world.js builds a world from LEVELS[jobIndex].
export const LEVELS = [LEVEL, LEVEL2, LEVEL3];

function inRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// Binary light: 1.0 inside a pool, LIGHT_DARK in the dark wings.
// M14: the level is a parameter (default Job 1) — the same call reads
// Job 2's pools when the campaign is on Job 2.
export function lightAt(x, y, level = LEVEL) {
  for (const pool of level.lightPools) {
    if (inRect(x, y, pool)) return CONFIG.LIGHT_POOL;
  }
  return CONFIG.LIGHT_DARK;
}

// Floor material at a point: 'carpet' inside a carpet zone, 'wood' else.
export function floorAt(x, y, level = LEVEL) {
  for (const zone of level.carpetZones) {
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
