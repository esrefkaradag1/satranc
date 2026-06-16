import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Skipping due to missing env variables');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const tables = ['students', 'puzzles', 'homeworks', 'homework_attempts', 'app_state'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    console.log(`Table ${table} error:`, error?.message || 'None');
  }
}

main();
