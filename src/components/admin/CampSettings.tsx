import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function CampSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campData, setCampData] = useState<{
    id: string;
    name: string;
    description: string | null;
    official_url: string | null;
    slug: string;
  } | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    official_url: '',
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchCampData();
  }, []);

  const fetchCampData = async () => {
    setLoading(true);
    const campId = localStorage.getItem('camp_id');
    if (!campId) {
      setMessage({ type: 'error', text: '找不到營區編號，請先選擇營區' });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('nf_campgrounds')
      .select('id, name, description, official_url, slug')
      .eq('id', campId)
      .single();

    if (error) {
      console.error('讀取營區資料失敗:', error);
      setMessage({ type: 'error', text: '讀取營區資料失敗：' + error.message });
    } else if (data) {
      setCampData(data);
      setForm({
        name: data.name || '',
        description: data.description || '',
        official_url: data.official_url || '',
      });
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const campId = localStorage.getItem('camp_id');
    if (!campId) {
      setMessage({ type: 'error', text: '找不到營區編號' });
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('nf_campgrounds')
      .update({
        name: form.name,
        description: form.description,
        official_url: form.official_url || null,
      })
      .eq('id', campId)
      .select()
      .single();

    if (error) {
      console.error('更新失敗:', error);
      setMessage({ type: 'error', text: '更新失敗：' + error.message });
    } else {
      setCampData(data);
      // 同步更新 localStorage 中的營區名稱
      localStorage.setItem('camp_name', data.name);
      setMessage({ type: 'success', text: '✅ 營區資料已成功更新！' });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-stone-500 font-medium">載入營區資料中...</p>
      </div>
    );
  }

  if (!campData) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 text-center">
        <p className="text-red-500 font-medium">❌ 無法讀取營區資料</p>
        <button onClick={fetchCampData} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200">
      <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-stone-800 mb-1">營區基本設定</h3>
          <p className="text-sm text-stone-500">編輯營區的名稱、描述等資訊，修改後會立即更新到前台頁面。</p>
        </div>

        <div className="border-t border-stone-200 pt-6 space-y-5">
          {/* 營區名稱 */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              營區名稱 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none text-stone-800"
              placeholder="例如：不遠露營度假山莊"
              required
            />
            <p className="text-xs text-stone-400 mt-1">會顯示在網站標題、導覽列與 SEO 中</p>
          </div>

          {/* 營區描述 */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              營區描述
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none text-stone-800 min-h-[120px] resize-y leading-relaxed"
              placeholder="簡單介紹營區的特色與理念..."
              rows={6}
            />
            <p className="text-xs text-stone-400 mt-1">
              這段文字會顯示在首頁主視覺區與營區介紹頁的標題下方，也是 SEO 描述。
              建議 50-200 字以內。
            </p>
          </div>

          {/* 官方網站 */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              官方網站網址
            </label>
            <input
              type="url"
              value={form.official_url}
              onChange={(e) => setForm({ ...form, official_url: e.target.value })}
              className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none text-stone-800"
              placeholder="https://example.com"
            />
          </div>
        </div>

        {/* 當前資料預覽 */}
        <details className="border border-stone-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-stone-600 cursor-pointer hover:bg-stone-50 select-none rounded-lg">
            📋 查看當前前台顯示效果
          </summary>
          <div className="px-4 pb-4 pt-2 border-t border-stone-100">
            <div className="bg-stone-50 rounded-lg p-4 space-y-2">
              <p className="text-xs text-stone-400 font-medium">🏠 首頁 Hero 區塊</p>
              <p className="text-stone-700 text-sm leading-relaxed">
                {form.description || '（尚未填寫描述，將顯示預設文字）'}
              </p>
              <hr className="border-stone-200 my-2" />
              <p className="text-xs text-stone-400 font-medium">🔍 SEO 描述</p>
              <p className="text-stone-600 text-xs leading-relaxed">
                {form.description 
                  ? `${form.name}，${form.description}。提供完善的露營、住宿預訂與豐富的自然生態體驗。`
                  : '（將顯示預設 SEO 描述）'}
              </p>
            </div>
          </div>
        </details>

        {/* 訊息提示 */}
        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            message.type === 'success' 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 送出按鈕 */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-400 text-white rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                儲存中...
              </>
            ) : (
              '💾 儲存設定'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}