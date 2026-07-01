import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, resetCustomersSeed, resetPricingSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
