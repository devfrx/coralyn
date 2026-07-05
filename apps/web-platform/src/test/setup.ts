import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server, resetPlatformSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetPlatformSeed());
afterEach(() => { server.resetHandlers(); document.body.innerHTML = ''; });
afterAll(() => server.close());
