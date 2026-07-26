import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `node`, non `jsdom`: le asserzioni leggono file dal disco e non montano un solo componente.
    // E' anche la ragione per cui questo package pesa poco sulla concorrenza di `pnpm -r test`
    // (D-066): niente jsdom da istanziare per worker.
    environment: 'node',
    globals: true,
  },
});
