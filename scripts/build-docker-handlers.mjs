/**
 * Docker/nginx üretimi için TS API handler'larını .mjs'e paketler.
 *
 * Vercel `api/*.ts` uçlarını doğrudan çalıştırır; Docker ise yalnızca .mjs
 * yükleyebildiğinden (bkz. Dockerfile), TS-yalnızca handler'lar (platform-week-stats,
 * external-game-snapshot) burada bundle edilir. `.mjs` bağımlılıkları dışarıda
 * tutulur ki lichess throttle gibi paylaşılan modül durumu tek örnek kalsın.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'server/generated');

/**
 * `.mjs` bağımlılıkları (paylaşılan runtime) bundle'a gömülmez; çalışma zamanında
 * `lib/` altından yüklenir. Kaynak dosyaya göre olan görece yolu, çıktı klasörüne
 * (server/generated) göre yeniden yazarız — aksi halde `../foo.mjs` yanlış çözülür.
 */
const externalizeMjsPlugin = {
  name: 'externalize-mjs',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\.mjs$/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      const absTarget = path.resolve(path.dirname(args.importer), args.path);
      let rel = path.relative(outDir, absTarget).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return { path: rel, external: true };
    });
  },
};

const entries = [
  'lib/api-handlers/platform-week-stats.ts',
  'lib/api-handlers/external-game-snapshot.ts',
];

async function run() {
  await build({
    entryPoints: entries.map((e) => path.join(root, e)),
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    plugins: [externalizeMjsPlugin],
    logLevel: 'info',
  });
  console.log('[build-docker-handlers] server/generated içine yazıldı.');
}

run().catch((err) => {
  console.error('[build-docker-handlers] hata:', err);
  process.exit(1);
});
