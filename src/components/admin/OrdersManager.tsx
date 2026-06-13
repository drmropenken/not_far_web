import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import OrderModal from './OrderModal';

type Item = {
  id: string;
  name: string;
  category: 'campsite' | 'equipment' | 'service';
  price_weekday: number;
  price_holiday: number;
  price_original: number;
};

type OrderItem = {
  id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  nf_items: Item;
};

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  license_plate: string | null;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  notes: string | null;
  discount_code: string | null;
  discount_amount: number;
  created_at: string;
  nf_order_items: OrderItem[];
};

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('nf_orders')
      .select(`
        *,
        nf_order_items (
          *,
          nf_items (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: 'pending' | 'paid' | 'cancelled') => {
    if (!confirm(`確定要將此訂單標記為「${newStatus === 'paid' ? '已付款' : newStatus === 'cancelled' ? '已取消' : '待付款'}」嗎？`)) return;

    // 如果是取消訂單，退還庫存
    if (newStatus === 'cancelled') {
      const order = orders.find(o => o.id === orderId);
      if (order && order.status !== 'cancelled') {
        const start = new Date(order.check_in_date);
        const end = new Date(order.check_out_date);
        
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          
          for (const oi of order.nf_order_items) {
            const { data: inv } = await supabase
              .from('nf_inventory')
              .select('id, booked_quantity')
              .eq('date', dateStr)
              .eq('item_id', oi.item_id)
              .single();
              
            if (inv && inv.booked_quantity > 0) {
              await supabase
                .from('nf_inventory')
                .update({ booked_quantity: Math.max(0, inv.booked_quantity - oi.quantity) })
                .eq('id', inv.id);
            }
          }
        }
      }
    }
    
    const { error } = await supabase
      .from('nf_orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      alert('更新失敗: ' + error.message);
    } else {
      fetchOrders();
    }
  };

  const deleteOrder = async (orderId: string) => {
    if (!confirm('警告：確定要刪除這筆訂單嗎？此動作無法復原！(通常建議使用「取消訂單」保留紀錄)')) return;
    
    // 找出這筆訂單
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // 如果訂單尚未取消，強制退還庫存
    if (order.status !== 'cancelled') {
      const start = new Date(order.check_in_date);
      const end = new Date(order.check_out_date);
      
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        for (const oi of order.nf_order_items) {
          const { data: inv } = await supabase
            .from('nf_inventory')
            .select('id, booked_quantity')
            .eq('date', dateStr)
            .eq('item_id', oi.item_id)
            .single();
            
          if (inv && inv.booked_quantity > 0) {
            await supabase
              .from('nf_inventory')
              .update({ booked_quantity: Math.max(0, inv.booked_quantity - oi.quantity) })
              .eq('id', inv.id);
          }
        }
      }
    }

    // 先刪除關聯的訂單明細 (避免 Foreign Key 阻擋)
    await supabase.from('nf_order_items').delete().eq('order_id', orderId);

    // 最後刪除主訂單
    const { error } = await supabase
      .from('nf_orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      fetchOrders();
    }
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">已付款</span>;
      case 'pending': return <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">待付款</span>;
      case 'cancelled': return <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold border border-rose-200">已取消</span>;
      default: return null;
    }
  };

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-48px)] w-full">
      
      {/* 工具列與篩選標籤 (緊湊設計) */}
      <div className="px-4 md:px-6 pt-3 md:pt-4 border-b border-slate-200 shrink-0 flex flex-col-reverse md:flex-row justify-between md:items-end gap-3 bg-white md:rounded-t-2xl z-10">
        
        {/* 篩選標籤 */}
        <div className="flex gap-2 md:gap-4 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: '全部訂單' },
            { id: 'pending', label: '待付款' },
            { id: 'paid', label: '已付款' },
            { id: 'cancelled', label: '已取消' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 md:px-5 md:py-2.5 rounded-t-lg font-bold text-sm transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-amber-500 text-amber-600 bg-amber-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 新增訂單按鈕 */}
        <div className="pb-2 flex justify-end">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-800 text-amber-300 hover:bg-slate-700 px-5 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-slate-700 flex items-center justify-center gap-2"
          >
            <span className="text-base leading-none mb-0.5">+</span> 手動新增訂單
          </button>
        </div>
      </div>

      {/* 訂單列表區域 */}
      <div className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-amber-600/60 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
            <p className="font-medium tracking-widest text-sm">載入訂單資料中...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 bg-white rounded-xl border border-slate-200/50 border-dashed min-h-[300px]">
            <span className="text-5xl opacity-50">🏕️</span>
            <p className="font-medium tracking-wider">目前沒有符合條件的訂單</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 align-top">
            {filteredOrders.map(order => (
              <div key={order.id} className={`bg-white rounded-xl border ${order.status === 'cancelled' ? 'border-rose-100 opacity-75' : 'border-slate-200'} shadow-sm overflow-hidden hover:shadow-md transition-all group`}>
                {/* 訂單表頭 */}
                <div className={`bg-slate-100/50 border-b ${order.status === 'cancelled' ? 'border-rose-100' : 'border-slate-100'} px-5 py-3 flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-500 bg-slate-200/70 px-2 py-1 rounded">
                      {order.order_no}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="text-xs text-slate-400">
                    下單時間: {new Date(order.created_at).toLocaleString('zh-TW')}
                  </div>
                </div>
                
                {/* 訂單內容 */}
                <div className="p-5 flex flex-col md:flex-row gap-6">
                  {/* 客戶資訊 */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${order.status === 'cancelled' ? 'bg-rose-50 text-rose-500 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'} flex items-center justify-center font-bold text-lg border`}>
                        {order.customer_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className={`font-bold text-lg ${order.status === 'cancelled' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{order.customer_name}</h3>
                        <p className="text-sm text-slate-500 font-mono">{order.customer_phone}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1.5 border border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">入住日期</span>
                        <span className="font-bold text-slate-700">{order.check_in_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">退營日期</span>
                        <span className="font-bold text-slate-700">{order.check_out_date}</span>
                      </div>
                      {order.license_plate && (
                        <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1.5">
                          <span className="text-slate-500">車牌號碼</span>
                          <span className="font-mono text-slate-700">{order.license_plate}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 項目與金額 */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="space-y-2 mb-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">預訂內容</h4>
                      <ul className="space-y-1.5">
                        {order.nf_order_items?.map(item => (
                          <li key={item.id} className="text-sm flex justify-between items-start">
                            <span className="text-slate-700 line-clamp-1">{item.nf_items?.name}</span>
                            <span className="text-slate-500 font-mono ml-2 shrink-0">x {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      {order.notes && (
                        <div className="mt-2 p-2 bg-amber-50/50 rounded text-xs text-amber-700 border border-amber-100/50">
                          📝 {order.notes}
                        </div>
                      )}
                    </div>
                    <div className="mt-auto">
                      <div className="text-right">
                        {order.discount_code && (
                          <div className="text-xs text-emerald-600 font-bold mb-1">
                            🎟️ {order.discount_code} (-NT$ {order.discount_amount?.toLocaleString()})
                          </div>
                        )}
                        <div className="flex justify-end items-end gap-2">
                          <span className="text-xs text-slate-500 mb-1">總金額</span>
                          <span className={`text-2xl font-bold tracking-tight ${order.status === 'cancelled' ? 'text-slate-400' : 'text-emerald-600'}`}>
                            NT$ {order.total_amount?.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 操作按鈕 */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => deleteOrder(order.id)} className="px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-md transition-colors mr-auto">
                    刪除紀錄
                  </button>
                  {order.status !== 'paid' && order.status !== 'cancelled' && (
                    <button onClick={() => updateOrderStatus(order.id, 'paid')} className="px-4 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors">
                      標記為已付款
                    </button>
                  )}
                  {order.status !== 'cancelled' && (
                    <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors">
                      取消訂單 (退還庫存)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <OrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchOrders} 
      />
    </div>
  );
}
