# VESTIGE//NULL asset pipeline

```
PixVerse (you, in the browser) ─┐
                                ├─► pipeline/pixverse/raw/<id>.mp4
prompts.py → PROMPTS.md ────────┘            │
                                              ▼
                          pipeline/pixverse/process.py
          keyed sprite sheets · looping backdrops · posters · index.json
                                              │
                                              ▼
                        pipeline/blender/pixverse_cards.py
               animated "apparition card" GLBs built from the sheets
                                              │
pipeline/blender/build_assets.py ─────────────┤  rigged characters, enemies,
  (rigs, skinning, animation actions, level)  │  level + arena GLBs
                                              ▼
                               jrpg/  (three.js game)
```

Everything is optional except `build_assets.py`. The game looks complete without any PixVerse footage and picks up each generated asset as soon as it's processed.

## Requirements

```sh
pip install bpy pillow numpy imageio-ffmpeg   # bpy = Blender as a Python module (Python 3.11)
```

You can use a desktop Blender instead of the `bpy` wheel: `blender -b -P pipeline/blender/build_assets.py`.

## 1. Blender: models, rigs, animation, level

```sh
python3 pipeline/blender/build_assets.py            # everything
python3 pipeline/blender/build_assets.py sable warden level   # just some
```

This writes to `jrpg/assets/models/`:

| GLB | contents |
| --- | --- |
| `sable`, `wisp`, `hex` | party members: low-poly, rigidly skinned to an 18+ bone armature |
| `saint`, `saint_ghost`, `wraith`, `moth`, `warden` | enemies and the boss (the moth has its own wing rig) |
| `level_spire` | the megastructure, generated from `jrpg/data/level.json` so it matches the game's collision exactly |
| `arena` | battle stage |
| `savepoint`, `chest` | props |

Each rig carries these actions: `idle run attack cast hit guard death victory`, plus overlays (`halo_spin`, `grimoire_float`) that the game layers on top. Poses are written as world-axis rotations and converted to bone space, so they're easy to tweak in `humanoid_actions()`. To edit the map, change `jrpg/data/level.json` and rebuild `level`.

Preview any model and clip with `jrpg/viewer.html`, for example `viewer.html?m=warden&a=attack`.

## 2. PixVerse: generate footage

```sh
python3 pipeline/pixverse/prompts.py    # rebuilds PROMPTS.md from style.json + manifest.json
```

Open `pipeline/pixverse/PROMPTS.md`. For each asset, paste the prompt and the negative prompt into PixVerse's **Text to Video**, use the listed aspect ratio and duration, and save the download as `pipeline/pixverse/raw/<asset id>.mp4`.

- `style.json` holds the shared art direction: darkcore, glitchcore, deftxnxs, Nihei megastructures and PS2-era JRPG. Change it once and every prompt follows.
- `manifest.json` lists each asset: its kind, prompt, whether it's green-screened, and its frame count and sheet grid. Add entries there to add assets.
- Characters, enemies and FX are prompted on flat green so they key cleanly.

## 3. Process into game assets

```sh
python3 pipeline/pixverse/process.py               # every asset with a raw video
python3 pipeline/pixverse/process.py hero_sable    # one asset
```

- **character / enemy / fx:** extracts evenly spaced frames, chroma-keys and despills them, crops every frame to a shared bounding box, and applies a light RGB-split and torn-row pass (`--no-glitch` skips it). Output is a sprite sheet (`.webp` with alpha) plus a poster frame.
- **environment:** re-encodes a 720p H.264 ping-pong loop so it repeats seamlessly, plus a poster frame.
- Writes `jrpg/assets/pixverse/index.json`, then runs `pipeline/blender/pixverse_cards.py`. That script builds a Blender "apparition card" for each character or enemy sheet: a UV-mapped card with a baked levitate, breathe and glitch-twitch animation.

### Where the footage appears in the game

| asset | in game |
| --- | --- |
| `hero_*` | dialogue portraits |
| `enemy_*` | encounter splash, and a giant apparition card looming behind the enemy line in battle |
| `env_megastructure` | video wrapped around the field horizon |
| `env_null_shore` | video wrapped around the battle horizon |
| `fx_rift_burst` | Rift Burst and enemy-death spell sprite |

### Testing without PixVerse

```sh
python3 pipeline/pixverse/make_test_clips.py /tmp/pix_test
python3 pipeline/pixverse/process.py --raw /tmp/pix_test
```

These are crude placeholders for checking the plumbing. Delete `jrpg/assets/pixverse/*` (keep `.gitkeep`) afterwards so they don't ship.

## Why there's no automated PixVerse step

PixVerse's web app needs your login, and automating it would mean handling your credentials. It's also fragile, and it likely goes against their terms of service. If you later get a PixVerse API key, an automatic generate-and-download step can sit in front of `process.py`: everything downstream already works from `raw/<id>.mp4`.
