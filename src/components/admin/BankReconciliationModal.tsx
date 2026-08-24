import React, { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// 台灣常見銀行代碼對照表
const TAIWAN_BANKS: Record<string, string> = {
  '004': '臺灣銀行',
  '005': '土地銀行',
  '006': '合作金庫',
  '007': '第一銀行',
  '008': '華南銀行',
  '009': '彰化銀行',
  '011': '上海商銀',
  '012': '台北富邦',
  '013': '國泰世華',
  '016': '高雄銀行',
  '017': '兆豐銀行',
  '050': '臺灣企銀',
  '052': '渣打銀行',
  '053': '台中銀行',
  '054': '京城銀行',
  '081': '滙豐銀行',
  '102': '華泰銀行',
  '103': '新光銀行',
  '108': '陽信銀行',
  '147': '三信商銀',
  '700': '中華郵政',
  '803': '聯邦銀行',
  '805': '遠東商銀',
  '806': '元大銀行',
  '807': '永豐銀行',
  '808': '玉山銀行',
  '809': '凱基銀行',
  '810': '星展銀行',
  '812': '台新銀行',
  '816': '安泰銀行',
  '822': '中國信託',
  '823': '將來銀行',
  '824': '連線銀行(LINE Bank)',
  '826': '樂天銀行'
};

export type ParsedTransaction = {
  id: string; // 唯一 key
  rawLine: string;
  transactionTime: string; // YYYY/MM/DD HH:mm:ss
  accountingDate: string; // YYYY/MM/DD
  amount: number;
  virtualAccount: string | null; // 9629481xxxxxxx
  sourceBankCode: string | null; // e.g. 103, 807
  sourceBankName: string | null; // e.g. 新光銀行
  sourceAccountOrSeq: string | null; // 轉出帳號或序號
  rawRemarks: string;
  isOrderRelated: boolean;
  status: 'matched' | 'already_logged' | 'unmatched' | 'ignored';
  matchedOrder?: any;
  existingLog?: any;
  selected: boolean;
};

type BankReconciliationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orders: any[];
  paymentLogs: Record<string, any[]>;
  adminEmail: string | null;
  campId?: string | null;
};

export default function BankReconciliationModal({
  isOpen,
  onClose,
  onSuccess,
  orders,
  paymentLogs,
  adminEmail,
  campId
}: BankReconciliationModalProps) {
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'already_logged' | 'unmatched' | 'ignored'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ successCount: number; totalAmount: number } | null>(null);

  if (!isOpen) return null;

  // 1. 解析單列文字
  const parseBankLine = (line: string, index: number): ParsedTransaction | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // 比對時間開頭：YYYY/MM/DD HH:mm:ss 或 YYYY-MM-DD HH:mm:ss
    const timeMatch = trimmed.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+\d{2}:\d{2}:\d{2})/);
    if (!timeMatch) {
      return null;
    }

    const transactionTime = timeMatch[1].replace(/-/g, '/');
    const remainingAfterTime = trimmed.slice(timeMatch[0].length).trim();

    // 次一個日期為入帳日
    const accDateMatch = remainingAfterTime.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
    const accountingDate = accDateMatch ? accDateMatch[1].replace(/-/g, '/') : transactionTime.split(' ')[0];

    // 尋找金額：通常緊隨在交易類型後面，支出為 0，存入為非 0 數字（可能含逗號）
    // 範例：0 25,000 *** 或 0 3,000 ***
    let amount = 0;
    const amountMatch = trimmed.match(/\s+0\s+([0-9,]+)\s+/);
    if (amountMatch) {
      amount = parseInt(amountMatch[1].replace(/,/g, ''), 10) || 0;
    } else {
      // 容錯找其他數字格式
      const fallbackAmountMatch = trimmed.match(/([0-9,]{1,10})\s+\*{3}/);
      if (fallbackAmountMatch) {
        amount = parseInt(fallbackAmountMatch[1].replace(/,/g, ''), 10) || 0;
      }
    }

    // 尋找虛擬帳號（9629481 + 7 碼數字，前面可能補 000）
    const vaMatch = trimmed.match(/(?:000)?(9629481\d{7})/);
    const virtualAccount = vaMatch ? vaMatch[1] : null;

    // 尋找轉出銀行代碼與資訊（例如 V 103... 或 RICHART）
    let sourceBankCode: string | null = null;
    let sourceBankName: string | null = null;
    let sourceAccountOrSeq: string | null = null;

    if (trimmed.includes('RICHART') || trimmed.includes('richart')) {
      sourceBankCode = '812';
      sourceBankName = '台新 Richart';
    }

    const bankCodeMatch = trimmed.match(/V\s+(\d{3})(\d+)/);
    if (bankCodeMatch) {
      sourceBankCode = bankCodeMatch[1];
      sourceBankName = TAIWAN_BANKS[sourceBankCode] || `銀行代碼 ${sourceBankCode}`;
      sourceAccountOrSeq = bankCodeMatch[1] + bankCodeMatch[2];
    } else {
      const vMatch = trimmed.match(/V\s+([A-Za-z0-9\s]+)/);
      if (vMatch) {
        sourceAccountOrSeq = vMatch[1].trim();
      }
    }

    // 判斷是否為訂單款項
    const isInterest = trimmed.includes('息') || trimmed.includes('利息') || trimmed.includes('存款息');
    const isOrderRelated = Boolean(virtualAccount && !isInterest);

    return {
      id: `tx-${index}-${transactionTime.replace(/[\/\s:]/g, '')}-${amount}`,
      rawLine: trimmed,
      transactionTime,
      accountingDate,
      amount,
      virtualAccount,
      sourceBankCode,
      sourceBankName: sourceBankName || (sourceBankCode ? TAIWAN_BANKS[sourceBankCode] || null : null),
      sourceAccountOrSeq,
      rawRemarks: trimmed.slice(trimmed.lastIndexOf('***') + 3).trim(),
      isOrderRelated,
      status: 'unmatched',
      selected: false
    };
  };

  // 2. 執行解析與比對
  const handleParseAndMatch = () => {
    if (!inputText.trim()) {
      alert('請先貼上或上傳銀行交易明細內容！');
      return;
    }

    setIsProcessing(true);
    setImportResult(null);

    const lines = inputText.split('\n');
    const parsedList: ParsedTransaction[] = [];

    // 建立虛擬帳號對照表
    const orderVAMap = new Map<string, any>();
    orders.forEach(order => {
      if (order.virtual_account) {
        orderVAMap.set(order.virtual_account.trim(), order);
      }
    });

    // 建立所有既有金流記錄的比對 Set (order_id + amount + collected_at_date)
    const existingLogSet = new Set<string>();
    Object.entries(paymentLogs).forEach(([orderId, logs]) => {
      logs.forEach(log => {
        if (log.payment_type === 'bank_transfer' || log.payment_type === 'onsite') {
          // 格式：orderId_amount_dateStr (YYYY/MM/DD)
          const logDate = log.collected_at ? new Date(log.collected_at).toISOString().split('T')[0] : '';
          existingLogSet.add(`${orderId}_${log.amount}_${logDate}`);
          // 亦記錄精確時間比對
          if (log.notes && log.notes.includes(logDate)) {
            existingLogSet.add(`${orderId}_${log.amount}_notes`);
          }
        }
      });
    });

    lines.forEach((line, idx) => {
      const item = parseBankLine(line, idx);
      if (!item) return;

      if (!item.isOrderRelated) {
        item.status = 'ignored';
        item.selected = false;
      } else if (item.virtualAccount && orderVAMap.has(item.virtualAccount)) {
        const order = orderVAMap.get(item.virtualAccount);
        item.matchedOrder = order;

        // 檢查是否已入過帳
        const txDateStr = item.transactionTime.split(' ')[0].replace(/\//g, '-');
        const isDuplicate = existingLogSet.has(`${order.id}_${item.amount}_${txDateStr}`);

        if (isDuplicate) {
          item.status = 'already_logged';
          item.selected = false; // 已入帳預設不勾選
        } else {
          item.status = 'matched';
          item.selected = true; // 待入帳預設勾選
        }
      } else {
        item.status = 'unmatched';
        item.selected = false;
      }

      parsedList.push(item);
    });

    setParsedItems(parsedList);
    setIsProcessing(false);
  };

  // 3. 處理檔案上傳
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
      }
    };
    reader.readAsText(file);
  };

  // 4. 勾選切換
  const toggleSelect = (id: string) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const toggleSelectAll = (checked: boolean) => {
    setParsedItems(prev => prev.map(item => {
      if (item.status === 'matched') {
        return { ...item, selected: checked };
      }
      return item;
    }));
  };

  // 5. 批次確認入帳
  const handleConfirmImport = async () => {
    const toImport = parsedItems.filter(item => item.selected && item.status === 'matched' && item.matchedOrder);
    if (toImport.length === 0) {
      alert('請先勾選欲入帳的款項！');
      return;
    }

    if (!confirm(`確定要將選取的 ${toImport.length} 筆款項正式寫入訂單金流嗎？\n總計金額：NT$ ${toImport.reduce((s, i) => s + i.amount, 0).toLocaleString()} 元`)) {
      return;
    }

    setIsImporting(true);

    try {
      const logsToInsert = toImport.map(item => {
        const order = item.matchedOrder;
        const sourceInfo = item.sourceBankName ? `${item.sourceBankName}${item.sourceBankCode ? `(${item.sourceBankCode})` : ''}` : '銀行轉帳';
        const accountInfo = item.sourceAccountOrSeq ? ` 轉出帳號/序號: ${item.sourceAccountOrSeq}` : '';
        const notes = `[銀行自動對帳] 虛擬帳號: ${item.virtualAccount} | 來源: ${sourceInfo}${accountInfo} | 交易時間: ${item.transactionTime}`;

        // 精確交易時間轉 ISO
        const isoCollectedAt = new Date(item.transactionTime.replace(/\//g, '-')).toISOString();

        return {
          order_id: order.id,
          amount: item.amount,
          payment_type: 'bank_transfer',
          collected_by: adminEmail ? `自動對帳 (${adminEmail})` : '銀行自動對帳',
          collected_at: isoCollectedAt,
          notes: notes
        };
      });

      const { error } = await supabase.from('nf_payment_logs').insert(logsToInsert);

      if (error) {
        throw new Error(error.message);
      }

      const totalAmt = toImport.reduce((s, i) => s + i.amount, 0);
      setImportResult({
        successCount: toImport.length,
        totalAmount: totalAmt
      });

      // 更新前端狀態為已入帳
      setParsedItems(prev => prev.map(item => {
        if (item.selected && item.status === 'matched') {
          return { ...item, status: 'already_logged', selected: false };
        }
        return item;
      }));

      // 通知父元件重新整理
      onSuccess();
    } catch (err: any) {
      alert('匯入失敗：' + (err.message || '未知錯誤'));
    } finally {
      setIsImporting(false);
    }
  };

  // 篩選與統計
  const counts = useMemo(() => {
    return {
      all: parsedItems.length,
      matched: parsedItems.filter(i => i.status === 'matched').length,
      already_logged: parsedItems.filter(i => i.status === 'already_logged').length,
      unmatched: parsedItems.filter(i => i.status === 'unmatched').length,
      ignored: parsedItems.filter(i => i.status === 'ignored').length,
      matchedAmount: parsedItems.filter(i => i.status === 'matched').reduce((s, i) => s + i.amount, 0),
      selectedCount: parsedItems.filter(i => i.selected).length,
      selectedAmount: parsedItems.filter(i => i.selected).reduce((s, i) => s + i.amount, 0)
    };
  }, [parsedItems]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return parsedItems;
    return parsedItems.filter(item => item.status === activeTab);
  }, [parsedItems, activeTab]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 animate-fade-in">
      <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-stone-800">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-indigo-950 text-white px-6 py-4.5 flex justify-between items-center shrink-0 border-b border-stone-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
              🏦
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider flex items-center gap-2">
                銀行自動對帳與金流匯入
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">智慧比對</span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                貼上或上傳銀行明細 TXT / CSV，系統將自動比對 14 碼虛擬帳號（9629481xxxxxxx）並批次入帳
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-white text-2xl leading-none transition-colors p-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-stone-50/50">

          {/* 輸入區塊 */}
          <div className="bg-white p-4.5 rounded-xl border border-stone-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <span>📋 貼上銀行交易明細文字 或 上傳檔案</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg border border-stone-300 transition-colors flex items-center gap-1">
                  <span>📂 選擇檔案 (.txt / .csv)</span>
                  <input type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                </label>
                {inputText && (
                  <button
                    onClick={() => { setInputText(''); setParsedItems([]); setImportResult(null); }}
                    className="text-xs text-stone-400 hover:text-rose-600 transition-colors"
                  >
                    清空內容
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="請直接從銀行網銀複製交易明細並貼在此處...&#10;範例：2026/07/30 12:47:342026/07/30 CD轉入 0 25,000 *** 00096294817209075,V 10300000480500182062 103214609"
              className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs font-mono text-stone-800 placeholder-stone-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all resize-y"
            />

            <div className="flex justify-between items-center pt-1">
              <span className="text-[11px] text-stone-400">
                💡 支援重複匯入（已入帳過款項會自動標記略過，絕不重複扣款）
              </span>
              <button
                onClick={handleParseAndMatch}
                disabled={isProcessing || !inputText.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? '正在解析比對中...' : '🔍 開始智慧比對'}
              </button>
            </div>
          </div>

          {/* 入帳成功提示 Alert */}
          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎉</span>
                <div>
                  <h4 className="font-bold text-sm">成功入帳 {importResult.successCount} 筆款項！</h4>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    已入帳總額：<span className="font-black text-emerald-700 font-mono">NT$ {importResult.totalAmount.toLocaleString()}</span> 元，相關訂單狀態與金額已同步更新。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 解析結果展示區塊 */}
          {parsedItems.length > 0 && (
            <div className="space-y-3">
              
              {/* 統計概覽 Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                  <div className="text-[11px] text-stone-400 font-medium">待匯入入帳</div>
                  <div className="text-base font-black text-emerald-600 font-mono mt-0.5">
                    {counts.matched} 筆 <span className="text-xs font-normal text-stone-500">($ {counts.matchedAmount.toLocaleString()})</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                  <div className="text-[11px] text-stone-400 font-medium">已入帳 (自動略過)</div>
                  <div className="text-base font-black text-amber-600 font-mono mt-0.5">
                    {counts.already_logged} 筆
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                  <div className="text-[11px] text-stone-400 font-medium">查無對應訂單</div>
                  <div className="text-base font-black text-rose-600 font-mono mt-0.5">
                    {counts.unmatched} 筆
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                  <div className="text-[11px] text-stone-400 font-medium">系統/非訂單款項</div>
                  <div className="text-base font-black text-stone-500 font-mono mt-0.5">
                    {counts.ignored} 筆
                  </div>
                </div>
              </div>

              {/* 狀態切換 Tabs & 全選按鈕 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-stone-200 pb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { id: 'all', label: `全部 (${counts.all})` },
                    { id: 'matched', label: `🟢 待入帳 (${counts.matched})` },
                    { id: 'already_logged', label: `🟡 已入帳 (${counts.already_logged})` },
                    { id: 'unmatched', label: `🔴 查無訂單 (${counts.unmatched})` },
                    { id: 'ignored', label: `⚪ 略過款項 (${counts.ignored})` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        activeTab === tab.id
                          ? 'bg-stone-800 text-white shadow-sm'
                          : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'matched' || activeTab === 'all' ? (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => toggleSelectAll(true)}
                      className="text-indigo-600 hover:underline font-bold"
                    >
                      全選待入帳
                    </button>
                    <span className="text-stone-300">|</span>
                    <button
                      onClick={() => toggleSelectAll(false)}
                      className="text-stone-500 hover:underline font-medium"
                    >
                      取消全選
                    </button>
                  </div>
                ) : null}
              </div>

              {/* 明細清單表格 */}
              <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-stone-100/80 text-stone-600 sticky top-0 z-10 border-b border-stone-200">
                      <tr>
                        <th className="p-3 w-10 text-center">勾選</th>
                        <th className="p-3">交易時間</th>
                        <th className="p-3 text-right">入帳金額</th>
                        <th className="p-3">虛擬帳號</th>
                        <th className="p-3">轉出銀行 / 來源</th>
                        <th className="p-3">對應訂單資訊</th>
                        <th className="p-3 text-center">比對狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-stone-400">
                            此分類下無交易資料
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map(item => {
                          const order = item.matchedOrder;
                          const isMatched = item.status === 'matched';
                          const isDuplicate = item.status === 'already_logged';
                          const isUnmatched = item.status === 'unmatched';

                          return (
                            <tr 
                              key={item.id}
                              className={`hover:bg-stone-50/80 transition-colors ${
                                item.selected ? 'bg-indigo-50/40' : ''
                              }`}
                            >
                              <td className="p-3 text-center">
                                {isMatched ? (
                                  <input
                                    type="checkbox"
                                    checked={item.selected}
                                    onChange={() => toggleSelect(item.id)}
                                    className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 cursor-pointer"
                                  />
                                ) : (
                                  <span className="text-stone-300">-</span>
                                )}
                              </td>
                              <td className="p-3 whitespace-nowrap font-mono text-stone-700">
                                {item.transactionTime}
                              </td>
                              <td className="p-3 text-right font-black font-mono text-sm text-stone-900 whitespace-nowrap">
                                NT$ {item.amount.toLocaleString()}
                              </td>
                              <td className="p-3 whitespace-nowrap font-mono font-bold text-indigo-700">
                                {item.virtualAccount || <span className="text-stone-400 font-normal">--</span>}
                              </td>
                              <td className="p-3">
                                {item.sourceBankName ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                                    🏛️ {item.sourceBankName}
                                  </span>
                                ) : (
                                  <span className="text-stone-400">銀行匯款</span>
                                )}
                                {item.sourceAccountOrSeq && (
                                  <span className="block text-[10px] text-stone-400 font-mono mt-0.5 truncate max-w-[160px]" title={item.sourceAccountOrSeq}>
                                    序號: {item.sourceAccountOrSeq}
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {order ? (
                                  <div className="space-y-0.5">
                                    <div className="font-bold text-stone-900 flex items-center gap-1.5">
                                      <span>{order.customer_name}</span>
                                      <span className="text-[10px] font-normal text-stone-500 font-mono">({order.customer_phone})</span>
                                    </div>
                                    <div className="text-[11px] text-stone-500 flex items-center gap-2">
                                      <span className="font-mono">{order.order_no}</span>
                                      <span>· 應收: NT${order.total_amount.toLocaleString()}</span>
                                      <span className="text-emerald-600 font-bold">· 已收: NT${(order.deposit_amount || 0).toLocaleString()}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-stone-400">--</span>
                                )}
                              </td>
                              <td className="p-3 text-center whitespace-nowrap">
                                {isMatched && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    🟢 待入帳
                                  </span>
                                )}
                                {isDuplicate && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200" title="此筆款項過去已入帳過，系統自動略過">
                                    🟡 已入帳 (略過)
                                  </span>
                                )}
                                {isUnmatched && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200" title="查無此虛擬帳號對應之訂單">
                                    🔴 查無訂單
                                  </span>
                                )}
                                {item.status === 'ignored' && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-500 border border-stone-200" title="利息或非訂單款項">
                                    ⚪ 系統項目
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-stone-100 border-t border-stone-200 px-6 py-4 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <div className="text-xs text-stone-600">
            {parsedItems.length > 0 ? (
              <span>
                已選取 <b className="text-indigo-600 text-sm font-mono">{counts.selectedCount}</b> 筆待入帳款項，
                合計：<b className="text-emerald-700 text-base font-black font-mono">NT$ {counts.selectedAmount.toLocaleString()}</b> 元
              </span>
            ) : (
              <span className="text-stone-400">請貼上明細並執行比對</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 bg-white hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg border border-stone-300 transition-colors cursor-pointer"
            >
              關閉
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isImporting || counts.selectedCount === 0}
              className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isImporting ? '正在寫入金流...' : `✅ 確認匯入入帳 (${counts.selectedCount} 筆)`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
