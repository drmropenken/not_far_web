import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { supabase } from '../../lib/supabase';

// Helper function to parse notes and remove the [Email: ...] [人數: ...] tags for customer display
const parseCustomerNotes = (notesStr: string | null) => {
  if (!notesStr) return '';
  // Removes tags like [Email: xxx] and [人數: 2大 0小] from the beginning or anywhere
  return notesStr.replace(/\[Email:\s*.*?\]\s*/g, '').replace(/\[人數:\s*.*?\]\s*/g, '').trim();
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'paid': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200">已全額付款</span>;
    case 'deposit_paid': return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg border border-blue-200">已付訂金</span>;
    case 'checked_in': return <span className="px-2.5 py-1 bg-slate-100 text-slate-800 text-xs font-bold rounded-lg border border-slate-300">已報到</span>;
    case 'cancelled': return <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg border border-rose-200">已取消</span>;
    default: return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg border border-amber-200 animate-pulse">待付款</span>;
  }
};

export default function MyOrdersFlow() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    const hash = window.location.hash;

    if (hash.includes('access_token')) {
      setLoading(true);
    }

    const checkSessionAndLiff = async () => {
      // 1. Google Auth parsing
      if (hash.includes('access_token') && hash.includes('refresh_token')) {
        try {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {}
      }

      // 2. LIFF init
      try {
        await liff.init({ liffId: '2010317535-p1JobvGF' }); // Same LIFF ID
        if (liff.isLoggedIn()) {
          setLoading(true);
          const profile = await liff.getProfile();
          const fakeEmail = profile.userId + '@line.notfar.com';
          const fakePassword = profile.userId + '_notfar_secret_2024!';

          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: fakeEmail,
            password: fakePassword
          });

          if (signInError) {
            await supabase.auth.signUp({
              email: fakeEmail,
              password: fakePassword,
              options: {
                data: { full_name: profile.displayName, avatar_url: profile.pictureUrl, line_id: profile.userId }
              }
            });
            await supabase.auth.signInWithPassword({ email: fakeEmail, password: fakePassword });
          }
        }
      } catch (err) {
        console.error("LIFF Init failed", err);
      }

      // 3. Final Session reading
      if (isMounted) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSession(session);
          fetchMyOrders(session);
        } else {
          setLoading(false);
        }
      }
    };

    checkSessionAndLiff();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && isMounted) {
        setSession(session);
        fetchMyOrders(session);
      } else if (!session && isMounted) {
        setSession(null);
        setOrders([]);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchMyOrders = async (currentSession: any) => {
    setLoading(true);
    const email = currentSession.user.email;
    const lineId = currentSession.user.user_metadata?.line_id;

    let query = supabase.from('nf_orders')
      .select(`
        *,
        nf_order_items (
          *,
          nf_items (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (lineId) {
      query = query.or(`line_user_id.eq.${lineId},customer_email.eq.${email}`);
    } else {
      query = query.eq('customer_email', email); // fallback
    }

    const { data, error } = await query;

    if (!error && data) {
      // Temporary fallback for line vs email logic if customer_email doesn't exist explicitly in db yet (it might just be in notes)
      // Wait, BookingFlow inserts Email into 'notes', but does it insert into a dedicated email column? No, 'nf_orders' doesn't have customer_email!
      // Let's rely on line_user_id mainly, or we can filter by notes containing the email!
    }
    
    // Better logic: Fetch all orders where line_user_id matches, OR notes contains the email.
    let filterStr = '';
    if (lineId) {
      filterStr += `line_user_id.eq.${lineId}`;
    }
    if (email && !email.includes('@line.notfar.com')) {
      if (filterStr) filterStr += ',';
      filterStr += `notes.ilike.%[Email: ${email}]%`;
    }

    if (filterStr) {
      const { data: finalData, error: finalError } = await supabase.from('nf_orders')
        .select(`*, nf_order_items (*, nf_items (*))`)
        .or(filterStr)
        .order('created_at', { ascending: false });
        
      if (!finalError) {
        setOrders(finalData || []);
      }
    }
    
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/my-orders' }
    });
  };

  const handleLineLogin = async () => {
    try {
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.origin + '/my-orders' });
      }
    } catch (err: any) {
      alert('LINE登入失敗: ' + err.message);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 relative">
      <div className="bg-white px-5 py-4 shadow-sm z-10 flex items-center justify-between sticky top-0">
        <div className="font-black text-slate-800 tracking-wide flex items-center gap-2">
          <span className="text-emerald-600 text-xl">🏕️</span> 我的訂單
        </div>
        {session && (
          <button onClick={() => {
            supabase.auth.signOut();
            if (liff.isLoggedIn()) liff.logout();
            setSelectedOrder(null);
          }} className="text-xs text-slate-400 font-bold hover:text-slate-600">
            登出
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto flex flex-col relative hide-scrollbar p-6 max-w-3xl w-full mx-auto">
        {!session ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
              <div className="text-6xl mb-2">🔍</div>
              <h1 className="text-2xl font-black text-slate-800 tracking-wider">查詢訂單</h1>
              <p className="text-sm text-slate-500 font-medium">請使用您預訂時的帳號登入</p>
              
              <div className="space-y-3 pt-4">
                <button onClick={handleLineLogin} className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#06C755]/20">
                  <span className="text-xl">💬</span> LINE 快速登入
                </button>
                <button onClick={handleGoogleLogin} className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                  <span className="text-xl">G</span> Google 登入
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {selectedOrder ? (
              <div className="space-y-6">
                <button onClick={() => setSelectedOrder(null)} className="text-slate-500 font-bold flex items-center gap-2 hover:text-slate-700 transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 w-fit">
                  &larr; 返回列表
                </button>
                
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 p-5 text-white flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-black tracking-widest">{selectedOrder.order_no}</h2>
                      <p className="text-slate-400 text-sm mt-1">{new Date(selectedOrder.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})} 建立</p>
                    </div>
                    <div>{getStatusBadge(selectedOrder.status)}</div>
                  </div>

                  <div className="p-5 space-y-6">
                    {/* 付款資訊 */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <h3 className="font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2">付款資訊</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">訂單總額</span>
                          <span className="font-bold text-slate-800">NT$ {selectedOrder.total_amount?.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">已付金額 (訂金)</span>
                          <span className="font-bold text-emerald-600">NT$ {selectedOrder.deposit_amount?.toLocaleString() || 0}</span>
                        </div>
                        {selectedOrder.status === 'pending' && selectedOrder.payment_method === 'bank_transfer' && selectedOrder.virtual_account && (
                          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                            <p className="text-xs text-blue-600 font-bold mb-2">🏦 專屬匯款帳號 (銀行代碼 009 彰化銀行)</p>
                            <p className="text-xl font-black text-blue-800 tracking-widest">{selectedOrder.virtual_account}</p>
                            <p className="text-xs text-blue-500 mt-2">請於下單後 10 天內完成匯款，以免訂單被自動取消喔！</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 預訂內容 */}
                    <div>
                      <h3 className="font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2">入住資訊</h3>
                      <div className="space-y-2 text-sm text-slate-600 font-medium mb-4">
                        <p>🏠 入住：<span className="text-slate-800 font-bold">{selectedOrder.check_in_date}</span></p>
                        <p>👋 退房：<span className="text-slate-800 font-bold">{selectedOrder.check_out_date}</span></p>
                        <p>👤 聯絡人：{selectedOrder.customer_name} ({selectedOrder.customer_phone})</p>
                      </div>

                      <div className="space-y-3">
                        {selectedOrder.nf_order_items?.map((oi: any) => (
                          <div key={oi.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                            <div>
                              <span className="font-bold text-slate-700">{oi.nf_items?.name}</span>
                              <span className="text-xs text-slate-500 ml-2">x {oi.quantity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 留言備註 */}
                    <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100">
                      <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><span>💬</span> 留言與備註</h3>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {parseCustomerNotes(selectedOrder.notes) || <span className="text-slate-400 italic">無特殊備註</span>}
                      </p>
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-2xl font-black text-slate-800 mb-6">嗨，{session.user.user_metadata?.full_name || '營友'}！</h2>
                
                {orders.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-6xl mb-4">🏕️</p>
                    <p className="text-slate-500 font-bold">目前還沒有任何訂單紀錄喔！</p>
                    <a href="/app" className="inline-block mt-4 text-emerald-600 font-bold hover:underline">現在去預訂 &rarr;</a>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div 
                        key={order.id} 
                        onClick={() => setSelectedOrder(order)}
                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-xs font-bold text-slate-400 block mb-1">{new Date(order.created_at).toLocaleDateString()}</span>
                            <h3 className="font-black text-slate-800 text-lg group-hover:text-emerald-700 transition-colors">{order.order_no}</h3>
                          </div>
                          <div>{getStatusBadge(order.status)}</div>
                        </div>
                        <div className="flex justify-between items-end border-t border-slate-100 pt-3">
                          <div className="text-sm text-slate-600 font-medium">
                            <p>入住：{order.check_in_date}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">總金額</span>
                            <span className="font-black text-slate-800">NT$ {order.total_amount?.toLocaleString() || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
