const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)) {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  supabase = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    db: { schema: 'public' }
  });
} else {
  console.warn('[Supabase] Variáveis de ambiente não configuradas. Operando sem persistência.');
}

module.exports = { supabase };


