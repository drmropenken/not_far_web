import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type Admin = {
  id: string;
  email: string;
  role: 'superadmin' | 'editor' | 'viewer';
  camp_id: string | null;
  created_at: string;
};

export default function AdminsManager() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'superadmin' | 'editor' | 'viewer'>('editor');
  
  // 目前登入者的角色
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchAdmins();
    setCurrentUserRole(localStorage.getItem('admin_role') || 'viewer');
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    const campId = localStorage.getItem('camp_id');

    let query = supabase
      .from('nf_admins')
      .select('*');

    // 如果目前登入者不是超級管理員（無 camp_id=null 權限），只顯示此營區的管理員
    const hasNullAccess = localStorage.getItem('admin_has_null_access') === 'true';
    if (campId && !hasNullAccess) {
      query = query.eq('camp_id', campId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching admins', error);
      alert('載入管理員失敗: ' + error.message);
    } else {
      setAdmins(data || []);
    }
    setLoading(false);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    
    setSaving(true);
    const campId = localStorage.getItem('camp_id');
    const { error } = await supabase
      .from('nf_admins')
      .insert([{ 
        email: newEmail.trim().toLowerCase(), 
        role: newRole,
        camp_id: campId || null
      }]);

    setSaving(false);

    if (error) {
      alert('新增失敗: ' + error.message);
    } else {
      setNewEmail('');
      setNewRole('editor');
      setIsAdding(false);
      fetchAdmins();
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`確定要刪除管理員 ${email} 嗎？`)) return;

    const { error } = await supabase
      .from('nf_admins')
      .delete()
      .eq('id', id);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      setAdmins(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleRoleChange = async (id: string, currentRole: string, newRole: string) => {
    if (currentRole === newRole) return;
    
    const { error } = await supabase
      .from('nf_admins')
      .update({ role: newRole })
      .eq('id', id);
      
    if (error) {
      alert('更新角色失敗: ' + error.message);
    } else {
      fetchAdmins();
    }
  };

  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'superadmin':
        return <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap">👑 最高管理員</span>;
      case 'editor':
        return <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap">📝 一般編輯</span>;
      case 'viewer':
        return <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-stone-100 text-stone-600 border border-stone-200 rounded-full text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap">👀 僅限觀看</span>;
      default:
        return <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-stone-100 text-stone-600 border border-stone-200 rounded-full text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap">{role}</span>;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-amber-50 border-l-4 border-amber-400 p-3 sm:p-4 rounded-r-xl text-amber-800 text-xs sm:text-sm leading-relaxed shadow-sm">
        <strong className="block mb-1 text-xs sm:text-base font-bold text-amber-900">🔐 權限角色說明</strong>
        <ul className="list-disc list-inside space-y-0.5 sm:space-y-1">
          <li><strong>👑 最高管理員 (superadmin)</strong>：擁有所有權限，包含新增/刪除其他管理員。</li>
          <li><strong>📝 一般編輯 (editor)</strong>：可以處理訂單狀態、設定庫存與折扣，但無法管理員帳號。</li>
          <li><strong>👀 僅限觀看 (viewer)</strong>：可以登入後台查看所有訂單與資料，但無法進行任何修改、刪除或存檔操作。</li>
        </ul>
      </div>

      <div className="flex justify-between items-center gap-2">
        <div className="text-xs sm:text-sm text-stone-500 font-medium">
          共 {admins.length} 位管理員
        </div>
        {currentUserRole === 'superadmin' && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className={`px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm shrink-0 ${isAdding ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md'}`}
          >
            {isAdding ? '取消新增' : <><span>+</span> 新增管理員</>}
          </button>
        )}
      </div>

      {isAdding && currentUserRole === 'superadmin' && (
        <form onSubmit={handleAddAdmin} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col md:flex-row gap-3 sm:gap-4 items-end animate-in slide-in-from-top-4 duration-200">
          <div className="flex-1 w-full">
            <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">管理員信箱 (Google Email) <span className="text-rose-500">*</span></label>
            <input 
              required 
              type="email" 
              value={newEmail} 
              onChange={e => setNewEmail(e.target.value)} 
              placeholder="例如: admin@gmail.com"
              className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-stone-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs sm:text-sm font-bold text-stone-600 mb-1">指派角色 <span className="text-rose-500">*</span></label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as any)}
              className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-stone-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
            >
              <option value="superadmin">👑 最高管理員 (superadmin)</option>
              <option value="editor">📝 一般編輯 (editor)</option>
              <option value="viewer">👀 僅限觀看 (viewer)</option>
            </select>
          </div>
          <button 
            disabled={saving || !newEmail.trim()} 
            type="submit" 
            className="w-full md:w-auto px-5 py-2 sm:px-6 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-colors whitespace-nowrap"
          >
            {saving ? '新增中...' : '儲存'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-stone-400 font-bold animate-pulse text-sm">載入中...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          {/* Mobile List View */}
          <div className="md:hidden divide-y divide-stone-100">
            {admins.map(admin => (
              <div key={admin.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-stone-50/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs sm:text-sm text-stone-800 truncate" title={admin.email}>
                    {admin.email}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-stone-400 mt-0.5">
                    加入於 {new Date(admin.created_at).toLocaleDateString('zh-TW')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {currentUserRole === 'superadmin' ? (
                    <select
                      value={admin.role}
                      onChange={(e) => handleRoleChange(admin.id, admin.role, e.target.value)}
                      className="px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="superadmin">👑 最高</option>
                      <option value="editor">📝 編輯</option>
                      <option value="viewer">👀 觀看</option>
                    </select>
                  ) : (
                    getRoleBadge(admin.role)
                  )}
                  {currentUserRole === 'superadmin' && (
                    <button 
                      onClick={() => handleDelete(admin.id, admin.email)}
                      className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                      title="刪除帳號"
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
            <table className="w-full text-left text-sm text-stone-600">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
                <tr>
                  <th className="p-4">管理員信箱</th>
                  <th className="p-4">角色權限</th>
                  <th className="p-4 text-center">加入時間</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {admins.map(admin => (
                  <tr key={admin.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="p-4 font-medium text-stone-800">
                      {admin.email}
                    </td>
                    <td className="p-4">
                      {currentUserRole === 'superadmin' ? (
                        <select
                          value={admin.role}
                          onChange={(e) => handleRoleChange(admin.id, admin.role, e.target.value)}
                          className="px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="superadmin">👑 最高管理員</option>
                          <option value="editor">📝 一般編輯</option>
                          <option value="viewer">👀 僅限觀看</option>
                        </select>
                      ) : (
                        getRoleBadge(admin.role)
                      )}
                    </td>
                    <td className="p-4 text-center text-stone-400">
                      {new Date(admin.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="p-4 text-right">
                      {currentUserRole === 'superadmin' && (
                        <button 
                          onClick={() => handleDelete(admin.id, admin.email)}
                          className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center"
                          title="刪除帳號"
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
        </div>
      )}
    </div>
  );
}
