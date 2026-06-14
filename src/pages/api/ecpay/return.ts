import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import crypto from 'crypto';

function generateCheckMacValue(params: Record<string, string>, hashKey: string, hashIV: string): string {
  const sortedKeys = Object.keys(params).sort();
  let str = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    if (key !== 'CheckMacValue') { // Do not include the CheckMacValue itself
      str += `&${key}=${params[key]}`;
    }
  }
  str += `&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(str).toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+')
    .replace(/'/g, '%27')
    .replace(/~/g, '%7e');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    const hashKey = import.meta.env.ECPAY_HASH_KEY;
    const hashIv = import.meta.env.ECPAY_HASH_IV;
    
    // 1. Verify CheckMacValue
    const receivedMac = params['CheckMacValue'];
    const calculatedMac = generateCheckMacValue(params, hashKey, hashIv);

    if (receivedMac !== calculatedMac) {
      console.error('ECPay MAC Validation Failed!', params);
      return new Response('0|ErrorMessage', { status: 400 });
    }

    // 2. Check Return Code
    const rtnCode = params['RtnCode'];
    const orderNo = params['MerchantTradeNo'];

    if (rtnCode === '1' && orderNo) {
      // Payment Success! Update DB
      const { error } = await supabase
        .from('nf_orders')
        .update({ status: 'paid' })
        .eq('order_no', orderNo);
      
      if (error) {
        console.error('Failed to update order status:', error);
      }
    }

    // 3. Always reply '1|OK' to ECPay so they know we received it
    return new Response('1|OK', {
      headers: { 'Content-Type': 'text/plain' }
    });
    
  } catch (err) {
    console.error('ECPay Webhook Error:', err);
    return new Response('0|ErrorMessage', { status: 500 });
  }
};
