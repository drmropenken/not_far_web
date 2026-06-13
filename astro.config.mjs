// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // 核心：必須告訴 Astro 這不是純靜態網站，我們要動態執行後端 API
  output: 'server',

  adapter: vercel({
    webAnalytics: { enabled: true }
  }),

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react()],
});