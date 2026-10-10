-- ==============================================================================
-- 連假 / 特殊日期進退房管制 (Closed to Departure & Closed to Arrival) 資料庫設定腳本
-- 請在 Supabase Dashboard -> SQL Editor 中執行此腳本
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.nf_date_rules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    camp_id text NOT NULL,
    date date NOT NULL,
    no_checkout boolean DEFAULT false NOT NULL,
    no_checkin boolean DEFAULT false NOT NULL,
    applies_to_all boolean DEFAULT true NOT NULL,
    item_ids text[] DEFAULT '{}'::text[] NOT NULL,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT nf_date_rules_camp_date_unique UNIQUE (camp_id, date)
);

COMMENT ON TABLE public.nf_date_rules IS '營區特定日期進退房限制規則 (如連假禁止退房/禁止入住)';
COMMENT ON COLUMN public.nf_date_rules.no_checkout IS '當日禁止退房 (CTD)';
COMMENT ON COLUMN public.nf_date_rules.no_checkin IS '當日禁止入住 (CTA)';
COMMENT ON COLUMN public.nf_date_rules.applies_to_all IS '是否全營區所有品項通用 (true: 全區, false: 僅限 item_ids)';
COMMENT ON COLUMN public.nf_date_rules.item_ids IS '特定受限制的品項 ID 陣列 (當 applies_to_all = false 時生效)';

-- 啟用 RLS
ALTER TABLE public.nf_date_rules ENABLE ROW LEVEL SECURITY;

-- 允許任何人讀取規則 (前台客人預訂需驗證限制)
DROP POLICY IF EXISTS "Allow public read nf_date_rules" ON public.nf_date_rules;
CREATE POLICY "Allow public read nf_date_rules" ON public.nf_date_rules
    FOR SELECT USING (true);

-- 允許所有後台/管理操作
DROP POLICY IF EXISTS "Allow all for nf_date_rules" ON public.nf_date_rules;
CREATE POLICY "Allow all for nf_date_rules" ON public.nf_date_rules
    FOR ALL USING (true);
