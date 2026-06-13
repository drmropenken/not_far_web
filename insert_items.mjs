import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const items = [
    { name: '四人帳篷租借 (自行搭設)', category: 'equipment', price_weekday: 1000, price_holiday: 1000, total_quantity: 30, sort_order: 21 },
    { name: '專人帳篷代搭服務 (單次)', category: 'service', price_weekday: 500, price_holiday: 500, total_quantity: 30, sort_order: 22 },
    { name: '客廳帳租借 (自行搭設)', category: 'equipment', price_weekday: 800, price_holiday: 800, total_quantity: 20, sort_order: 23 },
    { name: '專人客廳帳代搭服務 (單次)', category: 'service', price_weekday: 200, price_holiday: 200, total_quantity: 20, sort_order: 24 },
    { name: '豪華免搭帳 (含營位與寢具)', category: 'campsite', price_weekday: 2500, price_holiday: 3500, total_quantity: 10, sort_order: 25 },
    { name: '頂級海陸烤肉組代訂 (四人份)', category: 'service', price_weekday: 2000, price_holiday: 2000, total_quantity: 10, sort_order: 26 },
    { name: '營區特製晚餐 (單人份)', category: 'service', price_weekday: 450, price_holiday: 450, total_quantity: 100, sort_order: 27 },
  ];

  for (const item of items) {
    const { error } = await supabase.from('nf_items').insert([item]);
    if (error) {
      console.error('Error inserting', item.name, error);
    } else {
      console.log('Inserted', item.name);
    }
  }
}

run();
