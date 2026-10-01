<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history: force pushing or rebasing, amending, or squashing commits
> that are already pushed rewrites the project's history on Lovable's side.
>
> Commits pushed to the connected branch sync back to Lovable. Keep that branch
> in a working state.

<!-- LOVABLE:END -->

## Catchy! Tag Arena

- The game route is client only because React Three Fiber's Canvas needs browser APIs. Load the 3D bundle after the player presses Play.
- Motion and gameplay state live in `src/lib/catchy/` as mutable simulation data advanced at a capped 60 Hz fixed step. Zustand holds HUD and camera values, not per-frame agent data.
- World layout and tuning live in `src/lib/catchy/config.ts`; reusable camera and HUD tokens live in `src/styles.css`.
- CC0 Kenney models are under `public/models/<kit>/`; keep each kit's `Textures/` folder because its GLBs reference the atlas relatively.
- Arena surface textures are deterministic procedural canvas textures in `src/lib/catchy/textures.ts`.
- Preserve the existing React, React Three Fiber, Three.js, and Zustand architecture. Do not add unapproved V1 mechanics such as Jump, Slide, multiplayer, progression, shops, or new abilities.

## Required quality checks

Run these before considering an important change complete:

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:e2e
npm run build
```

`npm run test:all` runs the complete quality gate. Browser tests build with the isolated `e2e` mode, start the production-equivalent preview, and use Playwright-managed Chromium. Locally, install the browser with `npx playwright install chromium`; CI installs it automatically. `npm run build` verifies that the test bridge and development camera panel are absent from production assets.

**Permanent feature policy:** every important new feature must include automated tests in the same change. Gameplay mechanics and interactions need simulation tests; state transitions and bug fixes need regression tests; important control changes need input or browser tests. A feature without suitable tests is incomplete.

GitHub Actions runs typecheck, lint, unit tests, coverage, Playwright E2E, and the production build on pushes and pull requests.
