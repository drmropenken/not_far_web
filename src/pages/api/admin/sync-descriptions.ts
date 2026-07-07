import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

// 網頁上寫死的詳細描述，對應到資料庫的商品名稱
const DESCRIPTION_MAP: Record<string, string> = {
  '豪華野奢帳篷組': '極致奢華的免裝備露營！含雙人床、電扇與專屬客廳帳，提供一泊三食（含燒烤或火鍋晚餐），享受尊榮服務。',
  '住宿-四人石茅屋': '一秒踏進日本合掌村！外型超可愛的三角茅屋，內部空間寬敞，適合家庭同住，並設有獨立衛浴與冷氣。',
  '住宿-四人水管屋雅房': '造型獨特的水管屋，像極了可愛的汽水罐！備有冷氣與雙人床，車子可直接停在一旁，方便又特別。',
  '上營區-木屋棧板': '設有專屬的木棧板與遮頂設施，不怕日曬雨淋，提供平整舒適的搭帳空間，給您最安心的露營體驗。',
  '上營區-欖仁樹區 (一帳包區)': '樹蔭環繞的舒適營位，適合三五好友小包區。提供獨立的搭帳空間，鄰近公共衛浴，享受靜謐的露營時光。',
  '上營區-草原一區(四帳包區)': '遼闊的大草皮，適合多個家庭聯合包區！孩子們可以盡情奔跑玩耍，享受無拘無束的大自然。',
  '上營區-湖岸一區(六帳包區)': '絕佳的湖畔景觀，適合大型團體包區。面積廣達 50M*9M，給您最寬敞、最舒適的水岸露營體驗。',
  '住宿-六人大巴露營車': '免裝備豪華露營體驗！車內配有雙人床與沙發床，並設有獨立衛浴、冷氣等設施，讓您輕鬆享受大自然。',
  '住宿-十人包棟': '大家族或三五好友出遊首選！專屬的包棟空間，內有5張雙人床，並提供冷氣與完善的衛浴設備。',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // 🔒 驗證管理員身份
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return new Response(JSON.stringify({ error: '未登入' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 檢查是否為管理員（透過 nf_admins 表）
    const userEmail = session.user.email;
    const { data: admin } = await supabase
      .from('nf_admins')
      .select('role')
      .eq('email', userEmail)
      .maybeSingle();

    if (!admin || !['superadmin', 'editor'].includes(admin.role)) {
      return new Response(JSON.stringify({ error: '無權限' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 執行更新
    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const [name, description] of Object.entries(DESCRIPTION_MAP)) {
      const { error } = await supabase
        .from('nf_items')
        .update({ description })
        .eq('name', name);

      if (error) {
        results.push({ name, success: false, error: error.message });
      } else {
        results.push({ name, success: true });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({
      success: true,
      message: `✅ ${successCount} 筆更新成功` + (failCount ? `，❌ ${failCount} 筆失敗` : ''),
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('同步描述 API 錯誤:', err);
    return new Response(JSON.stringify({ error: '伺服器錯誤' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};