import test from "node:test";
import assert from "node:assert/strict";

import { parseImageMeta } from "../src/services/r2-sync.service.js";
import { createCorsHeaders } from "../src/middleware/cors.js";
import { getUserToken } from "../src/middleware/auth.js";
import { createRateLimit } from "../src/middleware/rate-limit.js";
import { createPayPalService } from "../src/services/paypal.service.js";

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
