import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const GET: APIRoute = async () => {
  try {
    // 取得 1 小時前的時間點
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 尋找超過 1 小時未付款的訂單
    const { data: expiredOrders, error: fetchError } = await supabase
      .from('nf_orders')
      .select('id, check_in_date, check_out_date, nf_order_items(item_id, quantity)')
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo);

    if (fetchError) {
      console.error('Cron: Failed to fetch expired orders:', fetchError);
      return new Response('Error fetching orders', { status: 500 });
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      return new Response('No expired orders found', { status: 200 });
    }

    console.log(`Cron: Found ${expiredOrders.length} expired orders. Processing cancellation...`);

    for (const order of expiredOrders) {
      // 1. 處理庫存退還
      const start = new Date(order.check_in_date);
      const end = new Date(order.check_out_date);

      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        
        for (const oi of order.nf_order_items) {
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
      await supabase
        .from('nf_orders')
        .update({ status: 'cancelled', notes: '系統自動取消：超過1小時未付款' })
        .eq('id', order.id);
        
      console.log(`Cron: Successfully cancelled order ID ${order.id}`);
    }

    return new Response(`Successfully cancelled ${expiredOrders.length} expired orders.`, { status: 200 });
  } catch (error) {
    console.error('Cron: Error cancelling pending orders:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
