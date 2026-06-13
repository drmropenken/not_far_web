import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import crypto from 'crypto';

function generateCheckMacValue(params: Record<string, string>, hashKey: string, hashIV: string): string {
  // 1. Sort by Key
  const sortedKeys = Object.keys(params).sort();
  let str = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    str += `&${key}=${params[key]}`;
  }
  str += `&HashIV=${hashIV}`;

  // 2. URL Encode
  let encoded = encodeURIComponent(str).toLowerCase();
  
  // 3. ECPay specific replacements
  encoded = encoded
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');

  // 4. SHA256 and UpperCase
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

export const GET: APIRoute = async ({ request, url }) => {
  const orderId = url.searchParams.get('order_id');
  
  if (!orderId) {
    return new Response('Missing order_id', { status: 400 });
  }

  // Fetch Order
  const { data: order, error } = await supabase
    .from('nf_orders')
    .select('*, nf_order_items(*, nf_items(*))')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return new Response('Order not found', { status: 404 });
  }

  // Generate ItemName
  const items = order.nf_order_items.map((oi: any) => `${oi.nf_items.name} x ${oi.quantity}`);
  let itemName = items.join('#');
  if (itemName.length > 400) {
    itemName = itemName.substring(0, 395) + '...';
  }

  // Base URL for ReturnURL and ClientBackURL
  const baseUrl = import.meta.env.PROD ? `https://${url.host}` : 'http://localhost:4321';
  // Use ngrok for local dev webhook testing if needed
  const returnUrl = `${baseUrl}/api/ecpay/return`;
  const clientBackUrl = `${baseUrl}/booking-success?order=${order.order_no}`;

  const merchantId = import.meta.env.ECPAY_MERCHANT_ID;
  const hashKey = import.meta.env.ECPAY_HASH_KEY;
  const hashIv = import.meta.env.ECPAY_HASH_IV;
  const endpoint = import.meta.env.ECPAY_ENDPOINT;

  const tradeDate = new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }).replace(/-/g, '/');

  const params: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: order.order_no,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: order.total_amount.toString(),
    TradeDesc: '不遠露營度假山莊線上預訂',
    ItemName: itemName || '線上預訂費用',
    ReturnURL: returnUrl,
    ChoosePayment: 'ALL',
    EncryptType: '1',
    ClientBackURL: clientBackUrl,
  };

  const macValue = generateCheckMacValue(params, hashKey, hashIv);
  params.CheckMacValue = macValue;

  // Build Auto-Submit HTML Form
  const inputs = Object.entries(params).map(([key, val]) => 
    `<input type="hidden" name="${key}" value="${val}" />`
  ).join('\\n');

  const html = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <title>轉跳至綠界金流...</title>
      <style>
        body { display: flex; justify-content: center; items-center: center; height: 100vh; background: #f8fafc; font-family: sans-serif; }
        .loader { border: 4px solid #e2e8f0; border-top: 4px solid #10b981; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .text-center { text-align: center; color: #475569; margin-top: 20vh;}
      </style>
    </head>
    <body>
      <div class="text-center">
        <h2>安全轉跳中，請稍候...</h2>
        <div class="loader"></div>
        <p>正前往綠界科技加密結帳畫面</p>
      </div>
      <form id="ecpay-form" action="${endpoint}" method="POST">
        ${inputs}
      </form>
      <script>
        document.getElementById('ecpay-form').submit();
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
};
