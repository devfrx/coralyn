import { describe, it, expect, vi, afterEach } from 'vitest';
import { privacyPreviewUrl } from './privacyPreview';

afterEach(() => vi.unstubAllEnvs());

describe('privacyPreviewUrl', () => {
  it('compone base URL + /privacy?e=<id>', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', 'https://clienti.coralyn.it');
    expect(privacyPreviewUrl('abc')).toBe('https://clienti.coralyn.it/privacy?e=abc');
  });
  it('senza base URL usa un percorso relativo', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', '');
    expect(privacyPreviewUrl('abc')).toBe('/privacy?e=abc');
  });
});
