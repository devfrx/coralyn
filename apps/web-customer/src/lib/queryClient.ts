import { QueryClient } from '@tanstack/vue-query';
import { QUERY_DEFAULTS } from '@coralyn/data-layer';

// Niente `createQueryClient`: quella factory aggancia la politica «401 → logout + redirect», che
// qui sarebbe sbagliata. Il canale cliente ha rotazione silenziosa single-flight (ADR-0049) e il
// ritorno all'attivazione lo decide CustomerShell osservando `authenticated`. Condivisa è solo la
// taratura, che era identica nelle tre app.
export const queryClient = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
