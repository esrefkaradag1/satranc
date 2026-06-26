/**
 * Tarayıcı dışı: Stockfish worker dosyalarının varlığını ve boyutunu kontrol eder.
 * Tam analiz testi tarayıcıda çalışır; bu script eksik asset / deploy sorunlarını yakalar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stockfishDir = path.join(root, 'public', 'stockfish');

const candidates = [
  'stockfish-18-lite-single.js',
  'stockfish.wasm.js',
  'stockfish.js',
];

console.log('=== Motor dosya kontrolü ===\n');

let ok = true;
for (const name of candidates) {
  const p = path.join(stockfishDir, name);
  if (!fs.existsSync(p)) {
    console.log(`✗ Eksik: public/stockfish/${name}`);
    ok = false;
    continue;
  }
  const stat = fs.statSync(p);
  const kb = (stat.size / 1024).toFixed(1);
  console.log(`✓ public/stockfish/${name} (${kb} KB)`);
}

console.log('\n=== Notlar ===');
console.log('- Analiz paneli tarayıcıda Stockfish Web Worker kullanır (CLOUD değil, yerel).');
console.log('- Mat pozisyonlarında 2. ve 3. satır boş kalabilir; bu çökme değildir.');
console.log('- Motor çökerse konsolda [AnalysisEngine] logları ve otomatik yeniden başlatma görülür.');
console.log('- Sayfayı yenileyin; hâlâ sorun varsa Ayarlar → motor tipini wasm/lite değiştirin.\n');

process.exit(ok ? 0 : 1);
