// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The dev-only devtools plugin injects `data-tsd-source` on every JSX element.
// React Three Fiber treats dashed props as nested paths ("data.tsd.source") and
// crashes, so strip the attribute from 3D scene files.
const stripTsdSourceFromR3F = {
  name: "sprout:strip-tsd-source-r3f",
  transform(code: string, id: string) {
    if (!/\/src\/components\/game\//.test(id) || !code.includes("data-tsd-source")) return null;
    return {
      code: code
        .replace(/\s+data-tsd-source=(\{`[^`]*`\}|"[^"]*"|\{"[^"]*"\})/g, "")
        .replace(/"data-tsd-source":\s*("[^"]*"|`[^`]*`),?/g, ""),
      map: null,
    };
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [stripTsdSourceFromR3F],
  },
});
