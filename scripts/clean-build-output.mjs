import { rmSync } from "node:fs";

for (const target of [".output", ".vercel/output"]) {
  rmSync(target, { recursive: true, force: true });
}
