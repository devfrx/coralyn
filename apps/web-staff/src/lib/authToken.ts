// Holder del JWT di sessione, unica fonte di verità condivisa tra lo store di
// sessione e `apiFetch`. Persistito in localStorage così la sessione sopravvive
// al refresh (poi reidratata via GET /api/auth/me). http.ts non può dipendere dal
// Pinia store (è codice non-componente), perciò passa da qui.
export const TOKEN_KEY = 'coralyn.auth.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
