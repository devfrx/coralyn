import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken, clearToken, TOKEN_KEY } from './authToken';

beforeEach(() => localStorage.clear());

describe('authToken', () => {
  it('setToken persiste e getToken lo rilegge', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc');
  });

  it('clearToken rimuove il token', () => {
    setToken('abc');
    clearToken();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('getToken legge un token gia presente in localStorage', () => {
    localStorage.setItem(TOKEN_KEY, 'xyz');
    expect(getToken()).toBe('xyz');
  });
});
