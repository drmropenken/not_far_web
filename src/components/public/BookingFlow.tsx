import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type Item = {
  id: string;
  name: string;
  category: 'campsite' | 'equipment' | 'service';
  price_weekday: number;
  price_holiday: number;
  price_original: number;
  total_quantity: number;
};

type SelectedItem = {
  item: Item;
  quantity: number;
};

export default function BookingFlow() {
  const [step, setStep] = useState(0); // 0: Login, 1: Date, 2: Items, 3: Info, 4: Confirm
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', license_plate: '', notes: '' });
  const [availableItems, setAvailableItems] = useState<{item: Item, remaining: number}[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [fetchingItems, setFetchingItems] = useState(false);
  
  // Discount states
  const [discountCode, setDiscountCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(1);
  const [discountError, setDiscountError] = useState('');
  const [discountAppliedCode, setDiscountAppliedCode] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setCustomerInfo(prev => ({ 
          ...prev, 
          email: session.user.email || '', 
          name: session.user.user_metadata?.full_name || '' 
        }));
        setStep(prevStep => prevStep === 0 ? 1 : prevStep);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setStep(prevStep => prevStep === 0 ? 1 : prevStep);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (step === 2 && dates.checkIn && dates.checkOut) {
      fetchAvailableItems();
    }
  }, [step, dates.checkIn, dates.checkOut]);

  const fetchAvailableItems = async () => {
    setFetchingItems(true);
    const start = new Date(dates.checkIn);
    const end = new Date(dates.checkOut);
    
    // 1. Fetch all items
    const { data: items } = await supabase
      .from('nf_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!items) {
      setFetchingItems(false);
      return;
    }

    // Sort by category
    const categoryWeight: Record<string, number> = { campsite: 1, equipment: 2, service: 3 };
    items.sort((a, b) => {
      if (categoryWeight[a.category] !== categoryWeight[b.category]) {
        return categoryWeight[a.category] - categoryWeight[b.category];
      }
      return a.sort_order - b.sort_order;
    });

    // 2. Fetch inventory for the period
    const startStr = start.toISOString().split('T')[0];
    const endStr = new Date(end.getTime() - 86400000).toISOString().split('T')[0];
    
    const { data: inventory } = await supabase
      .from('nf_inventory')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr);

    const available: {item: Item, remaining: number}[] = [];

    for (const item of items) {
      let minRemaining = item.total_quantity;

      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const record = inventory?.find(i => i.item_id === item.id && i.date === dateStr);
        
        const override = record?.override_quantity;
        const total = (override !== null && override !== undefined) ? override : item.total_quantity;
        const booked = record?.booked_quantity || 0;
        const remaining = Math.max(0, total - booked);

        if (remaining < minRemaining) {
          minRemaining = remaining;
        }
      }
      available.push({ item, remaining: minRemaining });
    }

    setAvailableItems(available);
    setFetchingItems(false);
  };

  const handleItemSelect = (item: Item, quantity: number) => {
    setSelectedItems(prev => {
      const existing = prev.find(p => p.item.id === item.id);
      if (quantity === 0) {
        return prev.filter(p => p.item.id !== item.id);
      }
      if (existing) {
        return prev.map(p => p.item.id === item.id ? { ...p, quantity } : p);
      }
      return [...prev, { item, quantity }];
    });
  };

  const calculateTotal = () => {
    let total = 0;
    const start = new Date(dates.checkIn);
    const end = new Date(dates.checkOut);

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      selectedItems.forEach(({ item, quantity }) => {
        if (item.category === 'campsite' || item.category === 'equipment') {
          total += (isWeekend ? item.price_holiday : item.price_weekday) * quantity;
        }
      });
    }

    selectedItems.forEach(({ item, quantity }) => {
      if (item.category === 'service') {
        total += item.price_weekday * quantity;
      }
    });

    return Math.round(total * discountPercent);
  };

  const calculateDiscountAmount = () => {
    let total = 0;
    const start = new Date(dates.checkIn);
    const end = new Date(dates.checkOut);

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      selectedItems.forEach(({ item, quantity }) => {
        if (item.category === 'campsite' || item.category === 'equipment') {
          total += (isWeekend ? item.price_holiday : item.price_weekday) * quantity;
        }
      });
    }

    selectedItems.forEach(({ item, quantity }) => {
      if (item.category === 'service') {
        total += item.price_weekday * quantity;
      }
    });

    return Math.round(total * (1 - discountPercent));
  };

  const handleVerifyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountPercent(1);
      setDiscountError('');
      setDiscountAppliedCode('');
      return;
    }
    const { data } = await supabase
      .from('nf_discount_codes')
      .select('*')
      .eq('code', discountCode.trim().toUpperCase())
      .eq('is_active', true)
      .single();
      
    if (data) {
      setDiscountPercent(data.discount_percent);
      setDiscountError('');
      setDiscountAppliedCode(data.code);
    } else {
      setDiscountPercent(1);
      setDiscountError('無效的折扣碼或已停用');
      setDiscountAppliedCode('');
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    try {
      // 1. Generate Order Number (Max 20 chars for ECPay)
      const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(2, 14); // YYMMDDHHMMSS (12 chars)
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 chars
      const orderNo = `N${dateStr}${randomStr}`; // 17 chars total

      const totalAmount = calculateTotal();
      const discountAmount = calculateDiscountAmount();

      // 2. Create Order
      const { data: orderData, error: orderError } = await supabase
        .from('nf_orders')
        .insert([{
          order_no: orderNo,
          check_in_date: dates.checkIn,
          check_out_date: dates.checkOut,
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          license_plate: customerInfo.license_plate,
          notes: `[Email: ${customerInfo.email}] ${customerInfo.notes}`,
          total_amount: totalAmount,
          discount_code: discountAppliedCode || null,
          discount_amount: discountAmount,
          status: 'pending'
        }])
        .select('id')
        .single();

      if (orderError) throw orderError;
      const orderId = orderData.id;

      // 3. Create Order Items
      const orderItemsToInsert = selectedItems.map(({ item, quantity }) => ({
        order_id: orderId,
        item_id: item.id,
        quantity: quantity,
        unit_price: item.price_weekday // Simplified for now
      }));

      const { error: itemsError } = await supabase.from('nf_order_items').insert(orderItemsToInsert);
      if (itemsError) throw itemsError;

      // 4. Lock Inventory
      const start = new Date(dates.checkIn);
      const end = new Date(dates.checkOut);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split('T')[0];
        for (const { item, quantity } of selectedItems) {
          // Fetch existing inventory record
          const { data: invData } = await supabase
            .from('nf_inventory')
            .select('id, booked_quantity')
            .eq('date', dStr)
            .eq('item_id', item.id)
            .single();

          if (invData) {
            await supabase.from('nf_inventory')
              .update({ booked_quantity: invData.booked_quantity + quantity })
              .eq('id', invData.id);
          } else {
            await supabase.from('nf_inventory')
              .insert([{ date: dStr, item_id: item.id, booked_quantity: quantity }]);
          }
        }
      }

      // 5. Redirect to ECPay wrapper API
      window.location.href = `/api/ecpay/create?order_id=${orderId}`;
    } catch (error: any) {
      alert('建立訂單失敗: ' + error.message);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app' }
    });
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white px-5 py-4 shadow-sm z-10 flex items-center justify-between sticky top-0">
        <div className="font-black text-slate-800 tracking-wide flex items-center gap-2">
          <span className="text-emerald-600 text-xl">🏕️</span> 不遠山莊預訂
        </div>
        {session && (
          <button onClick={() => supabase.auth.signOut().then(() => setStep(0))} className="text-xs text-slate-400 font-bold hover:text-slate-600">
            登出
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto flex flex-col relative hide-scrollbar">
        {step === 0 && (
          <div className="flex-1 flex flex-col p-6 items-center justify-center">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
              <div className="text-6xl mb-2">👋</div>
              <h1 className="text-2xl font-black text-slate-800 tracking-wider">歡迎來到不遠</h1>
              <p className="text-sm text-slate-500 font-medium">請先登入以繼續您的預訂流程或查詢訂單</p>
              
              <div className="space-y-3 pt-4">
                <button className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#06C755]/20">
                  <span className="text-xl">💬</span> LINE 快速登入
                </button>
                <button onClick={handleGoogleLogin} className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                  <span className="text-xl">G</span> Google 登入
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 p-6 flex flex-col">
            <h2 className="text-2xl font-black text-slate-800 mb-6">選擇入住日期</h2>
            <div className="space-y-6 flex-1">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">入住日期 (Check-in)</label>
                <input 
                  type="date" 
                  value={dates.checkIn}
                  min={new Date().toLocaleDateString('en-CA')}
                  onChange={(e) => setDates({...dates, checkIn: e.target.value, checkOut: ''})}
                  className="w-full text-lg font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors" 
                />
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">退房日期 (Check-out)</label>
                <input 
                  type="date" 
                  value={dates.checkOut}
                  min={dates.checkIn ? new Date(new Date(dates.checkIn).getTime() + 86400000).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA')}
                  onChange={(e) => setDates({...dates, checkOut: e.target.value})}
                  disabled={!dates.checkIn}
                  className="w-full text-lg font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors disabled:opacity-50" 
                />
              </div>
            </div>
            <div className="pt-6 mt-auto">
              <button 
                onClick={() => setStep(2)} 
                disabled={!dates.checkIn || !dates.checkOut}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步 <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}
        
        {step === 2 && (
          <div className="flex-1 p-6 flex flex-col">
            <button onClick={() => setStep(1)} className="text-slate-400 text-sm font-bold mb-4 flex items-center gap-1 hover:text-slate-600 w-fit">&larr; 返回修改日期</button>
            <h2 className="text-2xl font-black text-slate-800 mb-6">選擇方案</h2>
            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              {fetchingItems ? (
                <div className="flex flex-col items-center justify-center py-20 text-emerald-500">
                  <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
                  <p className="font-bold tracking-widest text-sm">搜尋空房與裝備中...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableItems.map(({ item, remaining }) => {
                    const selected = selectedItems.find(s => s.item.id === item.id);
                    const qty = selected?.quantity || 0;
                    
                    return (
                      <div key={item.id} className={`p-4 rounded-2xl border-2 transition-all ${qty > 0 ? 'border-emerald-500 bg-emerald-50/30 shadow-md' : 'border-slate-100 bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 mb-1 inline-block">
                              {item.category === 'campsite' ? '⛺️ 營位' : item.category === 'equipment' ? '🪑 裝備' : '🍖 服務'}
                            </span>
                            <h3 className="font-black text-slate-800 text-lg leading-tight">{item.name}</h3>
                            <div className="text-sm text-slate-500 font-bold mt-1">
                              平日 ${item.price_weekday} / 假日 ${item.price_holiday}
                            </div>
                          </div>
                          <div className="text-right">
                            {remaining > 0 ? (
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">剩餘 {remaining}</span>
                            ) : (
                              <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">已額滿</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                          <span className="text-sm font-bold text-slate-600">數量</span>
                          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-1 border border-slate-200">
                            <button 
                              onClick={() => handleItemSelect(item, Math.max(0, qty - 1))}
                              className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50"
                              disabled={qty === 0}
                            >-</button>
                            <span className="w-6 text-center font-black text-slate-800">{qty}</span>
                            <button 
                              onClick={() => handleItemSelect(item, Math.min(remaining, qty + 1))}
                              className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-emerald-600 font-bold hover:bg-emerald-50 disabled:opacity-50"
                              disabled={qty >= remaining || remaining === 0}
                            >+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="pt-6 mt-auto border-t border-slate-100 shrink-0">
              <button 
                onClick={() => setStep(3)} 
                disabled={selectedItems.length === 0}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步 <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 p-6 flex flex-col">
             <button onClick={() => setStep(2)} className="text-slate-400 text-sm font-bold mb-4 flex items-center gap-1 hover:text-slate-600 w-fit">&larr; 返回修改方案</button>
            <h2 className="text-2xl font-black text-slate-800 mb-6">填寫聯絡資料</h2>
            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              <div className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-lg">聯絡資訊</h3>
                
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">聯絡人姓名 <span className="text-rose-500">*</span></label>
                  <input required type="text" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="例如：王小明"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">手機號碼 <span className="text-rose-500">*</span></label>
                  <input required type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="例如：0912345678"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">電子郵件 <span className="text-rose-500">*</span></label>
                  <input required type="email" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="用於寄送訂單通知"/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">車牌號碼 (選填)</label>
                  <input type="text" value={customerInfo.license_plate} onChange={e => setCustomerInfo({...customerInfo, license_plate: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="如有開車請填寫，方便辨識進場"/>
                </div>
                
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">折扣碼 (選填)</label>
                  <div className="flex gap-2">
                    <input type="text" value={discountCode} onChange={e => setDiscountCode(e.target.value.toUpperCase())} className="flex-1 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono tracking-wider" placeholder="請輸入折扣代碼"/>
                    <button type="button" onClick={handleVerifyDiscount} className="bg-slate-800 text-white px-5 rounded-xl font-bold hover:bg-slate-700 transition-colors whitespace-nowrap text-sm">套用</button>
                  </div>
                  {discountError && <p className="text-rose-500 text-sm mt-1.5 font-bold">{discountError}</p>}
                  {discountPercent < 1 && <p className="text-emerald-600 text-sm mt-1.5 font-bold">成功套用 {discountAppliedCode}，享 {(discountPercent * 10).toFixed(1).replace('.0', '')} 折優惠！</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">特殊需求備註 (選填)</label>
                  <textarea value={customerInfo.notes} onChange={e => setCustomerInfo({...customerInfo, notes: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none" placeholder="有任何需要我們協助的地方嗎？"/>
                </div>
              </div>
            </div>
            <div className="pt-6 mt-auto border-t border-slate-100 shrink-0">
              <button 
                onClick={() => setStep(4)} 
                disabled={!customerInfo.name || !customerInfo.phone || !customerInfo.email}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步 <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 p-6 flex flex-col">
             <button onClick={() => setStep(3)} className="text-slate-400 text-sm font-bold mb-4 flex items-center gap-1 hover:text-slate-600 w-fit">&larr; 返回修改資料</button>
            <h2 className="text-2xl font-black text-slate-800 mb-6">確認結帳</h2>
            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 mb-4">
                <h3 className="font-bold text-slate-500 uppercase tracking-wider text-xs border-b border-slate-100 pb-2">入住資訊</h3>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-bold">入住日期</span>
                  <span className="text-slate-800 font-black">{dates.checkIn}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-bold">退房日期</span>
                  <span className="text-slate-800 font-black">{dates.checkOut}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-slate-500 uppercase tracking-wider text-xs border-b border-slate-100 pb-2">預訂明細</h3>
                {selectedItems.map(({ item, quantity }) => (
                  <div key={item.id} className="flex justify-between items-center">
                    <span className="text-slate-700 font-bold">{item.name} <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-xs ml-1">x {quantity}</span></span>
                    <span className="text-slate-800 font-black text-sm">已計入</span>
                  </div>
                ))}
                
                <div className="space-y-2 mt-4 pt-4 border-t border-emerald-100/50 text-slate-700 font-medium">
                  <div className="flex justify-between items-center text-sm">
                    <span>原價總計</span>
                    <span>NT$ {(calculateTotal() / discountPercent).toLocaleString()}</span>
                  </div>
                  {discountPercent < 1 && (
                    <div className="flex justify-between items-center text-sm text-rose-500 font-bold">
                      <span>折扣金額 ({discountAppliedCode})</span>
                      <span>- NT$ {calculateDiscountAmount().toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-end mt-2 pt-2 border-t border-emerald-200/50">
                    <span>最終結帳金額</span>
                    <span className="text-3xl font-black text-emerald-700">NT$ {calculateTotal().toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 mt-auto border-t border-slate-100 shrink-0">
              <button 
                onClick={handleCheckout}
                className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-500 transition-colors text-lg tracking-widest flex items-center justify-center gap-2"
              >
                前往綠界付款 <span>💳</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
