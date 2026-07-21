import { describe, it, expect, vi } from 'vitest';
import { handleUnauthorized } from './onApiError';
import { ApiError } from './http';

function makeSession(authenticated: boolean) {
  return { authenticated, logout: vi.fn() };
}

function makeRouter(name: string | null, fullPath: string) {
  return { currentRoute: { value: { name, fullPath } }, push: vi.fn() };
}

describe('handleUnauthorized (D-037)', () => {
  it('su 401 con sessione attiva: logout + redirect al login preservando la rotta', () => {
    const session = makeSession(true);
    const router = makeRouter('customers', '/customers/c-1');
    handleUnauthorized(new ApiError(401, '/customers/c-1'), session, router);
    expect(session.logout).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/customers/c-1' } });
  });

  it('su 401 senza sessione (login errato / rehydrate scaduto): no-op, gestione locale', () => {
    const session = makeSession(false);
    const router = makeRouter('login', '/login');
    handleUnauthorized(new ApiError(401, '/auth/login'), session, router);
    expect(session.logout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('su 401 già sulla rotta login: no-op (niente loop di redirect)', () => {
    const session = makeSession(true);
    const router = makeRouter('login', '/login');
    handleUnauthorized(new ApiError(401, '/auth/me'), session, router);
    expect(session.logout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('non aggiunge ?redirect quando la rotta corrente è la home', () => {
    const session = makeSession(true);
    const router = makeRouter('map', '/');
    handleUnauthorized(new ApiError(401, '/map'), session, router);
    expect(router.push).toHaveBeenCalledWith({ name: 'login', query: {} });
  });

  it('ignora gli errori non-401 (es. 409, 500): no-op', () => {
    const session = makeSession(true);
    const router = makeRouter('customers', '/customers');
    handleUnauthorized(new ApiError(409, '/customers'), session, router);
    handleUnauthorized(new ApiError(500, '/customers'), session, router);
    expect(session.logout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('ignora gli errori che non sono ApiError (es. errore di rete)', () => {
    const session = makeSession(true);
    const router = makeRouter('customers', '/customers');
    handleUnauthorized(new Error('Failed to fetch'), session, router);
    expect(session.logout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
