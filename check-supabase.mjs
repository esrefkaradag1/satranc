import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const serviceKey = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();

console.log('Supabase URL:', supabaseUrl || '(eksik)');

if (!supabaseUrl || (!serviceKey && !anonKey)) {
  console.error('Eksik: VITE_SUPABASE_URL ve en az bir anahtar (.env)');
  process.exit(1);
}

async function probe(label, key) {
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });
  const tables = ['students', 'clubs', 'puzzles', 'homeworks'];
  console.log(`\n[${label}]`);
  for (const table of tables) {
    const { error } = await sb.from(table).select('id').limit(1);
    const status = error ? `HATA: ${error.message}` : 'OK';
    console.log(`  ${table}: ${status}`);
  }
}

async function main() {
  if (serviceKey) await probe('service_role', serviceKey);
  if (anonKey) await probe('anon', anonKey);
  console.log('\nNot: "permission denied for schema public" görürseniz scripts/selfhosted-supabase-grants.sql çalıştırın.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
