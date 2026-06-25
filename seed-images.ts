import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ennwjjgnxlzqnwveqbkx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs";

const supabase = createClient(supabaseUrl, supabaseKey);

const hardcodedImages: Record<string, string[]> = {
  "六人大巴露營車": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150c7d791dc.jpeg"],
  "十人包棟": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150e09b75ef.jpeg"],
  "豪華野奢帳篷組": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a140d6500e04.jpeg"],
  "四人石茅屋": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150dbab8cc1.jpeg"],
  "四人水管屋雅房": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150d6f461ea.jpeg"],
  "欖仁樹區 (一至二帳包區)": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150eb01ff7a.jpeg"],
  "草原區 (四至五帳包區)": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150f1465bfb.jpeg"],
  "湖岸一區 (六帳包區)": ["https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150c05872cc.jpeg"]
};

// I noticed the DB name might not perfectly match the exact key, let's fetch first.
async function main() {
  const { data: items, error } = await supabase.from("nf_items").select("*");
  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  for (const item of items) {
    let matchedKey = Object.keys(hardcodedImages).find(k => item.name.includes(k) || k.includes(item.name));
    
    // special cases for matching
    if (item.name === "住宿-四人石茅屋") matchedKey = "四人石茅屋";
    if (item.name === "住宿-六人大巴露營車") matchedKey = "六人大巴露營車";
    if (item.name === "住宿-十人包棟") matchedKey = "十人包棟";
    if (item.name === "營位-欖仁樹區(一至二帳包區)") matchedKey = "欖仁樹區 (一至二帳包區)";
    if (item.name === "營位-草原區(四至五帳包區)") matchedKey = "草原區 (四至五帳包區)";
    if (item.name === "營位-湖岸一區(六帳包區)") matchedKey = "湖岸一區 (六帳包區)";
    if (item.name === "住宿-四人水管屋雅房") matchedKey = "四人水管屋雅房";

    if (matchedKey) {
      const urls = hardcodedImages[matchedKey].join(',');
      const { error: updateError } = await supabase
        .from("nf_items")
        .update({ image_url: urls })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`Failed to update ${item.name}:`, updateError.message);
      } else {
        console.log(`Updated ${item.name} with image: ${urls}`);
      }
    } else {
      console.log(`No image found for ${item.name}`);
    }
  }
}

main();
