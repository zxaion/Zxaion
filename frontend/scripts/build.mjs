// Build frontend: frontend/src → frontend/dist
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB  = join(ROOT, 'src'); // Tetap menggunakan 'src'
const DIST = join(ROOT, 'dist');

// 1. Definisikan regex INCLUDE agar tidak error
const INCLUDE = /<!-- @include (.*) -->/;

const read = (rel) => {
  const file = join(WEB, rel);
  if (!existsSync(file)) {
    // 2. Gunakan throw agar build gagal jika file penting hilang, 
    // tapi pesan errornya sudah benar menggunakan folder 'src'
    throw new Error(`File tidak ditemukan: ${rel} (mencari di ${WEB})`);
  }
  return readFileSync(file, 'utf8');
};

function buildHtml() {
  const content = read('index.html');
  return content
    .split('\n')
    .map((line) => {
      const m = line.match(INCLUDE);
      if (!m) return line;
      
      const includePath = m[1].trim();
      const partContent = read(includePath);
      
      // Menghapus newline di akhir file partial agar tidak ada gap antar section
      return partContent.replace(/\n$/, '');
    })
    .join('\n');
}

// Penanda "▸ nama-file" memudahkan debugging di browser.
function bundle(files, marker) {
  return files.map((rel) => {
    const content = read(rel);
    return `${marker(rel)}\n${content.replace(/\n*$/, '\n')}`;
  }).join('\n');
}

// Load manifest
const manifestRaw = read('manifest.json');
const manifest = JSON.parse(manifestRaw);

// Bersihkan dan siapkan folder dist
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Eksekusi Build
console.log('Memulai build...');

writeFileSync(join(DIST, 'index.html'),  buildHtml());
writeFileSync(join(DIST, 'style.css'),   bundle(manifest.css, (f) => `/* ▸ ${f} */`));
writeFileSync(join(DIST, 'script.js'),   bundle(manifest.js,  (f) => `// ▸ ${f}`));

const quicklink = read('quicklink.json');
JSON.parse(quicklink); // Validasi jika JSON rusak
writeFileSync(join(DIST, 'quicklink.json'), quicklink);

console.log('Build selesai → dist/');
for (const f of ['index.html', 'style.css', 'script.js', 'quicklink.json']) {
  const filePath = join(DIST, f);
  if (existsSync(filePath)) {
    const size = (readFileSync(filePath).length / 1024).toFixed(1);
    console.log(`  ${f.padEnd(15)} ${size} KB`);
  }
}
