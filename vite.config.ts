import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/spending-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: { navigateFallbackDenylist: [/^\/spending-app\/preview\//] },
      manifest: {
        name: 'Spending App',
        short_name: 'Spending',
        description: 'Локальный учёт расходов',
        start_url: '/spending-app/',
        scope: '/spending-app/',
        display: 'standalone',
        theme_color: '#f7f8fa',
        background_color: '#f7f8fa',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
