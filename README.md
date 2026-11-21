[![make.fun](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/burnfire1-ops/curtain-call-stealth/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/burnfire1-ops/curtain-call-stealth/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

# CURTAIN CALL — The Midnight Theatre

A top-down stealth game: steal back 3 props (Star Tiara, Golden Mask,
Lead's Violin) from the midnight theatre, then reach the EXIT unseen.

- **Patrol routes you can learn**: every usher walks a dotted route on
  the floor; watch it, then slip past.
- **Cover you can read**: red velvet curtains and a prop crate block
  sight and movement. Hide behind them.
- **Light is danger, dark is safe**: warm stage-light pools make
  suspicion fill fast; dark wings slow it down.
- **The floor talks**: carpet is silent, stage wood is noisy — running
  on wood draws ushers. Guard footsteps ring on the floor where they
  just walked, and a noise ring shows how far your own running is heard.
- **Detection gives you a chance to recover**: suspicion fills, then
  the usher gets suspicious, then chases your *last-known* position —
  never your live one. Break sight and the chase becomes a search.
- **Rank**: finish unseen and the win screen reads **GHOST**.

## How to play

Open `game/index.html` in desktop Chrome (no network, no build step —
plain static files under `game/`).

- **WASD / arrow keys**: move
- **Shift**: run (louder — the noise ring grows, worse on wood)
- **P**: pause · **R**: restart · **M**: mute · **Enter**: start / restart

Win by reaching the green EXIT. Props are optional branches — the exit
is always reachable without them, so there is no soft-lock.

## Layout

- `main.ts` — the entry program (Node 22): copies `game/` and
  `screenshots/` to the output and writes `dossier.json`.
- `vendor/makefun-game.ts` — the kit's library, copied unchanged.
- `game/` — the game itself, static files only:
  `game/src/config.js` (tuning), `level.js` (the one 3-wing level),
  `vision.js` + `detection.js` (cones + suspicion), `guard.js` (FSM),
  `player.js` via `world.js` (simulation), `render.js` (canvas),
  `hud.js` (HUD + screens data), `screens.js` (screen flow),
  `audio.js` (synthesised WebAudio, no assets), `feel.js` (shake,
  alerts, flashes), `input.js`, `random.js`, `shots.js` (frozen
  frames for screenshots).
- `screenshots/` — 4 renders of the game's own code in a browser.
- `tests/` — `node --test` unit tests (`npm test`).

Built for the [make.fun](https://make.fun/bounty/best-stealth-game-20261121-1759)
"Make the best stealth game" bounty. Original game: own idea, art,
sounds and names. MIT licensed.
