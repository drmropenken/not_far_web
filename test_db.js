import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ennwjjgnxlzqnwveqbkx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.rpc('create_booking_transaction');
  // Wait, RPC cannot be queried this way without parameters.
  // Instead, let's use the REST API or just ask the user?
  // We can't query pg_proc using anon key.
  console.log('Error:', error);
}

test();
