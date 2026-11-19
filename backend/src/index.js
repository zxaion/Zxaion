/**
 * Stable modular Worker entry point.
 *
 * During the parity migration, the existing Worker implementation is kept
 * intact in ../worker.js and re-exported here. Route/service extraction can
 * now happen behind this stable entry without changing the Cloudflare entry
 * path again or altering the current fetch/scheduled behavior.
 */
import legacyWorker from "../worker.js";

export default legacyWorker;
