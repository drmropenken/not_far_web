import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  name: string;
  category: string;
  total_quantity: number;
  image_url?: string | null;
};

type InventoryRecord = {
  id?: string;
  item_id: string;
  date: string;
  override_quantity: number | null;
  booked_quantity: number;
};

type PaymentLog = {
  id: string;
  order_id: string;
  amount: number;
  payment_type: string;
  collected_by?: string;
  collected_at?: string;
  notes?: string | null;
};

type MonthOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone?: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_amount?: number;
  deposit_amount?: number;
  payment_method?: string | null;
  notes: string | null;
  admin_notes: string | null;
  nf_order_items: {
    item_id: string;
    quantity: number;
    nf_items: { category: string; name: string };
  }[];
};

export default function InventoryCalendar() {
  const [items, setItems] = useState<Item[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [monthOrders, setMonthOrders] = useState<MonthOrder[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<Record<string, PaymentLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{
    item: Item;
    day: number;
    dateStr: string;
    currentOverride: number;
    booked: number;
    existingRecordId?: string;
    orders?: MonthOrder[];
  } | null>(null);
  const [activeCellTab, setActiveCellTab] = useState<'orders' | 'quota'>('orders');
  const [newQuota, setNewQuota] = useState<string>('');
  
  // 批次修改某日的全部庫存 / 財務數據 Modal 狀態
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [activeDayTab, setActiveDayTab] = useState<'financial' | 'quota'>('financial');
  const [dayOrderFilter, setDayOrderFilter] = useState<'check_in' | 'active'>('check_in');

  // Hover Tooltip 狀態
  const [hoveredCell, setHoveredCell] = useState<{
    rect: DOMRect;
    orders: MonthOrder[];
    booked: number;
    item: Item;
  } | null>(null);

  // 選擇月份
  const [currentDate, setCurrentDate] = useState(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  const yearsList = useMemo(() => {
    const currentY = new Date().getFullYear();
    const set = new Set<number>();
    for (let i = -3; i <= 4; i++) {
      set.add(currentY + i);
    }
    set.add(currentDate.getFullYear());
    return Array.from(set).sort((a, b) => a - b);
  }, [currentDate]);

  // 取得當月的天數陣列
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    fetchData();
    setAdminRole(localStorage.getItem('admin_role') || 'viewer');
  }, [currentDate]);

  useEffect(() => {
    // 當月份切換為當月時，自動滾動到今天的日期
    const today = new Date();
    if (!loading && currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth()) {
      setTimeout(() => {
        const todayCell = document.getElementById('today-col-header');
        if (todayCell && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: Math.max(0, todayCell.offsetLeft - scrollContainerRef.current.clientWidth / 2 + todayCell.clientWidth / 2),
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [currentDate, loading]);

  const fetchData = async () => {
    setLoading(true);
    const campId = localStorage.getItem('camp_id');
    
    // 1. 取得此營區的營位、裝備與服務
    const { data: itemsData } = await supabase
      .from('nf_items')
      .select('id, name, category, total_quantity')
      .eq('camp_id', campId)
      .order('sort_order', { ascending: true });

    // 先計算當月日期範圍
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${daysInMonth}`;

    if (itemsData) {
      const categoryWeight: Record<string, number> = { campsite: 1, equipment: 2, service: 3 };
      itemsData.sort((a, b) => {
        if (categoryWeight[a.category] !== categoryWeight[b.category]) {
          return categoryWeight[a.category] - categoryWeight[b.category];
        }
        return 0;
      });
      setItems(itemsData);

      // 2. 取得當月的庫存紀錄（只撈此營區的商品）
      const itemIds = itemsData.map(i => i.id);

      const { data: invData } = await supabase
        .from('nf_inventory')
        .select('*')
        .in('item_id', itemIds)
        .gte('date', startDate)
        .lte('date', endDate);

      if (invData) setInventory(invData);
    }

    // 3. 取得此營區的訂單（含財務欄位）
    const { data: ordersData } = await supabase
      .from('nf_orders')
      .select(`
        id, order_no, customer_name, customer_phone, check_in_date, check_out_date, status, total_amount, deposit_amount, payment_method, notes, admin_notes,
        nf_order_items (
          item_id, quantity,
          nf_items ( category, name )
        )
      `)
      .eq('camp_id', campId)
      .neq('status', 'cancelled')
      .lte('check_in_date', endDate)
      .gte('check_out_date', startDate);
      
    if (ordersData) {
      setMonthOrders(ordersData as any);

      // 4. 撈取訂單金流紀錄 (nf_payment_logs)
      if (ordersData.length > 0) {
        const orderIds = ordersData.map(o => o.id);
        const { data: logsData } = await supabase
          .from('nf_payment_logs')
          .select('*')
          .in('order_id', orderIds);

        if (logsData) {
          const grouped: Record<string, PaymentLog[]> = {};
          logsData.forEach((log: PaymentLog) => {
            if (!grouped[log.order_id]) grouped[log.order_id] = [];
            grouped[log.order_id].push(log);
          });
          setPaymentLogs(grouped);
        }
      }
    }

    setLoading(false);
  };

  // 切換月份
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // 點擊格子開啟編輯 Modal
  const handleCellClick = (item: Item, day: number, cellOrders: MonthOrder[] = []) => {
    if (adminRole === 'viewer') return;
    setHoveredCell(null);
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day.toString().padStart(2, '0')}`;
    
    const existingRecord = inventory.find(i => i.item_id === item.id && i.date === dateStr);
    const currentOverride = existingRecord?.override_quantity ?? item.total_quantity;
    
    setEditingCell({
      item,
      day,
      dateStr,
      currentOverride,
      booked: existingRecord?.booked_quantity || 0,
      existingRecordId: existingRecord?.id,
      orders: cellOrders
    });
    setNewQuota(currentOverride.toString());
    setActiveCellTab(cellOrders && cellOrders.length > 0 ? 'orders' : 'quota');
  };

  // 儲存修改的庫存
  const handleSaveQuota = async () => {
    if (!editingCell) return;
    
    let newOverride = newQuota.trim() === '' ? null : parseInt(newQuota);
    if (newOverride !== null && isNaN(newOverride)) {
      alert('請輸入有效的數字！');
      return;
    }

    // 如果輸入的數字跟原本預設的數量一樣，那就當作取消 override (存成 null)，避免無謂的黃色標記
    if (newOverride === editingCell.item.total_quantity) {
      newOverride = null;
    }

    setLoading(true);
    const savedEditingCell = { ...editingCell };
    setEditingCell(null); // 先關閉 Modal

    if (savedEditingCell.existingRecordId) {
      // Update
      const { error } = await supabase
        .from('nf_inventory')
        .update({ override_quantity: newOverride })
        .eq('id', savedEditingCell.existingRecordId);
      if (error) alert('更新失敗: ' + error.message);
    } else {
      // Insert
      const { error } = await supabase
        .from('nf_inventory')
        .insert([{
          item_id: savedEditingCell.item.id,
          date: savedEditingCell.dateStr,
          override_quantity: newOverride
        }]);
      if (error) alert('新增失敗: ' + error.message);
    }
    
    await fetchData(); // 重新整理
  };

  const handleBatchSaveQuota = async (overrideValue: number | null) => {
    if (editingDay === null) return;
    
    setLoading(true);
    const day = editingDay;
    setEditingDay(null);

    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day.toString().padStart(2, '0')}`;

    const promises = items.map(async (item) => {
      const existingRecord = inventory.find(i => i.item_id === item.id && i.date === dateStr);
      
      // 若是設定為 null (恢復預設)，而且本來就沒有 record，就不需要做事
      if (overrideValue === null && !existingRecord) {
        return Promise.resolve();
      }

      if (existingRecord) {
        // 更新現有紀錄
        return supabase
          .from('nf_inventory')
          .update({ override_quantity: overrideValue })
          .eq('id', existingRecord.id);
      } else {
        // 插入新紀錄 (只有在 overrideValue !== null 時)
        return supabase
          .from('nf_inventory')
          .insert([{
            item_id: item.id,
            date: dateStr,
            override_quantity: overrideValue
          }]);
      }
    });

    await Promise.all(promises);
    await fetchData();
  };

  // 當日財務與訂單資料計算
  const getDayFinancialSummary = (day: number) => {
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day.toString().padStart(2, '0')}`;

    // 當日入住訂單
    const checkInOrders = monthOrders.filter(o => o.check_in_date === dateStr);
    
    // 當日在營訂單 (入住日期 <= dateStr 且 退房日期 > dateStr)
    const activeOrders = monthOrders.filter(o => o.check_in_date <= dateStr && o.check_out_date > dateStr);

    const targetOrders = dayOrderFilter === 'check_in' ? checkInOrders : activeOrders;

    let totalRevenue = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let onsiteTotal = 0;
    let bankTransferTotal = 0;
    let creditCardTotal = 0;

    targetOrders.forEach(order => {
      const total = order.total_amount || 0;
      const deposit = order.deposit_amount || 0;
      const unpaid = Math.max(0, total - deposit);

      totalRevenue += total;
      totalPaid += deposit;
      totalUnpaid += unpaid;

      const logs = paymentLogs[order.id] || [];
      if (logs.length > 0) {
        logs.forEach(log => {
          if (log.payment_type === 'onsite') onsiteTotal += log.amount;
          else if (log.payment_type === 'bank_transfer') bankTransferTotal += log.amount;
          else if (log.payment_type === 'credit_card') creditCardTotal += log.amount;
          else onsiteTotal += log.amount;
        });
      } else if (deposit > 0) {
        // 若無明確 log，按支付方式拆分
        if (order.payment_method === 'onsite') onsiteTotal += deposit;
        else if (order.payment_method === 'bank_transfer') bankTransferTotal += deposit;
        else if (order.payment_method === 'credit_card' || order.payment_method === 'ecpay') creditCardTotal += deposit;
        else bankTransferTotal += deposit;
      }
    });

    return {
      dateStr,
      checkInOrders,
      activeOrders,
      targetOrders,
      totalRevenue,
      totalPaid,
      totalUnpaid,
      onsiteTotal,
      bankTransferTotal,
      creditCardTotal
    };
  };

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-stone-200 md:p-5 p-3 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-80px)] w-full relative">
      
      {/* 頂部控制列 (極致緊湊設計) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 shrink-0">
        
        {/* 提示說明 (縮小至一行) */}
        <div className="text-xs text-stone-600 bg-gradient-to-r from-emerald-50 to-teal-50/30 px-4 py-2 rounded-lg border border-emerald-100/60 flex items-center gap-3 shadow-sm flex-1 overflow-x-auto whitespace-nowrap hide-scrollbar">
          <span className="text-emerald-500 text-base leading-none">💡</span>
          <span className="text-stone-700 font-medium mr-2 hidden md:inline">點擊日期標題可看當日財務與批次關閉，點擊格子可強制修改當天總量。</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-white border border-stone-300 rounded-full"></div> 正常可訂</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-50 border border-amber-300 rounded-full"></div> 手動調整</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-50 border border-rose-300 rounded-full"></div> 滿帳</span>
          </div>
        </div>

        {/* 月份切換 (支援直接選年、選月、上一月/下一月與回到當月) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-stone-100/80 p-1 rounded-xl border border-stone-200 shadow-inner shrink-0">
          <button 
            onClick={handlePrevMonth} 
            className="px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-white hover:text-emerald-600 hover:shadow-xs rounded-lg transition-all"
            title="查看上個月"
          >
            &lt; 上個月
          </button>

          <div className="flex items-center gap-1">
            {/* 年份選擇 */}
            <select
              value={currentDate.getFullYear()}
              onChange={(e) => {
                const newYear = parseInt(e.target.value, 10);
                setCurrentDate(new Date(newYear, currentDate.getMonth(), 1));
              }}
              className="bg-white border border-stone-200/90 text-stone-800 font-bold text-xs rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer shadow-2xs"
            >
              {yearsList.map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>

            {/* 月份選擇 */}
            <select
              value={currentDate.getMonth() + 1}
              onChange={(e) => {
                const newMonth = parseInt(e.target.value, 10) - 1;
                setCurrentDate(new Date(currentDate.getFullYear(), newMonth, 1));
              }}
              className="bg-white border border-stone-200/90 text-stone-800 font-bold text-xs rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer shadow-2xs"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleNextMonth} 
            className="px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-white hover:text-emerald-600 hover:shadow-xs rounded-lg transition-all"
            title="查看下個月"
          >
            下個月 &gt;
          </button>

          {/* 回到當月 */}
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors ml-0.5"
            title="快速跳轉回今天所在的月份"
          >
            回到當月
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-emerald-600/60 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <p className="font-medium tracking-widest text-sm">載入中...</p>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-auto border border-stone-200 rounded-2xl relative shadow-inner bg-stone-50/50">
          <table className="w-full text-center border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-stone-100/90 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <tr>
                <th className="p-3 border-b border-r border-stone-200/80 bg-stone-100 min-w-[120px] md:min-w-[180px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] text-stone-700 font-bold tracking-wider">項目名稱</th>
                {daysArray.map(day => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const today = new Date();
                  const isToday = currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth() && day === today.getDate();
                  
                  return (
                    <th 
                      key={day} 
                      id={isToday ? 'today-col-header' : undefined} 
                      onClick={() => {
                        setEditingDay(day);
                        setActiveDayTab('financial');
                      }} 
                      title={`點擊查看 ${day} 日財務統計與修改庫存`}
                      className={`relative p-1.5 border-b border-r min-w-[45px] md:min-w-[55px] cursor-pointer hover:bg-stone-200/60 transition-colors group/day ${isToday ? 'bg-amber-100/60 border-amber-300 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.5)] z-20' : isWeekend ? 'text-rose-500 bg-rose-50/30 border-stone-200/80' : 'text-stone-600 border-stone-200/80'}`}
                    >
                      <div className="flex flex-col items-center justify-center space-y-0.5 group-hover/day:scale-105 transition-transform">
                        <span className={`font-bold text-base md:text-lg ${isToday ? 'text-amber-700' : ''}`}>{day}</span>
                        <span className={`text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isToday ? 'bg-amber-200/80 text-amber-800' : isWeekend ? 'bg-rose-100/50 text-rose-600' : 'bg-stone-200/50 text-stone-500'}`}>
                          {['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}
                        </span>
                        {isToday && <div className="absolute top-0 w-full h-1 bg-amber-400 left-0"></div>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-emerald-50/40 transition-colors group">
                  <td className="p-2 md:p-3 border-b border-r border-stone-100 font-medium text-stone-800 text-left sticky left-0 bg-white group-hover:bg-[#f0fdf4] z-10 whitespace-normal md:whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]">
                    <div className="flex flex-col md:flex-row md:items-center gap-1.5">
                      <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md self-start shrink-0 font-semibold tracking-wide hidden md:inline-block">
                        {item.category === 'campsite' ? '⛺️ 營位' : item.category === 'equipment' ? '🪑 裝備' : '🍖 服務'}
                      </span>
                      <span className="leading-tight text-sm md:leading-normal truncate max-w-[120px] md:max-w-none text-stone-700 font-bold" title={item.name}>{item.name}</span>
                    </div>
                    <div className="text-[9px] md:text-[10px] text-stone-400 font-medium mt-1 tracking-wider">預設: {item.total_quantity}</div>
                  </td>
                  
                  {daysArray.map(day => {
                    const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    const record = inventory.find(i => i.item_id === item.id && i.date === dateStr);
                    
                    const isOverridden = record?.override_quantity !== null && record?.override_quantity !== undefined && record?.override_quantity !== item.total_quantity;
                    const totalAvailable = (record?.override_quantity !== null && record?.override_quantity !== undefined) ? record.override_quantity! : item.total_quantity;
                    const booked = record?.booked_quantity || 0;
                    const remaining = Math.max(0, totalAvailable - booked);
                    
                    const isFull = totalAvailable > 0 && remaining === 0;
                    
                    let cellContent = (
                      <div className={`w-full h-full min-h-[32px] md:min-h-[40px] flex items-center justify-center rounded-lg mx-auto text-xs md:text-sm font-bold shadow-sm transition-all duration-200 transform group-hover/cell:scale-110 active:scale-95
                        ${isFull ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-rose-100/30 font-black' :
                          isOverridden ? 'bg-amber-50 text-amber-600 border border-amber-300 shadow-amber-100/30' :
                          booked > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-emerald-100/30' :
                          'bg-white text-stone-700 border border-stone-200 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-emerald-100/40'
                        }
                      `}>
                        {totalAvailable === 0 ? (
                          <span className="text-stone-300 font-normal">-</span>
                        ) : isFull ? (
                          <div className="flex items-baseline gap-0.5" title={`滿帳 (${booked}/${totalAvailable})`}>
                            <span className="text-xs md:text-sm font-black text-rose-600">{booked}</span>
                            <span className="text-[10px] text-rose-400 opacity-60">/</span>
                            <span className="text-xs md:text-sm font-black text-rose-600">{totalAvailable}</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-0.5">
                            <span className={`text-[10px] ${booked > 0 ? 'text-emerald-600 font-black text-xs' : 'opacity-60'}`}>{booked}</span>
                            <span className="text-[10px] opacity-40">/</span>
                            <span>{totalAvailable}</span>
                          </div>
                        )}
                      </div>
                    );

                    const today = new Date();
                    const isToday = currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth() && day === today.getDate();
                    
                    const currentDateTime = new Date(dateStr).getTime();
                    const cellOrders = monthOrders.filter(order => {
                      const start = new Date(order.check_in_date).getTime();
                      const end = new Date(order.check_out_date).getTime();
                      if (currentDateTime < start || currentDateTime >= end) return false;
                      const isFirstNight = currentDateTime === start;
                      return order.nf_order_items?.some(oi => {
                        if (oi.item_id !== item.id) return false;
                        const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
                        if (isSingleTime && !isFirstNight) return false;
                        return true;
                      });
                    });
                    
                    return (
                      <td 
                        key={day} 
                        className={`relative p-1 md:p-1.5 border-b border-r cursor-pointer group/cell ${isToday ? 'bg-amber-50/40 border-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]' : 'border-stone-100/60'}`} 
                        onClick={() => handleCellClick(item, day, cellOrders)}
                        onMouseEnter={(e) => {
                          // 僅在支援滑鼠真實 Hover 的裝置（非手機觸控）且 Modal 未開啟時才觸發預覽
                          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches && !editingCell && cellOrders.length > 0) {
                            setHoveredCell({
                              rect: e.currentTarget.getBoundingClientRect(),
                              orders: cellOrders,
                              booked,
                              item
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* 編輯單一格子庫存 / 檢視訂單 Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditingCell(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-800">{editingCell.item.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5 font-mono">{editingCell.dateStr} 日庫存與訂單資訊</p>
              </div>
              <button 
                onClick={() => setEditingCell(null)} 
                className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-200 text-stone-600 font-bold text-sm flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 分頁按鈕 */}
            <div className="flex border-b border-stone-200 bg-stone-100/60 px-4 pt-2 gap-2 text-sm font-bold">
              {editingCell.orders && editingCell.orders.length > 0 && (
                <button
                  onClick={() => setActiveCellTab('orders')}
                  className={`px-4 py-2 rounded-t-lg transition-all border-t border-x ${
                    activeCellTab === 'orders'
                      ? 'bg-white text-emerald-700 border-stone-200 border-b-white -mb-px'
                      : 'text-stone-500 hover:text-stone-800 border-transparent'
                  }`}
                >
                  📝 當日訂單 ({editingCell.orders.length} 筆)
                </button>
              )}
              <button
                onClick={() => setActiveCellTab('quota')}
                className={`px-4 py-2 rounded-t-lg transition-all border-t border-x ${
                  activeCellTab === 'quota'
                    ? 'bg-white text-emerald-700 border-stone-200 border-b-white -mb-px'
                    : 'text-stone-500 hover:text-stone-800 border-transparent'
                }`}
              >
                ⚙️ 修改庫存容量
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {activeCellTab === 'orders' && editingCell.orders && editingCell.orders.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs text-stone-500 font-medium flex justify-between items-center bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                    <span>💡 點擊下方按鈕可直接跳轉至「訂單管理」查看完整細節與編輯對帳：</span>
                  </div>
                  {editingCell.orders.map(order => {
                    const qty = order.nf_order_items?.find(oi => oi.item_id === editingCell.item.id)?.quantity || 0;
                    const total = order.total_amount || 0;
                    const paid = order.deposit_amount || 0;
                    const unpaid = Math.max(0, total - paid);
                    const orderSearchUrl = `/admin/orders?search=${encodeURIComponent(order.order_no)}`;
                    
                    return (
                      <div key={order.id} className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3 hover:border-emerald-300 transition-all shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-stone-800 text-base flex items-center gap-2">
                              <span>{order.customer_name}</span>
                              <span className="text-xs font-mono text-stone-400 bg-white px-2 py-0.5 rounded border border-stone-200">{order.order_no}</span>
                            </div>
                            <div className="text-xs text-stone-500 mt-1 flex items-center gap-3">
                              <span>📅 {order.check_in_date.slice(5)} ～ {order.check_out_date.slice(5)}</span>
                              <span>
                                {order.status === 'paid' ? <span className="text-emerald-600 font-bold">💰 已付款</span> :
                                 order.status === 'deposit_paid' ? <span className="text-teal-600 font-bold">🪙 已付定金</span> :
                                 order.status === 'checked_in' ? <span className="text-blue-600 font-bold">✅ 已報到</span> :
                                 <span className="text-rose-500 font-bold">⏳ 待付款</span>}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs mt-2 font-mono text-stone-600 bg-white px-2.5 py-1.5 rounded-lg border border-stone-200/80 shadow-2xs">
                              <span>總額: <strong className="text-stone-800 font-bold">NT$ {total.toLocaleString()}</strong></span>
                              <span>已收: <strong className="text-emerald-600 font-bold">NT$ {paid.toLocaleString()}</strong></span>
                              <span>尾款: <strong className={unpaid > 0 ? "text-rose-600 font-bold" : "text-stone-400 font-normal"}>{unpaid > 0 ? `NT$ ${unpaid.toLocaleString()}` : "已結清"}</strong></span>
                            </div>
                          </div>
                          <div className="bg-amber-100 text-amber-800 font-bold text-sm px-2.5 py-1 rounded-lg border border-amber-200 shrink-0 font-mono">
                            x {qty} 個
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-stone-200/80">
                          <span className="text-xs text-stone-400 font-mono">入住人資訊備註已整合</span>
                          <a
                            href={orderSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <span>🔍 開啟訂單管理對帳</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-stone-50 p-4 rounded-xl space-y-2 border border-stone-100 text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-500">項目名稱</span>
                      <span className="font-bold text-stone-700">{editingCell.item.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">指定日期</span>
                      <span className="font-bold text-stone-700 font-mono">{editingCell.dateStr}</span>
                    </div>
                    <div className="flex justify-between border-t border-stone-200/60 pt-2 mt-2">
                      <span className="text-stone-500">系統預設總量</span>
                      <span className="font-bold text-stone-700">{editingCell.item.total_quantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">目前已被訂走</span>
                      <span className="font-bold text-rose-500">{editingCell.booked}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">
                      實際可開放總數 <span className="text-stone-400 font-normal">(留空代表恢復預設)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newQuota}
                      onChange={(e) => setNewQuota(e.target.value)}
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-lg font-mono outline-none"
                      placeholder={editingCell.item.total_quantity.toString()}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveQuota();
                        if (e.key === 'Escape') setEditingCell(null);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-100 flex justify-end gap-3 bg-stone-50/50">
              <button 
                onClick={() => setEditingCell(null)}
                className="px-5 py-2 text-stone-600 font-bold hover:bg-stone-200 rounded-lg transition-colors text-sm"
              >
                關閉
              </button>
              {activeCellTab === 'quota' && (
                <button 
                  onClick={handleSaveQuota}
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2 text-sm"
                >
                  儲存容量變更
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 點擊整天標題開啟 Modal：分頁 1 財務統計、分頁 2 修改全天庫存 */}
      {editingDay !== null && (() => {
        const summary = getDayFinancialSummary(editingDay);
        const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), editingDay);
        const dayOfWeekStr = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditingDay(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                    <span>📅 {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月 {editingDay} 日</span>
                    <span className="text-xs font-semibold text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full">
                      星期{dayOfWeekStr}
                    </span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">當日財務與庫存控制面板</p>
                </div>
                <button 
                  onClick={() => setEditingDay(null)} 
                  className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-200 text-stone-600 font-bold text-sm flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex border-b border-stone-200 bg-stone-100/60 px-4 pt-2 gap-2 text-sm font-bold">
                <button
                  onClick={() => setActiveDayTab('financial')}
                  className={`px-4 py-2 rounded-t-lg transition-all border-t border-x ${
                    activeDayTab === 'financial'
                      ? 'bg-white text-emerald-700 border-stone-200 border-b-white -mb-px'
                      : 'text-stone-500 hover:text-stone-800 border-transparent'
                  }`}
                >
                  💰 當日財務數據
                </button>
                <button
                  onClick={() => setActiveDayTab('quota')}
                  className={`px-4 py-2 rounded-t-lg transition-all border-t border-x ${
                    activeDayTab === 'quota'
                      ? 'bg-white text-emerald-700 border-stone-200 border-b-white -mb-px'
                      : 'text-stone-500 hover:text-stone-800 border-transparent'
                  }`}
                >
                  ⚙️ 修改全天庫存
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {activeDayTab === 'financial' ? (
                  <div className="space-y-4">
                    {/* 訂單篩選切換 */}
                    <div className="flex items-center justify-between bg-stone-100 p-1 rounded-xl text-xs font-bold border border-stone-200">
                      <button
                        onClick={() => setDayOrderFilter('check_in')}
                        className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                          dayOrderFilter === 'check_in' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        當日入住訂單 ({summary.checkInOrders.length} 筆)
                      </button>
                      <button
                        onClick={() => setDayOrderFilter('active')}
                        className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                          dayOrderFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        當日在營總數 ({summary.activeOrders.length} 筆)
                      </button>
                    </div>

                    {/* 金額統計卡片 */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl text-center shadow-sm">
                        <div className="text-[11px] font-semibold text-emerald-700 mb-1">應收總額</div>
                        <div className="text-base md:text-lg font-black text-emerald-800 font-mono">
                          NT$ {summary.totalRevenue.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-teal-50/70 border border-teal-200/80 p-3 rounded-xl text-center shadow-sm">
                        <div className="text-[11px] font-semibold text-teal-700 mb-1">已收金額 / 定金</div>
                        <div className="text-base md:text-lg font-black text-teal-800 font-mono">
                          NT$ {summary.totalPaid.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-rose-50/70 border border-rose-200/80 p-3 rounded-xl text-center shadow-sm">
                        <div className="text-[11px] font-semibold text-rose-700 mb-1">未收尾款</div>
                        <div className="text-base md:text-lg font-black text-rose-700 font-mono">
                          NT$ {summary.totalUnpaid.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* 付款管道拆解 */}
                    <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 space-y-2 text-xs">
                      <div className="font-bold text-stone-700 flex items-center gap-1.5 pb-1 border-b border-stone-200">
                        <span>💵 金流明細拆解</span>
                        <span className="text-[10px] text-stone-400 font-normal">(含線上/現場收款)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="bg-white p-2 rounded-lg border border-stone-200 text-center">
                          <span className="text-stone-500 text-[10px] block">現場 / 現金</span>
                          <span className="font-bold font-mono text-stone-800 text-xs">NT$ {summary.onsiteTotal.toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-stone-200 text-center">
                          <span className="text-stone-500 text-[10px] block">銀行轉帳</span>
                          <span className="font-bold font-mono text-stone-800 text-xs">NT$ {summary.bankTransferTotal.toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-stone-200 text-center">
                          <span className="text-stone-500 text-[10px] block">信用卡 / 線上</span>
                          <span className="font-bold font-mono text-stone-800 text-xs">NT$ {summary.creditCardTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* 當日相關訂單細節列表 */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-stone-700 flex justify-between items-center px-1">
                        <span>📋 訂單名細 ({summary.targetOrders.length} 筆)</span>
                        <span className="text-[10px] text-stone-400">點擊右側按鈕可至訂單管理對帳</span>
                      </div>

                      {summary.targetOrders.length === 0 ? (
                        <div className="text-center py-6 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-stone-400 text-xs">
                          本日尚無關聯訂單資料
                        </div>
                      ) : (
                        summary.targetOrders.map(order => {
                          const total = order.total_amount || 0;
                          const paid = order.deposit_amount || 0;
                          const unpaid = Math.max(0, total - paid);
                          const orderSearchUrl = `/admin/orders?search=${encodeURIComponent(order.order_no)}`;

                          return (
                            <div key={order.id} className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2 hover:border-emerald-300 transition-all shadow-sm">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-bold text-stone-800 text-sm flex items-center gap-2">
                                    <span>{order.customer_name}</span>
                                    <span className="text-[10px] font-mono text-stone-500 bg-white px-1.5 py-0.5 rounded border border-stone-200">
                                      {order.order_no}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-2 font-mono">
                                    <span>📅 {order.check_in_date.slice(5)} ～ {order.check_out_date.slice(5)}</span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    order.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                    order.status === 'deposit_paid' ? 'bg-teal-100 text-teal-700' :
                                    order.status === 'checked_in' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {order.status === 'paid' ? '💰 已全額付款' :
                                     order.status === 'deposit_paid' ? '🪙 已付定金' :
                                     order.status === 'checked_in' ? '✅ 已報到' : '⏳ 待付款'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-stone-200/80 text-xs font-mono">
                                <div className="flex items-center gap-3 text-stone-600">
                                  <span>總金額: <strong className="text-stone-800 font-bold">NT$ {total.toLocaleString()}</strong></span>
                                  <span>已收: <strong className="text-emerald-600 font-bold">NT$ {paid.toLocaleString()}</strong></span>
                                  <span>尾款: <strong className="text-rose-600 font-bold">NT$ {unpaid.toLocaleString()}</strong></span>
                                </div>
                                <a
                                  href={orderSearchUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 shrink-0"
                                >
                                  <span>對帳</span>
                                  <span className="text-[9px]">↗</span>
                                </a>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-stone-500 bg-amber-50 p-3 rounded-xl border border-amber-200">
                      💡 批次修改全天庫存將影響全區商品在 <span className="font-mono font-bold text-stone-800">{summary.dateStr}</span> 的可訂數量。
                    </p>
                    <div className="space-y-3 pt-2">
                      <button 
                        onClick={() => handleBatchSaveQuota(0)}
                        disabled={adminRole === 'viewer'}
                        className="w-full py-3.5 px-4 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 transition-colors font-bold flex items-center justify-center gap-2 shadow-sm text-sm"
                      >
                        🚫 一鍵歸零 (關閉本日)
                      </button>
                      <button 
                        onClick={() => handleBatchSaveQuota(null)}
                        disabled={adminRole === 'viewer'}
                        className="w-full py-3.5 px-4 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 transition-colors font-bold flex items-center justify-center gap-2 shadow-sm text-sm"
                      >
                        ✅ 恢復系統預設
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-stone-100 flex justify-end bg-stone-50/50">
                <button 
                  onClick={() => setEditingDay(null)}
                  className="px-6 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-xl transition-colors text-sm"
                >
                  關閉
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 浮動的 Hover Tooltip (純預覽，僅在桌機滑鼠 Hover 且 Modal 未開啟時顯示) */}
      {!editingCell && hoveredCell && (
        <div 
          className="hidden md:block fixed z-[99999] pointer-events-none w-[280px] bg-stone-800/95 backdrop-blur-md text-white text-xs rounded-xl shadow-2xl p-3.5 border border-stone-700 animate-in fade-in duration-150"
          style={{
            left: hoveredCell.rect.left + hoveredCell.rect.width / 2,
            transform: 'translateX(-50%)',
            top: hoveredCell.rect.top > 280 
              ? hoveredCell.rect.top - 8 
              : hoveredCell.rect.bottom + 8,
            translate: hoveredCell.rect.top > 280 ? '0 -100%' : '0 0',
          }}
        >
          <div className="font-bold border-b border-stone-700 pb-2 mb-2 flex justify-between items-center">
            <span className="text-stone-200 tracking-wider">📝 當日訂單預覽</span>
            <span className="text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-[10px] font-mono">總計 {hoveredCell.booked} 個</span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto hide-scrollbar">
            {hoveredCell.orders.map(order => {
              const qty = order.nf_order_items?.find(oi => oi.item_id === hoveredCell.item.id)?.quantity || 0;
              const total = order.total_amount || 0;
              const paid = order.deposit_amount || 0;
              const unpaid = Math.max(0, total - paid);

              return (
                <div 
                  key={order.id} 
                  className="flex justify-between items-center gap-2 bg-stone-700/50 p-2 rounded-lg border border-stone-600/50 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-emerald-300 font-bold truncate">
                      {order.customer_name} 
                      <span className="text-stone-400 font-mono text-[10px] ml-1">({order.order_no.slice(-4)})</span>
                    </div>
                    <div className="text-[10px] text-stone-300 mt-0.5 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{order.status === 'paid' ? '💰 已付款' : order.status === 'deposit_paid' ? '🪙 已付定金' : order.status === 'checked_in' ? '✅ 已報到' : '⏳ 待付款'}</span>
                      <span className="text-emerald-400">已收 NT$ {paid.toLocaleString()}</span>
                      {unpaid > 0 && <span className="text-rose-300">尾款 NT$ {unpaid.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="font-mono bg-stone-900/60 px-2 py-0.5 rounded text-amber-300 shrink-0 font-bold text-xs">x {qty}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-stone-400 text-center mt-2 pt-1 border-t border-stone-700/60">
            💡 點擊格子可開啟 Modal 查看細節與對帳
          </div>
          {/* 小三角形指標 */}
          <div 
            className={`absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent ${
              hoveredCell.rect.top > 280 
                ? 'top-full border-t-stone-800/95' 
                : 'bottom-full border-b-stone-800/95'
            }`}
          ></div>
        </div>
      )}
    </div>
  );
}
