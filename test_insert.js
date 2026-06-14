import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { data: order } = await supabase
    .from('nf_orders')
    .select('*, nf_order_items(*, nf_items(*))')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log("Order items:");
  for (const oi of order.nf_order_items) {
     console.log(oi.nf_items.name, oi.item_id, oi.quantity);
  }

  // Try to insert manually for the 16th and print errors
  for (const oi of order.nf_order_items) {
    const { data: existing, error: e1 } = await supabase
      .from('nf_inventory')
      .select('id, booked_quantity')
      .eq('date', '2026-06-16')
      .eq('item_id', oi.item_id)
      .single();

    console.log(`\nCheck 2026-06-16 for ${oi.nf_items.name}:`, existing ? "Exists" : "Not exists", e1 ? e1.message : "");

    if (existing) {
       const { error: e2 } = await supabase
         .from('nf_inventory')
         .update({ booked_quantity: existing.booked_quantity + oi.quantity })
         .eq('id', existing.id);
       if (e2) console.error("Update error:", e2.message);
       else console.log("Update success");
    } else {
       const { error: e3 } = await supabase
         .from('nf_inventory')
         .insert([{
           date: '2026-06-16',
           item_id: oi.item_id,
           booked_quantity: oi.quantity
         }]);
       if (e3) console.error("Insert error:", e3.message);
       else console.log("Insert success");
    }
  }
}

testInsert();
