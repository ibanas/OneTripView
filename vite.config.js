import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { anthropicExtractPlugin } from './server/extractPlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ANTHROPIC_API_KEY / APP_PASSPHRASE from .env files too (in addition to
  // the real process environment). The '' prefix loads vars WITHOUT the VITE_
  // prefix — these stay server-side and are NOT exposed to client code.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      anthropicExtractPlugin(env),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'app-icon.svg',
          'apple-touch-icon-180x180.png',
        ],
        manifest: {
          name: 'OneTripView — Travel Itinerary',
          short_name: 'OneTripView',
          description:
            'Turn booking PDFs into a visual travel itinerary with maps, photos, and a timeline.',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//], // never serve index.html for API calls
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            // Never cache the extraction endpoint (listed first so it wins).
            {
              urlPattern: ({ url, request }) =>
                request.method === 'POST' && url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
              method: 'POST',
              options: { cacheName: 'api-no-store' },
            },
            // OpenStreetMap tiles — immutable per z/x/y.
            {
              urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] }, // 0 = opaque cross-origin
              },
            },
            // Wikipedia destination photos.
            {
              urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'wikimedia-images',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Open-Meteo geocoding JSON.
            {
              urlPattern: /^https:\/\/[a-z-]+\.open-meteo\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'open-meteo',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Wikipedia REST summary JSON.
            {
              urlPattern: /^https:\/\/[a-z]{2,3}\.wikipedia\.org\/api\/rest_v1\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wikipedia-api',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Keep the dev server free of service-worker caching; PWA features are
          // active in production builds (and on the Vercel deploy).
          enabled: false,
        },
      }),
    ],
  }
})
