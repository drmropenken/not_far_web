import crypto from 'crypto';

function generateCheckMacValue(params, hashKey, hashIV) {
  const sortedKeys = Object.keys(params).sort();
  let str = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    str += `&${key}=${params[key]}`;
  }
  str += `&HashIV=${hashIV}`;

  console.log("Raw String:", str);

  let encoded = encodeURIComponent(str).toLowerCase();
  
  encoded = encoded
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+');

  console.log("Encoded String:", encoded);

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

const params = {
  ChoosePayment: 'ALL',
  EncryptType: '1',
  ItemName: 'Apple iphone 15',
  MerchantID: '3002607',
  MerchantTradeDate: '2023/03/12 15:30:23',
  MerchantTradeNo: 'ecpay20230312153023',
  PaymentType: 'aio',
  ReturnURL: 'https://www.ecpay.com.tw/receive.php',
  TotalAmount: '30000',
  TradeDesc: '促銷方案',
};

const hashKey = 'pwFHCqoQZGmho4w6';
const hashIv = 'EkRm7iFT261dpevs';

const mac = generateCheckMacValue(params, hashKey, hashIv);
console.log("Generated MAC:", mac);
console.log("Expected MAC: ", "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840");
console.log("Match:", mac === "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840");
