/**
 * Forma condivisa dei contenuti legali. Volutamente identica a quella di
 * `apps/web-customer/src/features/legal/informativa.content.ts` (5.6a): stessa convenzione, nessun
 * terzo stile nel repo. I due testi restano però SEPARATI di proposito — piani GDPR diversi
 * (ADR-0055): lì il titolare è il lido, qui è Coralyn.
 */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  /** ⚖️ Punto che richiede validazione legale prima della pubblicazione. */
  legalReview?: boolean;
}

/** Riga dell'imprint ex art. 7 D.Lgs. 70/2003. */
export interface ImprintField {
  label: string;
  value: string;
  /** Lettera dell'art. 7 comma 1 che impone l'informazione. */
  source: string;
}
