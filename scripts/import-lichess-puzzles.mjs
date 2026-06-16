#!/usr/bin/env node
/**
 * Lichess Puzzle Veritabanı Import Script
 *
 * Kullanım:
 *   1) CSV'yi indir: https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   2) Aç:  unzstd lichess_db_puzzle.csv.zst   (veya .bz2 varsa bunzip2)
 *   3) Çalıştır:
 *        node scripts/import-lichess-puzzles.mjs lichess_db_puzzle.csv
 *
 * Opsiyonel argümanlar:
 *   --count=1000        Kaç bulmaca import edilecek (varsayılan 500)
 *   --min-rating=800    Minimum rating (varsayılan 600)
 *   --max-rating=2800   Maksimum rating (varsayılan 2800)
 *   --themes=fork,pin   Sadece bu temaları içerenleri al (virgülle ayrılmış)
 *   --output=puzzles.json  Çıktı dosyası (varsayılan public/lichess-puzzles.json)
 *   --balanced           Her zorluk seviyesinden eşit sayıda al
 */

import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const THEME_TR = {
  mate: 'Mat',
  mateIn1: '1 Hamlede Mat',
  mateIn2: '2 Hamlede Mat',
  mateIn3: '3 Hamlede Mat',
  mateIn4: '4 Hamlede Mat',
  mateIn5: '5+ Hamlede Mat',
  fork: 'Çatal',
  pin: 'Tutuş',
  skewer: 'Şiş',
  discoveredAttack: 'Açma',
  doubleCheck: 'Çift Şah',
  sacrifice: 'Fedâ',
  deflection: 'Saptırma',
  decoy: 'Tuzak',
  interference: 'Engelleme',
  clearance: 'Temizleme',
  backRankMate: 'Sırt Sıra Matı',
  smotheredMate: 'Boğma Mat',
  hookMate: 'Kanca Mat',
  anastasiaMate: 'Anastasia Matı',
  arabianMate: 'Arap Matı',
  doubleBishopMate: 'Çift Fil Matı',
  promotion: 'Terfi',
  underPromotion: 'Alt Terfi',
  castling: 'Rok',
  enPassant: 'Geçerken Alma',
  endgame: 'Oyun Sonu',
  middlegame: 'Orta Oyun',
  opening: 'Açılış',
  pawnEndgame: 'Piyon Finali',
  rookEndgame: 'Kale Finali',
  bishopEndgame: 'Fil Finali',
  knightEndgame: 'At Finali',
  queenEndgame: 'Vezir Finali',
  queenRookEndgame: 'Vezir-Kale Finali',
  crushing: 'Ezici',
  advantage: 'Avantaj',
  equality: 'Eşitlik',
  defensiveMove: 'Savunma Hamlesi',
  attackingMove: 'Atak Hamlesi',
  quietMove: 'Sessiz Hamle',
  zugzwang: 'Zugzwang',
  intermezzo: 'Ara Hamle',
  trappedPiece: 'Tuzağa Düşmüş Taş',
  hangingPiece: 'Asılı Taş',
  kingsideAttack: 'Şah Kanadı Atağı',
  queensideAttack: 'Vezir Kanadı Atağı',
  capturingDefender: 'Savunucuyu Yeme',
  exposedKing: 'Açık Şah',
  short: 'Kısa',
  long: 'Uzun',
  veryLong: 'Çok Uzun',
  oneMove: 'Tek Hamle',
  master: 'Usta',
  masterVsMaster: 'Usta vs Usta',
  superGM: 'Süper GM',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    csvPath: '',
    count: 500,
    minRating: 600,
    maxRating: 2800,
    themes: [],
    output: resolve(ROOT, 'public/lichess-puzzles.json'),
    balanced: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--count=')) opts.count = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--min-rating=')) opts.minRating = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--max-rating=')) opts.maxRating = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--themes=')) opts.themes = arg.split('=')[1].split(',');
    else if (arg.startsWith('--output=')) opts.output = resolve(arg.split('=')[1]);
    else if (arg === '--balanced') opts.balanced = true;
    else if (!arg.startsWith('--')) opts.csvPath = resolve(arg);
  }

  return opts;
}

function ratingToDifficulty(r) {
  if (r < 1200) return 'Kolay';
  if (r < 1800) return 'Orta';
  return 'Zor';
}

function ratingToPoints(r) {
  if (r < 1000) return 5;
  if (r < 1200) return 10;
  if (r < 1500) return 15;
  if (r < 1800) return 20;
  if (r < 2100) return 30;
  return 50;
}

function translateThemes(themes) {
  const parts = themes.split(' ').filter(Boolean);
  const translated = parts.map(t => THEME_TR[t] || t);

  const matTheme = parts.find(t => t.startsWith('mateIn'));
  if (matTheme) return { category: 'Mat', theme: translated.join(', ') };

  const tactical = ['fork', 'pin', 'skewer', 'discoveredAttack', 'sacrifice', 'deflection', 'decoy'];
  const found = parts.find(t => tactical.includes(t));
  if (found) return { category: THEME_TR[found] || 'Taktik', theme: translated.join(', ') };

  const phase = parts.find(t => ['endgame', 'middlegame', 'opening'].includes(t));
  if (phase) return { category: THEME_TR[phase] || 'Genel', theme: translated.join(', ') };

  return { category: 'Genel', theme: translated.join(', ') };
}

function parseLine(line) {
  const p = line.split(',');
  if (p.length < 8 || p[0] === 'PuzzleId') return null;

  const rating = parseInt(p[3], 10);
  if (isNaN(rating)) return null;

  return {
    PuzzleId: p[0],
    FEN: p[1],
    Moves: p[2],
    Rating: rating,
    Popularity: parseInt(p[5], 10) || 0,
    NbPlays: parseInt(p[6], 10) || 0,
    Themes: p[7] || '',
    GameUrl: p[8] || '',
  };
}

function rowToPuzzle(row) {
  const { category, theme } = translateThemes(row.Themes);
  const difficulty = ratingToDifficulty(row.Rating);
  const moves = row.Moves.split(' ');
  const firstMove = moves[0];
  const solutionMoves = moves.slice(1);

  const themeLabels = row.Themes.split(' ').filter(Boolean);
  const matMatch = themeLabels.find(t => t.startsWith('mateIn'));
  let title = '';
  if (matMatch) {
    title = THEME_TR[matMatch] || matMatch;
  } else {
    title = THEME_TR[themeLabels[0]] || themeLabels[0] || 'Bulmaca';
  }
  title += ` (${row.Rating})`;

  return {
    id: row.PuzzleId,
    fen: row.FEN,
    solution: solutionMoves,
    title,
    difficulty,
    points: ratingToPoints(row.Rating),
    category,
    theme,
    hint: firstMove,
    lichessUrl: `https://lichess.org/training/${row.PuzzleId}`,
    rating: row.Rating,
    popularity: row.Popularity,
    nbPlays: row.NbPlays,
  };
}

async function main() {
  const opts = parseArgs();

  if (!opts.csvPath) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Lichess Bulmaca Import Aracı                      ║
╚══════════════════════════════════════════════════════════════╝

Kullanım:
  1) CSV'yi indir:
     https://database.lichess.org/lichess_db_puzzle.csv.zst

  2) Aç (zstd gerekli):
     unzstd lichess_db_puzzle.csv.zst
     VEYA bz2 için: bunzip2 lichess_db_puzzle.csv.bz2

  3) Script'i çalıştır:
     node scripts/import-lichess-puzzles.mjs lichess_db_puzzle.csv

  Opsiyonlar:
     --count=1000         Kaç bulmaca (varsayılan: 500)
     --min-rating=800     Min rating (varsayılan: 600)
     --max-rating=2800    Max rating (varsayılan: 2800)
     --themes=fork,pin    Tema filtresi
     --balanced           Her zorluktan eşit sayıda
     --output=out.json    Çıktı dosyası
`);
    process.exit(1);
  }

  console.log('📖 CSV okunuyor:', opts.csvPath);
  console.log(`   Hedef: ${opts.count} bulmaca, Rating: ${opts.minRating}-${opts.maxRating}`);
  if (opts.themes.length) console.log(`   Temalar: ${opts.themes.join(', ')}`);
  if (opts.balanced) console.log('   Dengeli mod aktif (Kolay/Orta/Zor eşit)');

  const stream = createReadStream(opts.csvPath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const buckets = opts.balanced
    ? { Kolay: [], Orta: [], Zor: [] }
    : null;
  const puzzles = [];
  let lineCount = 0;
  let skipped = 0;
  const perBucket = opts.balanced ? Math.ceil(opts.count / 3) : 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1 && line.startsWith('PuzzleId')) continue;

    const row = parseLine(line);
    if (!row) { skipped++; continue; }

    if (row.Rating < opts.minRating || row.Rating > opts.maxRating) { skipped++; continue; }
    if (row.Popularity < -30) { skipped++; continue; }

    if (opts.themes.length) {
      const rowThemes = row.Themes.split(' ');
      if (!opts.themes.some(t => rowThemes.includes(t))) { skipped++; continue; }
    }

    const puzzle = rowToPuzzle(row);

    if (opts.balanced) {
      const d = puzzle.difficulty;
      if (buckets[d].length < perBucket) {
        buckets[d].push(puzzle);
      }
      const total = buckets.Kolay.length + buckets.Orta.length + buckets.Zor.length;
      if (total >= opts.count) break;
    } else {
      puzzles.push(puzzle);
      if (puzzles.length >= opts.count) break;
    }

    if (lineCount % 100000 === 0) {
      const current = opts.balanced
        ? buckets.Kolay.length + buckets.Orta.length + buckets.Zor.length
        : puzzles.length;
      process.stdout.write(`\r   ${lineCount.toLocaleString()} satır okundu, ${current} bulmaca bulundu...`);
    }
  }

  const result = opts.balanced
    ? [...buckets.Kolay, ...buckets.Orta, ...buckets.Zor]
    : puzzles;

  console.log(`\n\n✅ Toplam ${result.length} bulmaca import edildi`);
  if (opts.balanced) {
    console.log(`   Kolay: ${buckets.Kolay.length}, Orta: ${buckets.Orta.length}, Zor: ${buckets.Zor.length}`);
  }
  console.log(`   Atlanan satır: ${skipped.toLocaleString()}`);
  console.log(`   Okunan satır: ${lineCount.toLocaleString()}`);

  const categories = {};
  for (const p of result) {
    categories[p.category] = (categories[p.category] || 0) + 1;
  }
  console.log('\n   Kategori dağılımı:');
  for (const [cat, cnt] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${cat}: ${cnt}`);
  }

  await writeFile(opts.output, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n💾 Kaydedildi: ${opts.output}`);
  console.log('   Uygulama açıldığında otomatik yüklenecek.');
}

main().catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});
