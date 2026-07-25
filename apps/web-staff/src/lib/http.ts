import { createApiFetch } from '@coralyn/data-layer';
import { getToken } from './authToken';

/** Composizione per web-staff: la sola cosa che questa app aggiunge al data-layer condiviso è
 *  DOVE sta il suo token (chiave `coralyn.auth.token`, distinta da quelle delle altre app).
 *  `ApiError` si importa da `@coralyn/data-layer`, non da qui: ridichiararne una locale
 *  romperebbe in silenzio gli `instanceof` di `handleUnauthorized` (ADR-0058 §1). */
export const apiFetch = createApiFetch(getToken);
