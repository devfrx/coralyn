import { createApiFetch } from '@coralyn/data-layer';
import { getToken } from './authToken';

/** Composizione per web-platform: come web-staff, ma sulla chiave di sessione della console
 *  superuser (`coralyn.platform.auth.token`). `ApiError` si importa da `@coralyn/data-layer`. */
export const apiFetch = createApiFetch(getToken);
