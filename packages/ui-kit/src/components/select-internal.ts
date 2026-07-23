/** Sentinella interna per il valore vuoto: reka-ui vieta SelectItem value="" (SelectItem.js:89),
 *  ma i consumatori usano '' come stato reale («Scegli…», «Tutte»). Select e Option mappano
 *  ''↔sentinella ai due bordi; la sentinella non esce mai da ui-kit. */
export const SELECT_EMPTY = '__uikit-select-empty__';
