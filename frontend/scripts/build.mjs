// Build frontend: frontend/src → frontend/dist   (tanpa dependency, cukup Node.js)
//   dist/index.html     ← src/index.html + semua <!-- @include ... --> (partials)
//   dist/style.css      ← gabungan src/css/*.css  (urutan = manifest.json)
//   dist/script.js      ← gabungan src/js/**/*.js (urutan = manifest.json)
//   dist/quicklink.json ← salinan src/quicklink.json (divalidasi JSON)
// Nama file hasil build SAMA dengan sebelumnya, jadi key di R2 & worker tidak berubah.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB  = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const read = (rel) => {
  const file = join(WEB, rel);
  if (!existsSync(file)) throw new Error(`File tidak ditemukan: web/${rel}`);
  return readFileSync(file, 'utf8');
};

const INCLUDE = /^[ \t]*<!-- @include (\S+) -->[ \t]*$/;

function buildHtml() {
  return read('index.html')
    .split('\n')
    .map((line) => {
      const m = line.match(INCLUDE);
      return m ? read(m[1]).replace(/\n$/, '') : line;
    })
    .join('\n');
}

// Penanda "▸ nama-file" memudahkan mencari asal baris saat debugging di browser.
function bundle(files, marker) {
  return files.map((rel) => `${marker(rel)}\n${read(rel).replace(/\n*$/, '\n')}`).join('\n');
}

const manifest = JSON.parse(read('manifest.json'));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

writeFileSync(join(DIST, 'index.html'),  buildHtml());
writeFileSync(join(DIST, 'style.css'),   bundle(manifest.css, (f) => `/* ▸ ${f} */`));
writeFileSync(join(DIST, 'script.js'),   bundle(manifest.js,  (f) => `// ▸ ${f}`));

const quicklink = read('quicklink.json');
JSON.parse(quicklink);                       // gagal build jika JSON rusak
writeFileSync(join(DIST, 'quicklink.json'), quicklink);

console.log('Build selesai → dist/');
for (const f of ['index.html', 'style.css', 'script.js', 'quicklink.json']) {
  console.log(`  ${f.padEnd(15)} ${(readFileSync(join(DIST, f)).length / 1024).toFixed(1)} KB`);
}
