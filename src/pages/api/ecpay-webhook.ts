import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

const ECPAY_HASH_KEY = import.meta.env.ECPAY_HASH_KEY;
const ECPAY_HASH_IV = import.meta.env.ECPAY_HASH_IV;

function makeCheckMacValue(params: Record<string, string>) {
  const filtered = Object.entries(params)
    .filter(([key]) => key !== 'CheckMacValue')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const raw = `HashKey=${ECPAY_HASH_KEY}&${filtered}&HashIV=${ECPAY_HASH_IV}`;
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/'/g, '%27')
    .replace(/\*/g, '%2a')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

export const POST: APIRoute = async ({ request }) => {
  const bodyText = await request.text();
  const form = new URLSearchParams(bodyText);
  const payload: Record<string, string> = {};
  form.forEach((value, key) => {
    payload[key] = value;
  });

  const receivedCheckMac = payload.CheckMacValue || '';
  if (!receivedCheckMac) {
    return new Response('0|CheckMacValue Missing', { status: 400 });
  }

  const expectedCheckMac = makeCheckMacValue(payload);
  if (expectedCheckMac !== receivedCheckMac.toUpperCase()) {
    return new Response('0|Invalid CheckMacValue', { status: 400 });
  }

  const merchantTradeNo = payload.MerchantTradeNo || '';
  const rtnCode = payload.RtnCode || '';
  const rtnMsg = payload.RtnMsg || '';
  const paymentStatus = rtnCode === '1' ? 'paid' : 'failed';

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id')
    .eq('ecpay_trade_no', merchantTradeNo)
    .limit(1)
    .maybeSingle();

  if (bookingError) {
    console.error('查詢 booking 失敗', bookingError);
  }

  if (booking?.id) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ payment_status: paymentStatus })
      .eq('id', booking.id);

    if (updateError) {
      console.error('更新 booking 失敗', updateError);
    }

    const { error: logError } = await supabase.from('payment_logs').insert({
      booking_id: booking.id,
      status: paymentStatus,
      message: rtnMsg,
      payload: JSON.stringify(payload),
    });

    if (logError) {
      console.error('插入 payment_logs 失敗', logError);
    }
  } else {
    console.warn('找不到對應 booking，無法寫入 payment_logs：', merchantTradeNo);
  }

  return new Response('1|OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
};
