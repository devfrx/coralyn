import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, resetCustomersSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetCustomersSeed());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
