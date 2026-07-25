import type { InjectionKey } from 'vue';

/**
 * Id dell'etichetta pubblicata da `Field`, per i controlli che un `<label>` NON riesce a etichettare.
 *
 * Perché serve (AUD-013, WCAG 4.1.2): `Field` avvolge il controllo in un `<label>`, e per `<input>`
 * e `<textarea>` è sufficiente — l'associazione è nativa. Ma `Select` rende un
 * `<button role="combobox">`, e un `<button>` **non è un labelable element**: il `<label>` che lo
 * avvolge non gli dà alcun nome accessibile. Lo screen reader annuncia il VALORE selezionato e mai
 * l'etichetta, su tutte e 32 le combobox del prodotto — «Mattina» invece di «Fascia oraria, Mattina».
 *
 * Il contesto è opzionale di proposito: un `Select` fuori da un `Field` continua a funzionare e usa
 * l'`aria-label` che gli passa il chiamante.
 */
export const FIELD_LABEL_ID: InjectionKey<string> = Symbol('coralyn.field.labelId');
