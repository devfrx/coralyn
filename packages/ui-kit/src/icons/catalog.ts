/**
 * Un catalogo di icone interrogabile a runtime, indipendente dalla libreria che lo popola.
 * `icons` mappa il nome canonico al body SVG; `aliases` mappa un nome alternativo al canonico.
 * I body sono markup statico versionato: non arrivano mai dalla rete né dall'utente.
 */
export interface IconCatalog {
  readonly icons: Readonly<Record<string, string>>;
  readonly aliases: Readonly<Record<string, string>>;
}

/** Body SVG del nome dato, seguendo gli alias. `null` se il catalogo non lo conosce. */
export function resolveFromCatalog(catalog: IconCatalog, name: string): string | null {
  // Object.hasOwn, non `in` o l'accesso diretto: i due record sono oggetti letterali, e un nome
  // uguale a un membro di Object.prototype (`toString`, `constructor`, ...) altrimenti
  // risulterebbe "trovato", restituendo un riferimento a funzione al posto di `string | null`.
  if (Object.hasOwn(catalog.icons, name)) return catalog.icons[name];
  if (Object.hasOwn(catalog.aliases, name)) {
    const parent = catalog.aliases[name];
    return Object.hasOwn(catalog.icons, parent) ? catalog.icons[parent] : null;
  }
  return null;
}

/**
 * Nomi che contengono `query`, canonici e alias, troncati a `limit`.
 * `total` è il numero di corrispondenze PRIMA del troncamento: senza, un elenco troncato
 * non si distingue da un elenco esaurito e chi cerca conclude che l'icona non esiste.
 */
export function searchCatalog(
  catalog: IconCatalog,
  query: string,
  limit: number,
): { names: string[]; total: number } {
  const q = query.trim().toLowerCase();
  const all = [...Object.keys(catalog.icons), ...Object.keys(catalog.aliases)];
  const matches = q ? all.filter((n) => n.includes(q)) : all;
  return { names: matches.slice(0, limit), total: matches.length };
}
