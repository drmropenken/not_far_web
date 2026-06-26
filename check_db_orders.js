import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase
      .from('nf_orders')
      .select(`
        *,
        nf_order_items (
          *,
          nf_items (*)
        )
      `).limit(1);
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data[0].nf_order_items, null, 2));
}
check();
