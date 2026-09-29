-- ==============================================================================
-- 每日自訂房價 / 浮動價格 (Dynamic Daily Pricing) 資料庫升級腳本
-- 請在 Supabase Dashboard -> SQL Editor 中執行此腳本
-- ==============================================================================

-- 1. 擴充 nf_inventory 表，新增 custom_price 欄位
ALTER TABLE public.nf_inventory ADD COLUMN IF NOT EXISTS custom_price integer;

-- 2. 欄位註解說明
COMMENT ON COLUMN public.nf_inventory.custom_price IS '每日自訂覆蓋價格 (null 表示採用商品預設的平日/假日價)';
