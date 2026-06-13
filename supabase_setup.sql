-- 1. 建立商品與服務表 (nf_items)
CREATE TABLE public.nf_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('campsite', 'equipment', 'service')),
    name TEXT NOT NULL,
    description TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    price_original INTEGER NOT NULL DEFAULT 0,
    price_weekday INTEGER NOT NULL DEFAULT 0,
    price_holiday INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 建立訂單主檔 (nf_orders)
CREATE TABLE public.nf_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    license_plate TEXT,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    total_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
    notes TEXT,
    line_user_id TEXT,
    ecpay_trade_no TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 建立訂單細項 (nf_order_items)
CREATE TABLE public.nf_order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.nf_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.nf_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. 建立每日庫存表 (nf_inventory)
CREATE TABLE public.nf_inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    item_id UUID NOT NULL REFERENCES public.nf_items(id) ON DELETE CASCADE,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(date, item_id) -- 每天每個商品只能有一筆庫存紀錄
);

-- 設定 Row Level Security (RLS)
ALTER TABLE public.nf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許所有人讀取商品" ON public.nf_items FOR SELECT USING (true);
CREATE POLICY "僅允許管理者修改商品" ON public.nf_items FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.nf_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許所有人讀取庫存" ON public.nf_inventory FOR SELECT USING (true);
CREATE POLICY "僅允許管理者修改庫存" ON public.nf_inventory FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.nf_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許建立訂單" ON public.nf_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "允許所有人讀取訂單" ON public.nf_orders FOR SELECT USING (true);
CREATE POLICY "允許管理者修改訂單" ON public.nf_orders FOR UPDATE USING (auth.role() = 'authenticated');

ALTER TABLE public.nf_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "允許建立訂單明細" ON public.nf_order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "允許所有人讀取訂單明細" ON public.nf_order_items FOR SELECT USING (true);
CREATE POLICY "允許管理者修改訂單明細" ON public.nf_order_items FOR UPDATE USING (auth.role() = 'authenticated');
