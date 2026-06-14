import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

const GMAIL_USER = import.meta.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = import.meta.env.GMAIL_APP_PASSWORD;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });

const parseRequestBody = async (request: Request) => {
  try {
    const bodyText = await request.text();
    return JSON.parse(bodyText);
  } catch (e) {
    return null;
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return jsonResponse({ error: 'Gmail 環境變數尚未設定。' }, 500);
  }

  const payload = await parseRequestBody(request);
  if (!payload) {
    return jsonResponse({ error: 'JSON 解析失敗，請檢查傳送格式。' }, 400);
  }

  const { name, phone, email, subject, message } = payload as Record<string, string>;
  if (!name || !email || !subject || !message) {
    return jsonResponse({ error: '請填寫姓名、電子郵件、主旨與訊息內容。' }, 400);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  const mailHtml = `
    <div style="font-family: 'Noto Sans TC', sans-serif; color: #333; line-height: 1.6;">
      <h2 style="color: #145d43;">不遠山莊官網 - 收到新的客戶聯絡訊息</h2>
      <table cellpadding="10" cellspacing="0" border="0" style="width:100%; max-width: 680px; border-collapse: collapse;">
        <tr style="background:#f4f7f6;"><td><strong>客戶姓名</strong></td><td>${name}</td></tr>
        <tr><td><strong>聯絡電話</strong></td><td>${phone || '無'}</td></tr>
        <tr style="background:#f4f7f6;"><td><strong>客戶 Email</strong></td><td>${email}</td></tr>
        <tr><td><strong>詢問主旨</strong></td><td>${subject}</td></tr>
        <tr style="background:#f4f7f6;"><td><strong>訊息內容</strong></td><td style="white-space: pre-wrap;">${message}</td></tr>
      </table>
      <p style="margin-top:20px; color:#555;">請儘速回覆客戶，謝謝！</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: GMAIL_USER,
      to: `${GMAIL_USER}, close2.tw@gmail.com`,
      replyTo: email,
      subject: `【不遠山莊官網聯絡表單】${subject}`,
      html: mailHtml,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    // 只有發生真正發信錯誤時，才在伺服器端印出紀錄
    console.error('contact sendMail error:', error);
    return jsonResponse({ error: '發送郵件失敗，請稍後再試。' }, 500);
  }
};