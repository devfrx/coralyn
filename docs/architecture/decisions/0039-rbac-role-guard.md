# ADR-0039 — RBAC: role-guard applicativo (`@Roles`/`RolesGuard`)

## Stato
Accettata (2026-07-04).

## Contesto
Finora l'API aveva un solo guard globale (`JwtAuthGuard`, ADR-0024): autenticazione sì,
**autorizzazione per ruolo no**. Le scritture dello Stabilimento (rinomina; poi gestione
utenti, D-025) devono essere **admin-only**. Serviva un primitivo di autorizzazione riusabile.

## Decisione
Introdurre un decoratore `@Roles(...roles: Role[])` (metadato via `SetMetadata`) e un
`RolesGuard` registrato come **secondo `APP_GUARD`** dopo `JwtAuthGuard`. Il guard legge i
ruoli richiesti col `Reflector`; **se assenti passa** (endpoint solo-auth invariati),
altrimenti richiede `req.user.role ∈ roles` (→ `403`). L'ordine di registrazione garantisce
che `req.user` sia già popolato. Il **superuser** (piattaforma) non ha i ruoli tenant → `403`
sulle scritture tenant (la sua console cross-tenant è fuori scope, ADR-0015).

## Conseguenze
- (+) Autorizzazione dichiarativa e riusabile; sblocca D-025 (gestione utenti).
- (+) Zero impatto sugli endpoint esistenti (nessun `@Roles` = comportamento invariato).
- (−) La revoca *immediata* dei permessi su un token già emesso resta legata alla scadenza
  (8h) finché non si affronta la revoca token (D-026).
