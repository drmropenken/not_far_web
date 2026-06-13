-- 開放管理者刪除訂單與訂單明細的權限
CREATE POLICY "允許管理者刪除訂單" ON public.nf_orders FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "允許管理者刪除訂單明細" ON public.nf_order_items FOR DELETE USING (auth.role() = 'authenticated');
