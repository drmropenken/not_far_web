import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ennwjjgnxlzqnwveqbkx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: items, error } = await supabase.from("nf_items").select("name, image_url");
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Total items:", items?.length);
  items?.forEach(i => {
    console.log(i.name, i.image_url ? `[HAS IMAGE: ${i.image_url.substring(0, 30)}...]` : "[NO IMAGE]");
  });
}
main();
