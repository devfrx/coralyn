import { describe, it, expect, vi, afterEach } from 'vitest';
import { privacyPreviewUrl } from './privacyPreview';

afterEach(() => vi.unstubAllEnvs());

describe('privacyPreviewUrl', () => {
  it('compone base URL + /privacy?e=<id>', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', 'https://clienti.coralyn.it');
    expect(privacyPreviewUrl('abc')).toBe('https://clienti.coralyn.it/privacy?e=abc');
  });

  it('normalizza la barra finale del base URL', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', 'https://clienti.coralyn.it/');
    expect(privacyPreviewUrl('abc')).toBe('https://clienti.coralyn.it/privacy?e=abc');
  });

  // Senza origin dell'app clienti NON si ripiega su un percorso relativo: resterebbe sull'origin di
  // web-staff, dove `/legale/informativa` e' un documento DIVERSO (policy operatori, titolare
  // Coralyn). Un link che porta al documento sbagliato e' peggio di nessun link.
  it('senza base URL restituisce stringa vuota, MAI un percorso relativo', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', '');
    expect(privacyPreviewUrl('abc')).toBe('');
  });

  it('non produce mai un URL sull origin corrente', () => {
    for (const base of ['', '   ']) {
      vi.stubEnv('VITE_WEB_CUSTOMER_URL', base);
      expect(privacyPreviewUrl('abc').startsWith('/')).toBe(false);
    }
  });
});
