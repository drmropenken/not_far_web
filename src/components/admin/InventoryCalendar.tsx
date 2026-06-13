import React, { useState, useEffect } from 'react';
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

  // 取得當月的天數陣列
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    setLoading(true);
    // 1. 取得所有營位 (過濾掉服務，因為服務通常不限量，或稍後再加)
    const { data: itemsData } = await supabase
      .from('nf_items')
      .select('id, name, category, total_quantity')
      .in('category', ['campsite', 'equipment'])
      .order('sort_order', { ascending: true });

    if (itemsData) setItems(itemsData);

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
    <div className="bg-white md:rounded-2xl shadow-sm border border-slate-200 md:p-8 p-4 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] w-full">
      
      {/* 標題與切換月份 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 shrink-0">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3 tracking-wide">
          <span className="text-emerald-600 bg-emerald-50 p-2 rounded-xl">📅</span> 庫存與可訂數量
        </h2>
        <div className="flex items-center justify-between gap-1 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200 w-full md:w-auto shadow-inner">
          <button onClick={handlePrevMonth} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-lg transition-all flex-1 md:flex-none text-center">
            &lt; 上個月
          </button>
          <span className="font-bold text-lg md:text-xl min-w-[140px] text-center text-slate-800 tracking-wider">
            {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月
          </span>
          <button onClick={handleNextMonth} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-lg transition-all flex-1 md:flex-none text-center">
            下個月 &gt;
          </button>
        </div>
      </div>

      <div className="text-xs md:text-sm text-slate-600 mb-6 shrink-0 bg-gradient-to-r from-emerald-50 to-teal-50/30 p-4 md:p-5 rounded-xl border border-emerald-100/60 flex gap-4 items-start shadow-sm">
        <span className="text-emerald-500 text-xl leading-none pt-0.5">💡</span>
        <div className="space-y-2">
          <p className="text-slate-700">這裡顯示每天 <strong className="text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded">「剩餘可預訂」</strong> 數量。點擊格子可強制修改當天總量（如維修、保留或被其他平台訂走）。</p>
          <div className="flex flex-wrap gap-4 pt-1">
            <span className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-white border-2 border-slate-200 rounded-full"></div> <span className="opacity-80">正常可訂</span></span>
            <span className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-amber-50 border-2 border-amber-300 rounded-full"></div> <span className="opacity-80">手動調整過總量</span></span>
            <span className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-rose-50 border-2 border-rose-300 rounded-full"></div> <span className="opacity-80">已額滿 / 鎖定</span></span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-emerald-600/60 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <p className="font-medium tracking-widest text-sm">載入中...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl relative shadow-inner bg-slate-50/50">
          <table className="w-full text-center border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <tr>
                <th className="p-4 border-b border-r border-slate-200/80 bg-slate-100/90 backdrop-blur-md min-w-[140px] md:min-w-[220px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] text-slate-700 font-bold tracking-wider">項目名稱</th>
                {daysArray.map(day => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th key={day} className={`p-2 border-b border-r border-slate-200/80 min-w-[50px] md:min-w-[65px] ${isWeekend ? 'text-rose-500 bg-rose-50/30' : 'text-slate-600'}`}>
                      <div className="flex flex-col items-center justify-center space-y-1 py-1">
                        <span className="font-bold text-lg md:text-xl">{day}</span>
                        <span className={`text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full ${isWeekend ? 'bg-rose-100/50 text-rose-600' : 'bg-slate-200/50 text-slate-500'}`}>
                          {['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors group">
                  <td className="p-3 md:p-4 border-b border-r border-slate-100 font-medium text-slate-800 text-left sticky left-0 bg-white group-hover:bg-emerald-50/20 z-10 whitespace-normal md:whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]">
                    <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md self-start shrink-0 font-semibold tracking-wide">
                        {item.category === 'campsite' ? '⛺️ 營位' : '🪑 裝備'}
                      </span>
                      <span className="leading-tight md:leading-normal truncate max-w-[140px] md:max-w-none text-slate-700 font-bold" title={item.name}>{item.name}</span>
                    </div>
                    <div className="text-[10px] md:text-xs text-slate-400 font-medium mt-1.5 md:mt-1 tracking-wider">預設: {item.total_quantity}</div>
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
                      <div className={`w-full h-full min-h-[40px] md:min-h-[48px] flex items-center justify-center rounded-xl mx-auto text-sm md:text-base font-bold shadow-sm transition-all duration-200 transform group-hover/cell:scale-105 active:scale-95
                        ${isFull ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-rose-100/30' :
                          isOverridden ? 'bg-amber-50 text-amber-600 border border-amber-300 shadow-amber-100/30' :
                          'bg-white text-slate-700 border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-emerald-100/40'
                        }
                      `}>
                        {remaining > 0 ? remaining : (totalAvailable === 0 ? <span className="text-slate-300 font-normal">-</span> : '滿')}
                      </div>
                    );

                    return (
                      <td key={day} className="p-1.5 md:p-2 border-b border-r border-slate-100/60 cursor-pointer group/cell" onClick={() => handleCellClick(item, day)} title={`點擊修改 ${day} 日庫存 | 已訂: ${booked} / 總量: ${totalAvailable}`}>
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
