// CURTAIN CALL — M4 feel: cheap juice, attached to discrete events.
// game-feel: juice fires on events (chase starts, prop taken, caught),
// never by polling; shake is trauma-based (trauma^2, summed sines,
// real-time decay) and writes a visual offset only — the simulation
// never moves. Pure logic, no DOM; render.js reads the state.
// The audio queue is drained by main.js once per frame and handed to
// audio.js, so the world never imports the audio module.

const SHAKE_DECAY = 1.2; // trauma lost per real second (game-feel §1)
const MAX_OFFSET = { x: 12, y: 8 }; // px at full trauma
const ALERT_SHOW_S = 0.9; // seconds the "!" stays above a guard
const PROP_FLASH_S = 1.0; // seconds the "+1 PROP" flash stays up

export function createFeel() {
  return {
    shake: 0, // trauma 0..1
    alerts: [], // { guard, age } — "!" above the guard
    propFlash: 0, // 1 -> 0 over PROP_FLASH_S after a pickup
    time: 0, // accumulated real time, drives the shake sines
    audioQueue: [], // sound names for main.js to play, then cleared
    // Real-time update (called by main.js every frame, even on the
    // win/lose screens, so effects decay instead of freezing mid-air).
    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt);
      for (const a of this.alerts) a.age += dt;
      this.alerts = this.alerts.filter((a) => a.age < ALERT_SHOW_S);
      this.propFlash = Math.max(0, this.propFlash - dt / PROP_FLASH_S);
    },
  };
}

export function addShake(feel, amount) {
  feel.shake = Math.min(1, feel.shake + amount);
}

export function queueAudio(feel, name) {
  feel.audioQueue.push(name);
}

// Drains the queued sound names (main.js plays them, then the queue
// is empty — each sound fires exactly once).
export function drainAudio(feel) {
  return feel.audioQueue.splice(0, feel.audioQueue.length);
}

// "!" above the guard when Suspicious -> Chase, + the alarm sting.
export function triggerAlert(feel, guard) {
  feel.alerts.push({ guard, age: 0 });
  queueAudio(feel, 'alarm');
}

// "+1 PROP" flash + chime when a prop is picked up.
export function triggerProp(feel) {
  feel.propFlash = 1;
  queueAudio(feel, 'prop');
}

// Small shake + impact sound when a guard catches the player.
export function triggerCaught(feel) {
  addShake(feel, 0.8);
  queueAudio(feel, 'caught');
}

// Camera offset from trauma: trauma^2 so light hits barely move and
// heavy hits punch; summed sines, never per-frame random buzz.
// Returns exactly { x: 0, y: 0 } at rest (shake 0).
export function shakeOffset(feel) {
  if (feel.shake <= 0) return { x: 0, y: 0 };
  const s = feel.shake * feel.shake;
  return {
    x: MAX_OFFSET.x * s * Math.sin(feel.time * 51),
    y: MAX_OFFSET.y * s * Math.sin(feel.time * 69),
  };
}
