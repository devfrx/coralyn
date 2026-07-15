// Chiavi DISTINTE da web-staff (coralyn.auth.token) e web-platform (coralyn.platform.auth.token)
// per non collidere sullo stesso origin (coralyn-dev-preview-env).
export const ACCESS_KEY = 'coralyn.customer.access.token';
export const REFRESH_KEY = 'coralyn.customer.refresh.token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
export function setAccessToken(t: string): void {
  localStorage.setItem(ACCESS_KEY, t);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(t: string): void {
  localStorage.setItem(REFRESH_KEY, t);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
