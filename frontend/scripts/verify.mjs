import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(frontendDir, "dist");
const read = (file) => readFile(path.join(distDir, file), "utf8");

const [html, css, js, quicklinks, sourceHtml, sourceCss, sourceQuicklinks, worker, configModule, stateModule, sessionModule, sourceScript, elementsModule, utilsModule, apiModule, adsModule, uiModule, syncService, workerEntry, corsModule, authModule, rateModule, paypalModule, healthRoute, adminRoute] = await Promise.all([
  read("index.html"),
  read("style.css"),
  read("script.js"),
  read("quicklink.json"),
  readFile(path.join(frontendDir, "index.html"), "utf8"),
  readFile(path.join(frontendDir, "style.css"), "utf8"),
  readFile(path.join(frontendDir, "quicklink.json"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "worker.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "config", "app.config.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "core", "state.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "services", "session.service.js"), "utf8"),
  readFile(path.join(frontendDir, "script.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "core", "elements.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "utils", "helpers.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "services", "api.service.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "services", "ads.service.js"), "utf8"),
  readFile(path.join(frontendDir, "src", "ui", "ui.service.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "services", "r2-sync.service.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "index.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "middleware", "cors.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "middleware", "auth.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "middleware", "rate-limit.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "services", "paypal.service.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "routes", "health.js"), "utf8"),
  readFile(path.resolve(frontendDir, "..", "backend", "src", "routes", "admin.js"), "utf8"),
]);

assert.equal(html, sourceHtml, "Built HTML must remain byte-identical to the legacy HTML.");
assert.equal(css, sourceCss, "Built CSS must remain byte-identical to the legacy CSS.");
assert.equal(quicklinks, sourceQuicklinks, "quicklink.json must remain byte-identical.");
assert.match(html, /href=["']\/style\.css["']/i, "HTML must reference the preserved CSS URL.");
assert.match(html, /src=["']\/script\.js["']/i, "HTML must reference the preserved JS URL.");

for (const token of ["refreshImages", "changeCategory", "openAnimeCollection", "paypalButtonsInstance", "zx_user_token", "ZXAION"]) {
  assert.ok(js.includes(token), `Bundled JS is missing compatibility token: ${token}`);
}

const activeRouteConditions = [
  /if\\s*\\(path === '\/api\/health' && method === 'GET'\\)/,
  /if\\s*\\(path === '\/api\/admin\/sync' && method === 'POST'\\)/,
  /if\\s*\\(path === '\/api\/paypal\/webhook' && method === 'POST'\\)/,
  /if\\s*\\(path === '\/api\/list' && method === 'GET'\\)/,
  /if\\s*\\(path === '\/api\/comitbase\/list' && method === 'GET'\\)/,
  /if\\s*\\(path === '\/api\/dtreasure\/list' && method === 'GET'\\)/,
  /if\\s*\\(path === '\/api\/trending' && method === 'GET'\\)/,
  /if\\s*\\(path.startsWith\('\/api\/stats\/'\) && method === 'GET'\\)/,
  /if\\s*\\(path.startsWith\('\/api\/view\/'\) && method === 'POST'\\)/,
  /if\\s*\\(path.startsWith\('\/api\/download\/'\) && method === 'POST'\\)/,
  /if\\s*\\(path === '\/api\/credits\/balance' && method === 'GET'\\)/,
  /if\\s*\\(path === '\/api\/credits\/purchase' && method === 'POST'\\)/,
  /if\\s*\\(path === '\/api\/credits\/spend' && method === 'POST'\\)/,
  /path.startsWith\('\/api\/img\/'\)/,
  /path.startsWith\('\/api\/comitbase\/img\/'\)/,
  /path.startsWith\('\/api\/dtreasure\/img\/'\)/,
];
for (const condition of activeRouteConditions) {
  assert.match(worker, condition, `Worker route condition missing or commented: ${condition}`);
}

for (const file of ["index.html", "style.css", "script.js", "quicklink.json"]) {
  const info = await stat(path.join(distDir, file));
  assert.ok(info.isFile() && info.size > 0, `Build output missing or empty: ${file}`);
}

assert.ok(configModule.includes("export const API_BASE"), "Config module must export API_BASE.");
assert.ok(configModule.includes("export const CREDIT_PACKS"), "Config module must export credit packs.");
assert.ok(configModule.includes("applyLegacyWindowConfig"), "Config module must apply legacy window maps.");
assert.ok(stateModule.includes("export class AppState") && stateModule.includes("export const state"), "State module exports are incomplete.");
assert.ok(sessionModule.includes("export const getOrCreateUserToken"), "Session token service export is missing.");
assert.ok(sourceScript.includes("./src/config/app.config.js"), "Legacy application must consume extracted config module.");
assert.ok(sourceScript.includes("./src/core/state.js"), "Legacy application must consume extracted state module.");
assert.ok(sourceScript.includes("./src/services/session.service.js"), "Legacy application must consume extracted session service.");
assert.ok(sourceScript.includes("./src/core/elements.js"), "Legacy application must consume extracted DOM module.");
assert.ok(sourceScript.includes("./src/utils/helpers.js"), "Legacy application must consume extracted utilities module.");
assert.ok(sourceScript.includes("./src/services/api.service.js"), "Legacy application must consume extracted API service.");
assert.ok(elementsModule.includes("export const elements"), "DOM elements module export is missing.");
assert.ok(utilsModule.includes("export const utils"), "Utilities module export is missing.");
assert.ok(apiModule.includes("export function createApiService") && apiModule.includes("return api;"), "API service factory is incomplete.");
assert.ok(!sourceScript.includes("const api = {"), "API service must be created through its extracted factory.");
assert.ok(sourceScript.includes("./src/services/ads.service.js"), "Application must consume extracted ads service.");
assert.ok(adsModule.includes("export const ads"), "Ads service export is missing.");
assert.ok(sourceScript.includes("./src/ui/ui.service.js"), "Application must consume extracted UI service.");
assert.ok(uiModule.includes("export function createUiService") && uiModule.includes("return ui;"), "UI service factory is incomplete.");
assert.ok(!sourceScript.includes("const ui = {"), "UI service must be created through its extracted factory.");
assert.ok(worker.includes("./src/services/r2-sync.service.js"), "Worker must import the extracted scheduled sync service.");
assert.ok(syncService.includes("export function parseImageMeta") && syncService.includes("export async function handleScheduled"), "R2 sync service exports are incomplete.");
assert.ok(workerEntry.includes("../worker.js"), "Stable Worker entry must preserve the legacy fetch/scheduled handler.");
assert.ok(worker.includes("./src/middleware/cors.js") && worker.includes("./src/middleware/auth.js") && worker.includes("./src/middleware/rate-limit.js"), "Worker middleware imports are incomplete.");
assert.ok(worker.includes("./src/services/paypal.service.js"), "Worker must import the PayPal service.");
assert.ok(corsModule.includes("export function createCorsHeaders"), "CORS middleware export is missing.");
assert.ok(authModule.includes("export function getUserToken"), "Auth middleware export is missing.");
assert.ok(rateModule.includes("export function createRateLimit"), "Rate-limit middleware export is missing.");
assert.ok(paypalModule.includes("export function createPayPalService"), "PayPal service export is missing.");
assert.ok(worker.includes("./src/routes/health.js") && worker.includes("./src/routes/admin.js"), "Worker route imports are incomplete.");
assert.ok(healthRoute.includes("export async function handleHealth"), "Health route handler export is missing.");
assert.ok(adminRoute.includes("export async function handleAdminSync"), "Admin sync route handler export is missing.");

console.log("Frontend verification passed: output assets, module extraction, compatibility globals, and Worker route contract.");
