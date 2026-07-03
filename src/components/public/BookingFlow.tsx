import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { supabase } from '../../lib/supabase';
import ImageCarousel from './ImageCarousel';
import roomImagesMap from '../../lib/roomImagesMap.json';

type Item = {
  id: string;
  name: string;
  category: 'campsite' | 'equipment' | 'service';
  price_weekday: number;
  price_holiday: number;
  price_original: number;
  total_quantity: number;
  image_url?: string | null;
};

type SelectedItem = {
  item: Item;
  quantity: number;
};

const getCategoryStyle = (category: string) => {
  switch (category) {
    case 'campsite': return { badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: '⛺', label: '營位', border: 'border-orange-400', activeBg: 'bg-orange-50/30', btnBg: 'bg-orange-500', btnText: 'text-orange-600', btnHover: 'hover:bg-orange-100' };
    case 'equipment': return { badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: '🪑', label: '裝備', border: 'border-blue-400', activeBg: 'bg-blue-50/30', btnBg: 'bg-blue-500', btnText: 'text-blue-600', btnHover: 'hover:bg-blue-100' };
    case 'service': return { badge: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🍖', label: '服務', border: 'border-purple-400', activeBg: 'bg-purple-50/30', btnBg: 'bg-purple-500', btnText: 'text-purple-600', btnHover: 'hover:bg-purple-100' };
    default: return { badge: 'bg-slate-100 text-slate-700 border-slate-200', icon: '📦', label: '其他', border: 'border-slate-400', activeBg: 'bg-slate-50/30', btnBg: 'bg-slate-500', btnText: 'text-slate-600', btnHover: 'hover:bg-slate-100' };
  }
};

export default function BookingFlow() {
  const [step, setStep] = useState(0); // 0: Login, 1: Date, 2: Campsite, 3: Addons, 4: Info, 5: Confirm, 6: Success
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', license_plate: '', adults: '2', children: '0', notes: '' });
  const [availableItems, setAvailableItems] = useState<{ item: Item, remaining: number }[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [fetchingItems, setFetchingItems] = useState(false);

  // Discount states
  const [discountCode, setDiscountCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(1);
  const [discountFixedAmount, setDiscountFixedAmount] = useState(0);
  const [discountError, setDiscountError] = useState('');
  const [discountAppliedCode, setDiscountAppliedCode] = useState('');
  const [finalOrderInfo, setFinalOrderInfo] = useState<{ orderNo: string, virtualAccount: string, totalAmount: number } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const hash = window.location.hash;

    // 若網址帶有 Supabase 的登入回傳 token，保持 loading 狀態等待處理
    if (hash.includes('access_token')) {
      setLoading(true);
    }

    const checkSessionAndLiff = async () => {
      // 1. 處理 Google 登入 (Supabase OAuth Hash 回傳)
      if (hash.includes('access_token') && hash.includes('refresh_token')) {
        try {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {
          console.error("Manual session set error:", err);
        }
      }

      // Check if we already have a session to avoid double loading UI flash
      const { data: { session: existingSession } } = await supabase.auth.getSession();

      // 2. 初始化 LIFF 並處理 LINE 暗影登入
      try {
        await liff.init({ liffId: '2010317535-p1JobvGF' });

        if (liff.isLoggedIn()) {
          // Only show loading if we don't already have a session rendering the UI
          if (!existingSession) {
            setLoading(true);
          }
          const profile = await liff.getProfile();
          const idToken = liff.getDecodedIDToken();
          const realEmail = idToken?.email;
          const fakeEmail = realEmail || `${profile.userId}@dummy-line.com`;
          const fakePassword = `${profile.userId}_notfar_secret_2024!`;

          // 嘗試暗影登入
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: fakeEmail,
            password: fakePassword
          });

          if (signInError) {
            // 如果失敗，代表是新用戶，自動註冊
            const { error: signUpError } = await supabase.auth.signUp({
              email: fakeEmail,
              password: fakePassword,
              options: {
                data: {
                  full_name: profile.displayName,
                  avatar_url: profile.pictureUrl,
                  line_id: profile.userId
                }
              }
            });

            if (signUpError) {
              alert("自動註冊失敗：" + signUpError.message);
            }

            // 註冊完重新登入一次確保拿到最新 Session
            const { error: retrySignInError } = await supabase.auth.signInWithPassword({
              email: fakeEmail,
              password: fakePassword
            });

            if (retrySignInError) {
              alert("註冊後登入失敗：" + retrySignInError.message + " (請檢查 Supabase 是否開啟了 Email Confirmation)");
            }
          }
        }
      } catch (err: any) {
        console.error("LIFF Init/Login failed:", err);
      }

      // 3. 統一讀取最終的 Supabase Session
      if (isMounted) {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session) {
          setSession(session);
          setCustomerInfo(prev => ({
            ...prev,
            email: (session.user.email?.includes('@line.notfar.com') || session.user.email?.includes('@dummy-line.com')) ? '' : (session.user.email || ''),
            name: session.user.user_metadata?.full_name || ''
          }));
          setStep(prev => prev === 0 ? 1 : prev);
        }
        setLoading(false);
      }
    };

    checkSessionAndLiff();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && isMounted) {
        setSession(session);
        setCustomerInfo(prev => ({
          ...prev,
          email: (session.user.email?.includes('@line.notfar.com') || session.user.email?.includes('@dummy-line.com')) ? '' : (session.user.email || ''),
          name: session.user.user_metadata?.full_name || ''
        }));
        setStep(prev => prev === 0 ? 1 : prev);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
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
      .eq('is_active', true)
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

    const available: { item: Item, remaining: number }[] = [];

    for (const item of items) {
      let minRemaining = item.total_quantity;
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const isFirstNight = d.getTime() === start.getTime();
        const isSingleTime = item.name.includes('單次') || item.name.includes('次計費');
        if (item.category === 'service' && isSingleTime && !isFirstNight) {
          continue; // 單次服務只需檢查第一天入住時的庫存
        }

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

    available.sort((a, b) => {
      const aEmpty = a.remaining === 0;
      const bEmpty = b.remaining === 0;
      if (aEmpty && !bEmpty) return 1;
      if (!aEmpty && bEmpty) return -1;
      return 0;
    });

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

  const renderItemCard = ({ item, remaining }: { item: Item, remaining: number }) => {
    const selected = selectedItems.find(s => s.item.id === item.id);
    const qty = selected?.quantity || 0;
    const catStyle = getCategoryStyle(item.category);

    const unit = item.category === 'campsite' ? '帳' : '組';

    return (
      <div key={item.id} className={`p-4 rounded-2xl border-2 transition-all ${remaining === 0 ? 'opacity-60 bg-slate-50 border-slate-200' : qty > 0 ? `${catStyle.border} ${catStyle.activeBg} shadow-md` : 'border-slate-100 bg-white shadow-sm'}`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 w-fit mb-2 ${catStyle.badge}`}>
              <span>{catStyle.icon}</span>{catStyle.label}
            </span>
            <h3 className="font-black text-slate-800 text-lg leading-tight">{item.name}</h3>
          </div>
          <div className="text-right shrink-0 ml-2">
            {remaining > 0 ? (
              remaining === 1 ? (
                <span className="text-xs font-black text-rose-600 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 animate-pulse shadow-sm block w-max">🔥 僅剩最後 1 {unit}</span>
              ) : (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 block w-max">剩餘 {remaining}</span>
              )
            ) : (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 block w-max">已額滿</span>
            )}
          </div>
        </div>

        {(() => {
          const mappedImages = roomImagesMap[item.name as keyof typeof roomImagesMap] || [];
          const dbImages = item.image_url ? item.image_url.split(',').map(u => u.trim()).filter(Boolean) : [];
          const itemImages = mappedImages.length > 0 ? mappedImages : dbImages;
          
          if (itemImages.length === 0) return null;
          
          return (
            <div className="mb-3 rounded-xl overflow-hidden aspect-video w-full border border-slate-100 shadow-sm">
              <ImageCarousel images={itemImages} alt={item.name} />
            </div>
          );
        })()}
        
        <div className="text-sm text-slate-500 font-bold mb-3 flex items-center gap-1.5 flex-wrap">
          {item.price_original > 0 && (
            <span className="line-through text-slate-400 font-normal text-xs">原價 ${item.price_original}</span>
          )}
          <span className={item.price_original > 0 ? "text-blue-600 font-black" : ""}>
            平日 ${item.price_weekday} / 假日 ${item.price_holiday}
          </span>
        </div>

        <div className={`flex items-center justify-between border-t border-opacity-50 pt-3 mt-1 ${qty > 0 ? catStyle.border : 'border-slate-100'}`}>
          <span className="text-sm font-bold text-slate-600">數量</span>
          <div className="flex items-center gap-3 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
            <button
              onClick={() => handleItemSelect(item, Math.max(0, qty - 1))}
              className={`w-8 h-8 flex items-center justify-center rounded-lg shadow-sm font-bold disabled:opacity-50 transition-colors ${qty > 0 ? `${catStyle.btnHover} ${catStyle.btnText}` : 'text-slate-600 hover:bg-slate-100'}`}
              disabled={qty === 0}
            >-</button>
            <span className={`w-6 text-center font-black ${qty > 0 ? catStyle.btnText : 'text-slate-800'}`}>{qty}</span>
            <button
              onClick={() => handleItemSelect(item, Math.min(remaining, qty + 1))}
              className={`w-8 h-8 flex items-center justify-center rounded-lg shadow-sm font-bold disabled:opacity-50 transition-colors ${qty > 0 ? `${catStyle.btnHover} ${catStyle.btnText}` : 'text-slate-600 hover:bg-slate-100'}`}
              disabled={qty >= remaining || remaining === 0}
            >+</button>
          </div>
        </div>
      </div>
    );
  };

  const calculateOriginalTotal = () => {
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

    const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    selectedItems.forEach(({ item, quantity }) => {
      if (item.category === 'service') {
        const isSingleTime = item.name.includes('單次') || item.name.includes('次計費');
        total += item.price_weekday * quantity * (isSingleTime ? 1 : nights);
      }
    });

    return total;
  };

  const calculateTotal = () => {
    const original = calculateOriginalTotal();
    if (discountFixedAmount > 0) {
      return Math.max(0, original - discountFixedAmount);
    }
    return Math.round(original * discountPercent);
  };

  const calculateDiscountAmount = () => {
    const original = calculateOriginalTotal();
    if (discountFixedAmount > 0) {
      return Math.min(original, discountFixedAmount);
    }
    return Math.round(original * (1 - discountPercent));
  };

  const handleVerifyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountPercent(1);
      setDiscountFixedAmount(0);
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
      setDiscountPercent(data.discount_percent || 1);
      setDiscountFixedAmount(data.discount_fixed_amount || 0);
      setDiscountError('');
      setDiscountAppliedCode(data.code);
    } else {
      setDiscountPercent(1);
      setDiscountFixedAmount(0);
      setDiscountError('無效的折扣碼或已停用');
      setDiscountAppliedCode('');
    }
  };

  const handleCheckout = async (method: 'ecpay' | 'bank_transfer') => {
    setLoading(true);
    try {
      // 1. Generate Order Number (Max 20 chars for ECPay)
      const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(2, 14); // YYMMDDHHMMSS (12 chars)
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 chars
      const orderNo = `N${dateStr}${randomStr}`; // 17 chars total

      const totalAmount = calculateTotal();
      const discountAmount = calculateDiscountAmount();

      // Prepare inventory updates payload for RPC
      const inventory_updates = [];
      const start = new Date(dates.checkIn);
      const end = new Date(dates.checkOut);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split('T')[0];
        const isFirstNight = d.getTime() === start.getTime();

        for (const { item, quantity } of selectedItems) {
          const isSingleTime = item.category === 'service' && (item.name.includes('單次') || item.name.includes('次計費'));
          if (isSingleTime && !isFirstNight) continue;

          inventory_updates.push({
            date: dStr,
            item_id: item.id,
            quantity: quantity
          });
        }
      }

      const orderDataPayload = {
        order_no: orderNo,
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        license_plate: customerInfo.license_plate,
        notes: `[Email: ${customerInfo.email}] [人數: ${customerInfo.adults}大 ${customerInfo.children}小] ${customerInfo.notes}`,
        total_amount: totalAmount,
        discount_code: discountAppliedCode || null,
        discount_amount: discountAmount,
        deposit_amount: 0,
        status: 'pending',
        payment_method: method,
        virtual_account: null, // 先填 null，等拿到 ID 後再更新
        line_user_id: session?.user?.user_metadata?.line_id || null
      };

      const orderItemsPayload = selectedItems.map(({ item, quantity }) => ({
        item_id: item.id,
        quantity: quantity,
        unit_price: item.price_weekday
      }));

      // 呼叫資料庫底層的 Atomic Transaction (RPC) 確保絕不超賣
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_booking_transaction', {
        p_order: orderDataPayload,
        p_order_items: orderItemsPayload,
        p_inventory_updates: inventory_updates
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const orderId = rpcData.order_id;

      // 網頁下單：使用 88 + 客戶手機後五碼
      let finalVirtualAccount = null;
      if (method === 'bank_transfer') {
        const phoneLast5 = customerInfo.phone.slice(-5).padStart(5, '0');
        finalVirtualAccount = `962948188${phoneLast5}`;
        await supabase.from('nf_orders').update({ 
          payment_method: method,
          virtual_account: finalVirtualAccount 
        }).eq('id', orderId);
      } else if (method === 'ecpay') {
        await supabase.from('nf_orders').update({ payment_method: method }).eq('id', orderId);
      }

      // Email Notification
      try {
        const itemsText = selectedItems.map(({ item, quantity }) => `<li>${item.name} x ${quantity}</li>`).join('');
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'new_order',
            orderData: { ...orderDataPayload, itemsText, virtual_account: finalVirtualAccount }
          })
        });
      } catch (e) {
        console.error('Email failed to send', e);
      }

      // 5. Redirect or Show Success
      if (method === 'ecpay') {
        window.location.href = `/api/ecpay/create?order_id=${orderId}`;
      } else {
        setFinalOrderInfo({
          orderNo,
          virtualAccount: finalVirtualAccount!,
          totalAmount
        });
        setLoading(false);
        setStep(6);
      }
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

  const handleLineLogin = async () => {
    try {
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.origin + '/app' });
      }
    } catch (err: any) {
      alert('LINE登入失敗: ' + err.message);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>;
  }



  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white px-5 py-4 shadow-sm z-10 flex items-center justify-between sticky top-0">
        <a href="/" className="font-black text-slate-800 tracking-wide flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-emerald-600 text-xl">🏕️</span> 不遠山莊預訂
        </a>
        {session && (
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors">回首頁</a>
            <button onClick={() => {
              supabase.auth.signOut().then(() => setStep(0));
              if (liff.isLoggedIn()) liff.logout();
            }} className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
              登出
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col relative hide-scrollbar min-h-0">
        {step === 0 && (
          <div className="flex-1 flex flex-col p-6 items-center justify-center">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
              <div className="text-6xl mb-2">👋</div>
              <h1 className="text-2xl font-black text-slate-800 tracking-wider">歡迎來到不遠</h1>
              <p className="text-sm text-slate-500 font-medium">請先登入以繼續您的預訂流程或查詢訂單</p>

              <div className="space-y-3 pt-4">
                <button onClick={handleLineLogin} className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#06C755]/20">
                  <span className="text-xl">💬</span> LINE 快速登入
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 p-6 flex flex-col min-h-0">
            <h2 className="text-2xl font-black text-slate-800 mb-6">選擇入住日期</h2>
            <div className="space-y-6 flex-1">
              <div className="bg-emerald-50/60 p-6 rounded-2xl shadow-sm border border-emerald-100/50">
                <label className="block text-sm font-black text-emerald-800 uppercase tracking-wider mb-3">入住日期 (Check-in)</label>
                <input
                  type="date"
                  value={dates.checkIn}
                  min={new Date().toLocaleDateString('en-CA')}
                  max={(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toLocaleDateString('en-CA'); })()}
                  onChange={(e) => setDates({ ...dates, checkIn: e.target.value, checkOut: '' })}
                  className="w-full text-xl font-black text-slate-800 bg-white border-2 border-emerald-200/60 rounded-xl px-4 py-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all shadow-inner"
                />
              </div>
              <div className="bg-emerald-50/60 p-6 rounded-2xl shadow-sm border border-emerald-100/50">
                <label className="block text-sm font-black text-emerald-800 uppercase tracking-wider mb-3">退房日期 (Check-out)</label>
                <input
                  type="date"
                  value={dates.checkOut}
                  min={dates.checkIn ? new Date(new Date(dates.checkIn).getTime() + 86400000).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA')}
                  onChange={(e) => setDates({ ...dates, checkOut: e.target.value })}
                  disabled={!dates.checkIn}
                  className="w-full text-xl font-black text-slate-800 bg-white border-2 border-emerald-200/60 rounded-xl px-4 py-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all disabled:opacity-50 shadow-inner"
                />
              </div>
            </div>
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-6 pt-4 mt-auto border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
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
          <div className="flex-1 p-6 flex flex-col min-h-0">
            <div className="flex items-end justify-between mb-4 gap-2">
              <h2 className="text-2xl font-black text-slate-800 leading-none">選擇營位</h2>
              <button onClick={() => setStep(1)} className="text-slate-400 text-sm font-bold flex items-center gap-1 hover:text-slate-600 shrink-0">&larr; 返回修改日期</button>
            </div>

            {selectedItems.filter(i => i.item.category === 'campsite').length === 0 && (
              <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl shadow-sm">
                <p className="text-sm text-amber-800 font-bold flex items-start gap-2 leading-relaxed">
                  <span className="text-lg leading-none">⚠️</span>
                  <span>
                    您尚未選擇營位！如僅需加購<strong>裝備租借</strong>或<strong>食材服務</strong>，可直接點選下一步。<br />
                    如需預訂營位，請在上方選擇您喜愛的營位類型與數量。
                  </span>
                </p>
              </div>
            )}

            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              {fetchingItems ? (
                <div className="flex flex-col items-center justify-center py-20 text-emerald-500">
                  <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
                  <p className="font-bold tracking-widest text-sm">搜尋空房與裝備中...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableItems.filter(a => a.item.category === 'campsite').map(renderItemCard)}
                </div>
              )}
            </div>
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-6 pt-4 mt-auto border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => setStep(3)}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2"
              >
                下一步 (加購裝備與食材) <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 p-6 flex flex-col min-h-0">
            <div className="flex items-end justify-between mb-4 gap-2">
              <h2 className="text-2xl font-black text-slate-800 leading-none">加購裝備與食材</h2>
              <button onClick={() => setStep(2)} className="text-slate-400 text-sm font-bold flex items-center gap-1 hover:text-slate-600 shrink-0">&larr; 返回修改營位</button>
            </div>

            {selectedItems.filter(i => i.item.category === 'campsite').length === 0 ? (
              <div className="bg-amber-50/80 rounded-xl p-4 mb-6 border border-amber-200 shadow-sm">
                <h3 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-1"><span>⚠️</span> 您尚未選擇營位</h3>
                <p className="text-amber-700 text-sm font-medium">
                  您本次僅加購裝備租借與食材服務，如需預訂營位請<a href="#" onClick={(e) => { e.preventDefault(); setStep(2); }} className="font-bold text-amber-900 underline">返回上一步</a>選擇。
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50/80 rounded-xl p-4 mb-6 border border-emerald-200 shadow-sm">
                <h3 className="font-bold text-emerald-800 text-sm mb-2 flex items-center gap-1"><span>⛺</span> 您已選擇的營位：</h3>
                <div className="space-y-1.5">
                  {selectedItems.filter(i => i.item.category === 'campsite').map(s => (
                    <div key={s.item.id} className="text-emerald-700 font-black text-sm flex justify-between items-center bg-white/60 px-3 py-2 rounded-lg border border-emerald-100/50 shadow-sm">
                      <span>{s.item.name}</span>
                      <span className="bg-emerald-200/50 text-emerald-800 px-2 py-0.5 rounded text-xs">x {s.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              <div className="space-y-4">
                {availableItems.filter(a => a.item.category !== 'campsite').map(renderItemCard)}
              </div>

              {/* 服務/餐飲區塊提示 */}
              {availableItems.filter(a => a.item.category === 'service').length > 0 && (
                <div className="mt-6 mb-2 p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm">
                  <p className="text-sm text-amber-800 font-bold flex items-start gap-2 leading-relaxed">
                    <span className="text-lg leading-none">💡</span>
                    <span>
                      溫馨提醒：加購份數為<strong className="text-amber-900 border-b border-amber-900/30 pb-0.5 mx-1">「每晚」</strong>計費，請確認您的加購數量。<br />
                      若您僅需加購「單日」餐飲，請勿在此勾選，請於下一步的「特殊需求備註」中說明，並於入住時現場加購結帳即可！
                    </span>
                  </p>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-6 pt-4 mt-auto border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => setStep(4)}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2"
              >
                下一步 (填寫聯絡資料) <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 p-6 flex flex-col min-h-0">
            <div className="flex items-end justify-between mb-4 gap-2">
              <h2 className="text-2xl font-black text-slate-800 leading-none">填寫訂位資料</h2>
              <button onClick={() => setStep(3)} className="text-slate-400 text-sm font-bold flex items-center gap-1 hover:text-slate-600 shrink-0">&larr; 返回修改裝備</button>
            </div>
            <div className="flex-1 overflow-auto -mx-6 px-6 pb-6">
              <div className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-lg">聯絡資訊</h3>

                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">聯絡人姓名 <span className="text-rose-500">*</span></label>
                  <input required type="text" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="例如：王小明" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">手機號碼 <span className="text-rose-500">*</span></label>
                  <input required type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="例如：0912345678" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">電子郵件 <span className="text-rose-500">*</span></label>
                  <input required type="email" value={customerInfo.email} onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="用於寄送訂單通知" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">車牌號碼 (選填)</label>
                  <input type="text" value={customerInfo.license_plate} onChange={e => setCustomerInfo({ ...customerInfo, license_plate: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="如有開車請填寫，方便辨識進場" />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-600 mb-1.5">成人人數 <span className="text-rose-500">*</span></label>
                    <input required type="number" min="1" value={customerInfo.adults} onChange={e => setCustomerInfo({ ...customerInfo, adults: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-600 mb-1.5">兒童人數</label>
                    <input type="number" min="0" value={customerInfo.children} onChange={e => setCustomerInfo({ ...customerInfo, children: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">折扣碼 (選填)</label>
                  <div className="flex gap-2">
                    <input type="text" value={discountCode} onChange={e => setDiscountCode(e.target.value.toUpperCase())} className="flex-1 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono tracking-wider" placeholder="請輸入折扣代碼" />
                    <button type="button" onClick={handleVerifyDiscount} className="bg-slate-800 text-white px-5 rounded-xl font-bold hover:bg-slate-700 transition-colors whitespace-nowrap text-sm">套用</button>
                  </div>
                  {discountError && <p className="text-rose-500 text-sm mt-1.5 font-bold">{discountError}</p>}
                  {(discountPercent < 1 || discountFixedAmount > 0) && (
                    <p className="text-emerald-600 text-sm mt-1.5 font-bold">
                      成功套用 {discountAppliedCode}，
                      {discountFixedAmount > 0 
                        ? `現折 NT$ ${discountFixedAmount} 元！` 
                        : `享 ${(discountPercent * 10).toFixed(1).replace('.0', '')} 折優惠！`}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">特殊需求備註 (選填)</label>
                  <textarea value={customerInfo.notes} onChange={e => setCustomerInfo({ ...customerInfo, notes: e.target.value })} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none" placeholder="有任何需要我們協助的地方嗎？" />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-6 pt-4 mt-auto border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => setStep(5)}
                disabled={!customerInfo.name || !customerInfo.phone || !customerInfo.email}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步 (確認結帳) <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex-1 p-6 flex flex-col min-h-0">
            <div className="flex items-end justify-between mb-4 gap-2">
              <h2 className="text-2xl font-black text-slate-800 leading-none">確認訂單與付款</h2>
              <button onClick={() => setStep(4)} className="text-slate-400 text-sm font-bold flex items-center gap-1 hover:text-slate-600 shrink-0">&larr; 返回修改資料</button>
            </div>
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
                {selectedItems.map(({ item, quantity }) => {
                  const nights = Math.round((new Date(dates.checkOut).getTime() - new Date(dates.checkIn).getTime()) / (1000 * 60 * 60 * 24));
                  const isSingleTime = item.category === 'service' && (item.name.includes('單次') || item.name.includes('次計費'));
                  const unit = item.category === 'campsite' ? '帳' : '份';

                  let itemTotal = 0;
                  let weekdays = 0;
                  let holidays = 0;

                  if (isSingleTime) {
                    itemTotal = item.price_weekday * quantity;
                  } else if (item.category === 'service') {
                    itemTotal = item.price_weekday * quantity * nights;
                  } else {
                    const start = new Date(dates.checkIn);
                    const end = new Date(dates.checkOut);
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
                  }

                  return (
                    <div key={item.id} className="flex justify-between items-start py-3 border-b border-slate-50 last:border-0">
                      <div className="flex-1 pr-4">
                        <span className="text-slate-700 font-bold block leading-snug">
                          {item.name}
                          <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-xs ml-2 border border-emerald-100 inline-block align-middle">
                            {isSingleTime ? `${quantity} ${unit} (單次)` : `${quantity} ${unit} × ${nights} 晚`}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400 mt-1.5 block font-medium leading-relaxed">
                          {isSingleTime ? (
                            `NT$ ${item.price_weekday} × ${quantity} ${unit}`
                          ) : item.category === 'service' ? (
                            `NT$ ${item.price_weekday} × ${quantity} ${unit} × ${nights} 晚`
                          ) : (
                            holidays > 0 && weekdays > 0
                              ? `(平日 NT$ ${item.price_weekday} × ${weekdays}晚 + 假日 NT$ ${item.price_holiday} × ${holidays}晚) × ${quantity}${unit}`
                              : holidays > 0
                                ? `假日 NT$ ${item.price_holiday} × ${holidays}晚 × ${quantity}${unit}`
                                : `平日 NT$ ${item.price_weekday} × ${weekdays}晚 × ${quantity}${unit}`
                          )}
                        </span>
                      </div>
                      <div className="shrink-0 text-right mt-0.5">
                        <span className="text-slate-800 font-black text-sm whitespace-nowrap">NT$ {itemTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-2 mt-4 pt-4 border-t border-emerald-100/50 text-slate-700 font-medium">
                  <div className="flex justify-between items-center text-sm">
                    <span>原價總計</span>
                    <span>NT$ {calculateOriginalTotal().toLocaleString()}</span>
                  </div>
                  {(discountPercent < 1 || discountFixedAmount > 0) && (
                    <li className="flex justify-between items-center text-emerald-600 font-bold">
                      <span>折扣金額 ({discountAppliedCode})</span>
                      <span>- NT$ {calculateDiscountAmount().toLocaleString()}</span>
                    </li>
                  )}
                  <div className="flex justify-between items-end mt-2 pt-2 border-t border-emerald-200/50">
                    <span>最終結帳金額</span>
                    <span className="text-3xl font-black text-emerald-700">NT$ {calculateTotal().toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-6 pt-4 mt-auto border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] space-y-3">
              <button
                onClick={() => handleCheckout('bank_transfer')}
                className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-500 transition-colors text-lg tracking-widest flex items-center justify-center gap-2"
              >
                取號匯款 (保留 10 天) <span>🏦</span>
              </button>
            </div>
          </div>
        )}

        {step === 6 && finalOrderInfo && (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-6">
              <div className="text-6xl mb-4 text-emerald-500">✅</div>
              <h1 className="text-2xl font-black text-slate-800 tracking-wider">訂單已成立！</h1>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                您的訂單編號為：<strong className="text-slate-800">{finalOrderInfo.orderNo}</strong><br />
                請於 <strong className="text-rose-500">10 日內</strong> 完成匯款，逾期系統將自動取消訂單。
              </p>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-left space-y-4">
                <div>
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">匯款銀行</span>
                  <span className="text-lg font-black text-slate-800">台新銀行 (812)</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">虛擬帳號</span>
                  <span className="text-2xl font-black text-emerald-600 tracking-widest">{finalOrderInfo.virtualAccount}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">匯款金額</span>
                  <span className="text-xl font-black text-rose-600">NT$ {finalOrderInfo.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-emerald-50 text-emerald-700 p-5 rounded-xl border border-emerald-200 text-sm font-bold space-y-3 text-left">
                <p className="flex items-start gap-2 leading-relaxed">
                  <span className="text-base leading-none mt-0.5">📋</span>
                  <span>可至 <a href="https://not-far-web.vercel.app/my-orders" className="text-emerald-800 underline font-black" target="_blank">我的訂單</a> 查詢訂單狀態與明細，亦可於該頁面留言給我們。</span>
                </p>
                <p className="flex items-start gap-2 leading-relaxed">
                  <span className="text-base leading-none mt-0.5">💬</span>
                  <span>如有進一步問題，歡迎透過官方 LINE <a href="https://line.me/ti/p/@paq1032x" className="text-emerald-800 underline font-black" target="_blank">@paq1032x</a> 洽詢</span>
                </p>
              </div>

              <div className="pt-4 space-y-3">
                <a href="/my-orders" className="block w-full bg-slate-800 text-emerald-400 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-700 transition-colors text-lg tracking-widest">
                  查看我的訂單
                </a>
                <a href="/" className="block w-full bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-300 transition-colors text-base tracking-widest">
                  返回首頁
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
