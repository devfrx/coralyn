# Handoff / Delega — Stabilimento overview FATTO (su `main`) · prossimo: COMPLETARE la sezione Stabilimento

> Documento di consegna per la **prossima sessione/macchina**. **Supera** l'handoff
> [2026-07-04-report-done-e-prossimi.md](2026-07-04-report-done-e-prossimi.md) (il cui "prossimo passo" — lo
> **Stabilimento** — è ora **fatto e su `main`** nella sua parte *overview read-only*). Workflow
> **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice creativo → mock/spec →
> RISOLVI le decisioni con l'utente (brainstorming) → **piano TDD** (`superpowers:writing-plans`) → esecuzione
> **subagent-driven, un commit per layer, test-first** → review a due stadi → **DOPO ogni slice: presenta e attendi conferma.**

---

## 0. Situazione GIT (all'avvio fai il sync §9; fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main`** (push effettuato) con lo **Stabilimento overview** (FF da `e94ff4d` a `6233032`). Working
  tree pulito, **nessun branch di lavoro locale aperto**.
- **Nessuna migrazione pendente.** Prossimo **ADR libero: 0039**. Prossimo **D libero: D-038** (D-037 appena creato).
- ⚠️ **`origin/feat/scheda-cliente-360`** è un branch remoto storico molto indietro (tutto su main). Prune remoto
  **opzionale**, richiede ok esplicito dell'utente.
- ⚠️ **Push su `main` richiede ok ESPLICITO dell'utente** (il classifier blocca il push sul default branch senza
  autorizzazione chiara).

## 1. Stato attuale — cosa è su `main` (sessione 2026-07-04, 2ª parte)
**Slice «Stabilimento overview» (read-only), subagent-driven, un commit per layer, review a due stadi:**
- **Backend:** `GET /api/establishment/overview` — nuovo `apps/api/src/establishment/` (`EstablishmentModule`,
  `EstablishmentController`, `EstablishmentService`, **projection pura** `establishment.projection.ts`). Tenant-scoped
  via `forTenant`, **read-only**, **nessuna migrazione**. Compone: nome stabilimento · **stagione attiva** (quella che
  **contiene oggi** `todayInRome()`, altrimenti `null`) · fasce operative (`TimeSlot[]` per `sortOrder`) · conteggi
  struttura (settori/ombrelloni/tipologie/**pacchetti non archiviati**) · **team** (utenti del tenant, **superuser
  escluso**, admin-first). ⚠️ **Correttezza:** `User` **non ha RLS** → il team è filtrato **esplicitamente** con
  `where: { establishmentId }` (non affidarsi a `forTenant` per gli utenti).
- **DTO:** `EstablishmentOverviewDTO` + `EstablishmentMemberDTO` in `packages/contracts/src/index.ts` (additivo).
- **FE:** `EstablishmentView.vue` dal mock a dati reali (composable `useEstablishmentOverview`, pattern `useReport`).
  4 card in lettura + card *Sessione* (logout reale). "Tu" marcato sul **FE** (`session.userEmail === member.email`).
  Azioni **`Modifica` / `Configura` / `Inviti e gestione`** = **disabilitate + "in arrivo"** (`Badge tone="soon"`).
  Empty-state stagione (`null` → "Nessuna stagione attiva") e stato d'errore.
- **Effetto collaterale positivo:** l'endpoint espone finalmente il **nome reale** dello stabilimento (prima il session
  store lo teneva hardcoded `'Lido Maestrale'`). ⚠️ **La nav header sinistra usa ancora il default hardcoded** finché
  `/auth/me` non espone il nome — vedi §8.
- **Config test:** `apps/web-staff/vitest.config.ts` ora passa `transformAssetUrls: false` al plugin Vue — su
  **Node 24/Windows** la pipeline di transform di vitest rompeva su `<img src="/…">` assoluti (test-only; dev/build
  invariati). Se monti direttamente un componente con un `<img src="/…">`, questo è il motivo.
- **Verificato LIVE** (Docker `--build api web`): endpoint 200, schermata reale (`Lido di Sviluppo · Estate 2026 ·
  1 mag – 30 set · Mattina·Pomeriggio·Giornata Intera · 2/34/2/1`, team con "Tu"), 0 errori console.

**Spec/piano:** [spec](../superpowers/specs/2026-07-04-stabilimento-overview-design.md) ·
[piano TDD](../superpowers/plans/2026-07-04-stabilimento-overview.md).

**Test (verificati fine sessione):** ui-kit **70** · web-staff **183** · api unit **122** · api e2e **169** · typecheck pulito.

## 2. IL PROSSIMO PASSO — COMPLETARE la sezione Stabilimento (decisione utente 2026-07-04)
L'utente ha scelto di **concludere lo Stabilimento** (invece di passare subito a D-024/D-012), completandolo "**almeno
per ora con ciò che manca**". I pezzi rimasti (oggi affordance "in arrivo") hanno **taglie molto diverse** → lo scope
va **deciso con l'utente** (brainstorming) prima di implementare:
- **`Modifica` stabilimento** — l'entità `Establishment` ha **solo `name`**: "Modifica" = essenzialmente **rinominare
  il lido** (write piccola: `PATCH /establishment` + editor inline/modale). Stagioni e fasce hanno **già** i loro editor
  nel catalogo (`seasons`/`time-slots`, area Listino) — valutare se linkarli o duplicarli.
- **`Configura` struttura** — settori/righe/ombrelloni/tipologie = la struttura mappa. Editarli tocca la **planimetria**
  = **[D-005](../architecture/deferred.md)** (deferito, grande) + CRUD settori/tipologie. **Slice grande**, non
  "completamento minore".
- **`Inviti e gestione` utenti** — **[D-025](../architecture/deferred.md)** (RBAC: gestione utenti staff + inviti
  [ADR-0028](../architecture/decisions/0028-provisioning-tenant.md) + role-guard sugli endpoint). Sottosistema di
  **sicurezza** a sé — mezza-implementazione = debito (vedi rationale spec §2).

**Raccomandazione (rubrica ADR-0002: professionale, zero-debito, non pigra):** il "completamento a basso rischio" è
**`Modifica` (rinomina stabilimento)** come write pulita; `Configura`=D-005 e `Utenti`=D-025 restano sottosistemi
grandi da NON innestare qui a metà. **Prima azione:** brainstorming per fissare con l'utente cosa entra in "completare
per ora" (probabilmente Modifica + eventuale gestione utenti minima), poi spec → piano TDD → subagent-driven.

## 3. Come VEDERE i mock (React SPA "Bundled Page", una schermata alla volta)
`docs/design/mockups/gestionale-lidi-aspirazionale.html` (~625KB, **NON leggerlo raw**). Config **`mockups`** in
`.claude/launch.json` (`python -m http.server 8090`): `preview_start` "mockups" → naviga a
`http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`. Per lo Stabilimento: i click sintetici
**non** triggerano gli handler React → usa `preview_eval` invocando l'`onClick` del fiber
(`el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))].onClick(...)`) sul selettore stabilimento
("Lido Maestrale / Stagione 2026"). Misura i valori con `getComputedStyle`, **mappa sui token, non copiare hex**.

## 4. Le schermate del mock — stato reale del FE
- **Mappa** · **Prenotazioni** (A1/A2/A3) · **Clienti** + **Scheda cliente 360°** · **Listino** (D-032) · **Report** ·
  **Rinnovi** (D-011) — tutte **reali**.
- **Stabilimento** — **overview read-only reale** (questo slice); mancano le **scritture** `Modifica`/`Configura`
  (D-005)/`Inviti` (D-025) → §2.
- **Auth/landing** — reali (registrazione self-service = D-002 **rifiutata**; provisioning = fornitore+inviti ADR-0028).

## 5. D-0xx aperti (registro [`deferred.md`](../architecture/deferred.md)) — i più rilevanti ora
Conferma sempre la scelta con l'utente prima di partire.
- **D-025 — Gestione utenti & RBAC** — sblocca `Inviti e gestione` dello Stabilimento (§2). *Overview read-only già
  consegnato; gestione ancora deferita.*
- **D-005 — Editor planimetrico libero** — sblocca `Configura` struttura (§2).
- **D-037 — Gestione globale del `401` FE** (NUOVO, 2026-07-04) — interceptor unico → logout + redirect `/login` su
  token scaduto, invece del banner d'errore per-view. App-wide, pre-esistente; lega a D-026. **Bassa** (UX, non rischio).
- **D-024 — GDPR cliente** (soft-delete/anonimizzazione) · **D-012 — Cabine/servizi accessori** (slice grande) ·
  **D-035 — Canale cliente + "assenze comunicate"** (visione grande) · **D-036 — Report avanzato**.

## 6. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/`**: dopo modifiche a `packages/contracts/src/index.ts` →
  `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test/e2e api.
- **Container dev stale = 404** sui nuovi endpoint → dopo cambi BE: `docker compose --profile full up -d --build api web`.
- ⚠️ **Sessione FE scaduta ≠ bug** (successo 2026-07-04): a **token JWT scaduto** (8h) + navigazione **client-side**, le
  view mostrano il **banner d'errore** invece di redirigere al login (`rehydrate`/`/auth/me` gira solo al reload). Fix =
  **re-login**. Causa strutturale tracciata in **D-037**. Prima di gridare al bug su una schermata "vuota/errore",
  verifica lo **status della richiesta**: `curl` con token fresco (login `admin@coralyn.dev`/`coralyn-admin-8473`) →
  se **200**, è la sessione del browser, non il codice.
- **`User` NON ha RLS** ([ADR-0026](../architecture/decisions/0026-identita-rls-utente.md)): query sugli utenti dentro
  `forTenant` vanno filtrate **esplicitamente** per `establishmentId`.
- **ECharts + jsdom:** i test dei grafici stubbano `VChart` (vedi ReportView.spec). Replica il pattern se aggiungi grafici.
- **Vitest su Node 24/Windows + `<img src="/…">`:** `transformAssetUrls: false` in `vitest.config.ts` (vedi §1).
- ⚠️ **`seed.ts` fa UPSERT dell'admin**: lancialo **sempre** con `DEV_ADMIN_PASSWORD=coralyn-admin-8473` (altrimenti
  resetta la password al default e rompe il login atteso).
- **Tool Bash su Windows** (Git Bash/POSIX): niente here-string PowerShell `@'…'@`; commit multi-riga con `git commit -F -`
  + heredoc. La cwd del Bash tool **persiste** (usa path assoluti).
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.
- **`.env`/`.env.test` alla ROOT** (gitignored) → `coralyn_*`. DB host `5433`; API `localhost:3000/api`; web Docker
  `localhost:8080` (build da working tree); dev Vite `5173` (proxy `/api` → `localhost:3000`); login
  `admin@coralyn.dev` / `coralyn-admin-8473`.

## 7. Ancore di codice (VERIFICATE 2026-07-04)
- **Stabilimento:** [`apps/api/src/establishment/`](../../apps/api/src/establishment/) (`establishment.controller.ts`,
  `establishment.service.ts`, `establishment.projection.ts`); e2e
  [`apps/api/test/establishment.e2e-spec.ts`](../../apps/api/test/establishment.e2e-spec.ts); FE
  [`apps/web-staff/src/features/establishment/`](../../apps/web-staff/src/features/establishment/)
  (`EstablishmentView.vue`, `useEstablishment.ts`); DTO in
  [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) (`EstablishmentOverviewDTO`).
- **Per completare (§2):** entità [`Establishment`](../../apps/api/prisma/schema.prisma) (solo `name`); identità/utenti
  [`apps/api/src/identity/`](../../apps/api/src/identity/) (per D-025); struttura mappa
  [`apps/api/src/map/`](../../apps/api/src/map/) (per D-005/`Configura`); catalogo stagioni/fasce
  [`apps/api/src/catalog/`](../../apps/api/src/catalog/).
- **Riuso:** `prisma.forTenant`, `TenantContext.require()`, `todayInRome()` ([`common/dates`](../../apps/api/src/common/)),
  ui-kit `Card`/`StatTile`/`Badge`/`Avatar`/`Button`/`Icon`; FE `queryResource` +
  [`queryKeys.ts`](../../apps/web-staff/src/lib/queryKeys.ts).

## 8. Follow-up minori tracciati (non bloccanti)
- **`/auth/me` non espone il nome stabilimento** → la **nav header** resta sul default hardcoded `'Lido Maestrale'`
  mentre la pagina Stabilimento usa il nome reale. Fix naturale quando si tocca `/me` o D-025 (aggiungere il nome allo
  `UserDTO`/al payload di sessione, e alimentare `session.establishmentName`).
- **D-037** (401 → redirect login) — tracciato in `deferred.md`.
- **`initials` team = `email.slice(0,2)`** (solo email disponibile lato overview) — accettabile; se in futuro il team
  porta un nome, usare le iniziali del nome.

## 9. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Per uno slice creativo:
`superpowers:brainstorming` (mock + decisioni) → `superpowers:writing-plans` (piano TDD) →
`superpowers:subagent-driven-development` (implementer NON annida + review a due stadi, un commit per layer) → review
finale → **presenta e attendi conferma**. Merge su `main` = FF, **con ok esplicito dell'utente**. ⚠️ Rebuild container
prima di testare in dev.

## 10. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: `main` = `origin/main` con lo **Stabilimento overview** (read-only) FATTO e pushato: endpoint
> `GET /api/establishment/overview` (proiezione pura tenant-scoped: nome · stagione-attiva=copre-oggi|null · fasce ·
> conteggi struttura · team senza superuser) + `EstablishmentView` reale (4 card in lettura, "Tu", azioni "in arrivo",
> card Sessione). Verde: ui-kit 70 · web-staff 183 · api unit 122 · api e2e 169 · typecheck pulito. ADR fino 0038 (prox
> 0039); **D libero D-038** (D-037 = gestione globale 401 FE, appena tracciato).
>
> MACCHINA: SEMPRE `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. ⚠️ Rebuild
> container prima di testare in dev: `docker compose --profile full up -d --build api web` (stale = 404). ⚠️ `seed.ts`
> con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`. DB `localhost:5433`; login `admin@coralyn.dev` / `coralyn-admin-8473`;
> web Docker `localhost:8080`. Push su `main` solo con mio ok esplicito. ⚠️ Se una schermata appare vuota/in-errore in
> dev, verifica prima che **non** sia la **sessione scaduta** (re-login; D-037), non il codice.
>
> PRIMA COSA (ADR-0009): leggi questo handoff `docs/handoff/2026-07-04-stabilimento-overview-done-e-completare.md`
> (stato §1, prossimo §2, mock §3, schermate §4, D-0xx §5, gotcha §6, ancore §7, follow-up §8).
>
> TASK: **COMPLETARE la sezione Stabilimento** (decisione mia: invece di D-024/D-012, chiudiamo prima lo Stabilimento
> "almeno per ora con ciò che manca"). I pezzi mancanti hanno taglie diverse: `Modifica` (rinomina lido = write
> piccola), `Configura` struttura (= D-005, grande), `Inviti/gestione utenti` (= D-025 RBAC, sicurezza). Fai
> brainstorming con me per fissare lo scope del "completamento per ora" (probabile: Modifica + eventuale gestione utenti
> minima), poi spec → piano TDD → subagent-driven. DOPO ogni slice: presentami lo stato e attendi conferma.
