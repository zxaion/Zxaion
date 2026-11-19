import test from "node:test";
import assert from "node:assert/strict";

import {
  API_BASE,
  ITEMS_PER_PAGE,
  CATEGORIES,
  ANIME_SUB_ALBUMS,
  CREDIT_PACKS,
  applyLegacyWindowConfig
} from "../src/config/app.config.js";
import { AppState } from "../src/core/state.js";
import { getOrCreateUserToken } from "../src/services/session.service.js";

test("frontend configuration retains existing API and gallery values", () => {
  assert.equal(API_BASE, "https://ai.zxaionverse.workers.dev");
  assert.equal(ITEMS_PER_PAGE, 30);
  assert.deepEqual(CATEGORIES, ["All", "Anime", "Fantasy", "Abstract", "Photography", "COMITBASE", "DTREASURE", "ZMEME", "OVERLAY"]);
  assert.ok(ANIME_SUB_ALBUMS.includes("GENSHIN"));
  assert.ok(ANIME_SUB_ALBUMS.includes("ORIGINAL"));
  assert.equal(CREDIT_PACKS["125$"].credits, "lifetime");
});

test("legacy window image, logo, and icon maps are applied without renaming keys", () => {
  const target = {};
  applyLegacyWindowConfig(target);
  assert.equal(target.headerBackgrounds.All, `${API_BASE}/api/img/HEADER/Home.jpg`);
  assert.equal(target.categoryThumbnails.DTREASURE, `${API_BASE}/api/img/HEADER/Dtreasure1.jpg`);
  assert.equal(target.animeAlbumThumbnails.GENSHIN, `${API_BASE}/api/img/HEADER/1Genshin.jpg`);
  assert.equal(target.customLogo.alt, "ZXAION VERSE Logo");
  assert.equal(target.customIcons.enabled, true);
});

test("AppState retains legacy defaults and pagination reset behavior", () => {
  const state = new AppState();
  assert.equal(state.currentCategory, "All");
  assert.equal(state.currentPage, 1);
  assert.equal(state.currentComitbasePage, 1);
  assert.equal(state.currentDtreasurePage, 1);
  assert.deepEqual(state.allPhotos, []);
  assert.ok(state.purchasedImages instanceof Set);

  state.currentPage = 4;
  state.currentComitbasePage = 3;
  state.currentDtreasurePage = 2;
  state.resetPagination();
  assert.equal(state.currentPage, 1);
  assert.equal(state.currentComitbasePage, 1);
  assert.equal(state.currentDtreasurePage, 1);
});

test("session service remains exported for the original browser token flow", () => {
  assert.equal(typeof getOrCreateUserToken, "function");
});
