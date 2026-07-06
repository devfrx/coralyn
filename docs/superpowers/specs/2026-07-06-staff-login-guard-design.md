# Spec — D-045: web-staff rifiuta il login dei superuser (+ copertura Sidebar nome stabilimento)

> Design **CONFERMATO** con l'utente (2026-07-06, filone "rendile vere" §3.4 = D-045). Slice **FE-only** (solo web-staff).
> Include un piccolo test che chiude un buco di copertura della slice "Nome stabilimento" (#3).

---

## 1. Contesto e problema

`web-staff` (gestionale di stabilimento, :8080) **non filtra il ruolo** al login: un **superuser di piattaforma** ha
credenziali valide e oggi otterrebbe una sessione qui, mentre la sua superficie corretta è **web-platform** (:8081). La
`web-platform` fa già il filtro **inverso** ([stores/session.ts:17,31](../../../apps/web-platform/src/stores/session.ts)):
rifiuta i non-superuser al login e in rehydrate. D-045 chiede il mirroring su web-staff.

Inoltre, la slice #3 ("Nome stabilimento") ha reso `session.establishmentName` un computed dalla sessione mostrato in
[Sidebar.vue:31](../../../apps/web-staff/src/app/Sidebar.vue), ma **nessun test** verifica che la Sidebar lo renderizzi
(la copertura si ferma allo store): se il binding si rompesse, niente lo coglierebbe.

## 2. Decisioni (CONFERMATE)

1. **`login` (web-staff):** dopo `/auth/login`, se `res.user.role === Role.Superuser` → `throw new Error(...)` **PRIMA** di
   `setToken`/`user.value` (nessun token persistito, nessuna sessione). Mirroring inverso di web-platform.
2. **`rehydrate` (web-staff):** se `/auth/me` ritorna `role === Role.Superuser` → `logout()` e ritorno (difesa in profondità
   contro un token superuser iniettato).
3. **`LoginView` invariato:** il `catch` mostra già il generico "Email o password non corretti"
   ([LoginView.vue:23-24](../../../apps/web-staff/src/features/auth/LoginView.vue)). Lo teniamo **generico di proposito**:
   non confermare che le credenziali del superuser sono valide (nessun oracolo/leak). Scelta di sicurezza, non pigrizia.
4. **Copertura Sidebar (chiude il buco di #3):** nuovo `Sidebar.spec.ts` che monta la Sidebar con una sessione valorizzata e
   asserisce che il banner mostra `session.establishmentName`.

## 3. Impatto per file

- **Modifica** `apps/web-staff/src/stores/session.ts`: guard di ruolo in `login` (throw pre-token) e `rehydrate` (logout se
  superuser). `Role` è già importato.
- **Test** `apps/web-staff/src/stores/session.spec.ts`: +2 casi — login superuser → `rejects`, nessun token, non
  autenticato; rehydrate con token superuser → logout, non autenticato. Usare **MSW `server.use`** (auto-reset via
  `test/setup.ts afterEach`) per far tornare a `/auth/login`/`/auth/me` un utente superuser.
- **Test (nuovo)** `apps/web-staff/src/app/Sidebar.spec.ts`: monta Sidebar via `mountApp`, valorizza `session.user` con un
  utente che ha `establishmentName`, asserisce che il testo del banner contiene quel nome (e, per reattività, che riflette un
  nome diverso). Nessuna modifica a `Sidebar.vue`.

## 4. Test / verifica
- web-staff: `--filter web-staff test` (baseline **253** → ~**257**: +2 session, +2 Sidebar) + `... typecheck` EXIT 0.
- web-platform: invariato (**16**); nessuna modifica.
- Nessun backend, nessun contract, nessun e2e.

## 5. Fuori scope
- Messaggio dedicato in LoginView (scelta: generico per sicurezza). Nessuna modifica a web-platform. Nessun cambio API.

## 6. Baseline (LIVE su `main` post "Nome stabilimento")
web-staff **253** · web-platform **16** · api unit **200** · api e2e **235** · typecheck pulito.
