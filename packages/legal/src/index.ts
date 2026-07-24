/**
 * `@coralyn/legal` — testi legali del piano B di ADR-0055 (Coralyn titolare verso gli operatori),
 * condivisi tra `web-staff` e `web-platform`.
 *
 * Esiste come package, e non come testo duplicato nelle due app, perché il contenuto è identico e
 * una divergenza tra le due pagine sarebbe un rilievo di compliance. ADR-0056.
 *
 * NON include l'informativa al bagnante: quella è il piano A, il titolare è il lido, il testo è
 * parametrizzato per tenant e vive in `web-customer`. Tenerli separati è deliberato.
 */
export { default as PrivacyPolicyView } from './PrivacyPolicyView.vue';
export { default as ImprintView } from './ImprintView.vue';
export { default as LegalDocument } from './LegalDocument.vue';

export type { LegalSection, ImprintField } from './types';
export {
  PRIVACY_OPERATORI_SECTIONS,
  PRIVACY_OPERATORI_UPDATED,
  PRIVACY_OPERATORI_VERSION,
} from './privacy.content';
export { IMPRINT_FIELDS, IMPRINT_NOT_APPLICABLE, IMPRINT_UPDATED } from './imprint.content';
