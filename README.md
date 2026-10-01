# Catchy

Catchy is a browser based 3D tag arena. One player chases three runners in a five minute round. Catching a runner removes them briefly, then they return at a safe spawn point.

## Controls

Desktop:

- **W / S** move forward and backward; **A** moves left and **D** moves right relative to the camera. Catchy faces the direction of travel.
- **Left / Right Arrow** rotate the camera.
- **Up Arrow** holds Camera Recenter.
- **Down Arrow** holds Tactical Overview.
- **Shift** uses Dash.
- **E** uses Speed Boost.
- **Space** has no gameplay action.
- Restart is available from the round end screen.

Touch screens:

- Left joystick moves.
- Right joystick turns the camera; push up to hold Camera Recenter or down to hold Tactical Overview.
- Separate Dash and Speed Boost buttons sit beside the right joystick.

The direction finder points toward the selected active runner. Install is optional. Play requests fullscreen and landscape where the browser supports them; denied or unavailable requests do not prevent play. On iOS Safari, Add to Home Screen is offered as guidance for an installed fullscreen experience.

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

Unit and simulation tests use Vitest; the current suite executes **81 test cases across six files**. Browser E2E tests use Playwright's own Chromium against an isolated E2E build served by Wrangler's local Cloudflare Worker preview. For a local first run, install Chromium with `npx playwright install chromium`. CI installs Chromium and runs the complete quality gate. The regular production build checks that the E2E bridge and camera tuning UI are absent and verifies the production PWA icons.

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
