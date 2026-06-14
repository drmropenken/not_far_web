import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPolicies() {
  const { data, error } = await supabase.rpc('query_policies', {});
  if (error) {
     console.error("RPC failed, doing direct fetch", error.message);
     // If we can't fetch policies directly, we can't easily know.
  } else {
     console.log(data);
  }
}

checkPolicies();
