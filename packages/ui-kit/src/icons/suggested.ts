/**
 * Le icone proposte all'apertura del picker. Non è un vincolo: la ricerca interroga TUTTE le
 * 1743 icone del catalogo, e nessuna è preclusa. Serve solo a non aprire su `a-arrow-down`.
 *
 * Vive in un solo posto: duplicarlo rifarebbe la duplicazione che questo lavoro toglie (D-040).
 */
export const SUGGESTED_ICONS: readonly string[] = [
  // ⚠️ `waves` NON va usata: in lucide 1.2.114 e' `hidden`, quindi il catalogo la esclude e il
  // filtro la scarterebbe in silenzio, aprendo il picker con 25 suggerimenti su 26.
  'umbrella', 'tree-palm', 'leaf', 'tent', 'waves-horizontal', 'anchor', 'sun', 'sunset',
  'shell', 'fish', 'sailboat', 'ship-wheel', 'life-buoy', 'volleyball',
  'armchair', 'bed-double', 'sofa', 'utensils', 'coffee', 'ice-cream-cone',
  'shower-head', 'baby', 'accessibility', 'dog', 'parking-meter', 'star',
];
