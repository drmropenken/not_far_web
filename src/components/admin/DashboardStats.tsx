import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  nf_order_items: { quantity: number; nf_items: { name: string } }[];
};

export default function DashboardStats() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // 獲取非取消狀態的訂單
    const { data, error } = await supabase
      .from('nf_orders')
      .select(`
        id, order_no, customer_name, customer_phone, check_in_date, check_out_date, total_amount, status, created_at,
        nf_order_items ( quantity, nf_items ( name ) )
      `)
      .neq('status', 'cancelled');
      
    if (data) {
      setOrders(data);
    }
    setLoading(false);
  };

  // 取得當地時間的 YYYY-MM-DD
  const today = new Date().toLocaleDateString('en-CA'); 
  const currentMonthStr = today.substring(0, 7); // YYYY-MM

  const checkinsToday = orders.filter(o => o.check_in_date === today);
  const checkoutsToday = orders.filter(o => o.check_out_date === today);
  
  // 計算本月已收帳款 (狀態為 paid，且在當月建立的訂單)
  const monthlyRevenue = orders
    .filter(o => o.status === 'paid' && o.created_at.startsWith(currentMonthStr))
    .reduce((sum, o) => sum + o.total_amount, 0);

  const pendingOrders = orders.filter(o => o.status === 'pending');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-amber-600/60 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
        <p className="font-medium tracking-widest text-sm">載入營運數據中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Stat Cards */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute -right-4 -bottom-4 text-emerald-500/10 text-8xl transition-transform group-hover:scale-110">⛺️</div>
          <p className="text-sm text-slate-500 font-bold tracking-wider mb-2 z-10">今日預計進場</p>
          <p className="text-3xl font-black text-slate-800 z-10">{checkinsToday.length} <span className="text-base font-medium text-slate-400">組</span></p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute -right-4 -bottom-4 text-blue-500/10 text-8xl transition-transform group-hover:scale-110">🚗</div>
          <p className="text-sm text-slate-500 font-bold tracking-wider mb-2 z-10">今日預計離場</p>
          <p className="text-3xl font-black text-slate-800 z-10">{checkoutsToday.length} <span className="text-base font-medium text-slate-400">組</span></p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute -right-4 -bottom-4 text-amber-500/10 text-8xl transition-transform group-hover:scale-110">💰</div>
          <p className="text-sm text-slate-500 font-bold tracking-wider mb-2 z-10">本月已收帳款</p>
          <p className="text-3xl font-black text-emerald-600 z-10">NT$ {monthlyRevenue.toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 flex flex-col justify-center relative overflow-hidden group bg-rose-50/50 hover:shadow-md transition-all">
          <div className="absolute -right-4 -bottom-4 text-rose-500/10 text-8xl transition-transform group-hover:scale-110">⚠️</div>
          <p className="text-sm text-rose-600 font-bold tracking-wider mb-2 z-10">待收款訂單</p>
          <p className="text-3xl font-black text-rose-700 z-10">{pendingOrders.length} <span className="text-base font-medium text-rose-400">筆未結</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Check-ins List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="font-bold text-slate-800 tracking-wide flex items-center gap-2">
              <span className="text-emerald-500">📥</span> 今日進場名單
            </h3>
            <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{checkinsToday.length} 組</span>
          </div>
          <div className="p-0 overflow-y-auto flex-1 hide-scrollbar">
            {checkinsToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                <span className="text-4xl opacity-50">🍃</span>
                <p className="text-sm font-medium tracking-wider">今日無人進場</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {checkinsToday.map(order => (
                  <li key={order.id} className="p-5 hover:bg-slate-50 transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        {order.customer_name}
                        {order.status === 'pending' && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] rounded border border-rose-200">尚未付款</span>}
                      </div>
                      <div className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">{order.order_no}</div>
                    </div>
                    <div className="text-sm text-slate-600 mb-3 font-mono flex items-center gap-1.5">
                      <span>📞</span> {order.customer_phone}
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-600 space-y-1.5 shadow-sm group-hover:border-slate-200 transition-colors">
                      {order.nf_order_items.map((oi, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="line-clamp-1 flex-1 pr-2">{oi.nf_items?.name}</span>
                          <span className="font-mono font-bold text-slate-500 shrink-0">x{oi.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Check-outs List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="font-bold text-slate-800 tracking-wide flex items-center gap-2">
              <span className="text-blue-500">📤</span> 今日離場名單
            </h3>
            <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{checkoutsToday.length} 組</span>
          </div>
          <div className="p-0 overflow-y-auto flex-1 hide-scrollbar">
            {checkoutsToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                <span className="text-4xl opacity-50">🍃</span>
                <p className="text-sm font-medium tracking-wider">今日無人離場</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {checkoutsToday.map(order => (
                  <li key={order.id} className="p-5 hover:bg-slate-50 transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        {order.customer_name}
                        {order.status === 'pending' && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] rounded border border-rose-200">尚未付款</span>}
                      </div>
                      <div className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">{order.order_no}</div>
                    </div>
                    <div className="text-sm text-slate-600 mb-3 font-mono flex items-center gap-1.5">
                      <span>📞</span> {order.customer_phone}
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-600 space-y-1.5 shadow-sm group-hover:border-slate-200 transition-colors">
                      {order.nf_order_items.map((oi, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="line-clamp-1 flex-1 pr-2">{oi.nf_items?.name}</span>
                          <span className="font-mono font-bold text-slate-500 shrink-0">x{oi.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
