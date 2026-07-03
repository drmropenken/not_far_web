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
    const tradeAmt = params['TradeAmt'];

    if (rtnCode === '1' && orderNo) {
      // Payment Success! Fetch order ID first
      const { data: order, error: orderError } = await supabase
        .from('nf_orders')
        .select('id')
        .eq('order_no', orderNo)
        .single();
      
      if (orderError || !order) {
        console.error('Failed to find order for ECPay payment log insertion:', orderError);
      } else {
        // Insert a new payment record into nf_payment_logs
        const { error: logError } = await supabase
          .from('nf_payment_logs')
          .insert({
            order_id: order.id,
            amount: parseInt(tradeAmt || '0', 10),
            payment_type: 'credit_card',
            collected_by: 'system',
            notes: '綠界'
          });

        if (logError) {
          console.error('Failed to insert ECPay payment log:', logError);
        } else {
          console.log(`Successfully recorded ECPay credit card payment for order ${orderNo}`);
        }
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
