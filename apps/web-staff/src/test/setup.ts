import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { clearToasts, registerIconCatalog } from '@coralyn/ui-kit';
import { lucideCatalog } from '@coralyn/ui-kit/icons/lucide';
import { server, resetCustomersSeed, resetPricingSeed, resetCampaignSeed, resetCustomerBookingsSeed, resetRentalsSeed, resetDayRentalsSeed } from '@/mocks/server';

// Vitest carica SOLO i `setupFiles`, mai `main.ts`: senza questa stessa registrazione l'IconPicker
// girerebbe a catalogo vuoto in ogni test, e la griglia icone sarebbe sempre vuota in silenzio.
registerIconCatalog(lucideCatalog);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); resetCampaignSeed(); resetCustomerBookingsSeed(); resetRentalsSeed(); resetDayRentalsSeed(); clearToasts(); });
afterEach(() => { server.resetHandlers(); document.body.innerHTML = ''; });
afterAll(() => server.close());

// reka-ui (Select/Popover): jsdom non implementa ResizeObserver né le pointer-capture API.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
