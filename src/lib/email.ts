import nodemailer from 'nodemailer';
import { supabase } from './supabase';

const user = import.meta.env.GMAIL_USER || process.env.GMAIL_USER || '';
const pass = import.meta.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user,
    pass
  }
});

export type EmailActionType = 'new_order' | 'status_update' | 'cancelled';

export const sendOrderNotification = async (orderData: any, actionType: EmailActionType, updateReason?: string) => {
  // 從備註中提取客人的 Email (格式: [Email: xxx@gmail.com])
  let customerEmail = '';
  if (orderData.notes) {
    const match = orderData.notes.match(/\[Email:\s*([^\]]+)\]/);
    if (match && match[1] && !match[1].includes('@line.notfar.com') && !match[1].includes('@dummy-line.com')) {
      customerEmail = match[1].trim();
    }
  }

  // 營主名單 (使用密件抄送 Bcc，從資料庫動態抓取)
  let adminEmails = 'dr.mr.openken@gmail.com'; // Fallback
  try {
    const { data: adminList } = await supabase.from('nf_admins').select('email');
    if (adminList && adminList.length > 0) {
      adminEmails = adminList.map(a => a.email).join(',');
    }
  } catch (e) {
    console.error('Failed to fetch admin emails for BCC', e);
  }

  // 如果客人沒有留信箱，就直接寄給第一順位營主作為主要收件者
  const toAddress = customerEmail || 'dr.mr.openken@gmail.com';
  
  let subject = '';
  let title = '';
  let actionText = '';
  
  switch(actionType) {
    case 'new_order':
      subject = `[不遠露營] 🎉 新訂單通知！(編號: ${orderData.order_no})`;
      title = '有一筆新的預訂訂單！';
      actionText = '請盡快登入後台確認訂單狀態。';
      break;
    case 'status_update':
      subject = updateReason ? `[不遠露營] 🔄 ${updateReason} (編號: ${orderData.order_no})` : `[不遠露營] 🔄 訂單狀態更新 (編號: ${orderData.order_no})`;
      title = updateReason || '訂單狀態已更新！';
      actionText = updateReason ? `您的訂單${updateReason}，請見下方最新明細。` : '訂單內容或狀態已被手動修改。';
      break;
    case 'cancelled':
      subject = `[不遠露營] ❌ 訂單已取消 (編號: ${orderData.order_no})`;
      title = '訂單已被取消。';
      actionText = '系統或管理員已將此訂單取消。';
      break;
  }

  // Calculate items text if available
  let itemsText = '';
  if (orderData.nf_order_items && Array.isArray(orderData.nf_order_items)) {
    itemsText = orderData.nf_order_items.map((oi: any) => {
      const name = oi.nf_items?.name || oi.item_name || '未知商品';
      return `<li>${name} x ${oi.quantity}</li>`;
    }).join('');
  } else if (orderData.itemsText) {
    // For simple API payloads
    itemsText = orderData.itemsText;
  }

  const statusMap: any = {
    'pending': '待付款',
    'deposit_paid': '已付定金',
    'paid': '已付款',
    'checked_in': '已報到',
    'cancelled': '已取消'
  };

  const statusText = statusMap[orderData.status] || orderData.status;

  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; background-color: #f8fafc;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: ${actionType === 'cancelled' ? '#e11d48' : '#059669'}; padding: 20px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">${title}</h1>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; margin-bottom: 24px; color: #475569;">${actionText}</p>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; width: 30%;">訂單編號</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; font-family: monospace; font-size: 16px;">${orderData.order_no}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">目前狀態</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold;">
                <span style="background-color: #f1f5f9; padding: 4px 10px; border-radius: 6px;">${statusText}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">訂購人</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${orderData.customer_name}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">聯絡電話</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${orderData.customer_phone}</td>
            </tr>
            ${orderData.notes && orderData.notes.match(/\[人數:\s*(.*?)\]/) ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">入住人數</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #3b82f6;">${orderData.notes.match(/\[人數:\s*(.*?)\]/)[1]}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">入住日期</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${orderData.check_in_date} ~ ${orderData.check_out_date}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; ${!orderData.deposit_amount ? 'border-bottom: 1px solid #f1f5f9;' : ''} color: #64748b;">總金額</td>
              <td style="padding: 12px 0; ${!orderData.deposit_amount ? 'border-bottom: 1px solid #f1f5f9;' : ''} font-weight: black; color: #333; font-size: 16px;">NT$ ${(orderData.total_amount || 0).toLocaleString()}</td>
            </tr>
            ${orderData.deposit_amount > 0 ? `
            <tr>
              <td style="padding: 12px 0; color: #64748b;">已收定金</td>
              <td style="padding: 12px 0; font-weight: bold; color: #059669;">NT$ ${orderData.deposit_amount.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">現場需付尾款</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: black; color: #e11d48; font-size: 18px;">NT$ ${Math.max(0, (orderData.total_amount || 0) - orderData.deposit_amount).toLocaleString()}</td>
            </tr>
            ` : ''}
            ${orderData.payment_method === 'bank_transfer' && orderData.virtual_account ? `
            <tr>
              <td style="padding: 16px 0; color: #64748b;" colspan="2">
                <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px;">
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">💳 專屬匯款帳號 (請於 3 日內完成匯款)</div>
                  <div style="font-weight: bold; color: #333;">銀行代碼：812 (台新銀行)</div>
                  <div style="font-weight: black; font-family: monospace; font-size: 18px; color: #0f172a; margin-top: 4px; letter-spacing: 1px;">${orderData.virtual_account}</div>
                </div>
              </td>
            </tr>
            ` : ''}
          </table>

          ${orderData.notes && orderData.notes.replace(/\[Email:.*?\]\s*/g, '').replace(/\[人數:.*?\]\s*/g, '').trim() ? `
          <div style="margin-top: 24px; background-color: #fffbeb; padding: 16px; border-left: 4px solid #f59e0b; border-radius: 4px;">
            <h3 style="color: #b45309; margin-top: 0; margin-bottom: 8px; font-size: 15px;">💬 備註與回覆</h3>
            <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; color: #451a03;">${orderData.notes.replace(/\[Email:.*?\]\s*/g, '').replace(/\[人數:.*?\]\s*/g, '').trim()}</p>
          </div>
          ` : ''}

          ${itemsText ? `
          <div style="margin-top: 24px; background-color: #f8fafc; padding: 16px; border-radius: 8px;">
            <h3 style="color: #475569; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 0;">預訂明細</h3>
            <ul style="padding-left: 20px; line-height: 1.8; margin-bottom: 0;">
              ${itemsText}
            </ul>
          </div>
          ` : ''}

          <div style="margin-top: 32px; text-align: center;">
            <a href="https://not-far-web.vercel.app/" style="background-color: #0f172a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; letter-spacing: 1px;">前往不遠山莊官網</a>
            <p style="margin-top: 16px; font-size: 14px; color: #64748b;">如有任何問題，歡迎透過官方 LINE 聯繫我們！</p>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: '"不遠露營系統" <' + user + '>',
      to: toAddress,
      bcc: adminEmails,
      subject,
      html
    });
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: err };
  }
};
