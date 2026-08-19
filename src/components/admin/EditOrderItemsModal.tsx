import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type Item = {
  id: string;
  name: string;
  category: string;
  price_weekday: number;
  price_holiday: number;
  total_quantity: number;
  image_url?: string | null;
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
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  deposit_amount?: number;
  status: string;
  discount_amount?: number;
  nf_order_items: OrderItem[];
};

const getCategoryStyle = (category: string) => {
  switch (category) {
    case 'campsite': return { badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: '⛺', label: '營位', border: 'border-orange-400', activeBg: 'bg-orange-50/30', btnBg: 'bg-orange-500', btnText: 'text-orange-600', btnHover: 'hover:bg-orange-100' };
    case 'equipment': return { badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: '🪑', label: '裝備', border: 'border-blue-400', activeBg: 'bg-blue-50/30', btnBg: 'bg-blue-500', btnText: 'text-blue-600', btnHover: 'hover:bg-blue-100' };
    case 'service': return { badge: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🍖', label: '服務', border: 'border-purple-400', activeBg: 'bg-purple-50/30', btnBg: 'bg-purple-500', btnText: 'text-purple-600', btnHover: 'hover:bg-purple-100' };
    default: return { badge: 'bg-stone-100 text-stone-700 border-stone-200', icon: '📦', label: '其他', border: 'border-stone-400', activeBg: 'bg-stone-50/30', btnBg: 'bg-stone-500', btnText: 'text-stone-600', btnHover: 'hover:bg-stone-100' };
  }
};

type EditOrderItemsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  order: Order | null;
};

export default function EditOrderItemsModal({ isOpen, onClose, onSuccess, order }: EditOrderItemsModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, number>>({});
  
  // Array of currently selected items
  const [selectedItems, setSelectedItems] = useState<{item: Item, quantity: number}[]>([]);

  useEffect(() => {
    if (isOpen && order) {
      fetchItems();
      fetchAvailability(order);
      const initialSelected = order.nf_order_items.map(oi => ({
        item: oi.nf_items,
        quantity: oi.quantity
      }));
      setSelectedItems(initialSelected);
    }
  }, [isOpen, order]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('nf_items')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (data) {
      const categoryWeight: Record<string, number> = { campsite: 1, equipment: 2, service: 3 };
      data.sort((a, b) => {
        if (categoryWeight[a.category] !== categoryWeight[b.category]) {
          return (categoryWeight[a.category] || 99) - (categoryWeight[b.category] || 99);
        }
        return a.sort_order - b.sort_order;
      });
      setItems(data);
    }
    setLoading(false);
  };

  const fetchAvailability = async (currentOrder: MonthOrder) => {
    if (!currentOrder?.check_in_date || !currentOrder?.check_out_date) return;
    const campId = currentOrder.camp_id || localStorage.getItem('camp_id');

    const { data: campItems } = await supabase
      .from('nf_items')
      .select('*')
      .eq('camp_id', campId);
    if (!campItems || campItems.length === 0) return;
    const itemIds = campItems.map(i => i.id);

    const dates: string[] = [];
    const start = new Date(currentOrder.check_in_date);
    const end = new Date(currentOrder.check_out_date);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    if (dates.length === 0) return;

    const { data: inventoryData } = await supabase
      .from('nf_inventory')
      .select('*')
      .in('item_id', itemIds)
      .in('date', dates);

    const oldItemsMap = new Map(currentOrder.nf_order_items.map(oi => [oi.item_id, oi.quantity]));
    const minMap: Record<string, number> = {};

    for (const item of campItems) {
      let minRemaining = item.total_quantity;
      const orderCurrentQty = oldItemsMap.get(item.id) || 0;

      for (const dateStr of dates) {
        const isFirstNight = dateStr === dates[0];
        const isSingleTime = item.name.includes('單次') || item.name.includes('次計費');
        if (item.category === 'service' && isSingleTime && !isFirstNight) {
          continue;
        }

        const record = inventoryData?.find(i => i.item_id === item.id && i.date === dateStr);
        const override = record?.override_quantity;
        const total = (override !== null && override !== undefined) ? override : item.total_quantity;
        const booked = record?.booked_quantity || 0;
        // 剩餘量加上此訂單目前已佔用的數量，即為此訂單最多可調整到的上限
        const remainingForThisOrder = Math.max(0, total - booked + orderCurrentQty);

        if (remainingForThisOrder < minRemaining) {
          minRemaining = remainingForThisOrder;
        }
      }
      minMap[item.id] = minRemaining;
    }

    setAvailabilityMap(minMap);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.item.id === itemId) {
        const available = availabilityMap[itemId] ?? i.item.total_quantity;
        const newQ = Math.max(0, Math.min(i.quantity + delta, available));
        return { ...i, quantity: newQ };
      }
      return i;
    }).filter(i => i.quantity > 0)); // Remove if quantity is 0
  };

  const toggleItem = (item: Item) => {
    const existing = selectedItems.find(i => i.item.id === item.id);
    if (existing) {
      setSelectedItems(selectedItems.filter(i => i.item.id !== item.id));
    } else {
      const available = availabilityMap[item.id] ?? item.total_quantity;
      if (available > 0) {
        setSelectedItems([...selectedItems, { item, quantity: 1 }]);
      }
    }
  };

  const calculateOriginalTotal = () => {
    if (!order?.check_in_date || !order?.check_out_date) return 0;
    const start = new Date(order.check_in_date);
    const end = new Date(order.check_out_date);
    const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    let total = 0;

    selectedItems.forEach(si => {
      const isSingleTime = si.item.category === 'service' && (si.item.name.includes('單次') || si.item.name.includes('次計費'));
      
      if (isSingleTime) {
        total += si.item.price_weekday * si.quantity;
      } else if (si.item.category === 'service') {
        total += si.item.price_weekday * si.quantity * nights;
      } else {
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const price = isWeekend ? si.item.price_holiday : si.item.price_weekday;
          total += price * si.quantity;
        }
      }
    });
    return total;
  };

  const calculateTotal = () => {
    return Math.max(0, calculateOriginalTotal() - (order?.discount_amount || 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (selectedItems.length === 0) {
      if (!confirm('警告：您移除了所有項目！確定要儲存嗎？（建議您直接使用「取消訂單」功能）')) return;
    }

    // 檢查是否有選中超出數量的項目
    for (const si of selectedItems) {
      const available = availabilityMap[si.item.id] ?? si.item.total_quantity;
      if (si.quantity > available) {
        alert(`項目「${si.item.name}」在所選日期僅剩餘可調整至 ${available}，請調整預訂數量！`);
        return;
      }
    }

    setSaving(true);
    const finalTotal = calculateTotal();
    
    // 1. Calculate inventory deltas
    const oldItemsMap = new Map(order.nf_order_items.map(oi => [oi.item_id, oi.quantity]));
    const newItemsMap = new Map(selectedItems.map(si => [si.item.id, si.quantity]));
    const allItemIds = new Set([...oldItemsMap.keys(), ...newItemsMap.keys()]);
    
    const start = new Date(order.check_in_date);
    const end = new Date(order.check_out_date);
    
    for (const itemId of allItemIds) {
      const oldQty = oldItemsMap.get(itemId) || 0;
      const newQty = newItemsMap.get(itemId) || 0;
      const delta = newQty - oldQty; 
      
      if (delta === 0) continue; 
      
      const itemData = items.find(i => i.id === itemId) || order.nf_order_items.find(oi => oi.item_id === itemId)?.nf_items;
      const isSingleTimeItem = itemData?.category === 'service' && 
        (itemData?.name.includes('單次') || itemData?.name.includes('次計費'));
      
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const isFirstNight = d.getTime() === start.getTime();
        
        if (isSingleTimeItem && !isFirstNight) continue;

        const { data: inv } = await supabase
          .from('nf_inventory')
          .select('id, booked_quantity')
          .eq('date', dateStr)
          .eq('item_id', itemId)
          .single();

        if (inv) {
          const newBookedQty = Math.max(0, inv.booked_quantity + delta);
          await supabase
            .from('nf_inventory')
            .update({ booked_quantity: newBookedQty })
            .eq('id', inv.id);
        } else if (delta > 0) {
          await supabase
            .from('nf_inventory')
            .insert([{
              date: dateStr,
              item_id: itemId,
              booked_quantity: delta
            }]);
        }
      }
    }

    // 2. Update nf_order_items
    for (const oi of order.nf_order_items) {
      if (!newItemsMap.has(oi.item_id)) {
        await supabase.from('nf_order_items').delete().eq('id', oi.id);
      }
    }
    for (const si of selectedItems) {
      const existing = order.nf_order_items.find(oi => oi.item_id === si.item.id);
      if (existing) {
        if (existing.quantity !== si.quantity) {
          await supabase.from('nf_order_items').update({ quantity: si.quantity }).eq('id', existing.id);
        }
      } else {
        await supabase.from('nf_order_items').insert([{
          order_id: order.id,
          item_id: si.item.id,
          quantity: si.quantity,
          unit_price: si.item.price_weekday
        }]);
      }
    }

    // Calculate how much they have already paid
    let historicalPaid = order.deposit_amount || 0;
    if (historicalPaid === 0 && (order.status === 'paid' || order.status === 'checked_in')) {
      historicalPaid = order.total_amount;
    }

    // 3. Update nf_orders total_amount and ensure deposit_amount reflects what they paid
    await supabase.from('nf_orders').update({ 
      total_amount: finalTotal,
      deposit_amount: historicalPaid
    }).eq('id', order.id);

    setSaving(false);
    onSuccess();
    onClose();
  };

  if (!isOpen || !order) return null;

  const currentTotal = calculateTotal();
  // Calculate how much they have already paid for UI display
  let deposit = order.deposit_amount || 0;
  if (deposit === 0 && (order.status === 'paid' || order.status === 'checked_in')) {
    deposit = order.total_amount;
  }
  const needRefund = deposit > currentTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl bg-indigo-100 text-indigo-600 p-2 rounded-lg">🛍️</span>
            <div>
              <h3 className="text-2xl font-bold text-stone-800 tracking-wide">編輯訂單明細</h3>
              <p className="text-sm text-stone-500 mt-1">{order.customer_name} • {order.order_no} • {order.check_in_date} 入住</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-rose-500 transition-colors p-2 rounded-full hover:bg-rose-50">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <form id="editItemsForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 bg-stone-50">
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm h-full flex flex-col mx-auto">
            <h4 className="font-bold text-stone-700 border-b border-stone-100 pb-2 mb-4 flex items-center gap-2 shrink-0">
              <span className="text-emerald-500">🏕️</span> 調整預訂項目
            </h4>
            
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-stone-400 py-10">載入項目中...</div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[300px] sm:max-h-[400px]">
                {items.map(item => {
                  const isSelected = selectedItems.some(i => i.item.id === item.id);
                  const selectedData = selectedItems.find(i => i.item.id === item.id);
                  const quantity = selectedData?.quantity || 0;
                  const catStyle = getCategoryStyle(item.category);
                  
                  const available = availabilityMap[item.id] ?? item.total_quantity;
                  const isSoldOut = available <= 0;

                  let breakdownText = "";
                  let itemTotalStr = "";

                  if (isSelected && order.check_in_date && order.check_out_date) {
                    const nights = Math.round((new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / (1000 * 60 * 60 * 24));
                    const isSingleTime = item.category === 'service' && (item.name.includes('單次') || item.name.includes('次計費'));
                    const unit = item.category === 'campsite' ? '帳' : '份';
                    
                    let itemTotal = 0;
                    let weekdays = 0;
                    let holidays = 0;
                    
                    if (isSingleTime) {
                      itemTotal = item.price_weekday * quantity;
                      breakdownText = `NT$ ${item.price_weekday.toLocaleString()} × ${quantity} ${unit}`;
                    } else if (item.category === 'service') {
                      itemTotal = item.price_weekday * quantity * nights;
                      breakdownText = `NT$ ${item.price_weekday.toLocaleString()} × ${quantity} ${unit} × ${nights} 晚`;
                    } else {
                      const start = new Date(order.check_in_date);
                      const end = new Date(order.check_out_date);
                      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        if (isWeekend) {
                          holidays++;
                          itemTotal += item.price_holiday * quantity;
                        } else {
                          weekdays++;
                          itemTotal += item.price_weekday * quantity;
                        }
                      }
                      if (holidays > 0 && weekdays > 0) {
                        breakdownText = `(平日 $${item.price_weekday.toLocaleString()} × ${weekdays}晚 + 假日 $${item.price_holiday.toLocaleString()} × ${holidays}晚) × ${quantity}${unit}`;
                      } else if (holidays > 0) {
                        breakdownText = `假日 $${item.price_holiday.toLocaleString()} × ${holidays}晚 × ${quantity}${unit}`;
                      } else {
                        breakdownText = `平日 $${item.price_weekday.toLocaleString()} × ${weekdays}晚 × ${quantity}${unit}`;
                      }
                    }
                    itemTotalStr = `NT$ ${itemTotal.toLocaleString()}`;
                  }
                  
                  return (
                    <div key={item.id} className={`p-3 rounded-xl border-2 transition-all ${isSoldOut && !isSelected ? 'border-stone-100 opacity-50' : isSelected ? `${catStyle.border} ${catStyle.activeBg}` : 'border-stone-100 hover:border-stone-300'}`}>
                      <div className="flex justify-between items-center cursor-pointer" onClick={() => (!isSoldOut || isSelected) && toggleItem(item)}>
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${isSelected ? `${catStyle.btnBg} border-transparent` : isSoldOut ? 'bg-stone-100 border-stone-200' : 'bg-white border-stone-300'}`}>
                            {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                          </div>
                          <div className="flex flex-col gap-1 items-start flex-1">
                            <div className="flex items-center gap-2 flex-wrap justify-between w-full">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border flex items-center gap-1 ${catStyle.badge}`}>
                                  <span>{catStyle.icon}</span>{catStyle.label}
                                </span>
                                <h5 className="font-bold text-stone-800 leading-tight">{item.name}</h5>
                              </div>
                              <span className={`px-2 py-0.5 text-xs font-bold rounded-full shrink-0 ${
                                isSoldOut ? 'bg-red-100 text-red-600' : available <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {isSoldOut ? '已額滿' : `剩餘 ${available}`}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500">平日 ${item.price_weekday.toLocaleString()} / 假日 ${item.price_holiday.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      
                      {isSelected && (
                        <div className={`mt-3 pt-3 border-t ${catStyle.border} border-opacity-50 space-y-2`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-semibold text-stone-600">數量</span>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg p-1 shadow-sm">
                                <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }} className={`w-8 h-8 rounded-md flex items-center justify-center ${catStyle.btnHover} text-stone-600 font-bold transition-colors`}>-</button>
                                <span className={`w-8 text-center font-bold ${catStyle.btnText}`}>{quantity}</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }} disabled={quantity >= available} className={`w-8 h-8 rounded-md flex items-center justify-center ${catStyle.btnHover} text-stone-600 font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}>+</button>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                isSoldOut ? 'bg-red-100 text-red-600' : available <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                剩餘 {available}
                              </span>
                            </div>
                          </div>
                          {order.check_in_date && order.check_out_date && (
                            <div className={`flex justify-between items-start text-xs bg-white p-2 rounded border ${catStyle.border} border-opacity-30 shadow-sm`}>
                              <span className="text-stone-500 font-medium leading-relaxed">{breakdownText}</span>
                              <span className="text-stone-700 font-bold text-right ml-2">{itemTotalStr}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-6 pt-4 border-t-2 border-stone-100 border-dashed shrink-0 space-y-3">
              <div className="flex justify-between items-center text-sm text-stone-500">
                <span>原本總金額</span>
                <span className="line-through">NT$ {order.total_amount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center bg-stone-50 p-2 rounded-lg border border-stone-200">
                <span className="font-bold text-stone-700">重新試算總金額</span>
                <span className="text-xl font-black text-stone-800 tracking-tighter">NT$ {currentTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-stone-500">
                <span>已收定金 (或全額)</span>
                <span>NT$ {deposit.toLocaleString()}</span>
              </div>
              
              <div className={`mt-2 p-3 rounded-lg flex items-center justify-between border ${needRefund ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <span className={`font-bold ${needRefund ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {needRefund ? '🚨 需現場退款給客人' : '待收剩餘尾款'}
                </span>
                <span className={`text-2xl font-black tracking-tighter ${needRefund ? 'text-rose-600' : 'text-emerald-600'}`}>
                  NT$ {Math.abs(currentTotal - deposit).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </form>

        <div className="p-4 md:p-6 border-t border-stone-200 bg-white flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-bold transition-colors">
            取消
          </button>
          <button type="submit" form="editItemsForm" disabled={saving} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 處理中...</>
            ) : (
              '確定儲存變更'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
