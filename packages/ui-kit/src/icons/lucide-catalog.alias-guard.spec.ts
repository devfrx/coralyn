import { describe, it, expect, vi } from 'vitest';

/**
 * Isola il costruttore di lucideCatalog da dati reali per provare un caso che sulla versione
 * Lucide pinnata non esiste ancora (per questo la divergenza era latente): un alias il cui
 * `parent` coincide con un membro di Object.prototype. Gemello del controllo che
 * apps/api/src/common/is-icon-key.ts fa con un Set — qui il filtro deve scartare per PRESENZA
 * (Object.hasOwn), non per VERITA' (accesso diretto), esattamente come resolveFromCatalog.
 */
vi.mock('@iconify-json/lucide', () => ({
  icons: {
    icons: { anchor: { body: '<path d="anchor"/>' } },
    aliases: {
      // 'toString' non e' mai stata resa una chiave PROPRIA di `icons`: l'accesso diretto
      // icons['toString'] risolverebbe comunque, ereditato da Object.prototype — truthy.
      fantasma: { parent: 'toString' },
      reale: { parent: 'anchor' },
    },
  },
}));

describe('lucideCatalog — il filtro degli alias orfani usa la presenza, non la verita', () => {
  it('scarta un alias il cui genitore esiste solo per ereditarieta da Object.prototype', async () => {
    const { lucideCatalog } = await import('./lucide-catalog');
    expect(lucideCatalog.aliases['fantasma']).toBeUndefined();
  });

  it('un alias verso un genitore presente davvero resta', async () => {
    const { lucideCatalog } = await import('./lucide-catalog');
    expect(lucideCatalog.aliases['reale']).toBe('anchor');
  });
});
