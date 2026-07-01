import type { RequestHandler } from 'msw';

// Lista base condivisa. In dev NON montiamo alcun worker MSW nel browser (il FE parla col
// backend reale via proxy Vite); i mock vivono SOLO nei test Node (vedi server.ts), che
// partono da questa lista. Vuota per ora: nessun handler condiviso tra i test.
export const handlers: RequestHandler[] = [];
