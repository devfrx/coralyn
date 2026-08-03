import { describe, it, expect } from 'vitest';
import { lucideCatalog } from './lucide-catalog';
import { resolveFromCatalog, searchCatalog } from './catalog';

describe('lucideCatalog', () => {
  it('offre le 1743 icone non deprecate', () => {
    expect(Object.keys(lucideCatalog.icons)).toHaveLength(1743);
  });

  it('esclude le icone hidden, e con esse la sola 32x32 del set', () => {
    // search-large e' 32x32 e hidden: se entrasse, il viewBox costante la ritaglierebbe a un quarto.
    expect(lucideCatalog.icons['search-large']).toBeUndefined();
  });

  it('porta gli alias, cosi le righe gia salvate come palmtree continuano a risolvere', () => {
    expect(lucideCatalog.aliases['palmtree']).toBe('tree-palm');
    expect(resolveFromCatalog(lucideCatalog, 'palmtree')).toBe(
      resolveFromCatalog(lucideCatalog, 'tree-palm'),
    );
  });

  it('non porta alias orfani verso icone escluse', () => {
    for (const parent of Object.values(lucideCatalog.aliases)) {
      expect(lucideCatalog.icons[parent]).toBeTruthy();
    }
  });

  it('risolve i tre valori scrivibili oggi dal prodotto', () => {
    for (const k of ['umbrella', 'leaf', 'palmtree']) {
      expect(resolveFromCatalog(lucideCatalog, k)).toBeTruthy();
    }
  });

  it('la ricerca su un catalogo vero tronca e dichiara il totale', () => {
    const r = searchCatalog(lucideCatalog, 'arrow', 10);
    expect(r.names).toHaveLength(10);
    expect(r.total).toBeGreaterThan(10);
  });
});
