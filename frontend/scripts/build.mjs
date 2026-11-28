// Build frontend: frontend/src → frontend/dist
//   dist/index.html     ← src/index.html + semua <!-- @include ... --> (partials, mendukung LF & CRLF)
//   dist/style.css      ← hasil kompilasi Tailwind CSS v4 (@tailwindcss/typography) + src/css/*.css
//   dist/script.js      ← CREDIT_PACK_DEFINITIONS + gabungan src/js/**/*.js (urutan = manifest.json)
//   dist/quicklink.json ← salinan src/quicklink.json (divalidasi JSON)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { CREDIT_PACK_DEFINITIONS } from '../../backend/src/config/packs.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(SCRIPT_DIR, '..');
const REPO_ROOT  = join(ROOT, '..');
const WEB        = join(ROOT, 'src');
const PUBLIC_DIR = join(ROOT, 'public');
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

export function minifyCss(css) {
  if (!css || typeof css !== 'string') return '';
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([\{\}\:\;\,\>])\s*/g, '$1')
    .replace(/\;(?=\})/g, '')
    .trim();
}

export function minifyJs(code) {
  if (!code || typeof code !== 'string') return '';
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < n && code[i] !== '\n' && code[i] !== '\r') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += quote;
      i++;
      while (i < n) {
        const c = code[i];
        out += c;
        if (c === '\\') {
          i++;
          if (i < n) out += code[i];
        } else if (c === quote) {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    if (ch === '`') {
      out += '`';
      i++;
      while (i < n) {
        const c = code[i];
        out += c;
        if (c === '\\') {
          i++;
          if (i < n) out += code[i];
        } else if (c === '`') {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    if (ch === '/') {
      const prevNonWhitespace = out.trimEnd().slice(-1);
      const isRegex = /[\(\[\{\=\,\:\;\!\&\|\?\+\-\*\/]/.test(prevNonWhitespace) || out.trimEnd().endsWith('return');
      if (isRegex) {
        out += '/';
        i++;
        while (i < n) {
          const c = code[i];
          out += c;
          if (c === '\\') {
            i++;
            if (i < n) out += code[i];
          } else if (c === '/') {
            i++;
            while (i < n && /[a-z]/i.test(code[i])) {
              out += code[i];
              i++;
            }
            break;
          }
          i++;
        }
        continue;
      }
    }

    if (ch === ' ' || ch === '\t') {
      const last = out.slice(-1);
      if (last && /[a-zA-Z0-9_\$]/.test(last)) {
        let peek = i + 1;
        while (peek < n && (code[peek] === ' ' || code[peek] === '\t')) peek++;
        if (peek < n && /[a-zA-Z0-9_\$]/.test(code[peek])) {
          out += ' ';
        }
      }
      i++;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      while (i < n && (code[i] === '\n' || code[i] === '\r' || code[i] === ' ' || code[i] === '\t')) i++;
      const last = out.slice(-1);
      if (last && last !== '\n' && last !== '{' && last !== ';' && last !== ',') {
        out += '\n';
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out.trim();
}

function resolveTailwindExecution() {
  const bins = process.platform === 'win32' ? ['tailwindcss.cmd', 'tailwindcss'] : ['tailwindcss'];
  const candidates = [
    ...bins.map(b => ({ bin: join(ROOT, 'node_modules', '.bin', b), cwd: ROOT })),
    ...bins.map(b => ({ bin: join(REPO_ROOT, 'node_modules', '.bin', b), cwd: REPO_ROOT })),
  ];
  for (const c of candidates) {
    if (existsSync(c.bin)) return { command: c.bin, argsPrefix: [], cwd: c.cwd };
  }
  return {
    command:    'npx',
    argsPrefix: ['--yes', '@tailwindcss/cli'],
    cwd:        existsSync(join(ROOT, 'node_modules')) ? ROOT : REPO_ROOT,
  };
}

function buildTailwindCss() {
  const entryPath  = join(WEB, 'css', 'tailwind.entry.css');
  const outPath    = join(DIST, '.tailwind.generated.css');
  const execConfig = resolveTailwindExecution();

  try {
    execFileSync(execConfig.command, [...execConfig.argsPrefix, '-i', entryPath, '-o', outPath, '--minify'], {
      cwd:   execConfig.cwd,
      stdio: 'pipe',
    });
  } catch (err) {
    throw new Error(`Tailwind CLI build gagal: ${err.message}`);
  }

  if (!existsSync(outPath)) {
    throw new Error('File output Tailwind CSS tidak berhasil dibuat.');
  }

  const compiled = readFileSync(outPath, 'utf8');
  rmSync(outPath, { force: true });
  return compiled;
}

function escapeXmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateBuildSitemapXml({ siteOrigin = 'https://zxaionverse.site', constantsSource = null } = {}) {
  const base = String(siteOrigin || 'https://zxaionverse.site').replace(/\/+$/, '');
  const src = constantsSource ?? read('js/config/constants.js');
  const sandbox = { window: undefined };
  vm.runInNewContext(`${src}\n;this.__CATS__ = CATEGORIES; this.__ALBUMS__ = ANIME_SUB_ALBUMS;`, sandbox);

  const categories = Array.isArray(sandbox.__CATS__) ? sandbox.__CATS__ : [];
  const albums = Array.isArray(sandbox.__ALBUMS__) ? sandbox.__ALBUMS__ : [];
  const today = new Date().toISOString().split('T')[0];

  const entries = [
    { loc: `${base}/`, changefreq: 'daily', priority: '1.0' },
  ];

  for (const cat of categories) {
    if (!cat || cat === 'All') continue;
    entries.push({
      loc: `${base}/?cat=${encodeURIComponent(cat)}`,
      changefreq: 'daily',
      priority: '0.8',
    });
  }

  for (const album of albums) {
    if (!album) continue;
    entries.push({
      loc: `${base}/?cat=Anime&album=${encodeURIComponent(album)}`,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  const urlBlocks = entries.map((e) => [
    '  <url>',
    `    <loc>${escapeXmlAttr(e.loc)}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${e.changefreq}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
    '  </url>',
  ].join('\n'));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlBlocks,
    '</urlset>',
    '',
  ].join('\n');
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
  const fullCss     = `${tailwindCss}\n\n${customCss}`;
  const minifiedCss = minifyCss(fullCss);

  const packsBanner = `window.__ZX_CREDIT_PACKS__=${JSON.stringify(CREDIT_PACK_DEFINITIONS)};\n`;
  const rawJs       = packsBanner + bundle(manifest.js, () => '');
  const minifiedJs  = minifyJs(rawJs);

  writeFileSync(join(DIST, 'index.html'), buildHtmlFromDisk());
  writeFileSync(join(DIST, 'style.css'),  minifiedCss);
  writeFileSync(join(DIST, 'script.js'),  minifiedJs);

  const quicklink = read('quicklink.json');
  JSON.parse(quicklink);
  writeFileSync(join(DIST, 'quicklink.json'), quicklink);

  const assetsSrcDir = join(WEB, 'assets');
  if (existsSync(assetsSrcDir)) {
    cpSync(assetsSrcDir, join(DIST, 'assets'), { recursive: true });
  }

  if (existsSync(PUBLIC_DIR)) {
    cpSync(PUBLIC_DIR, DIST, { recursive: true });
  }

  const siteOrigin = process.env.SITE_URL || 'https://zxaionverse.site';
  writeFileSync(join(DIST, 'sitemap.xml'), generateBuildSitemapXml({ siteOrigin }));

  console.log('Build selesai → dist/');
  for (const f of ['index.html', 'style.css', 'script.js', 'quicklink.json', '_redirects', '_headers', '404.html', 'robots.txt', 'sitemap.xml', 'favicon.ico']) {
    const outFile = join(DIST, f);
    if (existsSync(outFile)) {
      console.log(`  ${f.padEnd(15)} ${(readFileSync(outFile).length / 1024).toFixed(1)} KB`);
    }
  }
}

function buildHtmlFromDisk() {
  return resolveHtmlIncludes(read('index.html'), read);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runFrontendBuild();
}
