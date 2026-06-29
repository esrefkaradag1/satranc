#!/usr/bin/env node
/**
 * Supabase tam veri yedeği (service role ile).
 * Şema için repodaki SQL dosyalarını da kopyalar.
 *
 * Kullanım: node scripts/supabase-full-backup.mjs
 * Opsiyonel pg_dump için: SUPABASE_DB_PASSWORD=... node scripts/supabase-full-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const key = (
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''
).trim();

if (!url || !key) {
  console.error('Hata: .env içinde VITE_SUPABASE_URL ve VITE_SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? 'selfhosted';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(root, 'backups', `supabase_${projectRef}_${stamp}`);
const dataDir = path.join(outDir, 'data');
const schemaDir = path.join(outDir, 'schema');

const PAGE = 500;

const FALLBACK_TABLES = [
  'students',
  'coaches',
  'clubs',
  'branch_offices',
  'discipline_branches',
  'training_groups',
  'student_applications',
  'homeworks',
  'homework_attempts',
  'homework_submissions',
  'puzzles',
  'lessons',
  'attendance_records',
  'schedule_entries',
  'transactions',
  'gallery',
  'inventory',
  'activity_logs',
  'performance_analyses',
  'tournaments',
  'coach_ai_reports',
  'live_lesson_state',
  'group_lesson_logs',
  'chess_studies',
  'chess_study_events',
  'chess_study_actions',
  'chess_study_snapshots',
  'chess_study_presence',
  'site_messages',
  'app_roles',
  'app_permissions',
  'app_role_permissions',
  'app_state',
];

const SCHEMA_FILES = [
  'NETCHESS_SUPABASE.sql',
  'supabase_schema_full.sql',
  'supabase_migration_complete.sql',
  'supabase_club_rls.sql',
  'supabase_students_club_id.sql',
  'supabase_applications_list_columns.sql',
  'supabase_org_structure.sql',
  'supabase_roles.sql',
  'supabase_student_login_credentials.sql',
  'supabase_coaches_profile.sql',
  'supabase_coaches_password.sql',
  'supabase_group_lesson_logs.sql',
  'supabase_lessons_fix.sql',
  'supabase_leaderboard_points.sql',
  'supabase_study_categories.sql',
];

const sb = createClient(url, key);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function discoverTables() {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/openapi+json',
      },
    });
    if (!res.ok) return null;
    const spec = await res.json();
    const paths = Object.keys(spec.paths ?? {});
    const tables = paths
      .map((p) => p.replace(/^\//, ''))
      .filter((p) => p && !p.includes('{') && !p.includes('/'))
      .sort();
    return tables.length > 0 ? tables : null;
  } catch {
    return null;
  }
}

async function fetchTableRows(table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await sb.from(table).select('*').range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\r  ${table}: ${rows.length} satır...`);
  }
  if (rows.length > 0) process.stdout.write(`\r  ${table}: ${rows.length} satır\n`);
  return rows;
}

function copySchemaFiles() {
  ensureDir(schemaDir);
  const copied = [];
  for (const file of SCHEMA_FILES) {
    const src = path.join(root, file);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(schemaDir, file);
    fs.copyFileSync(src, dest);
    copied.push(file);
  }
  return copied;
}

function tryPgDump() {
  const password = (
    process.env.SUPABASE_DB_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    process.env.DATABASE_PASSWORD ??
    ''
  ).trim();
  if (!password) return { skipped: true, reason: 'SUPABASE_DB_PASSWORD / POSTGRES_PASSWORD yok' };

  const dumpFile = path.join(outDir, 'postgres_full_dump.sql');
  const poolerFile = path.join(root, 'supabase', '.temp', 'pooler-url');
  const selfHostedHost = (process.env.SUPABASE_HOST ?? '').trim();
  let host = selfHostedHost || `db.${projectRef}.supabase.co`;
  let port = '5432';
  let user = 'postgres';

  if (!selfHostedHost && fs.existsSync(poolerFile)) {
    const pooler = fs.readFileSync(poolerFile, 'utf8').trim();
    const m = pooler.match(/postgres(?:\.[^:]+)?:[^@]+@([^:/]+):(\d+)\//);
    if (m) {
      host = m[1];
      port = m[2] === '6543' ? '5432' : m[2];
      user = `postgres.${projectRef}`;
    }
  }

  try {
    execSync(
      [
        'pg_dump',
        `-h ${host}`,
        `-p ${port}`,
        `-U ${user}`,
        '-d postgres',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--schema=public',
        `-f "${dumpFile}"`,
      ].join(' '),
      {
        stdio: 'pipe',
        timeout: 600_000,
        env: { ...process.env, PGPASSWORD: password },
      },
    );
    const size = fs.statSync(dumpFile).size;
    return { ok: true, file: dumpFile, size, host, user };
  } catch (e) {
    return { ok: false, error: e.message?.slice(0, 300) ?? String(e) };
  }
}

async function listStorageBuckets() {
  const { data, error } = await sb.storage.listBuckets();
  if (error) return { error: error.message, buckets: [] };
  return { buckets: data ?? [] };
}

async function main() {
  ensureDir(dataDir);
  ensureDir(schemaDir);

  console.log(`Proje: ${projectRef}`);
  console.log(`Çıktı: ${outDir}\n`);

  const schemaCopied = copySchemaFiles();
  console.log(`Şema dosyaları kopyalandı: ${schemaCopied.length}`);

  const discovered = await discoverTables();
  const tables = discovered ?? FALLBACK_TABLES;
  console.log(`Tablolar (${tables.length}): ${tables.join(', ')}\n`);

  const summary = {
    projectRef,
    url,
    createdAt: new Date().toISOString(),
    tables: {},
    errors: [],
    schemaFiles: schemaCopied,
  };

  for (const table of tables) {
    try {
      const rows = await fetchTableRows(table);
      const file = path.join(dataDir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));
      summary.tables[table] = { rows: rows.length, file: `data/${table}.json` };
      if (rows.length === 0) console.log(`  ${table}: 0 satır`);
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (/does not exist|Could not find|42P01|PGRST205/i.test(msg)) {
        console.log(`  ${table}: atlandı (tablo yok)`);
        continue;
      }
      console.error(`  ${table}: HATA — ${msg}`);
      summary.errors.push({ table, error: msg });
    }
  }

  console.log('\nStorage bucket listesi...');
  const storage = await listStorageBuckets();
  summary.storage = storage;
  fs.writeFileSync(path.join(outDir, 'storage_buckets.json'), JSON.stringify(storage, null, 2));
  if (storage.buckets?.length) {
    console.log(`  ${storage.buckets.length} bucket: ${storage.buckets.map((b) => b.name).join(', ')}`);
  } else if (storage.error) {
    console.log(`  Storage listesi alınamadı: ${storage.error}`);
  }

  console.log('\npg_dump deneniyor...');
  const pg = tryPgDump();
  summary.pgDump = pg;
  if (pg.ok) {
    console.log(`  postgres_full_dump.sql (${(pg.size / 1024 / 1024).toFixed(2)} MB)`);
  } else if (pg.skipped) {
    console.log(`  Atlandı: ${pg.reason} (Dashboard → Database → password)`);
  } else {
    console.log(`  Başarısız: ${pg.error}`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(summary, null, 2));

  const totalRows = Object.values(summary.tables).reduce((n, t) => n + (t.rows ?? 0), 0);
  console.log(`\nTamamlandı: ${Object.keys(summary.tables).length} tablo, ${totalRows} satır`);
  console.log(`Yedek klasörü: ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
