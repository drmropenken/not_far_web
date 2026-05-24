# Not Far Web

一個使用 Astro 建構的露營網站，提供營地預訂、圖片展示、常見問題等功能。

## 🚀 技術棧

- **框架**: Astro 6.x
- **樣式**: CSS
- **資料庫**: Supabase
- **郵件服務**: Gmail SMTP + Nodemailer
- **支付**: ECPay 綠界金流

## 📁 專案結構

```text
/
├── public/
│   ├── script.js
│   └── style.css
├── src/
│   ├── assets/
│   ├── components/
│   │   └── Welcome.astro
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── index.astro          # 首頁
│   │   ├── about.astro          # 關於我們
│   │   ├── booking.astro        # 預訂頁面
│   │   ├── booking-success.astro # 預訂成功
│   │   ├── booking-failed.astro  # 預訂失敗
│   │   ├── campsite.astro       # 營地介紹
│   │   ├── contact.astro        # 聯絡我們
│   │   ├── faq.astro            # 常見問題
│   │   ├── gallery.astro        # 相簿
│   │   ├── pricing.astro        # 價格說明
│   │   └── api/                 # API 端點
│   │       ├── booking.ts       # 預訂 API
│   │       ├── contact.ts       # 聯絡表單 API
│   │       └── ecpay-webhook.ts # 綠界回調
│   └── styles/
│       └── global.css
└── astro.config.mjs
```

## 🧞 指令

所有指令都在專案根目錄執行：

| 指令                      | 說明                                    |
| :------------------------ | :-------------------------------------- |
| `npm install`             | 安裝依賴套件                            |
| `npm run dev`             | 啟動開發伺服器 (localhost:4321)          |
| `npm run build`           | 建置正式版網站到 `./dist/`               |
| `npm run preview`         | 在部署前預覽建置結果                     |

## 🌐 部署

本專案支援 Vercel 部署。部署前請設定以下環境變數：

| 變數名稱                    | 說明                          |
| :-------------------------- | :---------------------------- |
| `PUBLIC_SUPABASE_URL`       | Supabase 專案 URL             |
| `PUBLIC_SUPABASE_ANON_KEY`  | Supabase 公開金鑰             |
| `GMAIL_USER`                | Gmail 帳號                    |
| `GMAIL_APP_PASSWORD`        | Gmail 應用程式密碼              |
| `ECPAY_MERCHANT_ID`         | 綠界特店編號                  |
| `ECPAY_HASH_KEY`            | 綠界 Hash Key                 |
| `ECPAY_HASH_IV`             | 綠界 Hash IV                  |
| `ECPAY_RETURN_URL`          | 綠界回調網址                  |
| `ECPAY_CLIENT_BACK_URL`     | 客戶返回網址                  |

## 📝 授權

MIT License
