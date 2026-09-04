import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type DiscountCode = {
  id: string;
  code: string;
  discount_percent: number;
  discount_fixed_amount?: number;
  is_active: boolean;
  created_at: string;
};

export default function DiscountsManager() {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [newPercent, setNewPercent] = useState<number>(0.9); // Default 90%
  const [newFixedAmount, setNewFixedAmount] = useState<number>(100); // Default 100 NTD
  const [isAdding, setIsAdding] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  useEffect(() => {
    fetchDiscounts();
    setAdminRole(localStorage.getItem('admin_role') || 'viewer');
  }, []);

  const fetchDiscounts = async () => {
    setLoading(true);
    const campId = localStorage.getItem('camp_id');
    const query = supabase
      .from('nf_discount_codes')
      .select('*');
    
    // 如果有 camp_id，只顯示該營區的折扣碼
    if (campId) {
      query.eq('camp_id', campId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
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
    
    if (discountType === 'percent') {
      if (newPercent <= 0 || newPercent > 1) {
        alert('折扣比例必須大於 0 且小於等於 1 (例如 0.9 代表 9 折)');
        return;
      }
    } else {
      if (newFixedAmount <= 0) {
        alert('固定扣除金額必須大於 0');
        return;
      }
    }

    setSaving(true);
    const campId = localStorage.getItem('camp_id');
    const { error } = await supabase
      .from('nf_discount_codes')
      .insert([{
        code: newCode.trim().toUpperCase(),
        discount_percent: discountType === 'percent' ? newPercent : 1,
        discount_fixed_amount: discountType === 'fixed' ? newFixedAmount : 0,
        is_active: true,
        camp_id: campId
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
      setDiscountType('percent');
      setNewPercent(0.9);
      setNewFixedAmount(100);
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center gap-2">
        <div className="text-xs sm:text-sm text-stone-500 font-medium">
          共 {discounts.length} 組折扣碼
        </div>
        {adminRole !== 'viewer' && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className={`px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm shrink-0 ${isAdding ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-md'}`}
          >
            {isAdding ? '取消新增' : <><span>+</span> 新增折扣碼</>}
          </button>
        )}
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAddDiscount} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col md:flex-row gap-3 sm:gap-4 items-end animate-in slide-in-from-top-4 duration-200">
          <div className="flex-1 w-full">
            <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">折扣碼名稱 <span className="text-rose-500">*</span></label>
            <input 
              required 
              type="text" 
              value={newCode} 
              onChange={e => setNewCode(e.target.value.toUpperCase())} 
              className="w-full border border-stone-300 rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono uppercase tracking-widest text-stone-800" 
              placeholder="例如：SUMMER2026"
            />
          </div>
          <div className="flex-1 w-full flex flex-col gap-2.5 sm:gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">折扣方式 <span className="text-rose-500">*</span></label>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg border transition-colors ${discountType === 'percent' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'}`}
                >打折 (百分比)</button>
                <button 
                  type="button" 
                  onClick={() => setDiscountType('fixed')}
                  className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg border transition-colors ${discountType === 'fixed' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'}`}
                >固定扣除金額</button>
              </div>
            </div>

            {discountType === 'percent' ? (
              <div>
                <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">折扣比例 <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-2 sm:gap-3">
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    max="1"
                    value={newPercent} 
                    onChange={e => setNewPercent(parseFloat(e.target.value))} 
                    className="w-full border border-stone-300 rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono text-stone-800" 
                  />
                  <span className="text-stone-500 font-bold whitespace-nowrap text-xs sm:text-sm">
                    = {newPercent === 1 ? '無折扣' : newPercent < 1 && newPercent > 0 ? `打 ${newPercent * 10} 折` : '錯誤數值'}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">扣除金額 (NT$) <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-2 sm:gap-3">
                  <input 
                    required 
                    type="number" 
                    step="1"
                    min="1"
                    value={newFixedAmount} 
                    onChange={e => setNewFixedAmount(parseInt(e.target.value))} 
                    className="w-full border border-stone-300 rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono text-stone-800" 
                  />
                  <span className="text-stone-500 font-bold whitespace-nowrap text-xs sm:text-sm">
                    = 折 NT$ {newFixedAmount} 元
                  </span>
                </div>
              </div>
            )}
          </div>
          <button 
            type="submit" 
            disabled={saving}
            className="w-full md:w-auto px-6 py-2.5 sm:px-8 sm:py-3 bg-emerald-700 hover:bg-emerald-800 text-emerald-50 rounded-xl font-bold text-xs sm:text-sm transition-all disabled:opacity-50 whitespace-nowrap shadow-md"
          >
            {saving ? '儲存中...' : '確定新增'}
          </button>
        </form>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-400 font-bold animate-pulse text-sm">載入中...</div>
        ) : discounts.length === 0 ? (
          <div className="p-12 text-center text-stone-400 font-bold flex flex-col items-center text-sm">
            <span className="text-4xl mb-3">🏷️</span>
            目前沒有任何折扣碼
          </div>
        ) : (
          <>
            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-stone-100">
              {discounts.map(discount => (
                <div key={discount.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-stone-50/50 transition-colors">
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs sm:text-sm text-stone-800 bg-stone-100 px-2 py-0.5 rounded-md tracking-wider border border-stone-200">
                        {discount.code}
                      </span>
                      <span className="font-bold text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 whitespace-nowrap">
                        {discount.discount_fixed_amount && discount.discount_fixed_amount > 0 
                          ? `折 $${discount.discount_fixed_amount}`
                          : `${(discount.discount_percent * 10).toFixed(1).replace('.0', '')} 折`
                        }
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400">
                      建立於 {new Date(discount.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => adminRole !== 'viewer' && toggleActive(discount.id, discount.is_active)}
                        disabled={adminRole === 'viewer'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${discount.is_active ? 'bg-amber-500' : 'bg-stone-300'} ${adminRole === 'viewer' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${discount.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <span className={`text-[11px] font-bold ${discount.is_active ? 'text-amber-600' : 'text-stone-400'}`}>
                        {discount.is_active ? '啟用' : '停用'}
                      </span>
                    </div>

                    {adminRole !== 'viewer' && (
                      <button 
                        onClick={() => handleDelete(discount.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="刪除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
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
                          {discount.discount_fixed_amount && discount.discount_fixed_amount > 0 
                            ? `折 $${discount.discount_fixed_amount}`
                            : `${(discount.discount_percent * 10).toFixed(1).replace('.0', '')} 折`
                          }
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => adminRole !== 'viewer' && toggleActive(discount.id, discount.is_active)}
                          disabled={adminRole === 'viewer'}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${discount.is_active ? 'bg-amber-500' : 'bg-stone-300'} ${adminRole === 'viewer' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${discount.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <div className={`text-[10px] font-bold mt-1 ${discount.is_active ? 'text-amber-600' : 'text-stone-400'}`}>
                          {discount.is_active ? '啟用中' : '已停用'}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {adminRole !== 'viewer' && (
                          <button 
                            onClick={() => handleDelete(discount.id)}
                            className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                            title="刪除"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
