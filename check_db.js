import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  // Get the order
  const { data: order, error: oError } = await supabase
    .from('nf_orders')
    .select('*, nf_order_items(*, nf_items(*))')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (oError) {
    console.error("Error fetching order", oError);
    return;
  }

  console.log("Latest Order:", order.order_no);
  for (const item of order.nf_order_items) {
    console.log(`- Item: ${item.nf_items.name} (Category: ${item.nf_items.category}) x ${item.quantity}`);
  }

  // Check inventory for those items between 14th and 17th
  const { data: inv, error: iError } = await supabase
    .from('nf_inventory')
    .select('*, nf_items(name)')
    .gte('date', '2026-06-14')
    .lte('date', '2026-06-17')
    .order('date');

  if (iError) {
    console.error("Error fetching inventory", iError);
    return;
  }

  console.log("\nInventory records:");
  for (const i of inv) {
    if (order.nf_order_items.some(oi => oi.item_id === i.item_id)) {
      console.log(`${i.date} - ${i.nf_items.name}: booked=${i.booked_quantity}`);
    }
  }
}

checkData();
