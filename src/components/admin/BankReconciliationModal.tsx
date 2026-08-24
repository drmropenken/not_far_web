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
  txType: string; // 交易別 (例如 CD轉入, 跨行轉入, 存款息)
  amount: number;
  virtualAccount: string | null; // 9629481xxxxxxx
  sourceBankCode: string | null; // e.g. 103, 807
  sourceBankName: string | null; // e.g. 新光銀行
  sourceAccountOrSeq: string | null; // 轉出帳號或序號
  rawRemarks: string;
  isOrderRelated: boolean;
  status: 'matched' | 'already_logged' | 'unmatched' | 'ignored';
  matchedOrder?: any;
  existingLogs?: any[];
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
  const [currentStep, setCurrentStep] = useState<'input' | 'review'>('input');
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'already_logged' | 'unmatched' | 'ignored'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ successCount: number; totalAmount: number } | null>(null);

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

    // 判斷交易類型（CD轉入、跨行轉入、Richart、存款息等）
    let txType = '銀行轉入';
    if (trimmed.includes('CD') || trimmed.includes('cd')) {
      txType = 'CD轉入';
    } else if (trimmed.includes('RICHART') || trimmed.includes('richart')) {
      txType = 'Richart轉入';
    } else if (trimmed.includes('跨行') || trimmed.includes('bsJ') || trimmed.includes('他行')) {
      txType = '跨行轉入';
    } else if (trimmed.includes('息') || trimmed.includes('利息') || trimmed.includes('存款息') || trimmed.includes('sڮ')) {
      txType = '存款息';
    } else {
      const typeMatch = trimmed.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}\s+(.*?)\s+0\s+/);
      if (typeMatch && typeMatch[1].trim()) {
        txType = typeMatch[1].trim();
      }
    }

    // 判斷是否為訂單款項
    const isInterest = txType === '存款息' || trimmed.includes('息') || trimmed.includes('利息') || trimmed.includes('存款息');
    const isOrderRelated = Boolean(virtualAccount && !isInterest);

    return {
      id: `tx-${index}-${transactionTime.replace(/[\/\s:]/g, '')}-${amount}`,
      rawLine: trimmed,
      transactionTime,
      accountingDate,
      txType,
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

    // 建立所有既有金流記錄的比對 Set (以 精確交易時間 YYYY/MM/DD HH:mm:ss 或 notes 內容進行唯一性比對)
    const existingLogSet = new Set<string>();
    Object.entries(paymentLogs).forEach(([orderId, logs]) => {
      logs.forEach(log => {
        if (log.payment_type === 'bank_transfer' || log.payment_type === 'onsite') {
          // 精確時間字串
          if (log.collected_at) {
            const dateObj = new Date(log.collected_at);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            const h = String(dateObj.getHours()).padStart(2, '0');
            const min = String(dateObj.getMinutes()).padStart(2, '0');
            const s = String(dateObj.getSeconds()).padStart(2, '0');
            const exactTime = `${y}/${m}/${d} ${h}:${min}:${s}`;
            existingLogSet.add(`${orderId}_${log.amount}_${exactTime}`);
          }
          // 從 notes 中抓取精確交易時間
          if (log.notes) {
            const timeMatch = log.notes.match(/交易時間:\s*([0-9\/\-\s:]+)/);
            if (timeMatch) {
              const cleanedTime = timeMatch[1].trim().replace(/-/g, '/');
              existingLogSet.add(`${orderId}_${log.amount}_${cleanedTime}`);
            }
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
        item.existingLogs = paymentLogs[order.id] || [];

        // 判定 1: 檢查是否同一筆交易秒數已入帳過
        const isDuplicateTime = existingLogSet.has(`${order.id}_${item.amount}_${item.transactionTime}`);
        
        // 判定 2: 檢查該訂單是否已經全額付清 (status 為 paid 或已收金額 >= 應收金額)
        const currentPaid = (order.deposit_amount || 0);
        const orderTotal = (order.total_amount || 0);
        const isOrderFullyPaid = order.status === 'paid' || (orderTotal > 0 && currentPaid >= orderTotal);

        if (isDuplicateTime || isOrderFullyPaid) {
          item.status = 'already_logged';
          item.selected = false; // 已滿額付清或已入過帳，預設標記為「已入帳(略過)」，不主動勾選
        } else {
          item.status = 'matched';
          item.selected = true; // 尚未付清的訂單，預設標記為「待入帳」並主動勾選！
        }
      } else {
        item.status = 'unmatched';
        item.selected = false;
      }

      parsedList.push(item);
    });

    setParsedItems(parsedList);
    setIsProcessing(false);
    // 自動切換至第二步驟：核對明細頁面
    setCurrentStep('review');
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
      if (item.matchedOrder) {
        return { ...item, selected: checked };
      }
      return item;
    }));
  };

  // 5. 批次確認入帳
  const handleConfirmImport = async () => {
    const toImport = parsedItems.filter(item => item.selected && item.matchedOrder);
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
        const rawNote = item.rawRemarks ? ` | 備註: ${item.rawRemarks}` : '';
        const notes = `[銀行自動對帳] 類型: ${item.txType} | 虛擬帳號: ${item.virtualAccount} | 來源銀行: ${sourceInfo}${accountInfo}${rawNote} | 交易時間: ${item.transactionTime}`;

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 md:p-5 animate-fade-in">
      <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-7xl shadow-2xl overflow-hidden flex flex-col h-[94vh] text-stone-800">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-indigo-950 text-white px-6 py-4 flex flex-wrap justify-between items-center shrink-0 border-b border-stone-700 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
              🏦
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider flex items-center gap-2">
                銀行自動對帳與金流匯入
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">智慧比對</span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                貼上銀行明細 TXT / CSV，系統將自動比對 14 碼虛擬帳號（9629481xxxxxxx）並自動過濾重複入帳
              </p>
            </div>
          </div>

          {/* 步驟切換 Tabs (分頁導航) */}
          <div className="flex items-center gap-2 bg-stone-950/60 p-1 rounded-xl border border-stone-700/60">
            <button
              onClick={() => setCurrentStep('input')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentStep === 'input'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-stone-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>📋 1. 輸入/上傳明細</span>
              {inputText.trim() && (
                <span className="text-[10px] bg-indigo-900 text-indigo-200 px-1.5 py-0.2 rounded-full">
                  已填
                </span>
              )}
            </button>

            <button
              onClick={() => {
                if (parsedItems.length === 0 && inputText.trim()) {
                  handleParseAndMatch();
                } else if (parsedItems.length > 0) {
                  setCurrentStep('review');
                } else {
                  alert('請先在步驟 1 貼上明細文字並點擊開始比對！');
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentStep === 'review'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-stone-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>📊 2. 對帳核對與入帳</span>
              {counts.matched > 0 && (
                <span className="text-[10px] bg-emerald-800 text-emerald-100 px-1.5 py-0.2 rounded-full font-mono">
                  {counts.matched} 筆待入帳
                </span>
              )}
            </button>
          </div>

          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-white text-2xl leading-none transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto bg-stone-50/60 p-4 md:p-6">

          {/* ══════════════════════════════════════════════════════════════
              分頁 1：輸入/上傳明細
             ══════════════════════════════════════════════════════════════ */}
          {currentStep === 'input' && (
            <div className="max-w-4xl mx-auto space-y-5 animate-fade-in py-2">
              
              <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
                      <span>📋 貼上網銀交易明細文字 或 選擇檔案</span>
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                      可直接從網路銀行、台新、新光、彰銀、中信等網銀明細整批複製並貼入
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer text-xs px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl border border-stone-300 transition-colors flex items-center gap-1.5 shadow-sm">
                      <span>📂 上傳文字檔 (.txt / .csv)</span>
                      <input type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                    </label>
                    {inputText && (
                      <button
                        onClick={() => { setInputText(''); setParsedItems([]); setImportResult(null); }}
                        className="text-xs text-stone-400 hover:text-rose-600 transition-colors px-2 py-1"
                      >
                        清空內容
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={11}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="請直接從銀行網銀複製交易明細並貼在此處...&#10;範例：&#10;2026/07/30 12:47:342026/07/30 CD轉入 0 25,000 *** 00096294817209075,V 10300000480500182062 103214609&#10;2026/07/30 23:06:022026/07/31 CD轉入 0 6,000 *** 00096294813435927,V 80700014501800666832 807136521"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs font-mono text-stone-800 placeholder-stone-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all resize-y shadow-inner leading-relaxed"
                  />
                  {inputText && (
                    <div className="absolute bottom-3 right-3 bg-white/90 border border-stone-200 px-2.5 py-1 rounded-md text-[11px] font-mono text-stone-500 shadow-sm">
                      共 {inputText.split('\n').filter(l => l.trim()).length} 列明細
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                  <div className="text-xs text-stone-500 flex items-center gap-1.5">
                    <span>💡 支援重複匯入（已入帳過款項會自動標記略過，絕不重複加總）</span>
                  </div>

                  <button
                    onClick={handleParseAndMatch}
                    disabled={isProcessing || !inputText.trim()}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <span>正在解析比對中...</span>
                    ) : (
                      <>
                        <span>🔍 開始智慧比對 ➔ 前往核對分頁</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 格式範例說明卡片 */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <span>📌 支援的匯款格式說明：</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  • 系統會自動抓取 14 碼專屬虛擬帳號（例如 <code className="font-mono bg-amber-100 px-1 rounded">9629481xxxxxxx</code> 或前綴含 000 之帳號）。<br />
                  • 自動辨識轉出銀行（新光 103、永豐 807、中信 822、彰銀 009、台新 Richart 等）與精確交易秒數。<br />
                  • 存款利息或非訂單繳費將自動過濾並標示為系統項目。
                </p>
              </div>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              分頁 2：對帳核對與確認入帳
             ══════════════════════════════════════════════════════════════ */}
          {currentStep === 'review' && (
            <div className="space-y-4 animate-fade-in">

              {/* 入帳成功提示 Alert */}
              {importResult && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <h4 className="font-bold text-sm">成功入帳 {importResult.successCount} 筆款項！</h4>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        已入帳總額：<span className="font-black text-emerald-700 font-mono">NT$ {importResult.totalAmount.toLocaleString()}</span> 元，相關訂單已轉為已付款並記錄金流明細。
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setImportResult(null)}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-bold px-2 py-1"
                  >
                    關閉提示
                  </button>
                </div>
              )}

              {/* 統計概覽 Bar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs text-emerald-700 font-bold">🟢 待匯入入帳</div>
                    <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                      {counts.matched} <span className="text-xs font-normal text-stone-500">筆</span>
                    </div>
                  </div>
                  <div className="text-right font-mono font-bold text-sm text-emerald-700">
                    NT$ {counts.matchedAmount.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs text-amber-700 font-bold">🟡 已入帳 (自動略過)</div>
                    <div className="text-xl font-black text-amber-600 font-mono mt-1">
                      {counts.already_logged} <span className="text-xs font-normal text-stone-500">筆</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">已收訖</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs text-rose-700 font-bold">🔴 查無對應訂單</div>
                    <div className="text-xl font-black text-rose-600 font-mono mt-1">
                      {counts.unmatched} <span className="text-xs font-normal text-stone-500">筆</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full font-medium">需人工核對</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-stone-200 bg-stone-50 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs text-stone-500 font-bold">⚪ 系統 / 非訂單款項</div>
                    <div className="text-xl font-black text-stone-600 font-mono mt-1">
                      {counts.ignored} <span className="text-xs font-normal text-stone-500">筆</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-stone-500 bg-stone-200 px-2 py-0.5 rounded-full font-medium">利息/繳費</span>
                </div>
              </div>

              {/* 篩選 Tabs 與全選控制列 */}
              <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs overflow-x-auto py-0.5">
                  {[
                    { id: 'all', label: `全部明細 (${counts.all})` },
                    { id: 'matched', label: `🟢 待入帳 (${counts.matched})` },
                    { id: 'already_logged', label: `🟡 已入帳 (${counts.already_logged})` },
                    { id: 'unmatched', label: `🔴 查無訂單 (${counts.unmatched})` },
                    { id: 'ignored', label: `⚪ 略過款項 (${counts.ignored})` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-stone-800 text-white shadow-sm'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => toggleSelectAll(true)}
                    className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold transition-colors cursor-pointer"
                  >
                    全選待入帳
                  </button>
                  <button
                    onClick={() => toggleSelectAll(false)}
                    className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-300 rounded-lg font-bold transition-colors cursor-pointer"
                  >
                    取消全選
                  </button>
                  <button
                    onClick={() => setCurrentStep('input')}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>⬅️ 調整明細內容</span>
                  </button>
                </div>
              </div>

              {/* 明細比對表格 */}
              <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-100/80 text-stone-600 font-bold border-b border-stone-200 text-[11px] tracking-wide">
                        <th className="p-3.5 text-center w-12">勾選</th>
                        <th className="p-3.5 w-44">交易時間</th>
                        <th className="p-3.5 text-right w-32">入帳金額</th>
                        <th className="p-3.5 w-40">虛擬帳號</th>
                        <th className="p-3.5 w-48">轉出銀行 / 來源</th>
                        <th className="p-3.5 min-w-[280px]">對應訂單資訊與金流核對</th>
                        <th className="p-3.5 text-center w-36">比對狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-stone-400">
                            此分類下無任何交易紀錄
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const order = item.matchedOrder;
                          const isMatched = item.status === 'matched';
                          const isDuplicate = item.status === 'already_logged';
                          const isUnmatched = item.status === 'unmatched';

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                item.selected
                                  ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                                  : isDuplicate
                                  ? 'bg-amber-50/15 hover:bg-amber-50/30'
                                  : isUnmatched
                                  ? 'bg-rose-50/15 hover:bg-rose-50/30'
                                  : 'hover:bg-stone-50/60'
                              }`}
                            >
                              <td className="p-3.5 text-center">
                                {order ? (
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
                              <td className="p-3.5 whitespace-nowrap font-mono text-stone-700">
                                <div className="font-bold">{item.transactionTime}</div>
                                <div className="text-[10px] text-stone-400">入帳日: {item.accountingDate}</div>
                              </td>
                              <td className="p-3.5 text-right font-black font-mono text-sm text-stone-900 whitespace-nowrap">
                                NT$ {item.amount.toLocaleString()}
                              </td>
                              <td className="p-3.5 whitespace-nowrap font-mono font-bold text-indigo-700">
                                {item.virtualAccount ? (
                                  <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">
                                    {item.virtualAccount}
                                  </span>
                                ) : (
                                  <span className="text-stone-400 font-normal">--</span>
                                )}
                              </td>
                              <td className="p-3.5">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                                      item.txType === 'CD轉入' 
                                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                        : item.txType === 'Richart轉入'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : item.txType === '跨行轉入'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : 'bg-stone-100 text-stone-700 border-stone-200'
                                    }`}>
                                      {item.txType}
                                    </span>
                                    {item.sourceBankName && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200 font-medium text-[11px]">
                                        🏛️ {item.sourceBankName}
                                      </span>
                                    )}
                                  </div>
                                  {item.sourceAccountOrSeq && (
                                    <span className="block text-[10px] text-stone-500 font-mono truncate max-w-[190px]" title={item.sourceAccountOrSeq}>
                                      序號: {item.sourceAccountOrSeq}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3.5">
                                {order ? (
                                  <div className="space-y-1.5">
                                    <div className="font-bold text-stone-900 flex items-center gap-2">
                                      <span className="text-sm">{order.customer_name}</span>
                                      <span className="text-[11px] font-normal text-stone-500 font-mono">({order.customer_phone})</span>
                                    </div>
                                    <div className="text-[11px] text-stone-500 flex items-center gap-2 flex-wrap">
                                      <span className="font-mono bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200">{order.order_no}</span>
                                      <span>· 應收: NT${(order.total_amount || 0).toLocaleString()}</span>
                                      <span className="text-emerald-600 font-bold">· 已收: NT${(order.deposit_amount || 0).toLocaleString()}</span>
                                    </div>

                                    {/* 展開此訂單後台既有的金流記錄 */}
                                    {item.existingLogs && item.existingLogs.length > 0 && (
                                      <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-[10px] space-y-1 text-stone-600">
                                        <div className="font-bold text-stone-700 flex items-center gap-1">
                                          <span>📜 後台既有金流 ({item.existingLogs.length}筆)：</span>
                                        </div>
                                        {item.existingLogs.map((log: any, lidx: number) => {
                                          const timeStr = log.collected_at ? new Date(log.collected_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '無時間';
                                          const typeStr = log.payment_type === 'onsite' ? '現場' : log.payment_type === 'credit_card' ? '信用卡' : '匯款';
                                          return (
                                            <div key={log.id || lidx} className="flex items-center justify-between gap-1 font-mono text-[10px] text-stone-600">
                                              <span>• {timeStr} {typeStr} NT${log.amount?.toLocaleString()}</span>
                                              <span className="text-stone-400 text-[9px] truncate max-w-[120px]">{log.collected_by || ''}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 滿額預警與重複匯款判定說明 */}
                                    {(order.deposit_amount || 0) >= (order.total_amount || 0) && (
                                      <div className="text-[10px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 leading-relaxed">
                                        <span>⚠️ 訂單已全額收訖。若此筆為「客人重複匯款 / 多付」，可手動勾選入帳；若為同筆款項請保持略過。</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-stone-400">--</span>
                                )}
                              </td>
                              <td className="p-3.5 text-center whitespace-nowrap">
                                {isMatched && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                                    🟢 待入帳
                                  </span>
                                )}
                                {isDuplicate && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm" title="此筆款項過去已入帳過，系統自動略過">
                                    🟡 已入帳 (略過)
                                  </span>
                                )}
                                {isUnmatched && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm" title="查無此虛擬帳號對應之訂單">
                                    🔴 查無訂單
                                  </span>
                                )}
                                {item.status === 'ignored' && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-stone-100 text-stone-500 border border-stone-200" title="利息或非訂單款項">
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
            {currentStep === 'review' && parsedItems.length > 0 ? (
              <span>
                已選取 <b className="text-indigo-600 text-sm font-mono">{counts.selectedCount}</b> 筆待入帳款項，
                合計金額：<b className="text-emerald-700 text-base font-black font-mono">NT$ {counts.selectedAmount.toLocaleString()}</b> 元
              </span>
            ) : (
              <span className="text-stone-400">步驟 1：請先貼上明細並執行智慧比對</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {currentStep === 'review' ? (
              <>
                <button
                  onClick={() => setCurrentStep('input')}
                  disabled={isImporting}
                  className="px-4 py-2 bg-white hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg border border-stone-300 transition-colors cursor-pointer"
                >
                  ⬅️ 返回修改明細
                </button>
                <button
                  onClick={onClose}
                  disabled={isImporting}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  關閉
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || counts.selectedCount === 0}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isImporting ? '正在寫入金流...' : `✅ 確認匯入入帳 (${counts.selectedCount} 筆)`}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-white hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg border border-stone-300 transition-colors cursor-pointer"
                >
                  關閉
                </button>
                <button
                  onClick={handleParseAndMatch}
                  disabled={isProcessing || !inputText.trim()}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isProcessing ? '正在比對中...' : '🔍 開始智慧比對 ➔'}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
