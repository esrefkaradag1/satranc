#!/usr/bin/env node
/**
 * JSON yedeğinden yeni Supabase'e aktarılabilir SQL üretir.
 *
 * Kullanım:
 *   node scripts/backup-to-import-sql.mjs
 *   node scripts/backup-to-import-sql.mjs backups/supabase_.../
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SCHEMA_ORDER = [
  'NETCHESS_SUPABASE.sql',
  'supabase_org_structure.sql',
  'supabase_roles.sql',
  'supabase_students_club_id.sql',
  'supabase_applications_list_columns.sql',
  'supabase_student_login_credentials.sql',
  'supabase_coaches_profile.sql',
  'supabase_coaches_password.sql',
  'supabase_group_lesson_logs.sql',
  'supabase_lessons_fix.sql',
  'supabase_leaderboard_points.sql',
  'supabase_study_categories.sql',
  'supabase_club_rls.sql',
];

/** FK sırasına göre veri ekleme (view'lar hariç) */
const DATA_TABLE_ORDER = [
  'app_roles',
  'app_permissions',
  'clubs',
  'branch_offices',
  'discipline_branches',
  'training_groups',
  'coaches',
  'students',
  'student_applications',
  'puzzles',
  'homeworks',
  'homework_attempts',
  'homework_submissions',
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
  'chess_study_categories',
  'chess_studies',
  'chess_study_events',
  'chess_study_actions',
  'chess_study_snapshots',
  'chess_study_presence',
  'site_messages',
  'app_role_permissions',
  'branches',
  'groups',
  'homework_assignees',
  'homework_assignments',
  'homework_puzzles',
  'homework_stats',
  'payments',
  'student_contacts',
  'users',
];

const SKIP_DATA_PREFIXES = ['v_'];
const BATCH_SIZE = 50;

function findLatestBackup() {
  const dir = path.join(root, 'backups');
  if (!fs.existsSync(dir)) return null;
  const folders = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith('supabase_'))
    .map((n) => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return folders[0] ? path.join(dir, folders[0].n) : null;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInserts(table, rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch
      .map((row) => {
        const vals = columns.map((c) => sqlLiteral(row[c]));
        return `(${vals.join(', ')})`;
      })
      .join(',\n  ');
    chunks.push(
      `INSERT INTO public.${table} (${columns.join(', ')})\nVALUES\n  ${values}\nON CONFLICT DO NOTHING;`,
    );
  }
  return chunks.join('\n\n');
}

function readSchemaSql(backupDir) {
  const parts = [];
  parts.push('-- =============================================================================');
  parts.push('-- NETCHESS Supabase şema (yeni projeye ilk adım)');
  parts.push(`-- Oluşturulma: ${new Date().toISOString()}`);
  parts.push('-- =============================================================================\n');

  for (const file of SCHEMA_ORDER) {
    const fromBackup = path.join(backupDir, 'schema', file);
    const fromRoot = path.join(root, file);
    const src = fs.existsSync(fromBackup) ? fromBackup : fromRoot;
    if (!fs.existsSync(src)) continue;
    parts.push(`\n-- ── ${file} ──\n`);
    parts.push(fs.readFileSync(src, 'utf8'));
  }
  return parts.join('\n');
}

function readDataSql(backupDir) {
  const dataDir = path.join(backupDir, 'data');
  const parts = [];
  parts.push('-- =============================================================================');
  parts.push('-- NETCHESS Supabase veri');
  parts.push(`-- Oluşturulma: ${new Date().toISOString()}`);
  parts.push('-- =============================================================================\n');
  parts.push('SET session_replication_role = replica;\n');

  const files = fs.existsSync(dataDir)
    ? fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'))
    : [];
  const tableSet = new Set(files.map((f) => f.replace(/\.json$/, '')));

  const ordered = [
    ...DATA_TABLE_ORDER.filter((t) => tableSet.has(t)),
    ...[...tableSet]
      .filter((t) => !DATA_TABLE_ORDER.includes(t))
      .filter((t) => !SKIP_DATA_PREFIXES.some((p) => t.startsWith(p)))
      .sort(),
  ];

  let totalRows = 0;
  const tableSql = {};
  for (const table of ordered) {
    if (SKIP_DATA_PREFIXES.some((p) => table.startsWith(p))) continue;
    const file = path.join(dataDir, `${table}.json`);
    if (!fs.existsSync(file)) continue;
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows) || rows.length === 0) continue;
    parts.push(`\n-- ${table} (${rows.length} satır)\n`);
    const block = buildInserts(table, rows);
    tableSql[table] = block;
    parts.push(block);
    parts.push('\n');
    totalRows += rows.length;
    console.log(`  ${table}: ${rows.length} satır`);
  }

  parts.push('\nSET session_replication_role = DEFAULT;\n');
  return { sql: parts.join('\n'), totalRows, tables: ordered.length, tableSql };
}

function main() {
  const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : findLatestBackup();
  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error('Yedek klasörü bulunamadı. Önce: node scripts/supabase-full-backup.mjs');
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(root, 'backups', `sql_import_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Kaynak yedek: ${backupDir}`);
  console.log('Şema SQL üretiliyor...');
  const schemaSql = readSchemaSql(backupDir);
  const schemaFile = path.join(outDir, '01_schema.sql');
  fs.writeFileSync(schemaFile, schemaSql);

  console.log('Veri SQL üretiliyor...');
  const { sql: dataSql, totalRows, tableSql } = readDataSql(backupDir);
  const dataFile = path.join(outDir, '02_data.sql');
  fs.writeFileSync(dataFile, dataSql);

  const appsSql = tableSql['student_applications'];
  if (appsSql) {
    const appsFile = path.join(outDir, '03_data_student_applications.sql');
    const appsBody = [
      '-- student_applications (foto/imza — ayrı dosya, gerekirse tek başına çalıştırın)',
      'SET session_replication_role = replica;',
      appsSql,
      'SET session_replication_role = DEFAULT;',
    ].join('\n\n');
    fs.writeFileSync(appsFile, appsBody);

    const withoutApps = dataSql.replace(
      /\n-- student_applications[\s\S]*?(?=\n-- [a-z_]+ \(|\nSET session_replication_role = DEFAULT)/,
      '\n-- student_applications → 03_data_student_applications.sql dosyasında\n',
    );
    fs.writeFileSync(path.join(outDir, '02_data_without_applications.sql'), withoutApps);
  }

  const readme = `# Supabase SQL İçe Aktarma

Yeni Supabase projesinde **SQL Editor**'da sırayla çalıştırın:

1. \`01_schema.sql\` — tablolar, fonksiyonlar, RLS
2. \`02_data_without_applications.sql\` — ana veriler
3. \`03_data_student_applications.sql\` — başvurular (foto/imza, ~25 MB)
4. (isteğe bağlı) \`02_data.sql\` — hepsi tek dosyada

## Notlar
- Büyük dosya: \`student_applications\` foto/imza içerir; yavaşsa parçalara bölün.
- Storage (öğrenci fotoğrafları) ayrı: eski yedekte \`storage/student-photos/\` klasörüne yükleyin.
- Katı RLS aktifse import öncesi \`supabase_club_rls.sql\` içindeki ENABLE satırlarını geçici kapatın.

Oluşturulma: ${new Date().toISOString()}
Kaynak: ${backupDir}
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);

  const schemaMb = (fs.statSync(schemaFile).size / 1024 / 1024).toFixed(2);
  const dataMb = (fs.statSync(dataFile).size / 1024 / 1024).toFixed(2);

  console.log(`\nTamamlandı:`);
  console.log(`  ${schemaFile} (${schemaMb} MB)`);
  console.log(`  ${dataFile} (${dataMb} MB)`);
  console.log(`  ${path.join(outDir, 'README.md')}`);
}

main();
