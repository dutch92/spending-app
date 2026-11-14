import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const preview = loadEnv(mode, '.', 'VITE_').VITE_PREVIEW_BUILD === 'true';
  const appBase = preview ? '/spending-app/preview/' : '/spending-app/';
  return {
  base: appBase,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: { navigateFallbackDenylist: preview ? [] : [/^\/spending-app\/preview\//] },
      manifest: {
        name: preview ? 'Spending App Preview' : 'Spending App',
        short_name: preview ? 'Spending Preview' : 'Spending',
        description: 'Локальный учёт расходов',
        start_url: appBase,
        scope: appBase,
        display: 'standalone',
        theme_color: preview ? '#101c31' : '#f7f8fa',
        background_color: preview ? '#101c31' : '#f7f8fa',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  };
});
