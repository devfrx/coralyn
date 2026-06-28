import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server } from '@/mocks/server';
import { resetClientiSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetClientiSeed());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
