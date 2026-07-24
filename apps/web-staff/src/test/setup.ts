import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, resetCustomersSeed, resetPricingSeed, resetCampaignSeed, resetCustomerBookingsSeed, resetRentalsSeed, resetDayRentalsSeed } from '@/mocks/server';
import { clearToasts } from '@/lib/toasts';

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
