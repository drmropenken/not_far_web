-- 1. 解除原本的訂單狀態限制 (pending, paid, cancelled)
ALTER TABLE public.nf_orders DROP CONSTRAINT IF EXISTS nf_orders_status_check;

-- 2. 重新加入訂單狀態限制，新增 'checked_in' (已報到) 狀態
ALTER TABLE public.nf_orders ADD CONSTRAINT nf_orders_status_check CHECK (status IN ('pending', 'paid', 'checked_in', 'cancelled'));

-- 3. 新增營主專屬的內部備註欄位
ALTER TABLE public.nf_orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;
