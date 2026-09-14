import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { TAIWAN_HOLIDAYS } from '../../utils/taiwanHolidays';

interface BookingCalendarPickerProps {
  campId: string;
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
}

interface ItemInventoryInfo {
  totalRemaining: number;
  isSoldOut: boolean;
}

// 格式化 Date 為 YYYY-MM-DD
const formatDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 取得星期中文名稱
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function BookingCalendarPicker({
  campId,
  checkIn,
  checkOut,
  onChange
}: BookingCalendarPickerProps) {
  // 目前瀏覽的月份（年與月）
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (checkIn) {
      const parts = checkIn.split('-').map(Number);
      if (parts.length === 3) return new Date(parts[0], parts[1] - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState<Record<string, ItemInventoryInfo>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 今天字串 (YYYY-MM-DD)
  const todayStr = useMemo(() => formatDateStr(new Date()), []);

  // 最大允許預訂日期（6 個月後）
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return formatDateStr(d);
  }, []);

  // 載入營位項目與未來 6 個月庫存
  useEffect(() => {
    if (!campId) return;

    let isMounted = true;
    const fetchInventory = async () => {
      setLoading(true);
      try {
        // 1. 取得該營區所有 category = 'campsite' 的房型項目
        const { data: items, error: itemsErr } = await supabase
          .from('nf_items')
          .select('id, name, total_quantity, category')
          .eq('camp_id', campId)
          .eq('category', 'campsite')
          .eq('is_active', true);

        if (itemsErr || !items || items.length === 0) {
          if (isMounted) setLoading(false);
          return;
        }

        const itemIds = items.map(i => i.id);

        // 2. 取得今日起到 6 個月後的所有庫存覆寫與已訂資料
        const { data: invRecords, error: invErr } = await supabase
          .from('nf_inventory')
          .select('item_id, date, override_quantity, booked_quantity')
          .in('item_id', itemIds)
          .gte('date', todayStr)
          .lte('date', maxDateStr);

        if (invErr) {
          console.error('Error fetching inventory for calendar:', invErr);
        }

        // 建立 lookup map: date -> item_id -> record
        const invLookup: Record<string, Record<string, { override: number | null, booked: number }>> = {};
        if (invRecords) {
          for (const rec of invRecords) {
            if (!invLookup[rec.date]) {
              invLookup[rec.date] = {};
            }
            invLookup[rec.date][rec.item_id] = {
              override: rec.override_quantity,
              booked: rec.booked_quantity || 0
            };
          }
        }

        // 3. 計算每一天的總可用營位數量
        const availMap: Record<string, ItemInventoryInfo> = {};
        const curDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 6);

        while (curDate <= endDate) {
          const dStr = formatDateStr(curDate);
          let totalRemaining = 0;

          for (const item of items) {
            const rec = invLookup[dStr]?.[item.id];
            const override = rec?.override;
            const capacity = (override !== null && override !== undefined) ? override : item.total_quantity;
            const booked = rec?.booked || 0;
            const remaining = Math.max(0, capacity - booked);
            totalRemaining += remaining;
          }

          availMap[dStr] = {
            totalRemaining,
            isSoldOut: items.length > 0 && totalRemaining <= 0
          };

          curDate.setDate(curDate.getDate() + 1);
        }

        if (isMounted) {
          setAvailability(availMap);
        }
      } catch (err) {
        console.error('Calendar load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInventory();

    return () => {
      isMounted = false;
    };
  }, [campId, todayStr, maxDateStr]);

  // 月曆切換控制
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-indexed

  const canGoPrev = useMemo(() => {
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return viewDate > currentMonthStart;
  }, [viewDate]);

  const canGoNext = useMemo(() => {
    const maxMonthStart = new Date();
    maxMonthStart.setMonth(maxMonthStart.getMonth() + 5);
    return viewDate < maxMonthStart;
  }, [viewDate]);

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  // 產生當月的日期網格
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0 是週日
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: ({ type: 'empty'; key: string } | {
      type: 'day';
      dateStr: string;
      dayNum: number;
      isPast: boolean;
      isFutureMax: boolean;
      isSoldOut: boolean;
      isToday: boolean;
      holiday?: { name: string; isHoliday: boolean };
    })[] = [];

    // 填補月初空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ type: 'empty', key: `empty-${i}` });
    }

    // 填入當月日期
    for (let d = 1; d <= totalDays; d++) {
      const dObj = new Date(viewYear, viewMonth, d);
      const dStr = formatDateStr(dObj);
      const isPast = dStr < todayStr;
      const isFutureMax = dStr > maxDateStr;
      const isSoldOut = availability[dStr]?.isSoldOut || false;
      const isToday = dStr === todayStr;
      const holiday = TAIWAN_HOLIDAYS[dStr];

      days.push({
        type: 'day',
        dateStr: dStr,
        dayNum: d,
        isPast,
        isFutureMax,
        isSoldOut,
        isToday,
        holiday
      });
    }

    return days;
  }, [viewYear, viewMonth, todayStr, maxDateStr, availability]);

  // 點選日期邏輯
  const handleDateClick = (dateStr: string, isSoldOut: boolean, isPast: boolean) => {
    if (isPast) return;
    if (isSoldOut) {
      setErrorMessage(`⚠️ ${dateStr} 全區已客滿或不開放，請選擇其他日期`);
      return;
    }

    setErrorMessage('');

    // 情境 1: 尚未選擇入住日，或已經完整選完入住+退房（重新開始選）
    if (!checkIn || (checkIn && checkOut)) {
      onChange(dateStr, '');
      return;
    }

    // 情境 2: 已有 checkIn，正在選退房日 checkOut
    if (checkIn && !checkOut) {
      if (dateStr <= checkIn) {
        // 點選比入住日早或同一天：改為新的入住日
        onChange(dateStr, '');
        return;
      }

      // 檢查中間是否有客滿/鎖定夜數
      let hasLockedNight = false;
      let lockedDateStr = '';
      const cur = new Date(checkIn);
      const target = new Date(dateStr);

      while (cur < target) {
        const curStr = formatDateStr(cur);
        if (availability[curStr]?.isSoldOut) {
          hasLockedNight = true;
          lockedDateStr = curStr;
          break;
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (hasLockedNight) {
        setErrorMessage(`⚠️ 所選入住期間包含已客滿日期（${lockedDateStr}），請重新選取連續有空位的區間`);
        return;
      }

      // 區間驗證通過，設定入住與退房
      onChange(checkIn, dateStr);
    }
  };

  // 快速選擇 1 晚捷徑（點選入住日後若隔天有空可一鍵設定）
  const canQuickOneNight = useMemo(() => {
    if (!checkIn || checkOut) return false;
    const nextD = new Date(checkIn);
    nextD.setDate(nextD.getDate() + 1);
    const nextDStr = formatDateStr(nextD);
    return !availability[checkIn]?.isSoldOut && !availability[nextDStr]?.isSoldOut && nextDStr <= maxDateStr;
  }, [checkIn, checkOut, availability, maxDateStr]);

  const handleQuickOneNight = () => {
    if (!checkIn) return;
    const nextD = new Date(checkIn);
    nextD.setDate(nextD.getDate() + 1);
    const nextDStr = formatDateStr(nextD);
    onChange(checkIn, nextDStr);
  };

  // 計算選取天數
  const stayNights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);

  return (
    <div className="flex flex-col space-y-4">
      {/* 月曆卡片外框 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80">
        {/* 月份切換列 */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="上個月"
          >
            ◀
          </button>
          <div className="text-center">
            <span className="text-lg font-black text-slate-800 tracking-wide">
              {viewYear} 年 {viewMonth + 1} 月
            </span>
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={!canGoNext}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="下個月"
          >
            ▶
          </button>
        </div>

        {/* 星期表頭 */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEK_DAYS.map((day, idx) => (
            <div
              key={day}
              className={`text-xs font-bold py-1 ${
                idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日期格子網格 */}
        <div className="grid grid-cols-7 gap-1 relative min-h-[220px]">
          {loading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-xl">
              <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
          )}

          {calendarDays.map((item) => {
            if (item.type === 'empty') {
              return <div key={item.key} className="h-12" />;
            }

            const { dateStr, dayNum, isPast, isFutureMax, isSoldOut, isToday, holiday } = item;
            const isDisabled = isPast || isFutureMax || isSoldOut;

            const isCheckIn = checkIn === dateStr;
            const isCheckOut = checkOut === dateStr;
            const isInRange = checkIn && checkOut && dateStr > checkIn && dateStr < checkOut;

            // 決定格子的樣式
            let cellStyle = 'bg-white hover:bg-emerald-50/60 text-slate-800 cursor-pointer border border-transparent';

            if (isCheckIn && isCheckOut) {
              cellStyle = 'bg-emerald-600 text-white font-black rounded-xl shadow-md z-10 scale-105';
            } else if (isCheckIn) {
              cellStyle = checkOut
                ? 'bg-emerald-600 text-white font-black rounded-l-xl rounded-r-none shadow-md z-10 scale-105'
                : 'bg-emerald-600 text-white font-black rounded-xl shadow-md z-10 scale-105 ring-2 ring-emerald-400';
            } else if (isCheckOut) {
              cellStyle = 'bg-emerald-600 text-white font-black rounded-r-xl rounded-l-none shadow-md z-10 scale-105';
            } else if (isInRange) {
              cellStyle = 'bg-emerald-100/80 text-emerald-900 font-bold rounded-none';
            } else if (isSoldOut) {
              cellStyle = 'bg-slate-100 text-slate-300 line-through cursor-not-allowed border-dashed border-slate-200';
            } else if (isPast || isFutureMax) {
              cellStyle = 'text-slate-300 cursor-not-allowed';
            }

            return (
              <button
                key={dateStr}
                type="button"
                disabled={isDisabled}
                onClick={() => handleDateClick(dateStr, isSoldOut, isPast || isFutureMax)}
                className={`h-12 flex flex-col items-center justify-center p-0.5 relative transition-all rounded-lg select-none ${cellStyle}`}
              >
                {/* 今日標記 */}
                {isToday && !isCheckIn && !isCheckOut && (
                  <span className="absolute top-1 left-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                )}

                {/* 日期數字 */}
                <span className="text-sm font-bold leading-none">{dayNum}</span>

                {/* 節日或客滿標籤 */}
                {isSoldOut ? (
                  <span className="text-[9px] font-medium text-slate-400 leading-none mt-1">滿</span>
                ) : holiday ? (
                  <span
                    className={`text-[9px] font-black leading-none mt-1 truncate max-w-[36px] ${
                      isCheckIn || isCheckOut ? 'text-emerald-100' : 'text-rose-600'
                    }`}
                  >
                    {holiday.name}
                  </span>
                ) : isToday && !isCheckIn && !isCheckOut ? (
                  <span className="text-[8px] font-bold text-emerald-600 leading-none mt-1">今天</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 圖例說明 */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3 mt-2 border-t border-slate-100 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
            <span>已選擇</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-white border border-slate-300 inline-block" />
            <span>可預訂</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-dashed border-slate-300 inline-block" />
            <span className="text-slate-400">客滿/鎖定</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-rose-500 font-bold">●</span>
            <span>節假日</span>
          </div>
        </div>
      </div>

      {/* 錯誤/防呆警示提示 */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 已選區間摘要卡片 */}
      <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>📅</span> 預訂入住期間
          </span>
          {checkIn && (
            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                onChange('', '');
              }}
              className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors"
            >
              清除重選
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 入住日 */}
          <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-xs">
            <div className="text-[10px] font-bold text-slate-400 mb-1">入住日期 (Check-in)</div>
            <div className="text-sm font-black text-slate-800">
              {checkIn ? (
                <span className="text-emerald-700">{checkIn}</span>
              ) : (
                <span className="text-slate-300 font-normal">請點選月曆</span>
              )}
            </div>
          </div>

          {/* 退房日 */}
          <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-xs">
            <div className="text-[10px] font-bold text-slate-400 mb-1">退房日期 (Check-out)</div>
            <div className="text-sm font-black text-slate-800">
              {checkOut ? (
                <span className="text-emerald-700">{checkOut}</span>
              ) : checkIn ? (
                <span className="text-emerald-600 font-bold animate-pulse">請點選退房日</span>
              ) : (
                <span className="text-slate-300 font-normal">請點選月曆</span>
              )}
            </div>
          </div>
        </div>

        {/* 晚數狀態與快速按鈕 */}
        {checkIn && checkOut && stayNights > 0 ? (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-emerald-800">
              共計入住 <span className="text-base font-black text-emerald-600">{stayNights}</span> 晚
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
              ✓ 日期已確認，請按下一步
            </span>
          </div>
        ) : checkIn && !checkOut && canQuickOneNight ? (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 font-medium">想要只住 1 晚？</span>
            <button
              type="button"
              onClick={handleQuickOneNight}
              className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1 rounded-lg transition-colors shadow-2xs"
            >
              ⚡ 快速選 1 晚（隔日退房）
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
