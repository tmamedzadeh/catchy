# Catchy

Fast chase/tag browser game.

Catchy is a bright, browser-first 3D arena game. You are the only hunter. Chase three runners that flee, tag them at close range, and build your score before the 5-minute round ends. Each tagged runner briefly leaves play and respawns on a safe part of the map.

## Controls

- **W / A / S / D** or the **arrow keys** move relative to the camera. **S / ArrowDown** makes Catchy move backward while still facing forward, like a car in reverse.
- **Space** restarts the round, including the player and all runner positions.
- On touch screens, drag the on-screen joystick to move.

The direction finder points toward the nearest active runner. The world beacon marks that runner on the map.

## Camera tuning and debug mode

Append `?debug=true` to the URL to show the camera tuning panel and live gameplay telemetry. Height / Zoom ranges from 14 to 32 in 0.5 increments; Angle ranges from 10° to 75° in 1° increments. Reset Camera restores the default composition. The tuning panel is hidden during normal play.

## Development

Requires Node.js and npm.

```sh
npm install
npm run dev
```

Production build and lint:

```sh
npm run build
npm run lint
```

## Architecture

- **React, TypeScript, Vite, and TanStack Start** provide the browser application and client-only game route.
- **React Three Fiber and Three.js** render the Lovable visual foundation, procedural characters, lighting, terrain, and GLB props.
- **Zustand** holds HUD and camera values. Mutable player and runner simulation data is updated outside React at frame rate.
- **World configuration** keeps the circular arena size, body radii, spawn rules, props, and collision shapes together. Map prop descriptors supply both their GLB transform and their circle or rotated-box collision shape.
- **Assets** remain in `public/models/`, with each model kit's relative `Textures/` assets preserved. Procedural terrain textures are generated locally in the browser.

The project is browser-first and does not currently include offline PWA behavior, a backend, or multiplayer services.

<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->
