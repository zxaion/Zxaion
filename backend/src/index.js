/**
 * Stable Wrangler entry point.
 *
 * The Worker adapter in ../worker.js delegates HTTP requests to src/router.js
 * and scheduled events to the extracted R2 synchronization service.
 * Keep this file as the single entry referenced by wrangler.toml.
 */
import worker from "../worker.js";

export default worker;
