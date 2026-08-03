import { icons as lucide } from '@iconify-json/lucide';
import type { IconCatalog } from './catalog';

/**
 * Il catalogo Lucide, senza le icone `hidden`.
 *
 * Le hidden sono deprecate a monte: offrirle significherebbe far scegliere nomi che la libreria
 * puo' togliere. L'esclusione rende inoltre corretto il `viewBox` costante di `Icon.vue`, perche'
 * l'unica icona con dimensioni proprie (`search-large`, 32x32) e' hidden.
 *
 * Import tipizzato dall'entry del pacchetto, NON dal JSON grezzo: `resolveJsonModule` non e' attivo
 * in questo repo.
 */
const icons: Record<string, string> = {};
for (const [name, data] of Object.entries(lucide.icons)) {
  if (!data.hidden) icons[name] = data.body;
}

const aliases: Record<string, string> = {};
for (const [alias, data] of Object.entries(lucide.aliases ?? {})) {
  // Un alias verso un'icona esclusa sarebbe un vicolo cieco: si scarta.
  if (data.parent && icons[data.parent]) aliases[alias] = data.parent;
}

export const lucideCatalog: IconCatalog = { icons, aliases };
