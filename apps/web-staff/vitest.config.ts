import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // transformAssetUrls: false — su Node 24/Windows la pipeline di transform di vitest risolve male
  // gli asset pubblici referenziati con path assoluto (es. <img src="/coralyn-logo.png">), trattandoli
  // come URL file:// e lanciando ERR_INVALID_ARG_VALUE. In build/dev funziona (Vite reale); qui basta
  // NON riscrivere quell'attributo come import di modulo, dato che è già un path assoluto valido a runtime.
  plugins: [vue({ template: { transformAssetUrls: false } }), Icons({ compiler: 'vue3' })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.ts', '../../packages/ui-kit/src/**/*.spec.ts'],
  },
});
