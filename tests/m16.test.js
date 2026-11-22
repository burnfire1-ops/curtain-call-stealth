// M16 tests — Job 3 (THE VAULT AT MIDNIGHT), named guards, stars + par.
// Target: climb from the R5 dev rate 98.8125% toward the top-40 safe
// zone (~99.08%). G0 golf first (26,266 bytes freed, text 163,828 ->
// 146,126); these tests are the TDD red for Fases 1-3. No score formula
// change, no win/lose rule change, no tuning change — display + content
// only (a 3rd job, guard names, a stars display).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CONFIG from '../game/src/config.js';
import { LEVELS, buildLevel3, goalReachable, pacingProblems, lightAt, floorAt } from '../game/src/level.js';
import { createWorld, step } from '../game/src/world.js';
import { segmentBlocked } from '../game/src/vision.js';
import { transition } from '../game/src/screens.js';
import { applyShot } from '../game/src/shots.js';
import { render } from '../game/src/render.js';
import {
  selectLayout, selectCardLines, selectHowtoLines, jobStatus, canSelectJob,
  campaignTotal, updateBest, jobAtPoint, panelTextFits, PANEL_TEXT_MARGIN,
  winScreenLines, loseScreenLines, propsSummary, guardStatesShort,
  railRosterLines, starsForJob, starsText,
} from '../game/src/hud.js';

// Canvas monospace advance is 0.6em per char (13px -> 7.8px/char,
// 16px -> 9.6px/char) — the same measure the panel-text tests use.
const measure = (text, size) => String(text).length * size * 0.6;

const freshCampaign = () => ({ selected: 0, cleared: [false, false, false], best: [null, null, null] });

// --- Job 3 level data ---

test('m16: LEVELS has 3 jobs — Job 3 is camera+laser heavy, mirror-diagonal flow', () => {
  assert.equal(LEVELS.length, 3);
  assert.equal(LEVELS[0].name, 'THE MIDNIGHT THEATRE');
  assert.equal(LEVELS[1].name, 'THE GALLERY AFTER DARK');
  assert.equal(LEVELS[2].name, 'THE VAULT AT MIDNIGHT');
  assert.equal(LEVELS[2].guards.length, 5, 'Job 3 has 5 guards');
  assert.equal(LEVELS[2].cameras.length, 3, 'Job 3 has 3 cameras');
  assert.equal(LEVELS[2].lasers.length, 3, 'Job 3 has 3 lasers');
  assert.equal(LEVELS[2].props.length, 3);
  assert.deepEqual(LEVELS[2].props.map((p) => p.id), ['key', 'ledger', 'crown']);
  assert.deepEqual(LEVELS[2].props.map((p) => p.name),
    ['Obsidian Key', 'Jade Ledger', 'Midnight Crown']);
  assert.deepEqual(LEVELS[2].spawn, { x: 880, y: 520 }, 'spawn bottom-right');
  assert.deepEqual(
    { x: LEVELS[2].exit.x, y: LEVELS[2].exit.y },
    { x: 80, y: 40 }, 'exit top-left — the mirror diagonal of Job 1');
});

test('m16: Job 3 spawn/exit/props/covers sit inside the canvas, props clear of walls and covers', () => {
  const j3 = buildLevel3();
  const inside = (x, y) => x >= CONFIG.WALL && x <= CONFIG.VIEW_WIDTH - CONFIG.WALL
    && y >= CONFIG.WALL && y <= CONFIG.VIEW_HEIGHT - CONFIG.WALL;
  assert.ok(inside(j3.spawn.x, j3.spawn.y), 'spawn inside');
  assert.ok(inside(j3.exit.x, j3.exit.y)
    && inside(j3.exit.x + j3.exit.w, j3.exit.y + j3.exit.h), 'exit inside');
  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  for (const p of j3.props) {
    assert.ok(inside(p.x, p.y), `${p.id} inside`);
    assert.ok(!j3.walls.concat(j3.covers).some((r) => inRect(p.x, p.y, r)),
      `${p.id} not inside a wall or cover`);
  }
  assert.ok(!j3.walls.concat(j3.covers).some((r) => inRect(j3.spawn.x, j3.spawn.y, r)),
    'spawn not inside a wall or cover');
});

test('m16: Job 3 is reachable — spawn to exit, spawn to each prop, each prop to exit', () => {
  const j3 = buildLevel3();
  assert.equal(goalReachable(j3, j3.spawn, j3.exit), true, 'spawn -> exit');
  for (const p of j3.props) {
    assert.equal(goalReachable(j3, j3.spawn, p), true, `spawn -> ${p.id}`);
    assert.equal(goalReachable(j3, p, j3.exit), true, `${p.id} -> exit`);
  }
});

test('m16: Job 3 patrol routes never cross a cover or a wall', () => {
  const j3 = buildLevel3();
  const blockers = j3.walls.concat(j3.covers);
  for (const g of j3.guards) {
    const [a, b] = g.waypoints;
    assert.equal(segmentBlocked(a.x, a.y, b.x, b.y, blockers), false,
      `${g.name} route ${a.x},${a.y} -> ${b.x},${b.y} must be clear`);
  }
});

test('m16: Job 3 pacing beats pass (teach first, rest before climax)', () => {
  assert.deepEqual(pacingProblems(buildLevel3().beats), []);
});

test('m16: Job 3 room labels are hand-placed, at most 2, inside the canvas', () => {
  const labels = buildLevel3().roomLabels;
  assert.ok(labels.length <= 2, 'at most 2 room labels (render drops them anyway since M15)');
  for (const l of labels) {
    assert.ok(l.x > 0 && l.x < CONFIG.VIEW_WIDTH && l.y > 0 && l.y < CONFIG.VIEW_HEIGHT,
      `${l.text} inside the canvas`);
  }
});

test('m16: Job 3 has a stage light pool (wood floor) and carpet zones', () => {
  const j3 = buildLevel3();
  assert.ok(j3.lightPools.some((p) => p.id === 'stage'),
    'a stage pool is required — drawFloor renders wood under it');
  assert.ok(j3.carpetZones.length >= 1, 'carpet zones exist');
  assert.equal(lightAt(500, 90, j3), CONFIG.LIGHT_POOL, 'stage pool is lit');
  assert.equal(floorAt(500, 400, j3), 'carpet', 'south carpet zone is silent');
});

// --- world per job ---

test('m16: createWorld(2) builds Job 3 — counts, jobIndex, jobName, gadgets reset', () => {
  const w3 = createWorld(2);
  assert.equal(w3.jobIndex, 2);
  assert.equal(w3.jobName, 'THE VAULT AT MIDNIGHT');
  assert.equal(w3.guards.length, 5);
  assert.equal(w3.cameras.length, 3);
  assert.equal(w3.lasers.length, 3);
  assert.equal(w3.props.length, 3);
  assert.equal(w3.coins, 3, 'a fresh job starts with 3 coins');
  assert.equal(w3.smokes, 2, 'a fresh job starts with 2 smokes');
  assert.deepEqual(w3.guards.map((g) => g.name),
    ['VERA', 'LUKA', 'ODETTE', 'BASIL', 'NOOR']);
});

// --- named guards (Fase 2) ---

test('m16: every guard has a short unique name, no USHER prefix anywhere', () => {
  const names = LEVELS.flatMap((l) => l.guards.map((g) => g.name));
  assert.equal(names.length, 15, '6 + 4 + 5 guards');
  assert.equal(new Set(names).size, 15, 'all names unique across jobs');
  for (const n of names) {
    assert.ok(!n.includes('USHER'), `${n} must not carry the USHER prefix`);
    assert.ok(n.length <= 6, `${n} is short enough for the roster/labels`);
  }
  assert.deepEqual(LEVELS[0].guards.map((g) => g.name),
    ['CORVIN', 'MIRA', 'OTTO', 'SELMA', 'IVO', 'PETRA']);
  assert.deepEqual(LEVELS[1].guards.map((g) => g.name),
    ['ALBA', 'DORIN', 'ELIF', 'NERO']);
});

test('m16: guardStatesShort prints names as-is (no U prefix), distances unchanged', () => {
  const states = [
    { name: 'CORVIN', state: 'chase', x: 100, y: 140 },
    { name: 'MIRA', state: 'suspicious', x: 260, y: 100 },
    { name: 'OTTO', state: 'patrol' },
  ];
  const player = { x: 100, y: 100 };
  assert.equal(guardStatesShort(states, player), 'CORVIN CHASE 1t · MIRA SUSPICIOUS 4t · 1 PATROL');
  assert.equal(guardStatesShort(states, null), 'CORVIN CHASE · MIRA SUSPICIOUS · 1 PATROL');
});

test('m16: railRosterLines prints names as-is, cameras unchanged', () => {
  const world = createWorld(2);
  world.guards[0].state = 'chase'; // VERA
  world.guards[1].state = 'search'; // LUKA
  const lines = railRosterLines(world);
  assert.ok(lines.some((l) => l.startsWith('VERA CHASE')), 'VERA CHASE line');
  assert.ok(lines.some((l) => l.startsWith('LUKA SEARCH')), 'LUKA SEARCH line');
  assert.ok(lines.some((l) => l.startsWith('C1 ')), 'camera lines unchanged');
  assert.ok(!lines.some((l) => l.includes('UVERA') || l.includes('ULUKA')),
    'no U-prefix mangling');
});

// --- unlock chain (3 jobs) ---

test('m16: jobStatus — Job 3 locked until Job 2 is cleared, then open', () => {
  const fresh = freshCampaign();
  assert.equal(jobStatus(fresh, 0), 'open');
  assert.equal(jobStatus(fresh, 1), 'locked');
  assert.equal(jobStatus(fresh, 2), 'locked');
  const one = { selected: 0, cleared: [true, false, false], best: [null, null, null] };
  assert.equal(jobStatus(one, 1), 'open');
  assert.equal(jobStatus(one, 2), 'locked');
  const two = { selected: 0, cleared: [true, true, false], best: [null, null, null] };
  assert.equal(jobStatus(two, 2), 'open');
  assert.equal(canSelectJob(two, 2), true);
  assert.equal(canSelectJob(fresh, 2), false);
  const all = { selected: 0, cleared: [true, true, true], best: [null, null, null] };
  assert.equal(jobStatus(all, 2), 'cleared');
});

test('m16: transition select Digit3 — locked stays, open selects Job 3', () => {
  assert.deepEqual(
    transition('select', 'Digit3', { cleared: [false, false, false], selected: 0 }),
    { screen: 'select' });
  assert.deepEqual(
    transition('select', 'Digit3', { cleared: [true, true, false], selected: 0 }),
    { screen: 'select', action: 'select', job: 2 });
  // Digit1/2 still work on the 3-job campaign.
  assert.deepEqual(
    transition('select', 'Digit1', { cleared: [false, false, false], selected: 0 }),
    { screen: 'select', action: 'select', job: 0 });
});

test('m16: transition win Enter — Job 2 now offers NEXT JOB, only Job 3 closes the campaign', () => {
  assert.deepEqual(transition('win', 'Enter', { jobIndex: 0 }), { screen: 'play', action: 'next' });
  assert.deepEqual(transition('win', 'Enter', { jobIndex: 1 }), { screen: 'play', action: 'next' });
  assert.deepEqual(transition('win', 'Enter', { jobIndex: 2 }), { screen: 'select', action: 'title' });
});

test('m16: campaignTotal sums the bests of all 3 jobs, null counts 0', () => {
  assert.equal(campaignTotal([null, null, null]), 0);
  assert.equal(campaignTotal([{ score: 1245 }, { score: 1529 }, { score: 1600 }]), 4374);
  assert.equal(campaignTotal([{ score: 1245 }, null, { score: 1600 }]), 2845);
});

// --- stars + par (Fase 3) ---

test('m16: starsForJob — 3 = GHOST + all props + within par; 2 = GHOST; 1 = cleared', () => {
  assert.equal(starsForJob(0, 3, 3, 80, 90), 3, 'GHOST + 3/3 + under par');
  assert.equal(starsForJob(0, 3, 3, 90, 90), 3, 'exactly at par still 3 stars');
  assert.equal(starsForJob(0, 3, 3, 91, 90), 2, 'GHOST + 3/3 but over par');
  assert.equal(starsForJob(0, 2, 3, 40, 90), 2, 'GHOST but a prop left behind');
  assert.equal(starsForJob(1, 3, 3, 40, 90), 1, 'spotted once — 1 star');
  assert.equal(starsForJob(2, 0, 3, 200, 90), 1, 'cleared, barely');
});

test('m16: starsText — 3 stars is ★★★, 1 star is ★☆☆', () => {
  assert.equal(starsText(3), '★★★');
  assert.equal(starsText(2), '★★☆');
  assert.equal(starsText(1), '★☆☆');
  assert.equal(starsText(0), '☆☆☆');
});

test('m16: updateBest keeps the best score AND the best stars independently', () => {
  assert.deepEqual(updateBest(null, 1245, 87.4, 3), { score: 1245, time: 87.4, stars: 3 });
  // A worse score never replaces the best, even with more stars.
  assert.deepEqual(updateBest({ score: 1245, time: 87.4, stars: 2 }, 1000, 60, 3),
    { score: 1245, time: 87.4, stars: 3 }, 'stars improve even when the score does not');
  // A better score with fewer stars keeps the old stars.
  assert.deepEqual(updateBest({ score: 1245, time: 87.4, stars: 3 }, 1300, 95, 1),
    { score: 1300, time: 95, stars: 3 }, 'stars never drop');
  // Old 3-arg callers keep working (stars default 0).
  assert.deepEqual(updateBest(null, 500, 30), { score: 500, time: 30, stars: 0 });
});

test('m16: PAR_S — one par per job, Job 1 90s, Job 2 105s, Job 3 set from the T3 probe', () => {
  assert.equal(CONFIG.PAR_S.length, 3);
  assert.equal(CONFIG.PAR_S[0], 90, 'Job 1 par 01:30');
  assert.equal(CONFIG.PAR_S[1], 105, 'Job 2 par 01:45');
  assert.ok(Number.isInteger(CONFIG.PAR_S[2]) && CONFIG.PAR_S[2] >= 30 && CONFIG.PAR_S[2] <= 150,
    `Job 3 par must be a whole number of seconds in a sane range, got ${CONFIG.PAR_S[2]}`);
});

// --- select screen: 3 cards ---

test('m16: selectLayout has 3 cards, inside the canvas, no overlap, clear of the howto panel', () => {
  const L = selectLayout();
  assert.equal(L.cards.length, 3);
  assert.deepEqual(L.cards[0], { x: 20, y: 108, w: 300, h: 128 });
  assert.deepEqual(L.cards[1], { x: 330, y: 108, w: 300, h: 128 });
  assert.deepEqual(L.cards[2], { x: 640, y: 108, w: 300, h: 128 });
  for (let i = 0; i < 3; i++) {
    const c = L.cards[i];
    assert.ok(c.x >= 0 && c.x + c.w <= CONFIG.VIEW_WIDTH, `card ${i + 1} inside`);
    assert.ok(c.y + c.h <= L.howto.y, `card ${i + 1} clear of the howto panel`);
    for (let j = i + 1; j < 3; j++) {
      const d = L.cards[j];
      assert.ok(c.x + c.w <= d.x || d.x + d.w <= c.x, `cards ${i + 1}/${j + 1} do not overlap`);
    }
  }
});

test('m16: every select card line fits card − 80px (name bold 14px, rest 12px)', () => {
  const L = selectLayout();
  const cardW = L.cards[0].w; // 300
  const fresh = freshCampaign();
  const cleared = { selected: 0, cleared: [true, true, true], best: [
    { score: 1245, time: 87.4, stars: 3 },
    { score: 1529, time: 95.2, stars: 3 },
    { score: 1560, time: 80, stars: 3 },
  ] };
  for (const camp of [fresh, cleared]) {
    for (let i = 0; i < 3; i++) {
      const lines = selectCardLines(LEVELS[i], camp, i);
      assert.ok(panelTextFits(lines[0], 14, cardW, measure),
        `Job ${i + 1} name "${lines[0]}" must fit ${cardW - PANEL_TEXT_MARGIN * 2}px`);
      for (const line of lines.slice(1)) {
        if (!line) continue;
        assert.ok(panelTextFits(line, 12, cardW, measure),
          `Job ${i + 1} "${line}" must fit ${cardW - PANEL_TEXT_MARGIN * 2}px`);
      }
    }
  }
});

test('m16: selectCardLines — short counts format, stars in the best line, Job 3 locked text', () => {
  const fresh = freshCampaign();
  assert.deepEqual(selectCardLines(LEVELS[0], fresh, 0), [
    '1 · THE MIDNIGHT THEATRE',
    '6 guards · 2 cams · 2 lasers',
    'NOT CLEARED',
    'PRESS 1',
  ]);
  assert.equal(selectCardLines(LEVELS[2], fresh, 2)[2], 'LOCKED — clear Job 2 to open');
  const cleared = { selected: 0, cleared: [true, true, true], best: [
    { score: 1245, time: 87.4, stars: 3 },
    { score: 1529, time: 95.2, stars: 2 },
    { score: 1560, time: 80, stars: 1 },
  ] };
  assert.deepEqual(selectCardLines(LEVELS[0], cleared, 0), [
    '1 · THE MIDNIGHT THEATRE',
    '6 guards · 2 cams · 2 lasers',
    'CLEARED',
    'BEST 1245 · 01:27 · ★★★',
  ]);
  assert.equal(selectCardLines(LEVELS[1], cleared, 1)[3], 'BEST 1529 · 01:35 · ★★☆');
  assert.equal(selectCardLines(LEVELS[2], cleared, 2)[3], 'BEST 1560 · 01:20 · ★☆☆');
});

test('m16: jobAtPoint finds the third card', () => {
  assert.equal(jobAtPoint(700, 150), 2);
  assert.equal(jobAtPoint(100, 150), 0);
  assert.equal(jobAtPoint(400, 150), 1);
  assert.equal(jobAtPoint(10, 150), -1, 'left margin is not a card');
  assert.equal(jobAtPoint(700, 300), -1, 'below the cards is not a card');
});

// --- select render (MockCtx, same shape as m14) ---

class MockGradient {
  addColorStop() {}
}
class MockCtx {
  constructor() {
    this.calls = [];
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '';
    this.textAlign = '';
    this.globalAlpha = 1;
  }
  _rec(name, args) { this.calls.push([name, ...args]); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(x, y) { this._rec('translate', [x, y]); }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h, this.fillStyle]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  beginPath() { this._rec('beginPath', []); }
  moveTo(x, y) { this._rec('moveTo', [x, y]); }
  lineTo(x, y) { this._rec('lineTo', [x, y]); }
  arc(x, y, r, a0, a1) { this._rec('arc', [x, y, r, a0, a1]); }
  closePath() { this._rec('closePath', []); }
  fill() { this._rec('fill', []); }
  stroke() { this._rec('stroke', []); }
  setLineDash(d) { this._rec('setLineDash', [d]); }
  fillText(text, x, y) { this._rec('fillText', [text, x, y, this.textAlign, this.font]); }
  measureText(text) {
    const m = /(\d+)px/.exec(this.font || '12px monospace');
    const size = m ? parseInt(m[1], 10) : 12;
    return {
      width: String(text).length * size * 0.6,
      actualBoundingBoxAscent: size,
      actualBoundingBoxDescent: Math.ceil(size * 0.25),
    };
  }
  createRadialGradient() {
    this._rec('createRadialGradient', []);
    return new MockGradient();
  }
  createLinearGradient() {
    this._rec('createLinearGradient', []);
    return new MockGradient();
  }
}
function textsOf(ctx) {
  return ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
}

test('m16 render: select frame draws 3 cards + footer PRESS 1–3, Job 3 locked', () => {
  const ctx = new MockCtx();
  const { world, screen, campaign } = applyShot('select');
  render(ctx, world, screen, 0, false, campaign);
  const texts = textsOf(ctx);
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(rects.some((c) => c[1] === 20 && c[2] === 108 && c[3] === 300 && c[4] === 128),
    'job card 1 drawn');
  assert.ok(rects.some((c) => c[1] === 330 && c[2] === 108 && c[3] === 300 && c[4] === 128),
    'job card 2 drawn');
  assert.ok(rects.some((c) => c[1] === 640 && c[2] === 108 && c[3] === 300 && c[4] === 128),
    'job card 3 drawn');
  assert.ok(texts.includes('1 · THE MIDNIGHT THEATRE'), 'Job 1 card drawn');
  assert.ok(texts.includes('2 · THE GALLERY AFTER DARK'), 'Job 2 card drawn');
  assert.ok(texts.includes('3 · THE VAULT AT MIDNIGHT'), 'Job 3 card drawn');
  assert.ok(texts.includes('NOT CLEARED'), 'Job 3 open status drawn (Jobs 1+2 cleared)');
  assert.ok(texts.includes('PRESS 3'), 'Job 3 press hint drawn');
  assert.ok(texts.includes('CLICK A JOB CARD OR PRESS 1–3 · ENTER TO START'), 'closer says 1–3');
  assert.ok(texts.some((t) => t.includes('BEST 1245')), 'Job 1 best drawn');
  assert.ok(texts.some((t) => t.includes('BEST 1529')), 'Job 2 best drawn (cleared, not PRESS 2)');
});

// --- win screen with stars ---

test('m16: winScreenLines — a stars line sits between the score and the campaign total', () => {
  const e1 = applyShot('end');
  const lines = winScreenLines(e1.world, e1.campaign);
  assert.equal(lines.title, 'GHOST — ESCAPED!');
  assert.equal(lines.body.length, 5, '4 old lines + 1 stars line');
  assert.equal(lines.body[0], 'JOB 1 · THE MIDNIGHT THEATRE — CLEARED');
  assert.equal(lines.body[2], 'Score: 1245 — Props 600 + Ghost 500 + Time 145');
  assert.equal(lines.body[3], 'STARS ★★☆ · PAR 01:30', 'the end fixture is GHOST but 2/3 props — 2 stars');
});

test('m16: winScreenLines end3 — Job 3 GHOST + CAMPAIGN COMPLETE TOTAL 3 jobs, stars from the fixture', () => {
  const e3 = applyShot('end3');
  const { world, campaign } = e3;
  const lines = winScreenLines(world, campaign);
  assert.equal(lines.title, 'GHOST — ESCAPED!');
  assert.equal(lines.body[0], 'JOB 3 · THE VAULT AT MIDNIGHT — CLEARED');
  assert.ok(lines.body[1].includes('Props 3/3 · Spotted 0x'), 'full clear, unseen');
  const expectedStars = starsForJob(world.detections, 3, 3, world.time, CONFIG.PAR_S[2]);
  assert.equal(expectedStars, 3, 'the end3 fixture must be within par (else the staged shot lies)');
  assert.equal(lines.body[3], `STARS ${starsText(3)} · PAR ${(() => {
    const m = Math.floor(CONFIG.PAR_S[2] / 60);
    const s = CONFIG.PAR_S[2] % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })()}`);
  const total = campaignTotal(campaign.best);
  assert.equal(lines.body[4], `CAMPAIGN COMPLETE — TOTAL ${total}`);
  assert.equal(lines.footer, 'PRESS ENTER — BACK TO TITLE · R TO REPLAY');
  // The math of the staged run itself: props 900 + ghost 500 + time bonus.
  const s = world.props.filter((p) => p.taken).length * CONFIG.PROP_SCORE
    + CONFIG.GHOST_BONUS
    + (world.time <= CONFIG.TIME_BONUS_FULL_S ? CONFIG.TIME_BONUS_MAX
      : Math.max(0, Math.floor(CONFIG.TIME_BONUS_MAX
        - CONFIG.TIME_BONUS_DECAY * (world.time - CONFIG.TIME_BONUS_FULL_S))));
  assert.ok(lines.body[2].startsWith(`Score: ${s} — Props 900 + Ghost 500 + Time `),
    `staged score math: ${lines.body[2]}`);
});

test('m16: every win-screen body line fits panel − 80px at 16px (end/end2/end3)', () => {
  for (const shot of ['end', 'end2', 'end3']) {
    const { world, campaign } = applyShot(shot);
    const { body } = winScreenLines(world, campaign);
    for (const line of body) {
      assert.ok(panelTextFits(line, 16, 660, measure),
        `"${line}" (${shot}) must fit ${660 - PANEL_TEXT_MARGIN * 2}px`);
    }
  }
});

// --- shots fixtures ---

test('m16: shots select / end3 — 3-job campaigns, Job 3 selected/cleared', () => {
  const s = applyShot('select');
  assert.equal(s.campaign.selected, 2, 'Job 3 selected on the title');
  assert.deepEqual(s.campaign.cleared, [true, true, false], 'Jobs 1+2 cleared, Job 3 open');
  const w3 = applyShot('end3');
  assert.deepEqual(w3.campaign.cleared, [true, true, true], 'all 3 cleared after a Job 3 win');
  assert.equal(w3.campaign.best.length, 3);
});

test('m16: shots play3 / end3 / chase3 exist and render without throwing', () => {
  for (const shot of ['play3', 'end3', 'chase3']) {
    const { world, screen, campaign } = applyShot(shot);
    assert.equal(world.jobIndex, 2, `${shot} is a Job 3 frame`);
    const ctx = new MockCtx();
    render(ctx, world, screen, 0, false, campaign);
    assert.ok(textsOf(ctx).length > 0, `${shot} draws text`);
  }
  const chase = applyShot('chase3');
  assert.equal(chase.world.detections, 1, 'chase3 is honest: SPOTTED ×1 (like chase2)');
  const play = applyShot('play3');
  assert.equal(play.world.detections, 0, 'play3 stays GHOST (its SEARCH came from coin noise)');
});
