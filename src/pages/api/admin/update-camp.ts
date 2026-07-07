import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    // 🔒 驗證管理員身份
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401 });
    }

    const body = await request.json();
    const { camp_id, name, description, official_url } = body;

    if (!camp_id) {
      return new Response(JSON.stringify({ error: '缺少營區編號' }), { status: 400 });
    }

    // 建立更新物件，只更新有提供的欄位
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (official_url !== undefined) updates.official_url = official_url;

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: '沒有要更新的欄位' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('nf_campgrounds')
      .update(updates)
      .eq('id', camp_id)
      .select()
      .single();

    if (error) {
      console.error('更新營區失敗:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  } catch (err) {
    console.error('API 錯誤:', err);
    return new Response(JSON.stringify({ error: '伺服器錯誤' }), { status: 500 });
  }
};

// 讀取單一營區資料
export const GET: APIRoute = async ({ url }) => {
  try {
    const campId = url.searchParams.get('camp_id');
    if (!campId) {
      return new Response(JSON.stringify({ error: '缺少 camp_id' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('nf_campgrounds')
      .select('*')
      .eq('id', campId)
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ data }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: '伺服器錯誤' }), { status: 500 });
  }
};