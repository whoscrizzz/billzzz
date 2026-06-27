import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const API_PREFIX = "/bills-api";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "brand-mark.svg",
        "app-icon.svg",
        "icon-16.png",
        "icon-32.png",
        "icon-180.png",
        "icon-192.png",
        "icon-512.png",
      ],
      manifest: {
        name: "Bills — Suscripciones",
        short_name: "Bills",
        description: "Gestiona tus suscripciones, fechas de pago y avisos",
        theme_color: "#eef1f5",
        background_color: "#eef1f5",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "es",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        importScripts: ["sw-push.js"],
        runtimeCaching: [
          {
            // Literal string — template vars are not available in the generated service worker.
            urlPattern: ({ url }) => url.pathname.startsWith("/bills-api/auth/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/bills-api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      [API_PREFIX]: {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
