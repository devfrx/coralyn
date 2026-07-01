import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Icons({ compiler: 'vue3' }),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false }, // nessun SW in dev: il FE dev parla col backend reale via proxy
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      manifest: {
        name: 'Coralyn · Staff',
        short_name: 'Coralyn',
        lang: 'it',
        theme_color: '#E0795A',
        background_color: '#ECE3D5',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // @coralyn/contracts è CommonJS (consumato anche dal backend via dist). In dev Vite non
  // pre-bundla i pacchetti di workspace linkati: forziamo il pre-bundle così esbuild lo converte
  // in ESM ed espone gli export nominati a runtime (es. l'enum `Ruolo`, importato come valore).
  optimizeDeps: { include: ['@coralyn/contracts'] },
  server: {
    proxy: {
      // FE -> API reale senza CORS. In dev non c'è MSW nel browser: tutte le /api vanno al backend.
      // Nessun rewrite: il backend monta tutto sotto /api (ADR-0022), quindi /api/customers va
      // inoltrato intatto a http://localhost:3000/api/customers. In produzione il proxy non esiste
      // e il FE chiama /api direttamente sul backend: stesso path, nessuno strip.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
