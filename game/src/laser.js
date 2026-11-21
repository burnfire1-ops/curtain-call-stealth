// CURTAIN CALL — M13 laser tripwire: a timed gate, never a wall.
// One job: laser state + pulse + trip check.
// level-design: the beam pulses ON 1.6s / OFF 1.6s, so the player
// crosses on a timer (the OFF window is the telegraph — dim dashed
// beam + dim emitters, brightening just before the beam goes live).
// The trip is a PLAYER-only segment test (vision.segmentHitsCircle):
// guards never trip their own laser, and smoke never blocks it
// (a laser is light, not sight). One trip per crossing — the trip
// flag resets when the player leaves the beam, so crossing twice in
// one ON window trips twice (and two trips reach the alarm).
// Pure logic, no DOM.
import CONFIG from './config.js';
import { segmentHitsCircle } from './vision.js';

export function createLaser({ name, x1, y1, x2, y2 }) {
  return {
    name, // 'LASER 1' | 'LASER 2'
    x1, y1, x2, y2, // beam endpoints (fixed)
    on: true, // the beam starts live (the player reads it at once)
    phaseT: 0, // seconds in the current ON/OFF phase
    tripped: false, // true while the player stands in a live beam
  };
}

// Pulse the phase clock. The beam flips ON <-> OFF every
// LASER_ON_S / LASER_OFF_S seconds; leaving a phase clears the
// trip flag (a fresh ON window can trip again).
export function stepLaser(laser, dt) {
  laser.phaseT += dt;
  const limit = laser.on ? CONFIG.LASER_ON_S : CONFIG.LASER_OFF_S;
  if (laser.phaseT >= limit) {
    laser.on = !laser.on;
    laser.phaseT = 0;
    laser.tripped = false;
  }
}

// Does the live beam touch the player this step? False while OFF
// (the crossing window), false when the player already tripped this
// crossing (tripped resets when the player steps off the beam).
// The caller adds LASER_TRIP_SUSPICION and fires the TRIPPED! flash.
export function laserTripsPlayer(laser, player) {
  if (!laser.on) {
    laser.tripped = false;
    return false;
  }
  const touching = segmentHitsCircle(
    laser.x1, laser.y1, laser.x2, laser.y2,
    player.x, player.y, player.r,
  );
  if (!touching) {
    laser.tripped = false;
    return false;
  }
  if (laser.tripped) return false;
  laser.tripped = true;
  return true;
}
