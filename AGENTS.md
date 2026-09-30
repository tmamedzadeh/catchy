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

## Catchy! Tiny Tag Arena
- The game screen is real 3D via React Three Fiber on a client-only route (`ssr: false`), because the Canvas and its browser APIs cannot render on the server.
- Character/agent motion lives in `src/lib/catchy/*` as plain mutable state read inside `useFrame`; React state (`src/store/gameStore.ts`) only holds HUD-visible values, to keep the 60fps loop free of re-renders.
- World layout, props and tuning constants live in `src/lib/catchy/config.ts`, and the HUD visual language is tokenised in `src/styles.css`, so both can be reproduced in another engine later.
- 3D props are CC0 Kenney kits under `public/models/<kit>/` with each kit keeping its own `Textures/` folder, since the GLBs reference `Textures/colormap.png` relatively.
- Dominant arena surfaces use deterministic procedural canvas textures from `src/lib/catchy/textures.ts`, keeping the stylized materials self-contained and consistent without runtime asset requests.
