import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ennwjjgnxlzqnwveqbkx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: items, error } = await supabase.from("nf_items").select("name");
  items?.forEach(i => {
    if (i.name.includes("草原")) {
      console.log(i.name);
    }
  });
}
main();
