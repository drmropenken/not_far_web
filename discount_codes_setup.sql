-- 1. 新增折扣碼表 (nf_discount_codes)
CREATE TABLE public.nf_discount_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount_percent DECIMAL(3,2) NOT NULL DEFAULT 1.00 CHECK (discount_percent > 0 AND discount_percent <= 1), -- 範例: 0.85 代表 85 折
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 設定折扣碼表的安全性 (RLS)
ALTER TABLE public.nf_discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許所有人讀取折扣碼" ON public.nf_discount_codes FOR SELECT USING (true);
CREATE POLICY "僅允許管理者修改折扣碼" ON public.nf_discount_codes FOR ALL USING (auth.role() = 'authenticated');

-- 3. 擴充 nf_orders 欄位
ALTER TABLE public.nf_orders ADD COLUMN discount_code TEXT;
ALTER TABLE public.nf_orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;

-- 4. 插入幾筆範例預設的折扣碼
INSERT INTO public.nf_discount_codes (code, discount_percent) VALUES
('VIP95', 0.95),
('WINTER80', 0.80),
('EARLYBIRD', 0.90);
