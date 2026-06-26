import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeworkAttemptInsertPayloads } from '../lib/homeworkAttemptDb.mjs';

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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or key');
  process.exit(1);
}

const sb = createClient(url, key);

const { data: sample, error: sampleErr } = await sb.from('homework_attempts').select('*').limit(3);
console.log('Sample rows:', sampleErr?.message ?? sample);

const testRecord = {
  id: `diag-${Date.now()}`,
  studentId: 'diag-student',
  homeworkId: 'diag-hw',
  puzzleId: 'diag-puzzle',
  puzzleTitle: 'diag',
  correct: false,
  movesPlayed: ['e4'],
  solutionMoves: ['e4'],
  finalFen: null,
  timestamp: new Date().toISOString(),
};

for (const { style, payload } of homeworkAttemptInsertPayloads(testRecord)) {
  const { error } = await sb.from('homework_attempts').insert(payload);
  console.log(`Variant ${style} keys:`, Object.keys(payload).join(', '));
  console.log(`Variant ${style} result:`, error ? error.message : 'OK');
  if (!error) {
    await sb.from('homework_attempts').delete().eq('id', testRecord.id);
    break;
  }
}
