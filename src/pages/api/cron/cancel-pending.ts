import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 使用 Service Role Key 建立 Admin Client，這樣可以繞過 RLS 安全檢查，確保 Cron Job 能正常讀寫所有訂單
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const GET: APIRoute = async () => {
  try {
    // 取得時間點
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 尋找所有未付款的訂單
    const { data: pendingOrders, error: fetchError } = await supabase
      .from('nf_orders')
      .select('id, created_at, payment_method, check_in_date, check_out_date, nf_order_items(item_id, quantity, nf_items(category, name))')
      .eq('status', 'pending');

    if (fetchError) {
      console.error('Cron: Failed to fetch pending orders:', fetchError);
      return new Response('Error fetching orders', { status: 500 });
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return new Response('No pending orders found', { status: 200 });
    }

    // 篩選出已經過期的訂單
    const expiredOrders = pendingOrders.filter(order => {
      const createdAt = new Date(order.created_at);
      if (order.payment_method === 'bank_transfer') {
        return createdAt < thirtyDaysAgo; // 匯款保留 30 天
      } else {
        return createdAt < oneHourAgo;   // 其他(綠界)保留 1 小時
      }
    });

    if (expiredOrders.length === 0) {
      return new Response('No expired orders found', { status: 200 });
    }

    console.log(`Cron: Found ${expiredOrders.length} expired orders. Processing cancellation...`);

    for (const order of expiredOrders) {
      // 1. 處理庫存退還
      const start = new Date(order.check_in_date);
      const end = new Date(order.check_out_date);

      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const isFirstNight = d.getTime() === start.getTime();
        
        for (const oi of order.nf_order_items) {
          const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
          if (isSingleTime && !isFirstNight) continue;

          // 取得目前庫存紀錄
          const { data: inv } = await supabase
            .from('nf_inventory')
            .select('id, booked_quantity')
            .eq('date', dateStr)
            .eq('item_id', oi.item_id)
            .single();

          if (inv && inv.booked_quantity > 0) {
            // 退還庫存數量
            await supabase
              .from('nf_inventory')
              .update({ booked_quantity: Math.max(0, inv.booked_quantity - oi.quantity) })
              .eq('id', inv.id);
          }
        }
      }

      // 2. 將訂單狀態標記為已取消
      const timeoutReason = order.payment_method === 'bank_transfer' ? '超過10天未付款' : '超過1小時未付款';
      await supabase
        .from('nf_orders')
        .update({ status: 'cancelled', notes: `系統自動取消：${timeoutReason}` })
        .eq('id', order.id);
        
      console.log(`Cron: Successfully cancelled order ID ${order.id}`);
    }

    return new Response(`Successfully cancelled ${expiredOrders.length} expired orders.`, { status: 200 });
  } catch (error) {
    console.error('Cron: Error cancelling pending orders:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
