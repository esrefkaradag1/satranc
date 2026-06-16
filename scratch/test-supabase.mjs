import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read VITE_ variables from .env
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('lessons').select('*').limit(1);
  if (error) {
    console.error('Error fetching lessons:', error);
  } else {
    console.log('Columns in lessons table:', Object.keys(data[0] || {}));
  }
}

check();
