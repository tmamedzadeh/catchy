# Catchy

Catchy is a browser based 3D tag arena. One player chases three runners in a five minute round. Catching a runner removes them briefly, then they return at a safe spawn point.

## Controls

Desktop:

- **W** moves forward, **S** backward, **A** left, and **D** right relative to the camera. Catchy faces the direction of travel.
- **Mouse drag** rotates the camera.
- **ArrowLeft** yaws the camera left, **ArrowRight** yaws right, **ArrowUp** pitches up, and **ArrowDown** pitches down.
- **Space** jumps, **Shift** uses Dash, and **E** uses Speed Up.
- Restart is available from the round end screen.

Mobile:

- The left joystick controls movement only.
- Drag the gameplay area to rotate the camera.
- Bottom-right: Dash is left of Jump, with Jump rightmost.
- Speed Up is above Jump on the right.
- Camera follow is automatic; there is no second joystick on mobile.
- Touch ownership is explicit: the left stick moves, action buttons trigger one action, and all other gameplay touches drag the camera. The stick and camera can be used simultaneously.

The direction finder points toward the selected active runner. Catchy opens with a map library: choose Default or a custom map, then press **START**. Custom maps are saved on this device in browser storage. Open `/editor` for the desktop-first map editor; it uses the same serializable map data as gameplay, supports bundled assets, spawn editing, collider-aware validation, undo-friendly layout changes, and JSON export. Default is built-in and protected; duplicate it to customize. The V1 editor does not support online sharing, arbitrary asset uploads, or terrain authoring. Install is optional. Play requests fullscreen and landscape where the browser supports them; denied or unavailable requests do not prevent play. On iOS Safari, Add to Home Screen is offered as guidance for an installed fullscreen experience.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

The game route loads its 3D renderer after Play. Gameplay advances on a capped 60 Hz fixed simulation clock. Mutable player and runner data stays outside React; Zustand contains HUD and camera values.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:e2e
npm run build
npm run test:all
```

Unit and simulation tests use Vitest; the suite covers input ownership, camera-relative movement, camera follow/persistence, joystick geometry, and the existing gameplay mechanics. Browser E2E tests use Playwright's own Chromium against an isolated E2E build served by Wrangler's local Cloudflare Worker preview. For a local first run, install Chromium with `npx playwright install chromium`. CI installs Chromium and runs the complete quality gate. The regular production build checks that the E2E bridge and camera tuning UI are absent and verifies the production PWA icons.

**Important feature rule:** every important feature, gameplay change, state transition, control change, and bug fix must include an appropriate automated regression test in the same change. A feature without its test is incomplete.

## Assets and visuals

CC0 Kenney GLBs are served from `public/models/<kit>/`, with each kit's relative `Textures/` atlas preserved. Repeated static props use instancing and shared materials. Arena ground textures are generated in the browser. Grass is not used as the playable ground surface.

<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history: force pushing or rebasing, amending, or squashing commits
> that are already pushed rewrites the project's history on Lovable's side.
>
> Commits pushed to the connected branch sync back to Lovable. Keep that branch
> in a working state.

<!-- LOVABLE:END -->
