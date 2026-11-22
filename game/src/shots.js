// Screenshot mode (?shot=select|play|play2|end|end2|chase|chase2|
// foyer|auditorium|backstage) — pattern from the starter's shots.json.
// Deterministic staged states, rendered as one frozen frame so
// headless screenshots are reproducible. Returns the screen to draw
// (+ the campaign for the select/win screens).
// M14: the four dossier shots are the NEW ones — 'select' (Job 1
// cleared, Job 2 open + selected), 'play2' (Job 2 mid-game), 'end2'
// (Job 2 GHOST win + CAMPAIGN COMPLETE), 'chase2' (Job 2 alarm).
// The old Job 1 shots ('play', 'end', 'chase', foyer/auditorium/
// backstage) are unchanged — the old tests stage from them.
// 'start' is a kept alias for 'select' (the parent's screenshot
// driver still lists the old name).
import { createWorld } from './world.js';

// A fresh campaign: nothing cleared, no bests yet.
function freshCampaign() {
  return { selected: 0, cleared: [false, false, false], best: [null, null, null] };
}

// The M13 end-shot fixture: Job 1 just won (best 1245), Job 2 open.
function win1Campaign() {
  return {
    selected: 0,
    cleared: [true, false, false],
    best: [{ score: 1245, time: 87.4, stars: 2 }, null, null],
  };
}

// The M16 select fixture: Jobs 1+2 cleared (best 1245 · 01:27 ★★☆ and
// 1529 · 01:35 ★★★), Job 3 open and selected. The backdrop is Job 3's
// level (the selected job).
function selectCampaign() {
  return {
    selected: 2,
    cleared: [true, true, false],
    best: [{ score: 1245, time: 87.4, stars: 2 }, { score: 1529, time: 95.2, stars: 3 }, null],
  };
}

// The M14 Job 2 win fixture: Job 1 best 1245 + Job 2 GHOST win
// (3 props 900 + GHOST 500 + time 129 = 1529) -> campaign total 2774.
function win2Campaign() {
  return {
    selected: 1,
    cleared: [true, true, false],
    best: [{ score: 1245, time: 87.4, stars: 2 }, { score: 1529, time: 95.2, stars: 3 }, null],
  };
}

// The M16 Job 3 win fixture: Job 3 GHOST win (3 props 900 + GHOST 500
// + time 160 (80s) = 1560) -> campaign total 4334 (1245 + 1529 +
// 1560). The time is the staged full-clear run; PAR_S[2] is set from
// the T3 probe (placeholder 90s) and must stay above it.
function win3Campaign() {
  return {
    selected: 2,
    cleared: [true, true, true],
    best: [
      { score: 1245, time: 87.4, stars: 2 },
      { score: 1529, time: 95.2, stars: 3 },
      { score: 1560, time: 80, stars: 3 },
    ],
  };
}

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
  if (name === 'select' || name === 'start') {
    // M16 shot 1: the job board — Jobs 1+2 CLEARED (best 1245 · 01:27
    // ★★☆ and 1529 · 01:35 ★★★), Job 3 open and selected (gold
    // border), the HOW TO PLAY panel below. The backdrop is Job 3's
    // level (the selected job).
    const world = createWorld(2);
    return { world, screen: 'select', campaign: selectCampaign() };
  }
  if (name === 'play3') {
    // M16 shot 2: Job 3 mid-game, STAGED CALM (the M15 pattern):
    // the player is hidden inside curtain A, ONE guard searches the
    // south hall (last-known = a noise at (600,400)), CAM 2 sweeps
    // the middle hall (suspicion 0, not spotted), all 3 lasers are
    // DOWN (dashed, not live), no coin ring, no smoke cloud, no
    // footstep rings. COINS ×3, SMOKE ×2 (full). Exposure 0.2 — CALM.
    const world = createWorld(2);
    const cam2 = world.cameras[1];
    cam2.angle = Math.atan2(300 - cam2.y, 500 - cam2.x);
    cam2.dir = { x: Math.cos(cam2.angle), y: Math.sin(cam2.angle) };
    cam2.suspicion = 0;
    cam2.state = 'sweep';
    world.coins = 3;
    world.smokes = 2;
    world.smokeClouds = [];
    world.lasers[0].on = false;
    world.lasers[0].phaseT = 0.5;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 0.3;
    world.lasers[2].on = false;
    world.lasers[2].phaseT = 1.0;
    world.time = 40; // SCORE 700 live (Ghost 500 + Time 200, no props yet)
    stageGuard(world, 1, {
      x: 650, y: 300, dir: { x: -0.45, y: 0.89 },
      state: 'search', stateTime: 0.5, suspicion: 0.2,
      lastKnown: { x: 600, y: 400 },
    });
    world.guards[1].searchTimeLeft = 2.0;
    world.player.x = 360;
    world.player.y = 140;
    world.player.dir = { x: 1, y: 0 };
    world.exposure = 0.2;
    return { world, screen: 'play', campaign: freshCampaign() };
  }
  if (name === 'chase3') {
    // M16 shot 4: the Job 3 alarm — CAM 2's suspicion is full, so the
    // building alarm is active (red ALARM! pill) and ODETTE CHASES the
    // player's last-known position — cone red, teal camera cone on the
    // player. LASER 1 + LASER 3 live, LASER 2 down (dashed).
    const world = createWorld(2);
    const cam2 = world.cameras[1];
    cam2.angle = Math.atan2(500 - cam2.y, 700 - cam2.x);
    cam2.dir = { x: Math.cos(cam2.angle), y: Math.sin(cam2.angle) };
    cam2.suspicion = 1.0;
    cam2.state = 'spotted';
    world.alarm = { active: true, unseen: 0 };
    world.lasers[0].on = true;
    world.lasers[0].phaseT = 0.8;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 0.3;
    world.lasers[2].on = true;
    world.lasers[2].phaseT = 0.6;
    stageGuard(world, 2, {
      x: 700, y: 400, dir: { x: 0, y: 1 },
      state: 'chase', stateTime: 0.5, suspicion: 1.0,
      lastKnown: { x: 700, y: 500 },
    });
    world.player.x = 700;
    world.player.y = 500;
    world.player.dir = { x: 1, y: 0 };
    world.feel.alerts.push({ guard: world.guards[2], age: 0 });
    world.exposure = 1.0;
    // A chase only happens after a detection, so the frozen alarm
    // frame carries one — the rail reads "SPOTTED ×1" and the live
    // score loses the GHOST bonus (200).
    world.detections = 1;
    return { world, screen: 'play', campaign: freshCampaign() };
  }
  if (name === 'end3') {
    // M16 shot 3: the Job 3 GHOST win — all 3 props (900) + GHOST
    // (500) + time bonus 160 (80s) = 1560; campaign total 4334
    // (1245 + 1529 + 1560) with CAMPAIGN COMPLETE on the win screen.
    const world = createWorld(2);
    world.status = 'won';
    world.time = 80;
    world.props[0].taken = true;
    world.props[1].taken = true;
    world.props[2].taken = true;
    return { world, screen: 'win', campaign: win3Campaign() };
  }
  if (name === 'play2') {
    // M15 shot 2: Job 2 mid-game, STAGED CALM (the M14 shot was too
    // busy: coin ring + spotted camera + smoke + 2 live lasers at
    // once). Now the player is hidden in the dark west of curtain A,
    // ONE guard searches the south hall (last-known = a noise at
    // (600,400)), CAM 2 sweeps the middle hall (suspicion 0, not
    // spotted), all 3 lasers are DOWN (dashed, not live), no coin
    // ring, no smoke cloud, no footstep rings. COINS ×3, SMOKE ×2
    // (full). Exposure 0.2 — CALM. The minimap still shows every dot.
    const world = createWorld(1);
    const cam2 = world.cameras[1];
    cam2.angle = Math.atan2(300 - cam2.y, 500 - cam2.x);
    cam2.dir = { x: Math.cos(cam2.angle), y: Math.sin(cam2.angle) };
    cam2.suspicion = 0;
    cam2.state = 'sweep';
    world.coins = 3;
    world.smokes = 2;
    world.smokeClouds = [];
    world.lasers[0].on = false;
    world.lasers[0].phaseT = 0.5;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 0.3;
    world.lasers[2].on = false;
    world.lasers[2].phaseT = 1.0;
    world.time = 40; // SCORE 700 live (Ghost 500 + Time 200, no props yet)
    stageGuard(world, 1, {
      x: 650, y: 300, dir: { x: -0.45, y: 0.89 },
      state: 'search', stateTime: 0.5, suspicion: 0.2,
      lastKnown: { x: 600, y: 400 },
    });
    world.guards[1].searchTimeLeft = 2.0;
    world.player.x = 360;
    world.player.y = 140;
    world.player.dir = { x: 1, y: 0 };
    world.exposure = 0.2;
    return { world, screen: 'play', campaign: freshCampaign() };
  }
  if (name === 'chase2') {
    // M14 shot 4: the Job 2 alarm — CAM 2's suspicion is full, so the
    // building alarm is active (red ALARM! pill) and USHER 3 CHASES
    // the player's last-known position — cone red, teal camera cone on
    // the player. LASER 1 + LASER 3 live, LASER 2 down (dashed).
    const world = createWorld(1);
    const cam2 = world.cameras[1];
    cam2.angle = Math.atan2(500 - cam2.y, 700 - cam2.x);
    cam2.dir = { x: Math.cos(cam2.angle), y: Math.sin(cam2.angle) };
    cam2.suspicion = 1.0;
    cam2.state = 'spotted';
    world.alarm = { active: true, unseen: 0 };
    world.lasers[0].on = true;
    world.lasers[0].phaseT = 0.8;
    world.lasers[1].on = false;
    world.lasers[1].phaseT = 0.3;
    world.lasers[2].on = true;
    world.lasers[2].phaseT = 0.6;
    stageGuard(world, 2, {
      x: 700, y: 400, dir: { x: 0, y: 1 },
      state: 'chase', stateTime: 0.5, suspicion: 1.0,
      lastKnown: { x: 700, y: 500 },
    });
    world.player.x = 700;
    world.player.y = 500;
    world.player.dir = { x: 1, y: 0 };
    world.feel.alerts.push({ guard: world.guards[2], age: 0 });
    world.exposure = 1.0;
    // M15: a chase only happens after a detection (world.js counts
    // detections on chase entry), so the frozen alarm frame must carry
    // one — the M14 frame showed "EXIT: OPEN · GHOST" while USHER 3
    // chased, which contradicted the rail. The goal line now reads
    // "SPOTTED ×1" and the live score loses the GHOST bonus (200).
    world.detections = 1;
    return { world, screen: 'play', campaign: freshCampaign() };
  }
  if (name === 'end2') {
    // M14 shot 3: the Job 2 GHOST win — all 3 props (900) + GHOST
    // (500) + time bonus 129 (95.2s) = 1529; campaign total 2774
    // (1245 + 1529) with CAMPAIGN COMPLETE on the win screen.
    const world = createWorld(1);
    world.status = 'won';
    world.time = 95.2;
    world.props[0].taken = true;
    world.props[1].taken = true;
    world.props[2].taken = true;
    return { world, screen: 'win', campaign: win2Campaign() };
  }
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
    return { world, screen: 'play', campaign: freshCampaign() };
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
    return { world, screen: 'play', campaign: freshCampaign() };
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
    return { world, screen: 'play', campaign: freshCampaign() };
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
    return { world, screen: 'play', campaign: freshCampaign() };
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
    return { world, screen: 'play', campaign: freshCampaign() };
  }
  if (name === 'end') {
    world.status = 'won';
    world.time = 87.4;
    world.props[0].taken = true;
    world.props[1].taken = true;
    return { world, screen: 'win', campaign: win1Campaign() };
  }
  // Default: the select screen (the opener).
  return { world, screen: 'select', campaign: selectCampaign() };
}
