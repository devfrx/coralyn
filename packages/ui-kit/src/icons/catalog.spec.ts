import { describe, it, expect } from 'vitest';
import { resolveFromCatalog, searchCatalog, type IconCatalog } from './catalog';

const CAT: IconCatalog = {
  icons: { umbrella: '<path d="U"/>', 'tree-palm': '<path d="P"/>', anchor: '<path d="A"/>' },
  aliases: { palmtree: 'tree-palm' },
};

describe('catalog', () => {
  it('risolve un nome canonico', () => {
    expect(resolveFromCatalog(CAT, 'umbrella')).toBe('<path d="U"/>');
  });

  it('risolve un alias verso il body del padre', () => {
    expect(resolveFromCatalog(CAT, 'palmtree')).toBe('<path d="P"/>');
  });

  it('restituisce null per un nome inventato', () => {
    expect(resolveFromCatalog(CAT, 'non-esiste')).toBeNull();
  });

  it('un nome canonico con body vuoto risolve alla stringa vuota, non a null', () => {
    const withEmpty: IconCatalog = {
      icons: { ...CAT.icons, ghost: '' },
      aliases: CAT.aliases,
    };
    expect(resolveFromCatalog(withEmpty, 'ghost')).toBe('');
  });

  it('cerca per sottostringa e riporta il totale, non solo la pagina', () => {
    const r = searchCatalog(CAT, 'a', 2);
    expect(r.names).toHaveLength(2);
    // Quattro, non tre: la ricerca copre anche gli ALIAS, e 'palmtree' contiene una "a".
    expect(r.total).toBe(4); // umbrella, tree-palm, anchor + l'alias palmtree
  });

  it('senza query elenca tutto, sempre col tetto', () => {
    expect(searchCatalog(CAT, '', 10).total).toBe(4); // 3 canonici + 1 alias
    expect(searchCatalog(CAT, '   ', 1).names).toHaveLength(1);
  });

  it('la ricerca ignora le maiuscole', () => {
    expect(searchCatalog(CAT, 'UMBR', 10).names).toEqual(['umbrella']);
  });

  it('la ricerca trova anche per alias', () => {
    expect(searchCatalog(CAT, 'palmtree', 10).names).toContain('palmtree');
  });
});
