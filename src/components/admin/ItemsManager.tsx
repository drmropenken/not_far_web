import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  category: 'campsite' | 'equipment' | 'service';
  name: string;
  description: string | null;
  total_quantity: number;
  price_original: number;
  price_weekday: number;
  price_holiday: number;
  sort_order: number;
  image_url?: string | null;
  is_active: boolean;
};

export default function ItemsManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'campsite' | 'equipment' | 'service'>('all');

  // Form states
  const [formData, setFormData] = useState<Partial<Item>>({
    category: 'campsite',
    name: '',
    description: '',
    total_quantity: 1,
    price_original: 0,
    price_weekday: 0,
    price_holiday: 0,
    sort_order: 1,
    is_active: true,
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('nf_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching items:', error);
      alert('讀取資料失敗！');
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  const handleOpenModal = (item?: Item) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData({
        category: 'campsite',
        name: '',
        description: '',
        total_quantity: 1,
        price_original: 0,
        price_weekday: 0,
        price_holiday: 0,
        sort_order: items.length + 1,
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (editingItem) {
      // Update
      const { error } = await supabase
        .from('nf_items')
        .update(formData)
        .eq('id', editingItem.id);
      
      if (error) {
        console.error('Update error:', error);
        alert(`更新失敗！\\n錯誤：${error.message}\\n詳情：${error.details || ''}`);
      } else {
        handleCloseModal();
        fetchItems();
      }
    } else {
      // Insert
      const { error } = await supabase
        .from('nf_items')
        .insert([formData]);
      
      if (error) {
        console.error('Insert error:', error);
        alert(`新增失敗！\\n錯誤：${error.message}\\n詳情：${error.details || ''}`);
      } else {
        handleCloseModal();
        fetchItems();
      }
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個項目嗎？這可能會影響到歷史訂單紀錄喔！(建議將數量設為 0)')) return;
    
    setLoading(true);
    const { error } = await supabase.from('nf_items').delete().eq('id', id);
    if (error) {
      alert('刪除失敗，可能已經有訂單綁定此商品。');
    } else {
      fetchItems();
    }
    setLoading(false);
  };

  const categoryLabels = {
    campsite: '⛺️ 營位',
    equipment: '🪑 裝備租借',
    service: '🍖 餐飲與服務'
  };

  const categoryWeight: Record<string, number> = { campsite: 1, equipment: 2, service: 3 };

  const filteredItems = items.filter(item => {
    if (activeTab === 'all') return true;
    return item.category === activeTab;
  }).sort((a, b) => {
    if (categoryWeight[a.category] !== categoryWeight[b.category]) {
      return categoryWeight[a.category] - categoryWeight[b.category];
    }
    return a.sort_order - b.sort_order;
  });

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-stone-200 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-48px)] w-full">
      {/* 工具列與篩選標籤 (緊湊設計) */}
      <div className="px-4 md:px-6 pt-3 md:pt-4 border-b border-stone-200 shrink-0 flex flex-col-reverse md:flex-row justify-between md:items-end gap-3 bg-white md:rounded-t-2xl z-10">
        
        {/* 篩選標籤 */}
        <div className="flex gap-2 md:gap-4 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: '全部項目' },
            { id: 'campsite', label: '⛺️ 營位' },
            { id: 'equipment', label: '🪑 裝備' },
            { id: 'service', label: '🍖 服務' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 md:px-5 md:py-2.5 rounded-t-lg font-bold text-sm transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-amber-500 text-amber-600 bg-amber-50/50' 
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 新增項目按鈕 */}
        <div className="pb-2 flex justify-end">
          <button 
            onClick={() => handleOpenModal()}
            className="bg-emerald-700 text-emerald-50 hover:bg-stone-700 px-5 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-stone-700 flex items-center justify-center gap-2"
          >
            <span className="text-base leading-none mb-0.5">+</span> 新增項目
          </button>
        </div>
      </div>

      {loading && !showModal ? (
        <div className="flex-1 flex flex-col items-center justify-center text-amber-600/60 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
          <p className="font-medium tracking-widest text-sm">載入項目資料中...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-stone-50 p-4 md:p-6">
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm">
                  <th className="p-4 font-semibold">分類</th>
                  <th className="p-4 font-semibold">名稱</th>
                  <th className="p-4 font-semibold">每日數量</th>
                  <th className="p-4 font-semibold">平日價</th>
                  <th className="p-4 font-semibold">假日價</th>
                  <th className="p-4 font-semibold">狀態</th>
                  <th className="p-4 font-semibold">排序</th>
                  <th className="p-4 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">目前沒有符合條件的項目</td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-amber-50/30 transition-colors">
                      <td className="p-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium 
                          ${item.category === 'campsite' ? 'bg-green-100 text-green-700' : 
                            item.category === 'equipment' ? 'bg-blue-100 text-blue-700' : 
                            'bg-orange-100 text-orange-700'}`}>
                          {categoryLabels[item.category]}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-gray-800">{item.name}</td>
                      <td className="p-4">{item.total_quantity}</td>
                      <td className="p-4 text-gray-600">${item.price_weekday}</td>
                      <td className="p-4 text-gray-600">${item.price_holiday}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {item.is_active ? '已上架' : '已停用'}
                        </span>
                      </td>
                      <td className="p-4 text-gray-400">{item.sort_order}</td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleOpenModal(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Modal 表單 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-800">{editingItem ? '編輯項目' : '新增項目'}</h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value as any})}
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    required
                  >
                    <option value="campsite">⛺️ 營位 / 住宿</option>
                    <option value="equipment">🪑 裝備租借</option>
                    <option value="service">🍖 餐飲與服務</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">項目名稱</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="例如：豪華野奢帳篷"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">說明備註 (選填)</label>
                <textarea 
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none h-20 resize-none"
                  placeholder="簡單介紹此項目的特色..."
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">每日數量</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formData.total_quantity}
                    onChange={(e) => setFormData({...formData, total_quantity: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg p-2 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">平日價</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formData.price_weekday}
                    onChange={(e) => setFormData({...formData, price_weekday: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg p-2 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">假日價</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formData.price_holiday}
                    onChange={(e) => setFormData({...formData, price_holiday: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg p-2 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">原價(劃掉用)</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formData.price_original}
                    onChange={(e) => setFormData({...formData, price_original: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg p-2 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">排序 (越小越前面)</label>
                  <input 
                    type="number" 
                    value={formData.sort_order}
                    onChange={(e) => setFormData({...formData, sort_order: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-lg p-2 outline-none"
                    required
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <label className="block text-sm font-medium text-gray-700 mb-2">上架狀態</label>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.is_active ?? true}
                      onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      {formData.is_active ? '✅ 上架中 (顯示)' : '❌ 已停用 (隱藏)'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">圖片網址 (多張請用半形逗號分隔)</label>
                <textarea 
                  value={formData.image_url || ''}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg p-2 outline-none min-h-[80px]"
                  placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
                />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={handleCloseModal} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">取消</button>
                <button type="submit" disabled={loading} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                  {loading ? '儲存中...' : '儲存項目'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
