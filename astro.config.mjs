// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // 核心：必須告訴 Astro 這不是純靜態網站，我們要動態執行後端 API
  output: 'server', 
  adapter: vercel(),
});