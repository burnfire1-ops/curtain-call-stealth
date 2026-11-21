// CURTAIN CALL — M12 security camera: a fixed wall sensor with a
// sweeping teal cone. One job: camera state + sweep + cone check.
// game-ai: the camera is a second PERCEPTION sensor, not a guard —
// it never moves, never chases. It writes suspicion to the same
// meter (detection.js) and the world turns a full meter into the
// building alarm. The cone check is the shared vision.coneCheck,
// so a camera sees exactly what a guard would see from that spot.
// Pure logic, no DOM.
import CONFIG from './config.js';
import { coneCheck } from './vision.js';
import { updateSuspicion } from './detection.js';

export function createCamera({ name, x, y, baseAngleDeg }) {
  const baseAngle = (baseAngleDeg * Math.PI) / 180;
  return {
    name, // 'CAM 1' | 'CAM 2'
    x, y,
    baseAngle, // radians, centre of the sweep
    angle: baseAngle, // current aim (sweeps +/- CAM_SWEEP_DEG)
    time: 0,
    suspicion: 0, // 0..1, owned by detection.js (same meter as guards)
    state: 'sweep', // 'sweep' | 'spotted' (suspicion >= SUSPICIOUS_AT)
    dir: { x: Math.cos(baseAngle), y: Math.sin(baseAngle) },
  };
}

// The sweep is a sine, so the cone dwells at the extremes — the
// player can time a crossing while the cone looks the other way.
// Level-design: every camera has that blind window by construction.
export function stepCamera(cam, seen, ctx, dt) {
  cam.time += dt;
  const amp = (CONFIG.CAM_SWEEP_DEG * Math.PI) / 180;
  cam.angle = cam.baseAngle + amp * Math.sin(cam.time * CONFIG.CAM_SWEEP_SPEED);
  cam.dir = { x: Math.cos(cam.angle), y: Math.sin(cam.angle) };
  cam.suspicion = updateSuspicion(cam.suspicion, seen, ctx, dt);
  cam.state = cam.suspicion >= CONFIG.SUSPICIOUS_AT ? 'spotted' : 'sweep';
}

// Same sensor as a guard: range + cone + 2-point raycast vs walls
// and low cover (a curtain or the crate blocks a camera too).
export function cameraSees(cam, player, blockers) {
  return coneCheck(
    cam, cam.dir, player, blockers,
    CONFIG.CAM_VIEW_DIST, CONFIG.CAM_HALF_ANGLE_DEG,
  );
}
