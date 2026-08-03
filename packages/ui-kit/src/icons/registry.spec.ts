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

  it('le chiavi rinominate esistono col nome canonico Lucide', () => {
    expect(icons['pencil']).toBeTruthy();
    expect(icons['building-2']).toBeTruthy();
  });
});
