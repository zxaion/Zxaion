# Security Summary

**Reviewed Files**: 28
**Issues Resolved**: 7

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Paid Media Protection | `backend/src/routes/media.js` | 99-156 | If a DTREASURE item lacked a `_preview/` file in R2 (or image transform failed / wasn't requested), the route fell back to serving the unwatermarked full-resolution original file to unpurchased callers and also accepted `userToken` in URL query strings. | High | Fixed | Removed query-string token fallback, added object-key path validation, forced low-resolution blurred previews when `_preview/` is absent, and enforced fail-closed `403` responses if preview protection cannot be applied. |
| Payment Order Recovery | `backend/src/routes/credits.js` & `backend/src/routes/paypalWebhook.js` | 295 / 97 | A previously `'failed'` record in `payment_orders` caused `ON CONFLICT(id) DO NOTHING` (or webhook skip) to reject legitimate retries with `409` or skip crediting paid orders. | High | Fixed | Updated atomic claim queries in both `/api/credits/purchase` and `/api/paypal/webhook` to reclaim `'failed'` rows while remaining strictly idempotent against `'processing'` and `'completed'` orders. |
| Content Security Policy & CORS | `backend/src/config/security.js` & `backend/src/config/constants.js` | 6-22 / 13-17 | Worker CSP omitted PayPal's CDN (`www.paypalobjects.com` / `*.paypal.com`) and `ALLOWED_ORIGINS` omitted `www.` subdomains (`www.zxaionverse.com`, `www.zxaionverse.site`). | High | Fixed | Added PayPal SDK asset/subdomain origins to CSP directives and added `www.` + worker domains to `ALLOWED_ORIGINS`. |
| Credit Spend Item Verification | `backend/src/routes/credits.js` | 418 | `/api/credits/spend` deducted 10 credits without verifying that `photoId` belonged to an active DTREASURE item in D1. | Medium | Fixed | Verified `photoId` exists in `images` with `bucket = 'dtreasure'` before deducting credits, and added per-endpoint rate limits (`purchase`, `spend`, `recovery_create`). |
| Weak Token & Balance Error Handling | `backend/src/utils/userToken.js` & `backend/src/routes/credits.js` | 3 / 38 | `getUserToken` accepted short predictable strings, and `/api/credits/balance` returned HTTP `200` with `credits: 0` on DB error, wiping UI state. | Medium | Fixed | Enforced `/^[A-Za-z0-9._-]{8,128}$/` token validation and returned HTTP `500` on balance DB errors. |
| Account Recovery UI Refresh | `frontend/src/js/services/api-credits.js` | 101 | After restoring an account with a recovery code, the frontend called nonexistent `ui.renderDtreasure()` instead of `ui.renderDtreasureGallery()`. | Medium | Fixed | Updated to `ui.renderDtreasureGallery()`, invalidated sort cache, and unlocked any currently open image modal. |
| Double-Spend & PayPal SDK Wait | `frontend/src/js/ui/download.js` & `frontend/src/js/integrations/paypal.js` | 6 / 8 | Rapid double-clicks could submit parallel `/api/credits/spend` calls, and deferred PayPal SDK timed out after only 2.4s on slow networks. | Medium | Fixed | Added per-item `_spendingPhotoIds` lock, clean URL encoding/extension handling, and a 7.5s PayPal SDK wait with loading feedback. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Secrets & Credentials | `backend/wrangler.toml`, `.env.example` | PayPal secrets (`PAYPAL_CLIENT_SECRET_ID`, `PAYPAL_WEBHOOK_ID`) and `ADMIN_TOKEN` are never stored in code or `wrangler.toml`; read from runtime environment secrets. |
| Server-Side Payment Pricing | `backend/src/config/packs.js`, `backend/src/routes/credits.js` | Pack prices, USD currency, capture `COMPLETED` status, and `custom_id` ownership are verified against PayPal API before crediting. |
| Webhook Verification | `backend/src/routes/paypalWebhook.js` | Enforces required PayPal headers, restricts `paypal-cert-url` to trusted `https:` PayPal hostnames, and verifies signatures via `/v1/notifications/verify-webhook-signature`. |
| Atomic Credit Deduction | `backend/src/routes/credits.js` | Deducts credits atomically with `UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10` to prevent negative balances on concurrent requests. |
| Database Queries | `backend/src/routes/*.js` | All D1 SQL queries use bound parameters (`?`) with no string-interpolated user values. |
| Account Recovery & Rate Limiting | `backend/src/routes/credits.js`, `backend/src/services/rateLimit.js` | Recovery codes are generated with `crypto.getRandomValues`, stored only as SHA-256 hashes, and guarded by D1-backed rate limiting. |

## PoC Verification

### 1. Unpurchased DTREASURE Missing-Preview Bypass Prevention
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Access Guard / Unprotected Media Fallback |
| Impact | High |
| Affected File | `backend/src/routes/media.js:100-156` |
| Test Scenario | `GET /api/dtreasure/img/vault%2Fno_preview_yet.jpg` without `_preview/` asset in R2 and without `IMAGES` binding, plus `?download=true&userToken=<owner>` |

#### How It Was Fixed
Removed URL query `userToken` fallback, validated R2 keys against traversal characters, enforced blurred low-resolution transforms if `_preview/` is absent, and failed closed with `403` whenever preview protection cannot be applied.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Anonymous request hits `handleServeImage` for `/api/dtreasure/img/vault%2Fno_preview_yet.jpg` | `isDtreasure = true`, `authorizedDtreasure = false` |
| 2 | `bucket.get('_preview/vault/no_preview_yet.jpg')` returns `null`, setting `mustProtectOriginal = true` | Raw original marked protected |
| 3 | Without `IMAGES` transform available, execution hits fail-closed guard at `media.js:173` | **Blocked with HTTP 403** (`TOP_SECRET_4K_RAW_BYTES` never sent) |
| 4 | Download request with `?download=true&userToken=<owner>` (no `X-User-Token` header) hits `media.js:61-75` | **Blocked with HTTP 401** |

#### Conclusion
**Fix Verified** - Verified by automated tests (`npm test`, tests 19–20); unpurchased DTREASURE assets never leak unwatermarked full-resolution originals even if `_preview/` is missing or transform fails.

### 2. Failed PayPal Order Retry & Recovery
#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Retry Idempotency Lockout |
| Impact | High |
| Affected File | `backend/src/routes/credits.js:295`, `backend/src/routes/paypalWebhook.js:97` |
| Test Scenario | `POST /api/credits/purchase` on `ORD-RETRY-1` after an initial transient PayPal verification failure (`status = 'failed'`) |

#### How It Was Fixed
Updated `INSERT INTO payment_orders ... ON CONFLICT(id) DO UPDATE ... WHERE payment_orders.status = 'failed'` in both purchase and webhook handlers so transient failures can be reclaimed while `'processing'` and `'completed'` orders remain locked against double-crediting.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | First verification attempt receives `null` from PayPal and records `status = 'failed'` | Failure recorded safely |
| 2 | Retry arrives with `COMPLETED` `$5.00 USD` PayPal order | PayPal capture verified |
| 3 | Atomic claim updates row from `'failed'` to `'processing'`, grants 200 credits, sets `'completed'` | **Credited Exactly Once (200 credits)** |

#### Conclusion
**Fix Verified** - Verified by automated tests (`npm test`, test 20); failed payment verifications no longer lock paying users out of their credits on retry.
