import type { ImprintField } from './types';

/**
 * Informazioni obbligatorie del prestatore ex art. 7 D.Lgs. 70/2003 (direttiva e-commerce).
 * Vanno rese accessibili «in modo diretto e permanente»: da qui la rotta pubblica e il link nel
 * piè di pagina.
 *
 * Fonte canonica e riveduta: `docs/legal/imprint.md`. Le lettere dell'art. 7 comma 1 sono quelle
 * corrette (P. IVA è la lett. g, non la e: la mappatura era sbagliata nella prima stesura ed è
 * stata corretta in review).
 */
export const IMPRINT_UPDATED = '2026-07-24';

export const IMPRINT_FIELDS: ImprintField[] = [
  { label: 'Denominazione / ragione sociale', value: '[COMPILARE]', source: 'art. 7.1.a' },
  { label: 'Sede legale', value: '[COMPILARE]', source: 'art. 7.1.b' },
  { label: 'Email di contatto', value: '[COMPILARE]', source: 'art. 7.1.c' },
  { label: 'PEC e altri recapiti', value: '[COMPILARE]', source: 'art. 7.1.c' },
  { label: 'Registro Imprese e n. REA', value: '[COMPILARE]', source: 'art. 7.1.d' },
  { label: 'Partita IVA', value: '[COMPILARE]', source: 'art. 7.1.g' },
  { label: 'Prezzi e tariffe del servizio', value: '[COMPILARE]', source: 'art. 7.1.h' },
  { label: 'Capitale sociale', value: '[COMPILARE: se dovuto dalla forma societaria]', source: 'art. 2250 Cod. Civ.' },
];

/**
 * Voci dell'art. 7 non applicabili allo stato attuale. Dichiararle esplicitamente è più onesto che
 * ometterle: chi verifica sa che sono state considerate. Entrambe da confermare con un legale.
 */
export const IMPRINT_NOT_APPLICABLE: ImprintField[] = [
  {
    label: 'Autorità di vigilanza',
    value: 'Non applicabile: attività non soggetta a concessione, licenza o autorizzazione.',
    source: 'art. 7.1.e',
  },
  {
    label: 'Ordine professionale',
    value: 'Non applicabile: attività non regolamentata.',
    source: 'art. 7.1.f',
  },
];
