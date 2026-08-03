import { describe, it, expect } from 'vitest';
import { icons } from './registry';
import { lucideCatalog } from './lucide-catalog';
import { resolveFromCatalog } from './catalog';

describe('registry — spazio dei nomi condiviso col catalogo', () => {
  // Icon.vue consulta PRIMA il registry: una chiave omonima di un'icona Lucide diversa
  // vincerebbe in silenzio, e chi la sceglie dal picker vedrebbe un altro glifo.
  it('nessuna chiave del registry e omonima di un icona Lucide diversa', () => {
    const ombre = Object.keys(icons).filter((k) => resolveFromCatalog(lucideCatalog, k) !== null);
    // Le chiavi che restano devono essere quelle che rendono ESATTAMENTE l'omonima Lucide.
    // Qui asseriamo che le due note siano state rinominate.
    expect(ombre).not.toContain('edit');
    expect(ombre).not.toContain('building');
  });

  it("l'inventario delle chiavi in ombra e' fissato: una terza non passa inosservata", () => {
    // Il test sopra calcola `ombre` (le chiavi del registry che il catalogo conosce anche lui) e
    // controlla solo le due gia' rinominate: una TERZA chiave in ombra passerebbe senza che nessun
    // test se ne accorga. Qui si fissa l'insieme intero — stessa forma di
    // lucide-catalog.spec.ts, che fissa `toHaveLength(1743)`.
    //
    // ⚠️ Aggiungere una voce qui e' un atto DELIBERATO: prima di farlo, verifica a mano che il
    // glifo che il REGISTRY monta per quella chiave sia esattamente lo stesso che il CATALOGO
    // renderebbe per lo stesso nome Lucide. Se sono diversi, la chiave del registry va rinominata
    // (come 'pencil' e 'building-2'), non aggiunta qui.
    const ombre = Object.keys(icons).filter((k) => resolveFromCatalog(lucideCatalog, k) !== null);
    expect(ombre.sort()).toEqual([
      'alert-triangle', 'archive', 'arrow-down', 'arrow-up', 'bell', 'building-2', 'calendar',
      'check', 'chevron-down', 'chevron-left', 'chevron-right', 'clock', 'copy', 'euro', 'info',
      'layers', 'leaf', 'loader-2', 'mail', 'map', 'menu', 'palmtree', 'pencil', 'phone', 'plus',
      'search', 'settings', 'shield', 'smartphone', 'star', 'tag', 'trash-2', 'umbrella', 'users',
      'x', 'zap',
    ]);
  });

  it('le chiavi rinominate esistono col nome canonico Lucide', () => {
    expect(icons['pencil']).toBeTruthy();
    expect(icons['building-2']).toBeTruthy();
  });
});
