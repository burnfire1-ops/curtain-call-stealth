// CURTAIN CALL — tuning constants.
// prototype-fast Pattern 2: every tunable value is a named constant here,
// so a retune is a one-line change. No magic numbers in world.js / guard.js.
const CONFIG = {
  VIEW_WIDTH: 960,
  VIEW_HEIGHT: 600,
  // M15: the canvas is 1200x600 — the 960-wide playfield (all world
  // coordinates unchanged) plus a 240px rail on the right. RAIL_X is
  // the rail's left edge (= VIEW_WIDTH). CANVAS_H == VIEW_HEIGHT.
  CANVAS_W: 1200,
  CANVAS_H: 600,
  RAIL_W: 240,
  RAIL_X: 960,
  TILE: 40,
  WALL: 20, // outer wall thickness (px)

  PLAYER_R: 12,
  PLAYER_SPEED: 140, // walk, px/s
  RUN_SPEED: 220, // Shift, px/s

  GUARD_R: 14,
  GUARD_SPEED: 70, // patrol / search, px/s
  GUARD_CHASE_SPEED: 130, // chase, px/s (faster than patrol, slower than run)

  // M2 vision + detection (game-ai: cheap -> expensive perception,
  // suspicion meter, FSM with hysteresis + min state time).
  VIEW_DIST: 180, // guard sight range, px
  VIEW_HALF_ANGLE_DEG: 35, // half of the vision cone
  SUSPICION_FILL_BASE: 2.0, // suspicion/s at max range, walking, light 1.0
  SUSPICION_RUN_MULT: 1.5, // running fills suspicion faster (louder)
  SUSPICION_DECAY: 1.0, // suspicion lost per second unseen
  SUSPICIOUS_AT: 0.5, // suspicion >= this -> Suspicious
  CHASE_AT: 1.0, // suspicion == this -> Chase
  SUSPICIOUS_EXIT: 0.3, // suspicion < this -> back to Patrol (hysteresis)
  CHASE_EXIT: 0.6, // suspicion < this while chasing -> Search (hysteresis)
  MIN_STATE_TIME: 0.3, // minimum seconds in any guard state (anti-flicker)
  SEARCH_TIME: 2.0, // seconds the guard looks around at last-known
  SEARCH_TURN_RATE: 4.0, // rad/s the guard sweeps its gaze while searching

  // M3 light + floor (level-design: binary lighting, floor that talks).
  LIGHT_DARK: 0.35, // suspicion multiplier in dark wings (slow detection)
  LIGHT_POOL: 1.0, // suspicion multiplier inside a stage light pool
  NOISE_RUN_WOOD: 140, // noise radius (px) when running on wood
  NOISE_RUN_CARPET: 40, // noise radius (px) when running on carpet
  GUARD_STEP_LEN: 36, // px of guard travel per footstep ring
  RING_FADE_S: 1.0, // seconds a footstep ring stays visible
  PROP_PICKUP_R: 24, // pickup radius (px, plus player radius)

  // M12 coin distraction (game-ai: a sharp, localised sound is an
  // investigation trigger — the guard walks to the point, looks
  // around, then gives up) + security cameras (a second sensor that
  // feeds the same suspicion meter and raises a building alarm).
  COIN_COUNT: 3, // coins per run, no refill
  COIN_THROW_DIST: 200, // max throw distance from the player, px
  COIN_FLIGHT_S: 0.35, // seconds the coin spends in the air
  COIN_HEAR_RADIUS: 200, // px — guards inside it investigate the landing
  COIN_HEAR_S: 0.5, // seconds a landed coin stays audible (covers the
  // guard's MIN_STATE_TIME so no coin is missed mid-transition)
  COIN_RING_S: 0.8, // seconds the gold landing ring stays visible
  COIN_COOLDOWN_S: 0.5, // seconds between throws
  CAM_VIEW_DIST: 180, // camera sight range, px (same as guards)
  CAM_HALF_ANGLE_DEG: 35, // half of the camera cone (same as guards)
  CAM_SWEEP_DEG: 50, // camera sweeps +/- this from its base angle
  CAM_SWEEP_SPEED: 0.5, // rad/s of the sweep sine
  ALARM_CALM_S: 3.0, // seconds unseen by every camera before the alarm clears

  // M13 smoke gadget (game-ai: smoke is vision-blocking, not a
  // sound — it hides the player from cones without investigating).
  SMOKE_COUNT: 2, // smokes per run, no refill
  SMOKE_FLIGHT_S: 0.35, // same throw arc as the coin
  SMOKE_CLOUD_R: 90, // px — the cone-blocking cloud radius
  SMOKE_CLOUD_S: 4.0, // seconds a cloud lasts
  // M13 laser tripwire (level-design: a timed gate, never a wall —
  // the player crosses freely while OFF and pays while ON).
  LASER_ON_S: 1.6, // seconds the beam is live
  LASER_OFF_S: 1.6, // seconds the beam is down (the crossing window)
  LASER_TRIP_SUSPICION: 0.6, // suspicion added to the laser meter per trip
  // M13 alarm stages (game-ui-ux: a display mapping over the worst
  // suspicion — the fill rates themselves never change).
  STAGE_UNEASY: 0.35, // worst >= this -> UNEASY
  STAGE_HUNTED: 0.6, // worst >= this -> HUNTED
  STAGE_ALARM: 0.95, // worst >= this (or alarm active) -> ALARM
  // M13 score (game-ui-ux: informative only — win/lose rules never
  // change; a caught player simply never earns the GHOST bonus).
  PROP_SCORE: 300, // points per prop taken
  GHOST_BONUS: 500, // points for finishing with 0 detections
  TIME_BONUS_MAX: 200, // full time bonus at <= TIME_BONUS_FULL_S
  TIME_BONUS_FULL_S: 60, // seconds — full bonus up to a 1-minute run
  TIME_BONUS_DECAY: 2, // points lost per second past the full window
};

export default CONFIG;
