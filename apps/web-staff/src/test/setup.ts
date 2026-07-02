import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, resetCustomersSeed, resetPricingSeed, resetCampaignSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); resetCampaignSeed(); });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
