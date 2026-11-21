// M8 tests: guardStatesShort() compression (hud.js, pure helper).
// The helper was written with these tests in the same pass (trivial pure
// function — the red-green proof is the assertions below against the
// implementation, plus the full suite staying green).
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardStatesShort, LEGEND } from '../game/src/hud.js';

test('hud M8: all patrol collapses to a count', () => {
  const out = guardStatesShort([
    { name: 'USHER 1', state: 'patrol' },
    { name: 'USHER 2', state: 'patrol' },
    { name: 'USHER 3', state: 'patrol' },
    { name: 'USHER 4', state: 'patrol' },
    { name: 'USHER 5', state: 'patrol' },
    { name: 'USHER 6', state: 'patrol' },
  ]);
  assert.equal(out, '6 PATROL');
});

test('hud M8: one chase is named, patrols collapse', () => {
  const out = guardStatesShort([
    { name: 'USHER 1', state: 'patrol' },
    { name: 'USHER 2', state: 'patrol' },
    { name: 'USHER 3', state: 'chase' },
    { name: 'USHER 4', state: 'patrol' },
    { name: 'USHER 5', state: 'patrol' },
    { name: 'USHER 6', state: 'patrol' },
  ]);
  assert.equal(out, 'U3 CHASE · 5 PATROL');
});

test('hud M8: two alerted guards are both named', () => {
  const out = guardStatesShort([
    { name: 'USHER 1', state: 'patrol' },
    { name: 'USHER 2', state: 'suspicious' },
    { name: 'USHER 3', state: 'chase' },
    { name: 'USHER 4', state: 'patrol' },
  ]);
  assert.equal(out, 'U2 SUSPICIOUS · U3 CHASE · 2 PATROL');
});

test('hud M8: LEGEND constant still carries all four rules (m4 lock)', () => {
  assert.match(LEGEND, /LIGHT=danger/);
  assert.match(LEGEND, /DARK=safe/);
  assert.match(LEGEND, /CARPET=silent/);
  assert.match(LEGEND, /RUNNING on wood=noisy/);
});
