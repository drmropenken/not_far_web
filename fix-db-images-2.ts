import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ennwjjgnxlzqnwveqbkx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const updates = [
    { name: "上營區-欖仁樹區(二帳包區)", url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150eb01ff7a.jpeg" },
    { name: "上營區-湖岸一區(六帳包區)", url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150c05872cc.jpeg" },
    { name: "上營區-草原一區(四帳包區)", url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a15118ede679.jpeg" }
  ];

  for (const update of updates) {
    const { error } = await supabase
      .from("nf_items")
      .update({ image_url: update.url })
      .eq('name', update.name);
    
    if (error) {
      console.error(`Failed to update ${update.name}:`, error.message);
    } else {
      console.log(`Updated ${update.name} with image: ${update.url}`);
    }
  }
}

main();
