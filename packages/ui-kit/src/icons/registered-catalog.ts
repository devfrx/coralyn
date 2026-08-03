import { shallowRef } from 'vue';
import type { IconCatalog } from './catalog';

/**
 * Il catalogo che l'applicazione ha deciso di caricare. Parte vuoto di proposito.
 *
 * L'inversione (l'app registra, il kit consulta) e' cio' che permette a web-staff di avere il
 * catalogo intero nel bundle senza che web-customer e web-platform — che non rendono icone di
 * dominio — se lo portino dietro dal barrel.
 *
 * `shallowRef` e non una variabile: i `computed` che lo leggono devono invalidarsi se la
 * registrazione avviene dopo che un componente e' gia' montato.
 */
const current = shallowRef<IconCatalog | null>(null);

export function registerIconCatalog(catalog: IconCatalog): void {
  current.value = catalog;
}

export function getIconCatalog(): IconCatalog | null {
  return current.value;
}

/**
 * Azzera la registrazione. Gemello di `clearToasts`: senza, l'isolamento fra un test che registra
 * il catalogo e uno che non lo vuole starebbe tutto nell'ORDINE di dichiarazione dentro il file, e
 * chi aggiunge un caso in testa fa asserire all'altro l'opposto del proprio titolo.
 */
export function resetIconCatalog(): void {
  current.value = null;
}
