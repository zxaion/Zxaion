import test from "node:test";
import assert from "node:assert/strict";

import { parseImageMeta } from "../src/services/r2-sync.service.js";
import { createCorsHeaders } from "../src/middleware/cors.js";
import { getUserToken } from "../src/middleware/auth.js";
import { createRateLimit } from "../src/middleware/rate-limit.js";
import { createPayPalService } from "../src/services/paypal.service.js";
import { handleHealth } from "../src/routes/health.js";
import { handleAdminSync } from "../src/routes/admin.js";
import { handleTrending } from "../src/routes/trending.js";
import { handleImageStats } from "../src/routes/stats.js";
import { handleMainGallery, handleComitbaseGallery, handleDtreasureGallery } from "../src/routes/gallery.js";
import { handleRecordView, handleRecordDownload, handleCreditBalance } from "../src/routes/activity.js";
import { handlePayPalWebhook } from "../src/routes/paypal.js";
import { handleCreditPurchase, handleCreditSpend } from "../src/routes/credits.js";

test("parseImageMeta preserves the legacy image identity and URL contract", () => {
  const meta = parseImageMeta("ANIME/Demon Slayer/test-image.jpg", "main");
  assert.equal(meta.id, "main:ANIME/Demon Slayer/test-image.jpg");
  assert.equal(meta.category, "Anime");
  assert.equal(meta.sub_category, "demon slayer");
  assert.equal(meta.title, "Test Image");
  assert.equal(meta.url, "/api/img/ANIME%2FDemon%20Slayer%2Ftest-image.jpg");
});

test("parseImageMeta excludes unsupported and private/header objects", () => {
  assert.equal(parseImageMeta("HEADER/Anime.jpg", "main"), null);
  assert.equal(parseImageMeta("_private/secret.jpg", "main"), null);
  assert.equal(parseImageMeta("ANIME/poster.svg", "main"), null);
});

test("CORS preserves approved origin and fallback behavior", () => {
  const approved = createCorsHeaders(new Request("https://worker.test", {
    headers: { Origin: "https://zxaionverse.com" }
  }));
  assert.equal(approved["Access-Control-Allow-Origin"], "https://zxaionverse.com");
  assert.equal(approved["Access-Control-Allow-Methods"], "GET, HEAD, POST, OPTIONS, DELETE");

  const fallback = createCorsHeaders(new Request("https://worker.test", {
    headers: { Origin: "https://untrusted.example" }
  }));
  assert.equal(fallback["Access-Control-Allow-Origin"], "https://zxaion-verse.pages.dev");
});

test("auth middleware retains anonymous fallback and X-User-Token header", () => {
  assert.equal(getUserToken(new Request("https://worker.test")), "anonymous");
  assert.equal(getUserToken(new Request("https://worker.test", {
    headers: { "X-User-Token": "user-token-test" }
  })), "user-token-test");
});

test("rate limiter returns false above limit and true below limit", async () => {
  const DB = {
    prepare() {
      return {
        bind() {
          return {
            run: async () => ({}),
            first: async () => ({ count: 3 })
          };
        }
      };
    }
  };
  const check = createRateLimit(DB);
  assert.equal(await check("download", "visitor", 2), false);
  assert.equal(await check("download", "visitor", 3), true);
});

test("rate limiter preserves fail-open behavior on D1 errors", async () => {
  const DB = { prepare() { throw new Error("D1 unavailable"); } };
  const check = createRateLimit(DB);
  assert.equal(await check("download", "visitor"), true);
});

test("PayPal service rejects missing credentials without a network request", async () => {
  const service = createPayPalService({});
  await assert.rejects(service.getPayPalAccessToken(), /PayPal credentials not configured/);
});

test("PayPal order verification returns null for unsuccessful HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const service = createPayPalService({ clientId: "test", clientSecret: "test" });
    assert.equal(await service.verifyPayPalOrder("order-test", "token-test"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("health route returns connected status and preserves CORS headers", async () => {
  const response = await handleHealth({
    DB: { prepare: () => ({ first: async () => ({ success: true }) }) },
    corsHeaders: { "Access-Control-Allow-Origin": "https://zxaion-verse.pages.dev" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://zxaion-verse.pages.dev");
  assert.deepEqual(await response.json(), { status: "ok", db: "connected" });
});

test("health route reports D1 errors with HTTP 500", async () => {
  const response = await handleHealth({
    DB: { prepare: () => ({ first: async () => { throw new Error("D1 down"); } }) },
    corsHeaders: {}
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { status: "error", db: "disconnected", message: "D1 down" });
});

test("admin sync route rejects missing or incorrect admin token", async () => {
  let called = false;
  const response = await handleAdminSync({
    request: new Request("https://worker.test/api/admin/sync", { headers: { "X-Admin-Token": "wrong" } }),
    env: { ADMIN_TOKEN: "expected" },
    handleScheduled: async () => { called = true; },
    corsHeaders: {}
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("admin sync route invokes scheduled sync only after token validation", async () => {
  let called = false;
  const response = await handleAdminSync({
    request: new Request("https://worker.test/api/admin/sync", { headers: { "X-Admin-Token": "expected" } }),
    env: { ADMIN_TOKEN: "expected" },
    handleScheduled: async () => { called = true; },
    corsHeaders: {}
  });
  assert.equal(response.status, 200);
  assert.equal(called, true);
  assert.deepEqual(await response.json(), { success: true, message: "Sync completed" });
});


test("trending route clamps limits and maps D1 rows to the public image shape", async () => {
  let boundLimit = 0;
  const DB = {
    prepare() {
      return {
        bind(value) {
          boundLimit = value;
          return {
            all: async () => ({
              results: [{
                id: "main:folder/image.jpg",
                title: "Image",
                r2_key: "folder/image.jpg",
                bucket: "main",
                category: "Anime",
                sub_category: "series",
                view_count: 8,
                download_count: 2,
                score: 10
              }]
            })
          };
        }
      };
    }
  };
  const response = await handleTrending({
    url: new URL("https://worker.test/api/trending?limit=500"),
    DB,
    corsHeaders: {}
  });
  assert.equal(boundLimit, 50);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=120");
  assert.deepEqual(await response.json(), [{
    id: "main:folder/image.jpg",
    title: "Image",
    category: "Anime",
    subCategory: "series",
    url: "/api/img/folder%2Fimage.jpg",
    viewCount: 8,
    downloadCount: 2,
    score: 10
  }]);
});

test("image stats route decodes IDs and returns the existing response contract", async () => {
  let boundId = "";
  const DB = {
    prepare() {
      return {
        bind(value) {
          boundId = value;
          return { first: async () => ({ view_count: 17, download_count: 4 }) };
        }
      };
    }
  };
  const response = await handleImageStats({
    path: "/api/stats/main%3Afolder%2Fimage.jpg",
    DB,
    corsHeaders: {}
  });
  assert.equal(boundId, "main:folder/image.jpg");
  assert.deepEqual(await response.json(), { views: 17, downloads: 4 });
});


test("main gallery route preserves category filtering, pagination, and image mapping", async () => {
  let sql = "";
  let bindings = [];
  const DB = {
    prepare(query) {
      sql = query;
      return {
        bind(...values) {
          bindings = values;
          return { all: async () => ({ results: [{
            id: "main:anime/a.jpg",
            title: "A",
            category: "Anime",
            sub_category: "Series",
            r2_key: "anime/a.jpg",
            size: 123,
            uploaded: "2026-01-01",
            view_count: 9,
            download_count: 2
          }] }) };
        }
      };
    }
  };
  const response = await handleMainGallery({
    url: new URL("https://worker.test/api/list?page=2&limit=900&category=Anime"),
    DB,
    corsHeaders: {}
  });
  assert.match(sql, /bucket = 'main' AND category = \?/);
  assert.deepEqual(bindings, ["Anime", 500, 500]);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  assert.deepEqual(await response.json(), [{
    id: "main:anime/a.jpg",
    title: "A",
    category: "Anime",
    subCategory: "Series",
    url: "/api/img/anime%2Fa.jpg",
    size: 123,
    uploaded: "2026-01-01",
    path: "anime/a.jpg",
    viewCount: 9,
    downloadCount: 2
  }]);
});

test("COMITBASE gallery route keeps the missing-bucket empty response", async () => {
  const response = await handleComitbaseGallery({
    url: new URL("https://worker.test/api/comitbase/list"),
    DB: {},
    comitbaseBucket: null,
    corsHeaders: {}
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test("DTREASURE gallery route maps rows and keeps its private cache policy", async () => {
  let bindings = [];
  const DB = {
    prepare() {
      return {
        bind(...values) {
          bindings = values;
          return { all: async () => ({ results: [{
            id: "dtreasure:pack/a.png",
            title: "A",
            r2_key: "pack/a.png",
            uploaded: "2026-02-01",
            view_count: 4,
            download_count: 1
          }] }) };
        }
      };
    }
  };
  const response = await handleDtreasureGallery({
    url: new URL("https://worker.test/api/dtreasure/list?page=3&limit=100"),
    DB,
    treasureBucket: {},
    corsHeaders: {}
  });
  assert.deepEqual(bindings, [100, 200]);
  assert.equal(response.headers.get("Cache-Control"), "private, max-age=30");
  assert.deepEqual(await response.json(), [{
    id: "dtreasure:pack/a.png",
    title: "A",
    category: "DTREASURE",
    url: "/api/dtreasure/img/pack%2Fa.png",
    uploaded: "2026-02-01",
    viewCount: 4,
    downloadCount: 1
  }]);
});


test("view route records an asynchronous batch and returns 204", async () => {
  const statements = [];
  const pending = [];
  const rateCalls = [];
  const DB = {
    prepare(sql) {
      return { bind(...values) { return { sql, values }; } };
    },
    batch(items) {
      statements.push(...items);
      return Promise.resolve();
    }
  };
  const response = await handleRecordView({
    path: "/api/view/main%3Aimage.jpg",
    request: new Request("https://worker.test/api/view/main%3Aimage.jpg", { headers: { "X-User-Token": "visitor-1" } }),
    ctx: { waitUntil: promise => pending.push(promise) },
    DB,
    getUserToken: request => request.headers.get("X-User-Token") || "anonymous",
    checkRateLimit: async (...args) => { rateCalls.push(args); return true; },
    corsHeaders: {}
  });
  assert.equal(response.status, 204);
  assert.deepEqual(rateCalls, [["view", "visitor-1", 100, 3600]]);
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /UPDATE images SET view_count/);
  assert.deepEqual(statements[0].values, ["main:image.jpg"]);
  assert.equal(pending.length, 1);
  await Promise.all(pending);
});

test("download route enforces its rate limit and records a batch", async () => {
  let batchCount = 0;
  const DB = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    batch: async () => { batchCount++; }
  };
  const response = await handleRecordDownload({
    path: "/api/download/main%3Aimage.jpg",
    request: new Request("https://worker.test/api/download/main%3Aimage.jpg", { headers: { "X-User-Token": "visitor-2" } }),
    ctx: { waitUntil: promise => { void promise; } },
    DB,
    getUserToken: request => request.headers.get("X-User-Token") || "anonymous",
    checkRateLimit: async () => false,
    corsHeaders: {}
  });
  assert.equal(response.status, 429);
  assert.equal(batchCount, 0);
});

test("credit balance route returns the anonymous default without querying D1", async () => {
  const response = await handleCreditBalance({
    request: new Request("https://worker.test/api/credits/balance"),
    DB: { prepare() { throw new Error("must not query"); } },
    getUserToken: () => "anonymous",
    corsHeaders: {}
  });
  assert.deepEqual(await response.json(), { credits: 0, lifetime: false, purchased: [] });
});

test("credit balance route returns user credits and purchased image IDs", async () => {
  let queryCount = 0;
  const DB = {
    prepare(sql) {
      queryCount++;
      return {
        bind() {
          if (sql.includes("SELECT credits, lifetime")) {
            return { first: async () => ({ credits: 42, lifetime: 1 }) };
          }
          return { all: async () => ({ results: [{ photo_id: "main:a.jpg" }, { photo_id: "main:b.jpg" }] }) };
        }
      };
    }
  };
  const response = await handleCreditBalance({
    request: new Request("https://worker.test/api/credits/balance", { headers: { "X-User-Token": "visitor-3" } }),
    DB,
    getUserToken: request => request.headers.get("X-User-Token"),
    corsHeaders: {}
  });
  assert.equal(queryCount, 2);
  assert.deepEqual(await response.json(), { credits: 42, lifetime: true, purchased: ["main:a.jpg", "main:b.jpg"] });
});


test("PayPal webhook rejects invalid JSON before attempting verification", async () => {
  const response = await handlePayPalWebhook({
    request: new Request("https://worker.test/api/paypal/webhook", {
      method: "POST",
      body: "{invalid"
    }),
    DB: {},
    getPayPalAccessToken: async () => { throw new Error("must not run"); },
    verifyPayPalOrder: async () => { throw new Error("must not run"); },
    PAYPAL_WEBHOOK_ID: "webhook-test",
    PAYPAL_BASE: "https://api-m.paypal.com"
  });
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Invalid JSON");
});

test("PayPal webhook rejects requests missing required signature headers", async () => {
  const response = await handlePayPalWebhook({
    request: new Request("https://worker.test/api/paypal/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "event-test" })
    }),
    DB: {},
    getPayPalAccessToken: async () => { throw new Error("must not run"); },
    verifyPayPalOrder: async () => { throw new Error("must not run"); },
    PAYPAL_WEBHOOK_ID: "webhook-test",
    PAYPAL_BASE: "https://api-m.paypal.com"
  });
  assert.equal(response.status, 401);
  assert.equal(await response.text(), "Unauthorized");
});

test("credit purchase rejects anonymous users before reading payment data", async () => {
  const response = await handleCreditPurchase({
    request: new Request("https://worker.test/api/credits/purchase", { method: "POST", body: "not-json" }),
    DB: {},
    getUserToken: () => "anonymous",
    getPayPalAccessToken: async () => { throw new Error("must not run"); },
    verifyPayPalOrder: async () => { throw new Error("must not run"); },
    corsHeaders: {}
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, error: "Invalid user token" });
});

test("credit purchase validates pack and order ID before database access", async () => {
  const response = await handleCreditPurchase({
    request: new Request("https://worker.test/api/credits/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: "5$" })
    }),
    DB: { prepare() { throw new Error("must not query"); } },
    getUserToken: () => "visitor",
    getPayPalAccessToken: async () => { throw new Error("must not run"); },
    verifyPayPalOrder: async () => { throw new Error("must not run"); },
    corsHeaders: {}
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, error: "Missing pack or orderId" });
});

test("credit spend rejects anonymous users", async () => {
  const response = await handleCreditSpend({
    request: new Request("https://worker.test/api/credits/spend", { method: "POST", body: "{}" }),
    DB: {},
    getUserToken: () => "anonymous",
    corsHeaders: {}
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, error: "Authentication required" });
});

test("credit spend validates photo ID before database access", async () => {
  const response = await handleCreditSpend({
    request: new Request("https://worker.test/api/credits/spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }),
    DB: { prepare() { throw new Error("must not query"); } },
    getUserToken: () => "visitor",
    corsHeaders: {}
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, error: "Missing photoId" });
});
