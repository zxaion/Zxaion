import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(frontendDir, "dist");
const read = (file) => readFile(path.join(distDir, file), "utf8");

const [html, css, js, quicklinks, sourceHtml, sourceCss, sourceQuicklinks, worker] = await Promise.all([
  read("index.html"),
  read("style.css"),
  read("script.js"),
  read("quicklink.json"),
  readFile(path.join(frontendDir, "index.html"), "utf8"),
  readFile(path.join(frontendDir, "style.css"), "utf8"),
  readFile(path.join(frontendDir, "quicklink.json"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "worker.js"), "utf8"),
]);

assert.equal(html, sourceHtml, "Built HTML must remain byte-identical to the legacy HTML.");
assert.equal(css, sourceCss, "Built CSS must remain byte-identical to the legacy CSS.");
assert.equal(quicklinks, sourceQuicklinks, "quicklink.json must remain byte-identical.");
assert.match(html, /href=["']\/style\.css["']/i, "HTML must reference the preserved CSS URL.");
assert.match(html, /src=["']\/script\.js["']/i, "HTML must reference the preserved JS URL.");

for (const token of ["refreshImages", "changeCategory", "openAnimeCollection", "paypalButtonsInstance"]) {
  assert.ok(js.includes(token), `Bundled JS is missing compatibility token: ${token}`);
}

for (const route of [
  "/api/health",
  "/api/admin/sync",
  "/api/paypal/webhook",
  "/api/list",
  "/api/comitbase/list",
  "/api/dtreasure/list",
  "/api/trending",
  "/api/credits/balance",
  "/api/credits/purchase",
  "/api/credits/spend",
  "/api/stats/",
  "/api/view/",
  "/api/download/",
  "/api/img/",
  "/api/comitbase/img/",
  "/api/dtreasure/img/",
]) {
  assert.ok(worker.includes(route), `Worker route contract missing: ${route}`);
}

for (const file of ["index.html", "style.css", "script.js", "quicklink.json"]) {
  const info = await stat(path.join(distDir, file));
  assert.ok(info.isFile() && info.size > 0, `Build output missing or empty: ${file}`);
}

console.log("Frontend verification passed: asset parity, browser paths, globals, and Worker route contract.");
