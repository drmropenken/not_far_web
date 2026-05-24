import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const ECPAY_ENDPOINT = import.meta.env.ECPAY_ENDPOINT;
const ECPAY_MERCHANT_ID = import.meta.env.ECPAY_MERCHANT_ID;
const ECPAY_HASH_KEY = import.meta.env.ECPAY_HASH_KEY;
const ECPAY_HASH_IV = import.meta.env.ECPAY_HASH_IV;
const ECPAY_RETURN_URL = import.meta.env.ECPAY_RETURN_URL;
const ECPAY_CLIENT_BACK_URL = import.meta.env.ECPAY_CLIENT_BACK_URL;

const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const formatDate = (value: Date) => {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const makeCheckMacValue = (params: Record<string, string>) => {
  const ordered = Object.keys(params)
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const raw = `HashKey=${ECPAY_HASH_KEY}&${ordered}&HashIV=${ECPAY_HASH_IV}`;
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%21/g, '!')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2a/g, '*')
    .replace(/%2d/g, '-')
    .replace(/%2e/g, '.')
    .replace(/%5f/g, '_');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase 環境參數尚未設定。' }, 500);
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ error: '請提供有效的 JSON 格式資料。' }, 400);
  }

  const {
    checkin,
    checkout,
    accommodation,
    adults,
    children,
    phone,
    email,
    name,
    notes = '',
  } = payload as Record<string, string>;

  if (!checkin || !checkout || !accommodation || !phone || !email || !name) {
    return jsonResponse({ error: '請填寫所有必填欄位。' }, 400);
  }

  const checkinDate = new Date(`${checkin}T00:00:00`);
  const checkoutDate = new Date(`${checkout}T00:00:00`);
  if (Number.isNaN(checkinDate.getTime()) || Number.isNaN(checkoutDate.getTime())) {
    return jsonResponse({ error: '日期格式錯誤。' }, 400);
  }

  if (checkoutDate <= checkinDate) {
    return jsonResponse({ error: '退房日期必須晚於入住日期。' }, 400);
  }

  const { data: campsite, error: campsiteError } = await supabase
    .from('campsites')
    .select('id, name, price_weekday, price_weekend, slug')
    .eq('slug', accommodation)
    .limit(1)
    .single();

  if (campsiteError || !campsite) {
    return jsonResponse({ error: '找不到對應的住宿類型。' }, 404);
  }

  let totalAmount = 0;
  let currentDate = new Date(checkinDate);
  while (currentDate < checkoutDate) {
    totalAmount += isWeekend(currentDate) ? Number(campsite.price_weekend) : Number(campsite.price_weekday);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const { data: userRecord, error: userQueryError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (userQueryError) {
    return jsonResponse({ error: '查詢使用者資料時發生錯誤。' }, 500);
  }

  let userId: string;
  if (userRecord?.id) {
    userId = userRecord.id;
  } else {
    const { data: userInsert, error: userInsertError } = await supabase
      .from('users')
      .insert({ name, email, phone })
      .select('id')
      .single();

    if (userInsertError || !userInsert?.id) {
      return jsonResponse({ error: '建立使用者時發生錯誤。' }, 500);
    }

    userId = userInsert.id;
  }

  const { data: existingBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('checkin, checkout')
    .eq('campsite_id', campsite.id)
    .eq('payment_status', 'paid');

  if (bookingsError) {
    return jsonResponse({ error: '檢查訂單衝突時發生錯誤。' }, 500);
  }

  const hasConflict = Array.isArray(existingBookings)
    ? existingBookings.some((booking) => {
        const existingCheckin = new Date(`${booking.checkin}T00:00:00`);
        const existingCheckout = new Date(`${booking.checkout}T00:00:00`);
        return !(checkoutDate <= existingCheckin || checkinDate >= existingCheckout);
      })
    : false;

  if (hasConflict) {
    return jsonResponse({ error: '該日期營位已被預訂。' }, 409);
  }

  const merchantTradeNo = `NF-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const merchantTradeDate = new Date()
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const itemName = `${campsite.name} x${Math.max(1, Math.round((checkoutDate.getTime() - checkinDate.getTime()) / 86400000))}晚`;

  const { data: bookingInsert, error: bookingInsertError } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      campsite_id: campsite.id,
      checkin: formatDate(checkinDate),
      checkout: formatDate(checkoutDate),
      adults: Number(adults || 1),
      children: Number(children || 0),
      phone,
      notes,
      total_amount: totalAmount,
      payment_status: 'unpaid',
      ecpay_trade_no: merchantTradeNo,
    })
    .select('id')
    .single();

  if (bookingInsertError || !bookingInsert?.id) {
    return jsonResponse({ error: '建立訂單時發生錯誤。' }, 500);
  }

  if (!ECPAY_ENDPOINT || !ECPAY_MERCHANT_ID || !ECPAY_HASH_KEY || !ECPAY_HASH_IV || !ECPAY_RETURN_URL || !ECPAY_CLIENT_BACK_URL) {
    return jsonResponse({ error: 'ECPay 環境參數尚未完整設定。' }, 500);
  }

  const ecpayParams = {
    MerchantID: ECPAY_MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    PaymentType: 'aio',
    TotalAmount: String(totalAmount),
    TradeDesc: '不遠山莊露營訂單',
    ItemName: itemName,
    ReturnURL: ECPAY_RETURN_URL,
    ClientBackURL: ECPAY_CLIENT_BACK_URL,
    ChoosePayment: 'Credit',
    EncryptType: '1',
  };
  const CheckMacValue = makeCheckMacValue(ecpayParams);

  return jsonResponse({
    actionUrl: ECPAY_ENDPOINT,
    params: {
      ...ecpayParams,
      CheckMacValue,
    },
  });
};
