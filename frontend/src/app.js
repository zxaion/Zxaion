/**
 * Browser bundle entry for esbuild.
 *
 * script.js is now the compatibility composition layer: it imports the
 * extracted config, core, service, and UI modules while preserving the
 * deployed /script.js asset URL and existing window-level entry points.
 */
import "../script.js";
