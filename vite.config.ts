import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const API_PREFIX = '/bills-api';

export default defineConfig(({ mode }) => {
  // loadEnv also reads .env.local (gitignored) so each worktree/checkout can
  // pin its own ports without touching these shared defaults.
  const env = loadEnv(mode, process.cwd(), '');
  const VITE_PORT = Number(env.VITE_PORT) || 5173;
  const API_PORT = Number(env.VITE_API_PORT) || 8787;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'favicon.svg',
          'brand-mark.svg',
          'app-icon.svg',
          'app-icon-maskable.svg',
          'icon-16.png',
          'icon-32.png',
          'icon-180.png',
          'icon-192.png',
          'icon-512.png',
          'icon-512-maskable.png',
        ],
        manifest: {
          name: 'Bills — Suscripciones',
          short_name: 'Bills',
          description: 'Gestiona tus suscripciones, fechas de pago y avisos',
          theme_color: '#14171a',
          background_color: '#14171a',
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
          // Fase 7b: compartir texto desde otra app abre Bills con la hoja de
          // registro precargada. GET (no POST) a propósito — así lo maneja el
          // mismo useEffect de query params que ya usa `?p=` y `?open=`, sin
          // necesidad de que el Service Worker intercepte un form submit.
          share_target: {
            action: '/?share=1',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
            },
          },
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
              src: '/icon-512-maskable.png',
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
      // Bind explícito: sin esto Vite resuelve 'localhost' por DNS, y en
      // algunos Mac eso devuelve solo ::1 (IPv6), dejando el puerto
      // inalcanzable por IPv4. Igual, entrar por la URL http://127.0.0.1:...
      // rompe passkeys (WebAuthn no acepta IPs como rpId) — usar siempre
      // http://localhost:PORT en el navegador, no la IP que imprime Vite.
      host: '127.0.0.1',
      port: VITE_PORT,
      proxy: {
        [API_PREFIX]: {
          target: `http://127.0.0.1:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
  };
});
