import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const forbidden = /__CATCHY_E2E__|installCatchyE2EBridge|e2eBridge|Camera tuning/;

const vercelOutput = {
  name: "Vercel",
  publicRoot: join(process.cwd(), ".vercel", "output", "static"),
  bundleRoots: [
    join(process.cwd(), ".vercel", "output", "static", "assets"),
    join(process.cwd(), ".vercel", "output", "functions", "__server.func"),
  ],
};
const nitroOutput = {
  name: "Nitro",
  publicRoot: join(process.cwd(), ".output", "public"),
  bundleRoots: [
    join(process.cwd(), ".output", "public", "assets"),
    join(process.cwd(), ".output", "server"),
  ],
};
const outputLayouts = process.env["VERCEL"]
  ? [vercelOutput, nitroOutput]
  : [nitroOutput, vercelOutput];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let productionOutput;
for (const layout of outputLayouts) {
  if (await exists(join(layout.publicRoot, "manifest.webmanifest"))) {
    productionOutput = layout;
    break;
  }
}
if (!productionOutput) {
  for (const layout of outputLayouts) {
    if (await exists(layout.publicRoot)) {
      productionOutput = layout;
      break;
    }
  }
}

if (!productionOutput) {
  throw new Error("Production output not found in .vercel/output or .output.");
}

const { publicRoot } = productionOutput;

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(?:cjs|js|mjs|css|html|map)$/i.test(entry.name)) {
      const contents = await readFile(path, "utf8");
      if (forbidden.test(`${entry.name}\n${contents}`)) {
        throw new Error(`Production output contains test or debug code: ${path}`);
      }
    }
  }
}

async function inspectApplicationSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspectApplicationSource(path);
    else if (/\.(?:js|jsx|ts|tsx)$/i.test(entry.name)) {
      const contents = await readFile(path, "utf8");
      if (/console\.(?:log|debug)\s*\(/.test(contents)) {
        throw new Error(`Application source contains a console debugging call: ${path}`);
      }
    }
  }
}

async function verifyPwaIcons() {
  const manifestPath = join(publicRoot, "manifest.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expected = [
    { src: "/icons/catchy-192.png", sizes: "192x192", dimension: 192 },
    { src: "/icons/catchy-512.png", sizes: "512x512", dimension: 512 },
  ];

  for (const icon of expected) {
    const entry = manifest.icons.find((candidate) => candidate.src === icon.src);
    if (entry?.sizes !== icon.sizes || entry?.type !== "image/png") {
      throw new Error(`Production manifest is missing the ${icon.sizes} PNG icon entry.`);
    }

    const iconPath = resolve(publicRoot, icon.src.replace(/^\/+/, ""));
    if (!iconPath.startsWith(`${resolve(publicRoot)}${sep}`)) {
      throw new Error(`Production manifest contains an invalid icon path: ${icon.src}`);
    }
    const png = await readFile(iconPath);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
      !png.subarray(0, 8).equals(signature) ||
      png.readUInt32BE(16) !== icon.dimension ||
      png.readUInt32BE(20) !== icon.dimension
    ) {
      throw new Error(`Production icon has invalid PNG data or dimensions: ${icon.src}`);
    }
  }
}

await inspectApplicationSource(sourceRoot);
for (const bundleRoot of productionOutput.bundleRoots) {
  if (await exists(bundleRoot)) await inspect(bundleRoot);
}
await verifyPwaIcons();
console.log(
  `${productionOutput.name} production output passed app-debug, bundle, and PWA-icon verification.`,
);
