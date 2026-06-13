import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  name: string;
  category: string;
  total_quantity: number;
};

type InventoryRecord = {
  id?: string;
  item_id: string;
  date: string;
  override_quantity: number | null;
  booked_quantity: number;
};

export default function InventoryCalendar() {
  const [items, setItems] = useState<Item[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 選擇月份
  const [currentDate, setCurrentDate] = useState(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 取得當月的天數陣列
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    fetchData();
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
    // 1. 取得所有營位、裝備與服務
    const { data: itemsData } = await supabase
      .from('nf_items')
      .select('id, name, category, total_quantity')
      .order('sort_order', { ascending: true });

    if (itemsData) {
      const categoryWeight: Record<string, number> = { campsite: 1, equipment: 2, service: 3 };
      itemsData.sort((a, b) => {
        if (categoryWeight[a.category] !== categoryWeight[b.category]) {
          return categoryWeight[a.category] - categoryWeight[b.category];
        }
        return 0;
      });
      setItems(itemsData);
    }

    // 2. 取得當月的特別庫存紀錄
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${daysInMonth}`;

    const { data: invData } = await supabase
      .from('nf_inventory')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (invData) setInventory(invData);
    setLoading(false);
  };

  // 切換月份
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // 點擊格子修改覆蓋數量
  const handleCellClick = async (item: Item, day: number) => {
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day.toString().padStart(2, '0')}`;
    
    const existingRecord = inventory.find(i => i.item_id === item.id && i.date === dateStr);
    const currentOverride = existingRecord?.override_quantity ?? item.total_quantity;
    
    const input = prompt(`【${item.name}】\\n日期：${dateStr}\\n目前預設數量：${item.total_quantity}\\n目前已被訂走數量：${existingRecord?.booked_quantity || 0}\\n\\n請輸入這天「實際可開放的總數」(輸入空值代表恢復預設)：`, currentOverride.toString());
    
    if (input === null) return; // 取消
    
    let newOverride = input.trim() === '' ? null : parseInt(input);
    if (newOverride !== null && isNaN(newOverride)) {
      alert('請輸入有效的數字！');
      return;
    }

    // 如果輸入的數字跟原本預設的數量一樣，那就當作取消 override (存成 null)，避免無謂的黃色標記
    if (newOverride === item.total_quantity) {
      newOverride = null;
    }

    setLoading(true);

    if (existingRecord) {
      // Update
      const { error } = await supabase
        .from('nf_inventory')
        .update({ override_quantity: newOverride })
        .eq('id', existingRecord.id);
      if (error) alert('更新失敗: ' + error.message);
    } else {
      // Insert (booked_quantity defaults to 0 in DB)
      const { error } = await supabase
        .from('nf_inventory')
        .insert([{
          item_id: item.id,
          date: dateStr,
          override_quantity: newOverride
        }]);
      if (error) alert('新增失敗: ' + error.message);
    }
    
    await fetchData(); // 重新整理
  };

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-slate-200 md:p-5 p-3 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-80px)] w-full relative">
      
      {/* 頂部控制列 (極致緊湊設計) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 shrink-0">
        
        {/* 提示說明 (縮小至一行) */}
        <div className="text-xs text-slate-600 bg-gradient-to-r from-emerald-50 to-teal-50/30 px-4 py-2 rounded-lg border border-emerald-100/60 flex items-center gap-3 shadow-sm flex-1 overflow-x-auto whitespace-nowrap hide-scrollbar">
          <span className="text-emerald-500 text-base leading-none">💡</span>
          <span className="text-slate-700 font-medium mr-2 hidden md:inline">點擊格子可強制修改當天總量。</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-white border border-slate-300 rounded-full"></div> 正常可訂</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-50 border border-amber-300 rounded-full"></div> 手動調整</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-50 border border-rose-300 rounded-full"></div> 滿帳</span>
          </div>
        </div>

        {/* 月份切換 */}
        <div className="flex items-center justify-between gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200 shadow-inner shrink-0">
          <button onClick={handlePrevMonth} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded transition-all">
            &lt; 上個月
          </button>
          <span className="font-bold text-sm min-w-[100px] text-center text-slate-800 tracking-wider">
            {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月
          </span>
          <button onClick={handleNextMonth} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded transition-all">
            下個月 &gt;
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-emerald-600/60 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <p className="font-medium tracking-widest text-sm">載入中...</p>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-auto border border-slate-200 rounded-2xl relative shadow-inner bg-slate-50/50">
          <table className="w-full text-center border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <tr>
                <th className="p-3 border-b border-r border-slate-200/80 bg-slate-100/90 backdrop-blur-md min-w-[120px] md:min-w-[180px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] text-slate-700 font-bold tracking-wider">項目名稱</th>
                {daysArray.map(day => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const today = new Date();
                  const isToday = currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth() && day === today.getDate();
                  
                  return (
                    <th key={day} id={isToday ? 'today-col-header' : undefined} className={`relative p-1.5 border-b border-r min-w-[45px] md:min-w-[55px] ${isToday ? 'bg-amber-100/60 border-amber-300 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.5)] z-20' : isWeekend ? 'text-rose-500 bg-rose-50/30 border-slate-200/80' : 'text-slate-600 border-slate-200/80'}`}>
                      <div className="flex flex-col items-center justify-center space-y-0.5">
                        <span className={`font-bold text-base md:text-lg ${isToday ? 'text-amber-700' : ''}`}>{day}</span>
                        <span className={`text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isToday ? 'bg-amber-200/80 text-amber-800' : isWeekend ? 'bg-rose-100/50 text-rose-600' : 'bg-slate-200/50 text-slate-500'}`}>
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
                <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors group">
                  <td className="p-2 md:p-3 border-b border-r border-slate-100 font-medium text-slate-800 text-left sticky left-0 bg-white group-hover:bg-emerald-50/20 z-10 whitespace-normal md:whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]">
                    <div className="flex flex-col md:flex-row md:items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md self-start shrink-0 font-semibold tracking-wide hidden md:inline-block">
                        {item.category === 'campsite' ? '⛺️ 營位' : item.category === 'equipment' ? '🪑 裝備' : '🍖 服務'}
                      </span>
                      <span className="leading-tight text-sm md:leading-normal truncate max-w-[120px] md:max-w-none text-slate-700 font-bold" title={item.name}>{item.name}</span>
                    </div>
                    <div className="text-[9px] md:text-[10px] text-slate-400 font-medium mt-1 tracking-wider">預設: {item.total_quantity}</div>
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
                        ${isFull ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-rose-100/30' :
                          isOverridden ? 'bg-amber-50 text-amber-600 border border-amber-300 shadow-amber-100/30' :
                          'bg-white text-slate-700 border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-emerald-100/40'
                        }
                      `}>
                        {remaining > 0 ? remaining : (totalAvailable === 0 ? <span className="text-slate-300 font-normal">-</span> : '滿')}
                      </div>
                    );

                    const today = new Date();
                    const isToday = currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth() && day === today.getDate();
                    
                    return (
                      <td key={day} className={`p-1 md:p-1.5 border-b border-r cursor-pointer group/cell ${isToday ? 'bg-amber-50/40 border-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]' : 'border-slate-100/60'}`} onClick={() => handleCellClick(item, day)} title={`點擊修改 ${day} 日庫存 | 已訂: ${booked} / 總量: ${totalAvailable}`}>
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
    </div>
  );
}
