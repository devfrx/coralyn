import type { SeasonDTO } from '@coralyn/contracts';

/**
 * Regola UNICA di «quale stagione vale per questa data» (radice R-D).
 *
 * Prima esisteva in quattro copie con DUE semantiche diverse, e la divergenza non era teorica:
 * il **banco noleggi** prendeva la stagione che copre la data attiva, mentre l'**editor del
 * catalogo** e quello dei **prezzi** prendevano `seasons[0]`. Con più di una stagione configurata,
 * l'operatore applicava le tariffe di una stagione mentre l'admin ne modificava un'altra — e il
 * commento nel banco dichiarava «stesso fallback di RentalCatalogView», il che è vero solo per il
 * fallback e non per il percorso principale.
 *
 * Il fallback su `seasons[0]` resta di proposito: senza una stagione «in corso» configurata, una
 * vista che non mostra nulla è peggio di una che mostra la prima. È lo stesso comportamento di
 * prima, ma dichiarato in un posto solo invece che dedotto quattro volte.
 *
 * Le date sono stringhe ISO `YYYY-MM-DD` (ADR-0031): il confronto lessicografico è quello giusto.
 */
export function seasonCoveringDate(seasons: readonly SeasonDTO[], date: string): SeasonDTO | null {
  return seasons.find((s) => s.startDate <= date && date <= s.endDate) ?? seasons[0] ?? null;
}

/** Id della stagione che vale per `date`, o `''` se non ce ne sono affatto (contratto dei `Select`). */
export function seasonIdCoveringDate(seasons: readonly SeasonDTO[], date: string): string {
  return seasonCoveringDate(seasons, date)?.id ?? '';
}
