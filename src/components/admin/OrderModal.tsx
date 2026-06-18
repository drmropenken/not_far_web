import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type Item = {
  id: string;
  name: string;
  category: string;
  price_weekday: number;
  price_holiday: number;
  total_quantity: number;
};

type OrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function OrderModal({ isOpen, onClose, onSuccess }: OrderModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    license_plate: '',
    check_in_date: '',
    check_out_date: '',
    notes: '',
    discount_code: '',
  });

  const [selectedItems, setSelectedItems] = useState<{item: Item, quantity: number}[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(1);
  const [discountError, setDiscountError] = useState('');
  const [manualTotal, setManualTotal] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetchItems();
      // Reset form
      setFormData({
        customer_name: '',
        customer_phone: '',
        license_plate: '',
        check_in_date: new Date().toISOString().split('T')[0],
        check_out_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        notes: '',
        discount_code: '',
      });
      setSelectedItems([]);
      setDiscountPercent(1);
      setDiscountError('');
      setManualTotal('');
      setDepositAmount('');
    }
  }, [isOpen]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase.from('nf_items').select('*').order('sort_order');
    setItems(data || []);
    setLoading(false);
  };

  const handleVerifyDiscount = async () => {
    if (!formData.discount_code) {
      setDiscountPercent(1);
      setDiscountError('');
      return;
    }
    const { data } = await supabase
      .from('nf_discount_codes')
      .select('*')
      .eq('code', formData.discount_code)
      .eq('is_active', true)
      .single();
      
    if (data) {
      setDiscountPercent(data.discount_percent);
      setDiscountError('');
    } else {
      setDiscountPercent(1);
      setDiscountError('無效的折扣碼或已過期');
    }
  };

  const toggleItem = (item: Item) => {
    const existing = selectedItems.find(i => i.item.id === item.id);
    if (existing) {
      setSelectedItems(selectedItems.filter(i => i.item.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, { item, quantity: 1 }]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.item.id === itemId) {
        const newQ = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQ };
      }
      return i;
    }));
  };

  const calculateOriginalTotal = () => {
    if (!formData.check_in_date || !formData.check_out_date) return 0;
    const start = new Date(formData.check_in_date);
    const end = new Date(formData.check_out_date);
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
    return Math.floor(calculateOriginalTotal() * discountPercent);
  };

  const calculateDiscountAmount = () => {
    return Math.floor(calculateOriginalTotal() * (1 - discountPercent));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      alert('請至少選擇一個營位或裝備');
      return;
    }

    setSaving(true);
    const finalTotal = manualTotal ? parseInt(manualTotal) || 0 : calculateTotal();
    const discountAmount = calculateDiscountAmount();
    const deposit = parseInt(depositAmount) || 0;
    const finalStatus = deposit > 0 && deposit < finalTotal ? 'deposit_paid' : (deposit >= finalTotal ? 'paid' : 'pending');
    
    // 1. 建立訂單
    const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(2, 14);
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNo = `N${dateStr}${randomStr}`;
    
    const { data: newOrder, error: orderError } = await supabase
      .from('nf_orders')
      .insert([{
        order_no: orderNo,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        license_plate: formData.license_plate,
        check_in_date: formData.check_in_date,
        check_out_date: formData.check_out_date,
        notes: formData.notes,
        total_amount: finalTotal,
        discount_code: formData.discount_code || null,
        discount_amount: discountAmount,
        deposit_amount: deposit,
        status: finalStatus // 依據定金自動判斷狀態
      }])
      .select()
      .single();

    if (orderError) {
      alert('建立訂單失敗: ' + orderError.message);
      setSaving(false);
      return;
    }

    // 2. 建立訂單明細
    const orderItemsToInsert = selectedItems.map(si => ({
      order_id: newOrder.id,
      item_id: si.item.id,
      quantity: si.quantity,
      unit_price: si.item.price_weekday // 簡化紀錄，實際上這裡通常紀錄平均價或不用記，因為 total 已經算好了
    }));

    await supabase.from('nf_order_items').insert(orderItemsToInsert);

    // 3. 扣除庫存 (更新 nf_inventory.booked_quantity)
    const start = new Date(formData.check_in_date);
    const end = new Date(formData.check_out_date);
    
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const isFirstNight = d.getTime() === start.getTime();
      
      for (const si of selectedItems) {
        const isSingleTime = si.item.category === 'service' && (si.item.name.includes('單次') || si.item.name.includes('次計費'));
        if (isSingleTime && !isFirstNight) continue;

        // 先讀取當天該項目是否有紀錄
        const { data: existingInv } = await supabase
          .from('nf_inventory')
          .select('id, booked_quantity')
          .eq('date', dateStr)
          .eq('item_id', si.item.id)
          .single();

        if (existingInv) {
          const { error: updErr } = await supabase
            .from('nf_inventory')
            .update({ booked_quantity: existingInv.booked_quantity + si.quantity })
            .eq('id', existingInv.id);
          if (updErr) alert(`更新庫存失敗 (${dateStr}): ${updErr.message}`);
        } else {
          const { error: insErr } = await supabase
            .from('nf_inventory')
            .insert([{
              date: dateStr,
              item_id: si.item.id,
              booked_quantity: si.quantity
            }]);
          if (insErr) alert(`新增庫存失敗 (${dateStr}): ${insErr.message} (可能是 Supabase RLS 權限問題)`);
        }
      }
    }

    setSaving(false);
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl bg-amber-100 text-amber-600 p-2 rounded-lg">📝</span>
            <h3 className="text-2xl font-bold text-stone-800 tracking-wide">手動新增訂單</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-rose-500 transition-colors p-2 rounded-full hover:bg-rose-50">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <form id="orderForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 bg-stone-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* 左側：客戶資料 */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h4 className="font-bold text-stone-700 border-b border-stone-100 pb-2 mb-4 flex items-center gap-2">
                  <span className="text-emerald-500">👤</span> 客戶資訊
                </h4>
                <div>
                  <label className="block text-sm font-semibold text-stone-600 mb-1.5">客戶姓名 <span className="text-rose-500">*</span></label>
                  <input required type="text" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="例如：王小明"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-600 mb-1.5">聯絡電話 <span className="text-rose-500">*</span></label>
                  <input required type="tel" value={formData.customer_phone} onChange={e => setFormData({...formData, customer_phone: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="例如：0912345678"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-600 mb-1.5">車牌號碼 (選填)</label>
                  <input type="text" value={formData.license_plate} onChange={e => setFormData({...formData, license_plate: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="例如：ABC-1234"/>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h4 className="font-bold text-stone-700 border-b border-stone-100 pb-2 mb-4 flex items-center gap-2">
                  <span className="text-emerald-500">📅</span> 預訂日期
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-stone-600 mb-1.5">入營日期 <span className="text-rose-500">*</span></label>
                    <input required type="date" value={formData.check_in_date} onChange={e => setFormData({...formData, check_in_date: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-sm"/>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-stone-600 mb-1.5">退營日期 <span className="text-rose-500">*</span></label>
                    <input required type="date" min={formData.check_in_date} value={formData.check_out_date} onChange={e => setFormData({...formData, check_out_date: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-sm"/>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h4 className="font-bold text-stone-700 border-b border-stone-100 pb-2 mb-4 flex items-center gap-2">
                  <span className="text-emerald-500">🏷️</span> 折扣與備註
                </h4>
                <div>
                  <label className="block text-sm font-semibold text-stone-600 mb-1.5">套用折扣碼</label>
                  <div className="flex gap-2">
                    <input type="text" value={formData.discount_code} onChange={e => setFormData({...formData, discount_code: e.target.value.toUpperCase()})} className="flex-1 border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 outline-none font-mono uppercase" placeholder="例如：VIP95"/>
                    <button type="button" onClick={handleVerifyDiscount} className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-stone-700 transition-colors whitespace-nowrap">套用</button>
                  </div>
                  {discountError && <p className="text-rose-500 text-xs mt-1 font-bold">{discountError}</p>}
                  {discountPercent < 1 && <p className="text-emerald-600 text-xs mt-1 font-bold">成功套用 {discountPercent * 10} 折！</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-600 mb-1.5">訂單備註 (選填)</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 outline-none resize-none h-20" placeholder="有什麼特殊需求嗎？"/>
                </div>
              </div>
            </div>

            {/* 右側：選擇營位裝備 */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm h-full flex flex-col">
                <h4 className="font-bold text-stone-700 border-b border-stone-100 pb-2 mb-4 flex items-center gap-2 shrink-0">
                  <span className="text-emerald-500">🏕️</span> 預訂項目
                </h4>
                
                {loading ? (
                  <div className="flex-1 flex items-center justify-center text-stone-400">載入項目中...</div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[400px]">
                    {items.map(item => {
                      const isSelected = selectedItems.some(i => i.item.id === item.id);
                      const selectedData = selectedItems.find(i => i.item.id === item.id);
                      const quantity = selectedData?.quantity || 0;
                      
                      let breakdownText = "";
                      let itemTotalStr = "";

                      if (isSelected && formData.check_in_date && formData.check_out_date) {
                        const nights = Math.round((new Date(formData.check_out_date).getTime() - new Date(formData.check_in_date).getTime()) / (1000 * 60 * 60 * 24));
                        const isSingleTime = item.category === 'service' && (item.name.includes('單次') || item.name.includes('次計費'));
                        const unit = item.category === 'campsite' ? '帳' : '份';
                        
                        let itemTotal = 0;
                        let weekdays = 0;
                        let holidays = 0;
                        
                        if (isSingleTime) {
                          itemTotal = item.price_weekday * quantity;
                          breakdownText = `NT$ ${item.price_weekday} × ${quantity} ${unit}`;
                        } else if (item.category === 'service') {
                          itemTotal = item.price_weekday * quantity * nights;
                          breakdownText = `NT$ ${item.price_weekday} × ${quantity} ${unit} × ${nights} 晚`;
                        } else {
                          const start = new Date(formData.check_in_date);
                          const end = new Date(formData.check_out_date);
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
                            breakdownText = `(平日 $${item.price_weekday} × ${weekdays}晚 + 假日 $${item.price_holiday} × ${holidays}晚) × ${quantity}${unit}`;
                          } else if (holidays > 0) {
                            breakdownText = `假日 $${item.price_holiday} × ${holidays}晚 × ${quantity}${unit}`;
                          } else {
                            breakdownText = `平日 $${item.price_weekday} × ${weekdays}晚 × ${quantity}${unit}`;
                          }
                        }
                        itemTotalStr = `NT$ ${itemTotal.toLocaleString()}`;
                      }
                      
                      return (
                        <div key={item.id} className={`p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-amber-400 bg-amber-50/30' : 'border-stone-100 hover:border-stone-300'}`}>
                          <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleItem(item)}>
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-amber-500 border-amber-500' : 'bg-white border-stone-300'}`}>
                                {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                              </div>
                              <div>
                                <h5 className="font-bold text-stone-800">{item.name}</h5>
                                <p className="text-xs text-stone-500">平日 ${item.price_weekday} / 假日 ${item.price_holiday}</p>
                              </div>
                            </div>
                          </div>
                          
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-amber-200/50">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-semibold text-stone-600">數量</span>
                                <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg p-1 shadow-sm">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 text-stone-600 font-bold">-</button>
                                  <span className="w-8 text-center font-bold text-amber-600">{selectedData?.quantity}</span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 text-stone-600 font-bold">+</button>
                                </div>
                              </div>
                              {formData.check_in_date && formData.check_out_date && (
                                <div className="flex justify-between items-start text-xs bg-white p-2 rounded border border-amber-100">
                                  <span className="text-stone-500 font-medium leading-relaxed max-w-[70%]">{breakdownText}</span>
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

                <div className="mt-4 pt-4 border-t-2 border-stone-100 border-dashed shrink-0 space-y-3">
                  <div className="flex justify-between items-center text-sm text-stone-500">
                    <span>原價總計</span>
                    <span>NT$ {calculateOriginalTotal().toLocaleString()}</span>
                  </div>
                  {discountPercent < 1 && (
                    <div className="flex justify-between items-center text-sm text-rose-500 font-bold">
                      <span>折扣金額</span>
                      <span>- NT$ {calculateDiscountAmount().toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-stone-50 p-2 rounded-lg border border-stone-200">
                    <span className="font-bold text-stone-700">✏️ 手動修改總價</span>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400">NT$</span>
                      <input 
                        type="number" 
                        min="0"
                        placeholder={`系統試算: ${calculateTotal()}`}
                        value={manualTotal}
                        onChange={e => setManualTotal(e.target.value)}
                        className="w-24 border border-stone-300 rounded p-1.5 text-right text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                    <span className="font-bold text-emerald-700">🪙 已收定金</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600">NT$</span>
                      <input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        value={depositAmount}
                        onChange={e => setDepositAmount(e.target.value)}
                        className="w-24 border border-emerald-300 rounded p-1.5 text-right text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-end mt-4 pt-2 border-t border-stone-200">
                    <span className="font-bold text-stone-700 text-sm">
                      {parseInt(depositAmount) > 0 ? '剩餘待付尾款' : '最終結帳總金額'}
                    </span>
                    <span className="text-3xl font-black text-emerald-600 tracking-tighter">
                      NT$ {Math.max(0, (manualTotal ? parseInt(manualTotal) || 0 : calculateTotal()) - (parseInt(depositAmount) || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </form>

        <div className="p-4 md:p-6 border-t border-stone-200 bg-white flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-bold transition-colors">
            取消
          </button>
          <button type="submit" form="orderForm" disabled={saving} className="px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 建立中...</>
            ) : (
              '確定建立訂單'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
