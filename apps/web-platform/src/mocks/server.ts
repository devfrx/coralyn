import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
export { resetPlatformSeed, MOCK_TOKEN, MOCK_SUPERUSER } from './handlers';
