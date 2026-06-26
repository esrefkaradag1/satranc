#!/usr/bin/env node
/**
 * site_messages tablosunun Supabase'de var olup olmadığını kontrol eder.
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
  process.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

if (!url || !key) {
  console.error('Hata: .env içinde VITE_SUPABASE_URL ve anahtar tanımlı olmalı.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { error } = await sb.from('site_messages').select('id').limit(1);

if (!error) {
  console.log('OK: site_messages tablosu mevcut.');
  process.exit(0);
}

const msg = String(error.message ?? '').toLowerCase();
const missing =
  error.code === 'PGRST205' ||
  error.code === 'PGRST204' ||
  msg.includes('could not find the table') ||
  msg.includes('schema cache');

if (!missing) {
  console.error('Beklenmeyen hata:', error.message);
  process.exit(2);
}

console.log('\n❌ site_messages tablosu Supabase\'de YOK.\n');
console.log('Çözüm:');
console.log('1. https://supabase.com/dashboard → projeniz → SQL Editor');
console.log('2. Aşağıdaki dosyanın içeriğini yapıştırıp Run:');
console.log(`   ${join(root, 'supabase_site_messages.sql')}\n`);
console.log('--- SQL önizleme (ilk 8 satır) ---');
const sql = readFileSync(join(root, 'supabase_site_messages.sql'), 'utf8');
console.log(sql.split('\n').slice(0, 8).join('\n'));
console.log('...\n');
process.exit(1);
