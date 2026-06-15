import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY; // Using the provided publishable key

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const adProduct = {
    name: "o'rest 側睡記憶枕",
    description: "三層針織布柔軟親膚，德國技術 100D 記憶綿，慢回彈優秀釋壓。給您舒適的支撐，不論正睡或側睡都好眠！全程 100% 台灣製造，抗菌防霉好安心。",
    category: "贊助廣告",
    image_url: "https://www.orest.com.tw/wp-content/uploads/2021/04/%E5%81%B4%E7%9D%A1%E8%A8%98%E6%86%B6%E6%9E%95-1-1-600x600.jpg",
    price_hint: "了解詳情",
    affiliate_url: "https://www.orest.com.tw/products/sidepillw",
    is_active: true,
    tags: ["廣告"] // Changed tag to "廣告" to trigger the blue glow effect
  };

  // 插入資料
  const { data, error } = await supabase
    .from('products')
    .insert([adProduct])
    .select();

  if (error) {
    console.error("Error inserting product:", error);
  } else {
    console.log("Successfully inserted ad product:", data);
  }
}

main();
