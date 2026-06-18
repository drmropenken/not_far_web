import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import OrderModal from './OrderModal';
import EditOrderItemsModal from './EditOrderItemsModal';

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
  status: 'pending' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled';
  deposit_amount?: number;
  notes: string | null;
  admin_notes: string | null;
  discount_code: string | null;
  discount_amount: number;
  created_at: string;
  payment_method?: string;
  virtual_account?: string;
  nf_order_items: OrderItem[];
};

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFinancialsId, setEditingFinancialsId] = useState<string | null>(null);
  const [financialsForm, setFinancialsForm] = useState({ total_amount: '', deposit_amount: '' });
  const [editingOrderItemsOrder, setEditingOrderItemsOrder] = useState<Order | null>(null);

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

  const updateOrderStatus = async (orderId: string, newStatus: 'pending' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled') => {
    if (!confirm(`確定要將此訂單標記為「${newStatus === 'paid' ? '已付款' : newStatus === 'cancelled' ? '已取消' : newStatus === 'checked_in' ? '已報到' : '狀態變更'}」嗎？`)) return;

    // 如果是取消訂單，退還庫存
    if (newStatus === 'cancelled') {
      const order = orders.find(o => o.id === orderId);
      if (order && order.status !== 'cancelled') {
        const start = new Date(order.check_in_date);
        const end = new Date(order.check_out_date);
        
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const isFirstNight = d.getTime() === start.getTime();
          
          for (const oi of order.nf_order_items) {
            const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
            if (isSingleTime && !isFirstNight) continue;

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
    
    const orderToUpdate = orders.find(o => o.id === orderId);
    let updateData: any = { status: newStatus };
    // 如果手動標記為「已付款」，我們順便把「已收定金」直接填滿為「總金額」，確保資料的一致性
    if (newStatus === 'paid' && orderToUpdate) {
      updateData.deposit_amount = orderToUpdate.total_amount;
    }

    const { error } = await supabase
      .from('nf_orders')
      .update(updateData)
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
        const isFirstNight = d.getTime() === start.getTime();

        for (const oi of order.nf_order_items) {
          const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
          if (isSingleTime && !isFirstNight) continue;

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

  const updateOrderNote = async (orderId: number, currentNote: string) => {
    const newNote = prompt('請輸入客人備註：', currentNote);
    if (newNote === null) return;
    const { error } = await supabase.from('nf_orders').update({ notes: newNote }).eq('id', orderId);
    if (error) alert('更新失敗');
    else fetchOrders();
  };

  const updateAdminNote = async (orderId: string, currentNote: string) => {
    const newNote = prompt('請輸入營主內部備註 (僅管理員可見)：', currentNote);
    if (newNote === null) return;
    const { error } = await supabase.from('nf_orders').update({ admin_notes: newNote }).eq('id', orderId);
    if (error) alert('更新失敗');
    else fetchOrders();
  };

  const openFinancialsModal = (order: Order) => {
    // 如果是已付款狀態且沒有設定定金，代表他付了全額，我們把原本的總額當作已付定金帶入
    let paidAmount = order.deposit_amount || 0;
    if (paidAmount === 0 && (order.status === 'paid' || order.status === 'checked_in')) {
      paidAmount = order.total_amount;
    }

    setFinancialsForm({
      total_amount: order.total_amount?.toString() || '0',
      deposit_amount: paidAmount.toString()
    });
    setEditingFinancialsId(order.id);
  };

  const saveFinancials = async () => {
    if (!editingFinancialsId) return;
    const total = parseInt(financialsForm.total_amount) || 0;
    const deposit = parseInt(financialsForm.deposit_amount) || 0;
    const newStatus = deposit > 0 && deposit < total ? 'deposit_paid' : (deposit >= total ? 'paid' : 'pending');

    const currentOrder = orders.find(o => o.id === editingFinancialsId);
    let finalStatus = currentOrder?.status;
    // 如果原本是已取消或已報到，我們不改他的狀態，只改金額
    if (finalStatus !== 'cancelled' && finalStatus !== 'checked_in') {
      finalStatus = newStatus as any;
    }

    const { error } = await supabase
      .from('nf_orders')
      .update({ total_amount: total, deposit_amount: deposit, status: finalStatus })
      .eq('id', editingFinancialsId);

    if (error) {
      alert('更新金額失敗：' + error.message);
    } else {
      fetchOrders();
      setEditingFinancialsId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesStatus = activeTab === 'all' || order.status === activeTab;
    const matchesSearch = searchTerm === '' || 
      order.order_no.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_phone.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">已付款</span>;
      case 'deposit_paid': return <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-bold border border-teal-200 shadow-sm">🪙 已付定金</span>;
      case 'checked_in': return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">✅ 已報到</span>;
      case 'pending': return <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">待付款</span>;
      case 'cancelled': return <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold border border-rose-200">已取消</span>;
      default: return null;
    }
  };

  const handleExportCSV = () => {
    const headers = ['訂單編號', '訂購人姓名', '聯絡電話', '車牌號碼', '入住日期', '退房日期', '訂單狀態', '總金額(元)', '客人備註', '營主內部備註', '折扣碼', '折扣金額', '下單時間'];
    
    const rows = filteredOrders.map(order => [
      order.order_no,
      order.customer_name,
      order.customer_phone,
      order.license_plate || '',
      order.check_in_date,
      order.check_out_date,
      order.status === 'paid' ? '已付款' : order.status === 'deposit_paid' ? '已付定金' : order.status === 'pending' ? '待付款' : order.status === 'checked_in' ? '已報到' : '已取消',
      order.total_amount,
      `"${(order.notes || '').replace(/"/g, '""')}"`,
      `"${(order.admin_notes || '').replace(/"/g, '""')}"`,
      order.discount_code || '',
      order.discount_amount || 0,
      new Date(order.created_at).toLocaleString('zh-TW')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-stone-200 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-48px)] w-full">
      
      {/* 工具列與篩選標籤 (緊湊設計) */}
      <div className="px-4 md:px-6 pt-3 md:pt-4 border-b border-stone-200 shrink-0 flex flex-col md:flex-row justify-between md:items-end gap-3 bg-white md:rounded-t-2xl z-10">
        
        {/* 篩選標籤 */}
        <div className="flex gap-2 md:gap-4 overflow-x-auto hide-scrollbar w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: '全部訂單' },
            { id: 'pending', label: '待付款' },
            { id: 'deposit_paid', label: '已付定金' },
            { id: 'paid', label: '已付款' },
            { id: 'checked_in', label: '已報到' },
            { id: 'cancelled', label: '已取消' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 md:px-5 md:py-2.5 rounded-t-lg font-bold text-sm transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-amber-500 text-amber-600 bg-amber-50/50' 
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 搜尋列與新增訂單按鈕 */}
        <div className="pb-3 md:pb-2 flex flex-col sm:flex-row w-full md:w-auto justify-end gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 sm:w-64">
            <input 
              type="text" 
              placeholder="搜尋姓名、電話、訂單編號..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
            />
            <span className="absolute left-3 top-1/2 -transtone-y-1/2 opacity-50">🔍</span>
          </div>
          <button 
            onClick={handleExportCSV}
            className="bg-white text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-emerald-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            📥 匯出 Excel
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-700 text-emerald-50 hover:bg-stone-700 px-5 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-stone-700 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span className="text-base leading-none mb-0.5">+</span> 手動接單
          </button>
        </div>
      </div>

      {/* 訂單列表區域 */}
      <div className="flex-1 overflow-auto bg-stone-50 p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-amber-600/60 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
            <p className="font-medium tracking-widest text-sm">載入訂單資料中...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-4 bg-white rounded-xl border border-stone-200/50 border-dashed min-h-[300px]">
            <span className="text-5xl opacity-50">🏕️</span>
            <p className="font-medium tracking-wider">目前沒有符合條件的訂單</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 align-top">
            {filteredOrders.map(order => (
              <div key={order.id} className={`bg-white rounded-xl border ${order.status === 'cancelled' ? 'border-rose-100 opacity-75' : 'border-stone-200'} shadow-sm overflow-hidden hover:shadow-md transition-all group`}>
                {/* 訂單表頭 */}
                <div className={`bg-stone-100/50 border-b ${order.status === 'cancelled' ? 'border-rose-100' : 'border-stone-100'} px-5 py-3 flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-stone-500 bg-stone-200/70 px-2 py-1 rounded">
                      {order.order_no}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="text-xs text-stone-400">
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
                        <h3 className={`font-bold text-lg ${order.status === 'cancelled' ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{order.customer_name}</h3>
                        <p className="text-sm text-stone-500 font-mono">{order.customer_phone}</p>
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 text-sm space-y-1.5 border border-stone-100">
                      <div className="flex justify-between">
                        <span className="text-stone-500">入住日期</span>
                        <span className="font-bold text-stone-700">{order.check_in_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">退營日期</span>
                        <span className="font-bold text-stone-700">{order.check_out_date}</span>
                      </div>
                      {order.license_plate && (
                        <div className="flex justify-between border-t border-stone-200/60 pt-1.5 mt-1.5">
                          <span className="text-stone-500">車牌號碼</span>
                          <span className="font-mono text-stone-700">{order.license_plate}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 項目與金額 */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">預訂內容</h4>
                        {order.status !== 'cancelled' && (
                          <button onClick={() => setEditingOrderItemsOrder(order)} className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors font-medium border border-indigo-200 shadow-sm opacity-0 group-hover:opacity-100">
                            <span>🛍️</span> 編輯明細
                          </button>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {order.nf_order_items?.map(item => (
                          <li key={item.id} className="text-sm flex justify-between items-start">
                            <span className="text-stone-700 line-clamp-1">{item.nf_items?.name}</span>
                            <span className="text-stone-500 font-mono ml-2 shrink-0">x {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 p-2 bg-stone-100/50 hover:bg-stone-100 rounded text-xs text-stone-600 border border-stone-200 cursor-pointer transition-colors group/note" onClick={() => updateOrderNote(order.id as unknown as number, order.notes || '')}>
                        <div className="flex justify-between items-start">
                          <span>💬 客人備註：{order.notes || <span className="opacity-50 italic">無</span>}</span>
                          <span className="opacity-0 group-hover/note:opacity-100 text-stone-500">✏️</span>
                        </div>
                      </div>
                      <div className="mt-2 p-2 bg-amber-50 hover:bg-amber-100/80 rounded text-xs text-amber-800 border border-amber-200 cursor-pointer transition-colors group/note" onClick={() => updateAdminNote(order.id, order.admin_notes || '')}>
                        <div className="flex justify-between items-start font-medium">
                          <span>📝 營主備註：{order.admin_notes || <span className="opacity-50 italic">點擊新增內部備註...</span>}</span>
                          <span className="opacity-0 group-hover/note:opacity-100 text-amber-600">✏️</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <div className="text-right">
                        {order.discount_code && (
                          <div className="text-xs text-emerald-600 font-bold mb-1">
                            🎟️ {order.discount_code} (-NT$ {order.discount_amount?.toLocaleString()})
                          </div>
                        )}
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-stone-500">總金額</span>
                            <span className={`text-xl font-bold tracking-tight ${order.status === 'cancelled' ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                              NT$ {order.total_amount?.toLocaleString()}
                            </span>
                            {order.status !== 'cancelled' && (
                              <button onClick={() => openFinancialsModal(order)} className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-amber-600" title="微調訂單金額">
                                ✏️
                              </button>
                            )}
                          </div>
                          {(order.deposit_amount || 0) > 0 && order.status !== 'cancelled' && (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-teal-600">🪙 已收定金</span>
                                <span className="text-sm font-bold text-teal-600 tracking-tight">
                                  - NT$ {order.deposit_amount?.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-end items-end gap-2 mt-1 pt-1 border-t border-stone-200 border-dashed">
                                {order.deposit_amount && order.deposit_amount > order.total_amount ? (
                                  <>
                                    <span className="text-xs text-rose-500 font-bold mb-1">
                                      🚨 需退款
                                    </span>
                                    <span className="text-2xl font-black tracking-tight text-rose-600">
                                      NT$ {(order.deposit_amount - order.total_amount).toLocaleString()}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs text-stone-500 font-bold mb-1">
                                      {order.status === 'paid' || order.status === 'checked_in' ? '實收尾款' : '待收尾款'}
                                    </span>
                                    <span className={`text-2xl font-black tracking-tight ${order.status === 'paid' || order.status === 'checked_in' ? 'text-stone-500' : 'text-rose-600'}`}>
                                      NT$ {Math.max(0, order.total_amount - (order.deposit_amount || 0)).toLocaleString()}
                                    </span>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                          {(!order.deposit_amount || order.deposit_amount === 0 || order.status === 'cancelled') && (
                            <div className={`text-2xl font-bold tracking-tight mt-1 ${order.status === 'cancelled' ? 'text-stone-400' : 'text-emerald-600'}`}>
                              NT$ {order.total_amount?.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {order.payment_method === 'bank_transfer' && order.status === 'pending' && (
                  <div className="mx-5 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-1">
                    <div className="text-amber-800 font-bold text-sm flex items-center gap-2">
                      <span>🏦</span> 客人選擇虛擬帳號匯款
                    </div>
                    <div className="text-amber-700 text-sm">
                      請核對玉山銀行 (808) 帳號：<span className="font-black text-lg text-emerald-700 tracking-widest bg-white px-2 py-0.5 rounded border border-amber-200 ml-1">{order.virtual_account}</span>
                    </div>
                    <div className="text-amber-600 text-xs mt-1">若已收到款項，請點擊下方按鈕手動更改狀態。</div>
                  </div>
                )}

                {/* 操作按鈕 */}
                <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => deleteOrder(order.id)} className="px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-md transition-colors mr-auto">
                    刪除紀錄
                  </button>
                  {order.status === 'pending' && (
                    <button onClick={() => updateOrderStatus(order.id, 'paid')} className="px-4 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors">
                      標記為已付款
                    </button>
                  )}
                  {order.status === 'deposit_paid' && (
                    <button onClick={() => updateOrderStatus(order.id, 'paid')} className="px-4 py-1.5 text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors shadow-sm">
                      標記已付尾款 (轉為已付款)
                    </button>
                  )}
                  {order.status === 'paid' && (
                    <button onClick={() => updateOrderStatus(order.id, 'checked_in')} className="px-4 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shadow-sm">
                      ✅ 標記已報到
                    </button>
                  )}
                  {order.status !== 'cancelled' && (
                    <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="px-4 py-1.5 text-xs font-bold text-stone-600 bg-white hover:bg-stone-100 border border-stone-200 rounded-md transition-colors">
                      取消訂單 (退還庫存)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 編輯訂單金額 Modal */}
      {editingFinancialsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden border border-stone-200">
            <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <h3 className="font-bold text-stone-800 flex items-center gap-2">
                <span>💰</span> 訂單金額微調
              </h3>
              <button onClick={() => setEditingFinancialsId(null)} className="text-stone-400 hover:text-rose-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-600 mb-1.5">最終總金額</label>
                <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-lg border border-stone-200">
                  <span className="text-stone-500">NT$</span>
                  <input 
                    type="number" 
                    min="0"
                    value={financialsForm.total_amount}
                    onChange={e => setFinancialsForm({...financialsForm, total_amount: e.target.value})}
                    className="flex-1 bg-transparent border-none p-0 text-right font-bold focus:ring-0 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-600 mb-1.5">已收定金</label>
                <div className="flex items-center gap-2 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span className="text-emerald-600">NT$</span>
                  <input 
                    type="number" 
                    min="0"
                    value={financialsForm.deposit_amount}
                    onChange={e => setFinancialsForm({...financialsForm, deposit_amount: e.target.value})}
                    className="flex-1 bg-transparent border-none p-0 text-right font-bold focus:ring-0 outline-none text-emerald-700"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-stone-100 flex justify-between items-end">
                <span className="text-sm font-bold text-stone-500">
                  {parseInt(financialsForm.deposit_amount) > 0 ? '試算尾款' : '總金額'}
                </span>
                <span className="text-xl font-black text-amber-600">
                  NT$ {Math.max(0, (parseInt(financialsForm.total_amount) || 0) - (parseInt(financialsForm.deposit_amount) || 0)).toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-stone-400 text-center leading-relaxed bg-stone-50 p-2 rounded">
                💡 提示：儲存後，若定金大於 0 且小於總額，<br/>系統會自動將訂單轉為「已付定金」狀態。
              </div>
            </div>
            <div className="p-4 border-t border-stone-100 flex justify-end gap-2 bg-stone-50">
              <button onClick={() => setEditingFinancialsId(null)} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded-lg font-bold transition-colors">
                取消
              </button>
              <button onClick={saveFinancials} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-colors">
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}

      <OrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchOrders} 
      />

      <EditOrderItemsModal
        isOpen={!!editingOrderItemsOrder}
        onClose={() => setEditingOrderItemsOrder(null)}
        onSuccess={() => {
          fetchOrders();
          setEditingOrderItemsOrder(null);
        }}
        order={editingOrderItemsOrder}
      />
    </div>
  );
}
