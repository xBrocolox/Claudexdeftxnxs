# NULL//CATHEDRAL

A darkcore / gothcore / glitch-signal trading card game that runs in the browser. There's no build step and no dependencies. It takes its mood from vast silent megastructures, biomechanical saints and corrupted transmissions. Every card, name and piece of art is original.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## What's in it

- **44 collectible cards** across five factions: Silicate, Severed, Static, Hollow and the unaligned Null.
- **Procedural card art.** Every illustration is painted in code at runtime (`js/art.js`) from a seed derived from the card: layered megastructure depths, vanishing-point girders, hanging cables, and figures such as wraiths, haloed saints, multi-limbed constructs, serpents, eyes, gates and moth swarms. A glitch pass then adds RGB split, row displacement, datamosh smears, scanlines and grain.
- **Five rarities**, each with its own frame: Common, Uncommon, Rare (gold-etched), Super Rare (rotating spectrum frame, starfield holo) and Glitch Secret (animated chromatic holo, glitching art and name).
- **Holo foils** that follow the pointer: the card tilts in 3D and the rainbow foil and glare shift as you move. Any card can pull as a holo foil (8%). Super Rare and Glitch Secret cards are always foil.
- **Pack opening.** Five cards per pack, with slot 4 guaranteed Uncommon+ and slot 5 guaranteed Rare+. Rare cards glow through their backs before you flip them.
- **Archive** (collection browser with filters) and **Deck builder** (20 cards, cost-curve chart, auto-build).
- **Battles against an AI Host.** Win to earn shards (◈150 per win, ◈40 per loss) and buy packs for ◈100.

Progress is saved in `localStorage`.

## Rules

- Each player's **Core** starts at 25 integrity. Reduce the enemy Core to 0 to win.
- **Signal** is the resource. You gain +1 max Signal per turn (up to 10), and it refills every turn.
- **Units** attack the turn after they're deployed. Combat is simultaneous.
- **Protocols** are one-shot effects.
- Keywords: **BULWARK** (taunt), **OVERCLOCK** (attacks immediately), **VEIL** (can't be targeted until it attacks), **LEECH** (damage heals your Core), **CORRUPT** (damaged units lose 1 ATK), **ECHO** (leaves a 1/1 behind on death).

Right-click (or long-press) any card to inspect it up close.

## Code map

| File | Role |
| --- | --- |
| `js/cards.js` | Card database, factions, rarities, keywords |
| `js/art.js` | Seeded procedural art generator |
| `js/engine.js` | Pure battle rules engine (no DOM) that emits animation events |
| `js/ai.js` | Opponent: curve play, value trades, lethal checks |
| `js/render.js` | Card DOM + holographic pointer tilt |
| `js/app.js` | Save data, packs, archive, deck builder, battle UI |
| `css/style.css` | Frames, foils, glitch effects, layout |

## Swapping in your own art

The art for each card comes from `Art.render(card)` in `js/render.js`. To use hand-made or AI-generated images, add an `img: 'assets/x.jpg'` field to a card in `js/cards.js`. Then make `Art.render` return `card.img` when it's set.
