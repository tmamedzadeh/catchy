import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/catchy/agents.ts",
        "src/lib/catchy/config.ts",
        "src/lib/catchy/fixedStep.ts",
        "src/lib/catchy/maps/**/*.ts",
        "src/lib/catchy/camera.ts",
        "src/lib/catchy/input.ts",
        "src/lib/catchy/joystick.ts",
        "src/lib/catchy/pinch.ts",
        "src/lib/catchy/runtime.ts",
      ],
      exclude: ["src/lib/catchy/textures.ts"],
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
