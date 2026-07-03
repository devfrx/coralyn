import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, resetCustomersSeed, resetPricingSeed, resetCampaignSeed, resetCustomerBookingsSeed } from '@/mocks/server';
import { clearToasts } from '@/lib/toasts';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); resetCampaignSeed(); resetCustomerBookingsSeed(); clearToasts(); });
afterEach(() => { server.resetHandlers(); document.body.innerHTML = ''; });
afterAll(() => server.close());
