#!/usr/bin/env node
/**
 * Lichess OAuth için students sütunlarını kontrol eder.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const key = (
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''
).trim();

if (!url || !key) {
  console.error('Hata: .env içinde VITE_SUPABASE_URL ve SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { error } = await sb
  .from('students')
  .select('id, lichess_access_token, lichess_oauth_connected_at, lichess_username')
  .limit(1);

if (!error) {
  console.log('OK: Lichess OAuth sütunları mevcut (lichess_access_token, lichess_oauth_connected_at, lichess_username).');
  process.exit(0);
}

const msg = String(error.message ?? '').toLowerCase();
const missing =
  error.code === '42703' ||
  msg.includes('lichess_access_token') ||
  msg.includes('does not exist');

if (!missing) {
  console.error('Beklenmeyen hata:', error.message);
  process.exit(2);
}

console.log('\n❌ students tablosunda Lichess OAuth sütunları eksik.\n');
console.log('Çözüm: Supabase SQL Editor\'de şu dosyayı çalıştırın:');
console.log(`   ${join(root, 'supabase_lichess_oauth.sql')}\n`);
process.exit(1);
