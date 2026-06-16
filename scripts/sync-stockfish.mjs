/**
 * Stockfish Senkronizasyon Betiği
 * Hem Stockfish 18 (npm: stockfish) hem de Stockfish.js (npm: stockfish.js)
 * paketlerinden gerekli .js ve .wasm dosyalarını public/stockfish içine kopyalar.
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = join(root, 'public', 'stockfish');

// 1. Stockfish 18 (npm: stockfish) paketinden dosyalar
const sf18Bin = join(root, 'node_modules', 'stockfish', 'bin');
const sf18Files = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

// 2. Stockfish.js (npm: stockfish.js) paketinden dosyalar
const sfJsPkg = join(root, 'node_modules', 'stockfish.js');
const sfJsFiles = ['stockfish.js', 'stockfish.wasm.js', 'stockfish.wasm'];

mkdirSync(destDir, { recursive: true });

function syncFiles(srcDir, fileList, label) {
  if (!existsSync(srcDir)) {
    console.warn(`[sync-stockfish] ${label} dizini bulunamadı: ${srcDir}`);
    return;
  }
  for (const name of fileList) {
    const src = join(srcDir, name);
    if (existsSync(src)) {
      copyFileSync(src, join(destDir, name));
    } else {
      console.warn(`[sync-stockfish] Eksik dosya: ${src}`);
    }
  }
  console.log(`[sync-stockfish] ${label} dosyaları kopyalandı.`);
}

syncFiles(sf18Bin, sf18Files, 'Stockfish 18');
syncFiles(sfJsPkg, sfJsFiles, 'Stockfish.js');

console.log('[sync-stockfish] Bitti →', destDir);
