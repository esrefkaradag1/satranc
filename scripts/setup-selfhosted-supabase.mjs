#!/usr/bin/env node
/**
 * Self-hosted Supabase kurulum rehberi.
 * .env yüklendikten sonra hangi SQL dosyalarının çalıştırılması gerektiğini listeler.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const SQL_ORDER = [
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
  'supabase_lichess_oauth.sql',
  'supabase_site_messages.sql',
  'scripts/selfhosted-supabase-grants.sql',
];

console.log('Self-hosted Supabase kurulum');
console.log('API URL:', url || '(eksik .env)');
console.log('DB host:', process.env.SUPABASE_HOST || '(SUPABASE_HOST yok)');
console.log('\nSupabase Studio veya psql ile sırayla çalıştırın:\n');
for (const file of SQL_ORDER) {
  const full = path.join(root, file);
  const ok = fs.existsSync(full) ? '✓' : '✗';
  console.log(`  ${ok} ${file}`);
}

if (url && key) {
  console.log('\nREST şema kontrolü...');
  fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  })
    .then((r) => r.json())
    .then((spec) => {
      const paths = Object.keys(spec.paths ?? {});
      const tables = paths.filter((p) => p.startsWith('/') && !p.startsWith('/rpc') && p !== '/');
      console.log(`  Tablo uçları: ${tables.length}`);
      console.log(`  RPC uçları: ${paths.filter((p) => p.startsWith('/rpc')).length}`);
      if (tables.length === 0) {
        console.log('\n  UYARI: Hiç tablo görünmüyor. NETCHESS_SUPABASE.sql ve grants SQL çalıştırın.');
      } else {
        console.log('  Örnek:', tables.slice(0, 5).join(', '));
      }
    })
    .catch((err) => console.error('  Kontrol hatası:', err.message));
}
