# NULL — Interactive Digital Reality

An interface that obeys physics. Grab cards, throw them at the monolith, break it, enter the void.

## Run
    npm install
    npm run dev      # development
    npm run build    # production build → dist/index.html (single file)

## Architecture (src/engine)
- `physics.ts`   Matter.js world, fixed 120 Hz step, gravity / gravity-well fields, drag constraint
- `monolith.ts`  pre-computed convex shards (half-plane fracture), seam cracks, sprite, damage
- `fragments.ts` bounded debris pool (≤96 bodies, recycled, never collide with each other)
- `particles.ts` allocation-free pooled particles (≤480)
- `voidworld.ts` hidden reality: relics, gates A/B (teleport), polarity gate
- `renderer.ts`  Canvas2D, cached static layers, pre-rendered sprites
- `scene.ts`     state machine (still → active → revealing → void → resetting), input, HUD data
- `src/components` React shell: DOM items driven by rigid bodies, HUD

Keyboard: `R` resets. The HUD shows live-measured FPS / physics ms / body count.
