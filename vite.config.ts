import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const API_PREFIX = '/bills-api';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'brand-mark.svg',
        'app-icon.svg',
        'icon-16.png',
        'icon-32.png',
        'icon-180.png',
        'icon-192.png',
        'icon-512.png',
      ],
      manifest: {
        name: 'Bills — Suscripciones',
        short_name: 'Bills',
        description: 'Gestiona tus suscripciones, fechas de pago y avisos',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?pwa=1',
        scope: '/',
        lang: 'es',
        shortcuts: [
          {
            name: 'Ver pagos',
            short_name: 'Inicio',
            url: '/?pwa=1&p=home',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        importScripts: ['sw-push.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/bills-api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      [API_PREFIX]: {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
