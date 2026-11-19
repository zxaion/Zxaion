import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(frontendDir, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(frontendDir, "src", "app.js")],
  outfile: path.join(distDir, "script.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none",
  sourcemap: false,
});

for (const asset of ["index.html", "style.css", "quicklink.json"]) {
  await copyFile(path.join(frontendDir, asset), path.join(distDir, asset));
}

console.log("Frontend build complete: frontend/dist/");
