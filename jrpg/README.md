# VESTIGE//NULL

A darkcore / glitchcore tribute JRPG that runs in the browser. It pays homage to Final Fantasy X, Shadow Hearts, Kingdom Hearts, .hack, Cocoon, Grandia, Chrono Trigger and Star Ocean, set in a Tsutomu Nihei–style megastructure. The models, rigs and animations are built in Blender (`../pipeline`); the world, battles and shaders are three.js. All names, writing and art are original.

## Play

The game uses ES modules, so serve the folder rather than opening the file directly:

```sh
cd jrpg && python3 -m http.server 8000    # then open http://localhost:8000
```

There's no build step. three.js is vendored in `vendor/`, so the game runs offline; only the web fonts load from Google Fonts.

## Controls

| | keyboard | gamepad | touch |
| --- | --- | --- | --- |
| move | WASD / arrows (hold Shift to walk) | left stick | joystick |
| camera | drag, Q / R | right stick, LB / RB | drag |
| confirm / talk | E, Space, Enter | A | ◎ |
| back | Esc, X, Backspace | B | ✕ |
| menu | M, Tab | Start | MENU |

## What's in it

- **Exploration**: a third-person walk up the lower strata of the Null Spire, through five named zones with title cards. Enemies are visible and patrol, so there are no random encounters. The party follows you Grandia-style. There are NPCs, two recruitable party members, reliquary chests and save spheres (heal and save).
- **Battles**:
  - **Turn order**: FFX-style Conditional Turn-Based, with a live 10-turn order display. Guard and quick actions come around sooner; heavy skills cost you tempo.
  - **The Judgment Ring**, from Shadow Hearts: attacks and skills are timed. Hit each zone as the needle crosses it, and hit the red edge for a STRIKE.
  - **Your party**: Sable (a blade user), Wisp (a logged-in player who can't log out, with healing and debuffs) and Hex (a demon-fused brawler with a buff and life-drain).
  - **Presentation**: run-up melee with camera work, spell effects and damage popups.
  - **The boss**: The Warden, with a second phase and a telegraphed Null Liturgy (Guard!).
- **Progression**: XP, level-ups with stat growth, skills unlocked by level, items and drops. Progress saves to `localStorage`.
- **Look**: bloom and a custom glitch grade (chromatic split, datamosh row tearing, scanlines, grain and a teal-shadow grade), a shattered-moon sky, static rain, pyreflies and procedural WebAudio drones and battle loops.
- **Accessibility**: Settings has an AUTO Judgment Ring and a CRT/grain toggle.

## Code map

| file | role |
| --- | --- |
| `js/main.js` | boot, main loop, title, battle transitions, pause menu, game over, ending |
| `js/field.js` | exploration, collision against `data/level.json`, NPCs, enemies, chests, saves |
| `js/battle.js` | CTB engine, commands, Judgment Ring hookup, AI, boss phases, results |
| `js/ui.js` | dialogue, menus, Judgment Ring, battle HUD, popups (focus-stack, `await`-able) |
| `js/assets.js` | GLB loading, animated `Actor`, generated portraits, optional PixVerse media |
| `js/fx.js` | sky, pyreflies, static rain, spell effects |
| `js/post.js` | bloom + glitch/CRT post-processing |
| `js/audio.js` | procedural music and SFX |
| `js/data.js` | heroes, skills, items, enemies, encounter groups, dialogue |
| `js/state.js` | party/inventory state, leveling, save/load, settings |
| `viewer.html` | model and animation previewer |

Console helpers: `VESTIGE.State`, `VESTIGE.addHero('hex')`, `VESTIGE.startBattle('warden', { boss: true })`.
