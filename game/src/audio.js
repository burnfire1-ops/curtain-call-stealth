// CURTAIN CALL — M4 audio: synthetic WebAudio only, no audio files,
// no network. audio-design: one master gain (the mute switch acts on
// the group, never on individual sounds), a low drone whose tension
// follows the worst suspicion, and one-shot stingers for events.
// The AudioContext is created LAZY on the first user gesture
// (main.js calls unlock() from a click/keydown) and every public method
// is guarded: with no AudioContext — Node tests, headless Chrome
// without audio — every call is a silent no-op and never throws.

// Footstep loudness by distance to the nearest guard: full volume on
// top of the guard, silent beyond earshot (400px, past the 180px sight
// range so you hear a guard before you see it). Pure, unit-tested.
export function footstepGain(dist) {
  return Math.max(0, Math.min(1, 1 - dist / 400));
}

export function createAudio() {
  let ctx = null; // created lazily in unlock()
  let master = null;
  let drone = null; // { osc, gain } — tension drone, started in unlock()
  let muted = false;

  function ready() {
    return ctx !== null && !muted;
  }

  // One short synth blip: oscillator + exponential decay envelope.
  // Guarded so a failed node graph never throws into the game loop.
  function blip(freq, dur, gain, type = 'sine', when = 0) {
    if (!ready()) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }

  return {
    // Lazy init, called from the first user gesture. try/catch: headless
    // Chrome without an audio device must not throw here.
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      try {
        const AC = typeof window !== 'undefined'
          && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
        // Tension drone: a low sine that sits under everything; its
        // gain + pitch follow the worst suspicion (setTension).
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55;
        g.gain.value = 0.02;
        osc.connect(g);
        g.connect(master);
        osc.start();
        drone = { osc, gain: g };
      } catch (e) {
        ctx = null; // no audio on this machine — stay silent, keep playing
      }
    },

    isReady() {
      return ctx !== null;
    },

    isMuted() {
      return muted;
    },

    toggleMute() {
      muted = !muted;
      if (master) {
        try {
          master.gain.value = muted ? 0 : 0.5;
        } catch (e) { /* ignore */ }
      }
      return muted;
    },

    // Guard footsteps: volume by distance to the nearest guard, pitch
    // by the floor under the guard's feet (wood knocks, carpet thuds).
    footstep(dist, floor) {
      if (!ready()) return;
      const gain = footstepGain(dist) * 0.22;
      if (gain <= 0.01) return;
      blip(floor === 'carpet' ? 90 : 140, 0.07, gain, 'triangle');
    },

    // Adaptive drone (audio-design: vertical layer for intensity):
    // suspicion 0 -> quiet 55Hz hum; suspicion 1 -> louder, 85Hz.
    setTension(suspicion) {
      if (!drone || !ctx) return;
      try {
        const s = Math.max(0, Math.min(1, suspicion));
        drone.gain.gain.setTargetAtTime(0.02 + s * 0.06, ctx.currentTime, 0.2);
        drone.osc.frequency.setTargetAtTime(55 + s * 30, ctx.currentTime, 0.2);
      } catch (e) { /* ignore */ }
    },

    // Alarm sting when a chase starts: two-tone square, short.
    alarm() {
      blip(660, 0.12, 0.25, 'square');
      blip(440, 0.18, 0.25, 'square', 0.12);
    },

    // Caught impact: a low thud under the lose stinger.
    thud() {
      blip(70, 0.15, 0.3, 'triangle');
    },

    // Prop pickup chime: bright two-note sine.
    propChime() {
      blip(880, 0.15, 0.2, 'sine');
      blip(1320, 0.25, 0.18, 'sine', 0.09);
    },

    // Win stinger: rising three-note arpeggio.
    win() {
      blip(523, 0.18, 0.22, 'sine');
      blip(659, 0.18, 0.22, 'sine', 0.12);
      blip(784, 0.35, 0.22, 'sine', 0.24);
    },

    // Lose stinger: falling three-note phrase.
    lose() {
      blip(330, 0.2, 0.22, 'sawtooth');
      blip(220, 0.2, 0.22, 'sawtooth', 0.15);
      blip(165, 0.4, 0.22, 'sawtooth', 0.3);
    },
  };
}
