import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'lichess-count-'));
const outfile = join(dir, 'lichessCountGuard.mjs');

try {
  buildSync({
    absWorkingDir: root,
    entryPoints: [join(root, 'lib/lichessCountGuard.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  const mod = await import(pathToFileURL(outfile).href);
  mod.assertLichessCountGuard();
  if (mod.isTrustedPlatformDayStats({ lichessGames: 0, chessComGames: 7 })) {
    throw new Error('poisoned Oct 18 cache must not be trusted');
  }
  if (!mod.isTrustedPlatformDayStats({ lichessCountVersion: 3, lichessGames: 24 })) {
    throw new Error('stamped recount must be trusted');
  }
  console.log('lichess count guard ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
