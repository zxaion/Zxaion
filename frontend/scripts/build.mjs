// Build frontend: frontend/src → frontend/dist
//   dist/index.html     ← src/index.html + semua <!-- @include ... --> (partials, mendukung LF & CRLF)
//   dist/style.css      ← hasil kompilasi Tailwind CSS v4 (@tailwindcss/typography) + src/css/*.css
//   dist/script.js      ← CREDIT_PACK_DEFINITIONS + gabungan src/js/**/*.js (urutan = manifest.json)
//   dist/quicklink.json ← salinan src/quicklink.json (divalidasi JSON)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CREDIT_PACK_DEFINITIONS } from '../../backend/src/config/packs.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(SCRIPT_DIR, '..');
const REPO_ROOT  = join(ROOT, '..');
const WEB        = join(ROOT, 'src');
const DIST       = join(ROOT, 'dist');

export const INCLUDE_RE = /^[ \t]*<!-- @include (\S+) -->[ \t]*$/;

export function resolveHtmlIncludes(rawHtml, readFn) {
  return String(rawHtml)
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(INCLUDE_RE);
      return m ? readFn(m[1]).replace(/\r?\n$/, '') : line;
    })
    .join('\n');
}

const read = (rel) => {
  const file = join(WEB, rel);
  if (!existsSync(file)) throw new Error(`File tidak ditemukan: src/${rel}`);
  return readFileSync(file, 'utf8');
};

function checkFiles(files) {
  const missing = [...new Set(files)].filter((rel) => !existsSync(join(WEB, rel)));
  if (missing.length) {
    console.error(`\n${missing.length} file tidak ditemukan di frontend/src:`);
    for (const rel of missing) console.error(`  - ${rel}`);
    process.exit(1);
  }
}

function bundle(files, marker) {
  return files.map((rel) => `${marker(rel)}\n${read(rel).replace(/\r?\n*$/, '\n')}`).join('\n');
}

function buildTailwindCss() {
  const entryPath = join(WEB, 'css', 'tailwind.entry.css');
  const outPath   = join(DIST, '.tailwind.generated.css');
  const cliBin    = join(REPO_ROOT, 'node_modules', '.bin', 'tailwindcss');

  if (!existsSync(cliBin)) {
    throw new Error('Tailwind CLI binary tidak ditemukan. Jalankan npm install terlebih dahulu.');
  }

  execFileSync(cliBin, ['-i', entryPath, '-o', outPath, '--minify'], {
    cwd:   REPO_ROOT,
    stdio: 'pipe',
  });
  const compiled = readFileSync(outPath, 'utf8');
  rmSync(outPath, { force: true });
  return compiled;
}

export function runFrontendBuild() {
  const manifest = JSON.parse(read('manifest.json'));
  const includes = read('index.html')
    .split(/\r?\n/)
    .map((l) => l.match(INCLUDE_RE)?.[1])
    .filter(Boolean);

  checkFiles(['index.html', 'quicklink.json', 'css/tailwind.entry.css', ...includes, ...manifest.css, ...manifest.js]);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const tailwindCss = buildTailwindCss();
  const customCss   = bundle(manifest.css, (f) => `/* ▸ ${f} */`);
  const packsBanner = `// ▸ single-source credit packs (backend/src/config/packs.js)\nwindow.__ZX_CREDIT_PACKS__ = ${JSON.stringify(CREDIT_PACK_DEFINITIONS)};\n\n`;

  writeFileSync(join(DIST, 'index.html'), buildHtmlFromDisk());
  writeFileSync(join(DIST, 'style.css'),  `/* ▸ tailwind v4 + @tailwindcss/typography */\n${tailwindCss}\n\n${customCss}`);
  writeFileSync(join(DIST, 'script.js'),  packsBanner + bundle(manifest.js, (f) => `// ▸ ${f}`));

  const quicklink = read('quicklink.json');
  JSON.parse(quicklink);
  writeFileSync(join(DIST, 'quicklink.json'), quicklink);

  console.log('Build selesai → dist/');
  for (const f of ['index.html', 'style.css', 'script.js', 'quicklink.json']) {
    console.log(`  ${f.padEnd(15)} ${(readFileSync(join(DIST, f)).length / 1024).toFixed(1)} KB`);
  }
}

function buildHtmlFromDisk() {
  return resolveHtmlIncludes(read('index.html'), read);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runFrontendBuild();
}
