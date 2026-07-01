# Handoff / Delega — Astrazione componenti frontend (da eseguire nella PROSSIMA sessione)

> Documento di consegna. Il **design è pronto e approvato** (spec + ADR-0033 + piano); l'**esecuzione
> è delegata alla sessione successiva**. Questo handoff dice al prossimo agente cosa leggere, cosa fare,
> i vincoli, e — dopo il refactor — come riprendere la roadmap.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + **tutti** gli ADR, in
> particolare il nuovo [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) e
> [ADR-0017](../architecture/decisions/0017-design-system-frontend.md)/[0018](../architecture/decisions/0018-linguaggio-visivo.md)/[0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)),
> tutte le `docs/specs/` (in particolare
> [2026-07-01-frontend-abstraction-design.md](../specs/2026-07-01-frontend-abstraction-design.md)),
> tutte le `docs/design/` (**inclusi i mock** `docs/design/mockups/*.html` — sono la fonte di verità
> dello stile), tutti i `docs/plans/` (in particolare
> [2026-07-01-frontend-abstraction.md](../plans/2026-07-01-frontend-abstraction.md)) e i `docs/handoff/`.
> Più `README.md` di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **`origin/main`** contiene, al momento della consegna: **A4.2 (rinnovo + anzianità)** mergiata + il
  **fix di review A4.2** + il **chore MSW dev** (service worker MSW rimosso in dev) + i **documenti di
  design di questo refactor** (ADR-0033, spec, piano, questo handoff). **Working tree pulito, nessun
  branch pendente da mergiare** — i doc sono già su `main`.
- **Nessuna migrazione**, nessun cambio di codice applicativo: questa sessione ha prodotto solo design docs.

## 1. Cosa ha prodotto questa sessione

1. **A4.2 completata, revisionata (giro `/code-review` high), mergiata FF e pushata** —
   `POST /bookings/:id/renew`, `GET /bookings/subscriptions`, anzianità derivata, vista FE Rinnovi,
   seed 2ª stagione 2027. Increment A4 **completo**.
2. **Fix dev MSW** (chore) mergiato: in dev non si registra più il service worker MSW (causava un
   errore di passthrough sulle navigazioni SPA).
3. **Design del refactor "astrazione viste"**: [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md),
   [spec](../specs/2026-07-01-frontend-abstraction-design.md), [piano TDD](../plans/2026-07-01-frontend-abstraction.md).

## 2. IL TASK della prossima sessione — eseguire il refactor

**Eseguire il piano** [docs/plans/2026-07-01-frontend-abstraction.md](../plans/2026-07-01-frontend-abstraction.md)
task-by-task. Il piano è già scritto e pronto; il codice è congelato dalla consegna, quindi il piano
non è invecchiato. Usa `superpowers:subagent-driven-development` (o `executing-plans`), come è stato
fatto per A4.2. Parti da un **NUOVO branch da `main`**.

**Obiettivo:** estrarre componenti/utility/composable riutilizzabili dalle viste `web-staff`
(scope **massimale**: include `DataTable` data-driven e factory dei composable), collocandoli secondo
[ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) (`ui-kit` generico vs
`web-staff/lib` di dominio).

### ⚠️ Vincolo ferreo — ZERO regressione visiva
Le viste — **incluse quelle ancora mock** (`PricingView`, ecc.) — devono restare **pixel-identiche** e
continuare a seguire i mock (`docs/design/mockups/*.html` + `packages/ui-kit/src/styles/theme.css`).
L'estrazione è **puramente strutturale**: i componenti emettono **le identiche classi Tailwind/DOM**
di ora (copiare verbatim, non riscrivere). Verifica obbligatoria per ogni vista adottata:
1. spec di vista esistente **verde**;
2. **screenshot before/after** con gli strumenti di preview (`preview_start` sul dev server,
   `preview_screenshot`, `preview_inspect`) — nessuna differenza visiva.

## 3. Confini e scope (dettaglio nella spec §2–§6)
- **`ui-kit`** (generico, nessun dominio/dati): `EmptyState`, `Select`, `ModalFooter`, `PageToolbar`,
  `DataTable` potenziato (retro-compatibile), util `formatEuro`/`initials`/`dateRange`.
- **`web-staff/lib`** (dominio): `useEntityLabels`, `statusMaps`, `useQueryResource` (factory —
  ridurre lo scope se offusca, spec §5.3).
- **Fuori scope:** ridisegno visivo, nuovi endpoint/dati per le viste mock, nuove funzionalità, i18n.
- **Assorbe** il follow-up "cleanup #2" della review A4.2 (dedup `customerName`/`umbrellaLabel`/`initials`).

## 4. Insidie note (gotcha)
- **`corepack pnpm`** (pin 11.9.0). Dopo modifiche a `ui-kit`: `corepack pnpm --filter @coralyn/ui-kit build`
  prima che `web-staff` consumi i nuovi export, e **pulire `apps/web-staff/node_modules/.vite`** se i
  tipi/export risultano stale.
- **Verifica visiva:** usa gli strumenti `preview_*` (dev FE su :5173, `corepack pnpm --filter
  @coralyn/web-staff dev`). Login dev `admin@coralyn.dev` / `coralyn-admin-8473` (serve il backend:
  `docker compose --profile full up -d --build api`, DB su **5433**).
- **Test da non regredire:** ui-kit **14** · web-staff **47** (post-A4.2), + i nuovi spec di
  componenti/util/composable. `pnpm -r build` + `eslint .` verdi.
- **Retro-compatibilità `DataTable`:** l'API a slot corpo attuale deve continuare a funzionare; adozione
  **incrementale** (una commit per vista). Se una vista ha celle troppo particolari, può restare
  sull'API a slot (non è obbligatorio migrare tutto).
- **`ValidationPipe`/whitelist, porta 5433, `prisma db seed`**: gotcha backend storici — non pertinenti
  a questo refactor (solo FE), ma validi se toccherai il backend nello slice successivo.

## 5. DOPO il refactor — riprendere la roadmap
Concluso il refactor (merge FF su `main`), **riprendere "quello che stavamo facendo prima"**: il prossimo
slice di dominio. Opzioni aperte (handoff A4.2 §6):
- **D-032** — Editor CRUD del listino (`Season`/`Pricing`/`Rate`/`Package` da form; retira anche il mock
  statico di `PricingView`). Ora che l'astrazione FE è pronta, l'editor riusa i componenti condivisi.
- **D-011** — Prelazione abbonamenti (finestre/scadenze/priorità per anzianità), che estende A4.2.

Presentare pro/contro + raccomandazione di scope e attendere conferma (workflow [ADR-0009]).

## 6. Stato test da preservare
ui-kit **14** · web-staff **47** · api unit **68** · api e2e **73** · `pnpm -r build` + `eslint .` verdi.
Prossimo ADR libero: **0034**. Decisioni rimandate rilevanti aperte: D-032, D-011, D-012, D-013, D-009,
D-018, D-025, D-030, D-033.

## 7. Macchina "zagor" / "Jays" (sync)
All'avvio la working copy può essere su un branch vecchio con ref `origin` stantii. Esegui SEMPRE
`git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di fidarti
del tree o creare un branch. Path: `C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new`
(Jays). La fix MSW è ora **committata e pushata** (non più solo nel working tree), quindi è presente su
entrambe le macchine dopo il fetch/ff.

---

## 8. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina può essere
> C:\Users\Jays\Desktop\new).
>
> STATO: A4.2 (rinnovo + anzianità) è COMPLETA, mergiata FF su main e pushata; increment A4 completo.
> È stato anche mergiato un chore che rimuove il service worker MSW in dev. origin/main contiene già
> A4.2 completo + il design di questo refactor (ADR-0033, spec, piano, handoff): nessun branch pendente.
>
> MACCHINA: all'avvio esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge
> --ff-only origin/main` prima di fidarti del tree o creare un branch.
>
> PRIMA COSA (ADR-0009): leggi per intero TUTTA la documentazione. In particolare l'handoff
> `docs/handoff/2026-07-01-frontend-abstraction-delegation.md`, poi `docs/architecture/` (README +
> glossary + deferred + TUTTI gli ADR, specialmente il nuovo 0033 e 0017/0018/0027), i mock
> `docs/design/mockups/*.html` (fonte di verità dello stile), la spec
> `docs/specs/2026-07-01-frontend-abstraction-design.md` e il piano
> `docs/plans/2026-07-01-frontend-abstraction.md`.
>
> TASK: esegui il piano di astrazione dei componenti frontend (scope massimale) task-by-task
> (subagent-driven), partendo da un NUOVO branch da main. VINCOLO FERREO: **zero regressione visiva** —
> le viste (anche quelle mock) restano pixel-identiche e seguono i mock; estrazione solo strutturale
> (classi copiate verbatim). Verifica ogni vista con spec verde + screenshot before/after via preview_*.
> Non regredire i conteggi test (ui-kit 14 · web-staff 47 · api 68/73).
>
> DOPO il refactor: riprendi la roadmap di dominio — presentami pro/contro + raccomandazione tra
> **D-032** (editor listino) e **D-011** (prelazione abbonamenti), poi attendi la mia conferma
> (workflow ADR-0009: spec → piano → implementazione test-first, commit per layer).
