# Gnome Forest Mushroom Game — Design

## Concept
A relaxing, no-fail walking game. You play a gnome strolling through a dense,
flower-filled forest, picking mushrooms. Two black cats follow you everywhere:
Frankie (slightly bigger, with an overbite — two little white fangs visible)
and Pickle (smaller). That's the whole plot, on purpose.

## Platform & Tech
- Single-page HTML5 canvas game: `index.html` + `game.js`, zero dependencies.
- Runs on macOS by opening `index.html` in any browser (Safari/Chrome).
- All art is drawn procedurally with canvas 2D — no image assets.
- Optional ambient audio generated with WebAudio (toggle with M).

## World
- Large scrolling world (~3600×3600 px) with a camera that follows the gnome.
- Seeded-random placement of: dense trees (with collision), flowers (many
  colors, gentle sway), grass tufts, rocks, and mushrooms.
- Drifting pollen/firefly particles for ambience. Soft daytime palette.

## Gameplay
- Move with WASD or arrow keys. Gnome has a small walk-bob animation.
- Mushrooms come in 4 varieties (red-cap, brown, chanterelle, rare violet).
- Walk near a mushroom → prompt appears → press Space or E to pick it.
- Basket counter UI shows totals per variety. Picked mushrooms respawn
  elsewhere after a while, so the forest never runs dry.
- No enemies, no timer, no fail state.

## Cats
- Both cats follow the gnome in a loose trailing chain with smooth easing,
  each with its own follow distance and speed so they feel independent.
- Frankie is ~25% bigger and renders an overbite (white fangs below the
  muzzle). Both have tail-swish animations; they sit down when you idle.

## Verification
- `node --check game.js` for syntax.
- Open in browser and confirm: movement, collision, cat following, picking,
  counter increments, respawn.
