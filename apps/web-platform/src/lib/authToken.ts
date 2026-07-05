// Chiave DISTINTA da web-staff (coralyn.auth.token) per non collidere sullo stesso origin.
export const TOKEN_KEY = 'coralyn.platform.auth.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
