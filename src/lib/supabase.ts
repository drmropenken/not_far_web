import { createClient } from "@supabase/supabase-js";

// 請確保在 .env 檔案中設定以下變數
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

// 單一實例
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
