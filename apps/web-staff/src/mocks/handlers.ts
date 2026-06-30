import type { RequestHandler } from 'msw';

// Dev: nessun mock attivo. Il worker MSW (onUnhandledRequest: 'bypass' in main.ts) lascia
// passare le richieste al backend reale. I mock vivono SOLO nei test (vedi server.ts).
export const handlers: RequestHandler[] = [];
