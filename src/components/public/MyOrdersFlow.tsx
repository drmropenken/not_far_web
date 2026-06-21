import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { supabase } from '../../lib/supabase';

// Helper function to parse notes and extract Email, People, and clean notes
const parseOrderNotes = (notesStr: string | null) => {
  if (!notesStr) return { email: '', people: '', notes: '' };
  const emailMatch = notesStr.match(/\[Email:\s*(.*?)\]/);
  const peopleMatch = notesStr.match(/\[人數:\s*(.*?)\]/);
  const email = emailMatch ? emailMatch[1] : '';
  const people = peopleMatch ? peopleMatch[1] : '';
  const notes = notesStr.replace(/\[Email:\s*.*?\]\s*/, '').replace(/\[人數:\s*.*?\]\s*/, '').trim();
  return { email, people, notes };
};

const getOrderStatusInfo = (order: any) => {
  if (order.status === 'cancelled') {
    return { label: '已取消', colorClass: 'bg-rose-100 text-rose-800 border-rose-200', type: 'cancelled' };
  }
  if (order.status === 'paid') {
    return { label: '已全額付款', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', type: 'paid' };
  }
  if (order.status === 'deposit_paid') {
    return { label: '已付訂金', colorClass: 'bg-blue-100 text-blue-800 border-blue-200', type: 'paid' };
  }
  if (order.status === 'checked_in') {
    return { label: '已報到', colorClass: 'bg-slate-100 text-slate-800 border-slate-300', type: 'paid' };
  }
  
  // Pending status checks
  if (order.status === 'pending') {
    if (order.payment_method === 'bank_transfer') {
      const orderDate = new Date(order.created_at).getTime();
      const now = new Date().getTime();
      const daysDiff = (now - orderDate) / (1000 * 3600 * 24);
      if (daysDiff > 10) {
        return { label: '已逾期', colorClass: 'bg-stone-200 text-stone-600 border-stone-300', type: 'expired' };
      }
    } else if (order.payment_method === 'credit_card') {
      // If credit card is pending, it usually means payment failed/abandoned since ECPay is immediate
      return { label: '付款失敗/逾期', colorClass: 'bg-stone-200 text-stone-600 border-stone-300', type: 'expired' };
    }
    return { label: '待付款', colorClass: 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse', type: 'pending' };
  }
  
  return { label: '未知狀態', colorClass: 'bg-gray-100 text-gray-800 border-gray-200', type: 'other' };
};

const getStatusBadge = (order: any) => {
  const info = getOrderStatusInfo(order);
  return <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${info.colorClass}`}>{info.label}</span>;
};

export default function MyOrdersFlow() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const handleAppendNote = async () => {
    if (!replyText.trim() || !selectedOrder) return;
    setIsSubmittingReply(true);
    
    // Append to existing notes (including the original hidden [Email] tags)
    const currentNotes = selectedOrder.notes || '';
    const appendedNotes = currentNotes + (currentNotes ? '\n\n' : '') + `[顧客補充]：${replyText.trim()}`;

    const { error } = await supabase.from('nf_orders').update({ notes: appendedNotes }).eq('id', selectedOrder.id);
    
    setIsSubmittingReply(false);
    if (error) {
      alert('留言失敗：' + error.message);
    } else {
      setSelectedOrder({ ...selectedOrder, notes: appendedNotes });
      setOrders(orders.map(o => o.id === selectedOrder.id ? { ...o, notes: appendedNotes } : o));
      setIsReplying(false);
      setReplyText('');
    }
  };

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
        <a href="/" className="font-black text-slate-800 tracking-wide flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-emerald-600 text-xl">🏕️</span> 我的訂單
        </a>
        {session && (
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors">回首頁</a>
            <button onClick={() => {
              supabase.auth.signOut();
              if (liff.isLoggedIn()) liff.logout();
              setSession(null);
              setSelectedOrder(null);
            }} className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
              登出
            </button>
          </div>
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
                    <div>{getStatusBadge(selectedOrder)}</div>
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
                        {getOrderStatusInfo(selectedOrder).type === 'pending' && selectedOrder.payment_method === 'bank_transfer' && selectedOrder.virtual_account && (
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
                        {parseOrderNotes(selectedOrder.notes).email && <p>✉️ Email：{parseOrderNotes(selectedOrder.notes).email}</p>}
                        {parseOrderNotes(selectedOrder.notes).people && <p>👥 入住人數：{parseOrderNotes(selectedOrder.notes).people}</p>}
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
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-amber-800 flex items-center gap-2"><span>💬</span> 留言紀錄與對話</h3>
                        {!isReplying && (
                          <button onClick={() => setIsReplying(true)} className="text-xs bg-amber-200/50 hover:bg-amber-300/50 text-amber-800 px-3 py-1.5 rounded-lg transition-colors font-bold border border-amber-200">
                            我要補充留言
                          </button>
                        )}
                      </div>
                      
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white/60 p-3 rounded-lg border border-amber-100/50 max-h-48 overflow-y-auto">
                        {parseOrderNotes(selectedOrder.notes).notes || <span className="text-slate-400 italic">目前無留言或備註</span>}
                      </div>

                      {isReplying && (
                        <div className="mt-4 pt-4 border-t border-amber-200/50 animate-fade-in">
                          <textarea 
                            value={replyText} 
                            onChange={(e) => setReplyText(e.target.value)} 
                            placeholder="例如：我們想更改人數為3大1小、或是 Email 填錯想更正為 abc@gmail.com..." 
                            className="w-full text-sm p-3 rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none h-24 mb-3"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setIsReplying(false)} disabled={isSubmittingReply} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
                            <button onClick={handleAppendNote} disabled={isSubmittingReply || !replyText.trim()} className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                              {isSubmittingReply ? '送出中...' : '送出留言'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-2xl font-black text-slate-800 mb-6">嗨，{session.user.user_metadata?.full_name || '營友'}！</h2>
                
                {/* 狀態切換標籤 */}
                <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar pb-1">
                  {[
                    { id: 'all', label: '全部訂單' },
                    { id: 'pending', label: '待付款' },
                    { id: 'paid', label: '已付款' },
                    { id: 'cancelled', label: '已失效' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFilter(tab.id as any)}
                      className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                        filter === tab.id 
                          ? 'bg-slate-800 text-white shadow-md' 
                          : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {orders.filter(o => {
                  if (filter === 'all') return true;
                  const type = getOrderStatusInfo(o).type;
                  if (filter === 'pending') return type === 'pending';
                  if (filter === 'paid') return type === 'paid';
                  if (filter === 'cancelled') return type === 'cancelled' || type === 'expired';
                  return true;
                }).length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-6xl mb-4">🏕️</p>
                    <p className="text-slate-500 font-bold">目前沒有相關的訂單紀錄喔！</p>
                    <a href="/app" className="inline-block mt-4 text-emerald-600 font-bold hover:underline">現在去預訂 &rarr;</a>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.filter(o => {
                      if (filter === 'all') return true;
                      const type = getOrderStatusInfo(o).type;
                      if (filter === 'pending') return type === 'pending';
                      if (filter === 'paid') return type === 'paid';
                      if (filter === 'cancelled') return type === 'cancelled' || type === 'expired';
                      return true;
                    }).map(order => (
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
                          <div>{getStatusBadge(order)}</div>
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
