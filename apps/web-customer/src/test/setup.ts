import { afterEach } from 'vitest';

// Nessun MSW qui: il canale cliente (B1-B4) testa http.ts/session.ts mockando
// direttamente `fetch` (vi.spyOn). Le viste (B5) aggiungeranno mocks/server se serve.
afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
