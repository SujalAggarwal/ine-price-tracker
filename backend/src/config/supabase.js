import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
// ONLY use service_role key — never fall back to anon key for backend operations
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  // Fail fast — backend cannot operate without a database connection
  throw new Error(
    '[Supabase FATAL]: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. ' +
    'Set these in backend/.env before starting the server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Service role key: disable session persistence (it's a server-side client)
    persistSession: false,
    autoRefreshToken: false,
  }
});
