import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type DiscountCode = {
  id: string;
  code: string;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
};

export default function DiscountsManager() {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newPercent, setNewPercent] = useState<number>(0.9); // Default 90%
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const fetchDiscounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('nf_discount_codes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching discounts', error);
      alert('載入折扣碼失敗: ' + error.message);
    } else {
      setDiscounts(data || []);
    }
    setLoading(false);
  };

  const handleAddDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    if (newPercent <= 0 || newPercent > 1) {
      alert('折扣比例必須大於 0 且小於等於 1 (例如 0.9 代表 9 折)');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('nf_discount_codes')
      .insert([{
        code: newCode.trim().toUpperCase(),
        discount_percent: newPercent,
        is_active: true
      }]);

    setSaving(false);
    if (error) {
      if (error.code === '23505') { // Unique violation
        alert('此折扣碼名稱已存在！');
      } else {
        alert('新增失敗: ' + error.message);
      }
    } else {
      setNewCode('');
      setNewPercent(0.9);
      setIsAdding(false);
      fetchDiscounts();
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('nf_discount_codes')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      alert('狀態更新失敗: ' + error.message);
    } else {
      setDiscounts(prev => prev.map(d => d.id === id ? { ...d, is_active: !currentStatus } : d));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這組折扣碼嗎？（如果已有訂單使用過此代碼，為保證紀錄完整，建議使用「停用」而不是刪除）')) {
      return;
    }

    const { error } = await supabase
      .from('nf_discount_codes')
      .delete()
      .eq('id', id);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      setDiscounts(prev => prev.filter(d => d.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="text-stone-500 font-medium">
          共 {discounts.length} 組折扣碼
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm ${isAdding ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-md'}`}
        >
          {isAdding ? '取消新增' : <><span>+</span> 新增折扣碼</>}
        </button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAddDiscount} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col md:flex-row gap-4 items-end animate-in slide-in-from-top-4 duration-200">
          <div className="flex-1 w-full">
            <label className="block text-sm font-bold text-stone-600 mb-1.5">折扣碼名稱 <span className="text-rose-500">*</span></label>
            <input 
              required 
              type="text" 
              value={newCode} 
              onChange={e => setNewCode(e.target.value.toUpperCase())} 
              className="w-full border border-stone-300 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none font-mono uppercase tracking-widest text-stone-800" 
              placeholder="例如：SUMMER2026"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-bold text-stone-600 mb-1.5">折扣比例 <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-3">
              <input 
                required 
                type="number" 
                step="0.01"
                min="0.01"
                max="1"
                value={newPercent} 
                onChange={e => setNewPercent(parseFloat(e.target.value))} 
                className="w-full border border-stone-300 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-stone-800" 
              />
              <span className="text-stone-500 font-bold whitespace-nowrap text-sm">
                = {newPercent === 1 ? '無折扣' : newPercent < 1 && newPercent > 0 ? `打 ${newPercent * 10} 折` : '錯誤數值'}
              </span>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={saving}
            className="w-full md:w-auto px-8 py-3 bg-emerald-700 hover:bg-emerald-800 text-emerald-50 rounded-xl font-bold transition-all disabled:opacity-50 whitespace-nowrap shadow-md"
          >
            {saving ? '儲存中...' : '確定新增'}
          </button>
        </form>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400 font-bold animate-pulse">載入中...</div>
        ) : discounts.length === 0 ? (
          <div className="p-12 text-center text-stone-400 font-bold flex flex-col items-center">
            <span className="text-4xl mb-3">🏷️</span>
            目前沒有任何折扣碼
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500">
                  <th className="p-4 font-bold text-sm tracking-widest whitespace-nowrap">折扣碼 (CODE)</th>
                  <th className="p-4 font-bold text-sm tracking-widest whitespace-nowrap text-center">折數</th>
                  <th className="p-4 font-bold text-sm tracking-widest whitespace-nowrap text-center">狀態</th>
                  <th className="p-4 font-bold text-sm tracking-widest whitespace-nowrap text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {discounts.map(discount => (
                  <tr key={discount.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-lg text-stone-800 bg-stone-100 px-3 py-1 rounded-lg tracking-widest border border-stone-200">
                          {discount.code}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                        {(discount.discount_percent * 10).toFixed(1).replace('.0', '')} 折
                      </span>
                      <div className="text-[10px] text-stone-400 mt-1 font-mono">({discount.discount_percent})</div>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => toggleActive(discount.id, discount.is_active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${discount.is_active ? 'bg-amber-500' : 'bg-stone-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${discount.is_active ? 'transtone-x-6' : 'transtone-x-1'}`} />
                      </button>
                      <div className={`text-[10px] font-bold mt-1 ${discount.is_active ? 'text-amber-600' : 'text-stone-400'}`}>
                        {discount.is_active ? '啟用中' : '已停用'}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleDelete(discount.id)}
                        className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="刪除"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
