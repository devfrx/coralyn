import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Cap dei worker, ADR-0061 (D-066): «meta' dei core, ma non piu' di 4». Vitest senza limite
// apre un fork per file fino a `core - 1`: su 32 core, ui-kit da sola arrivava a 5,3 GB di RSS,
// cioe' piu' della RAM libera nello scenario in cui la voce e' stata trovata. Presidiato da
// `packages/docs-lint/src/test-workers.spec.ts`.
const MAX_WORKERS = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));

export default defineConfig({
  plugins: [vue()],
  test: {
    maxWorkers: MAX_WORKERS,
    environment: 'jsdom',
    globals: true,
  },
});
