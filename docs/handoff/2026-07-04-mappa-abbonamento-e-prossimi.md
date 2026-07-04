# Handoff / Delega — Mappa (fix pomeriggio + «Abbonamento») fatta · D-035 · prossimo Report/Stabilimento

> ## ⛔ SUPERATO (2026-07-04, notte) — snapshot storico, NON eseguire il "prossimo passo" qui
> Il **Report cruscotto** (che questo handoff dava come prossimo) è ora **FATTO e su `main`** (ECharts/ADR-0038,
> endpoint `GET /reports/summary`, `ReportView` reale). Handoff autorevole corrente:
> **[2026-07-04-report-done-e-prossimi.md](2026-07-04-report-done-e-prossimi.md)**. Il testo sotto resta come
> fotografia; il prossimo passo reale è **Stabilimento**.

> Documento di consegna per la **prossima sessione/macchina**. **Supera** l'handoff
> [2026-07-03-scheda-cliente-redesign-mock-e-pending.md](2026-07-03-scheda-cliente-redesign-mock-e-pending.md)
> (il cui "prossimo passo" — redesign Scheda cliente, fix mappa, bottoni drawer — è ora **fatto e su `main`**).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice creativo →
> spec/mock → RISOLVI le decisioni con l'utente → **piano TDD** → esecuzione **subagent-driven, un commit per layer,
> test-first**. **DOPO ogni slice: presenta lo stato e attendi conferma.**

---

## 0. Situazione GIT (all'avvio fai il sync §7; fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main` = `9a6c71d`** — tutto pushato, working tree pulito, **nessun branch di lavoro locale aperto**.
- **Nessuna migrazione pendente.** Prossimo **ADR libero: 0038**. Prossimo **D libero: D-036**.
- ⚠️ **Branch remoto `origin/feat/scheda-cliente-360` (`0e86f29`) è 3 commit DIETRO `main`**: tutto il suo lavoro è
  ormai su `main`. Prune remoto **opzionale** (la deletion remota NON è auto-autorizzata dal classifier: serve l'ok utente).
- ⚠️ **Push su `main` richiede ok esplicito dell'utente** (il classifier blocca il push sul default branch senza autorizzazione chiara).

## 1. Stato attuale — cosa è su `main` ORA (mergiato FF in sessione 2026-07-04, in ordine)
- **`0e86f29`** — **Scheda Cliente 360° (funzionale) + REDESIGN visivo**: nel `ui-kit` `SectionCard`+`Callout` nuovi e
  `StatTile` esteso (`tone`/`layout`, retro-compatibile); `CustomerBookingDTO` arricchito con `packageName?`/`sectorName?`
  (join server-side in `listByCustomer`, **nessuna migrazione**); 3 card ridisegnate fedeli al mock. Review whole-branch
  opus: merge=YES, 0 Crit/0 Imp.
- **`121502e`** — **FIX MAPPA §5**: le prenotazioni **pomeridiane** ora sono incassabili/annullabili dalla mappa.
  `open()` auto-seleziona la fascia che HA una prenotazione (prima partiva fissa su Mattina); i box Mattina/Pomeriggio
  sono ora `<button>` cliccabili (`selectSlot`, `aria-pressed`, ring accent) per passare fra le fasce. **Verificato LIVE
  dall'utente.**
- **`eebda7c`** — **docs D-035** (deferred.md), vedi §4.
- **`9a6c71d`** — **bottone «Abbonamento» sulla mappa**: ora è una scorciatoia che apre lo stesso modale "Nuova
  prenotazione" con `type=subscription` **preimpostato** (una sola fonte di verità; bottone e dropdown Tipo convergono).
  `openModal(presetType)` + corretto `@click="openModal"` → `openModal()`. **Nessuna** pre-selezione di fascia (i
  time-slot sono creati dal tenant, nomi/orari arbitrari → non esiste una "giornata intera" canonica). Il bottone
  **«Presenza» è stato RIMOSSO** (vedi §4/D-035). Zero backend (`POST /bookings type=subscription` esiste già), zero migrazione.
- **Test in sessione:** web-staff **170** · ui-kit **65** · api unit **113** · typecheck pulito. ⚠️ **e2e NON ri-eseguiti
  (Docker Desktop era giù)** — vanno rigirati alla prima occasione con Docker su (baseline attesa ~159; i fix mappa sono FE).

## 2. IL PROSSIMO PASSO (ordine utente, mostra i mock una schermata alla volta — §3)
1. **Report** — [`ReportView.vue`](../../apps/web-staff/src/features/report/ReportView.vue) è **mock totale**, nessun
   endpoint d'aggregazione. Il contenuto vero dello slice è **decidere con l'utente quali KPI** esporre (incasso per
   periodo, occupazione, abbonati vs giornalieri, …) + endpoint backend. **Mostra prima il mock Report.**
2. **Stabilimento** — [`EstablishmentView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue)
   è mock; la parte team/config tocca **RBAC = [D-025](../architecture/deferred.md)** (deferito). Primo passo: vista
   minimale read-only.
3. **D-0xx**: **D-024** (GDPR cliente) **o D-012** (cabine/servizi) — **CONFERMA con l'utente**. D-034 deprioritizzato.

## 3. Come VEDERE i mock (React SPA "Bundled Page", una schermata alla volta)
`docs/design/mockups/gestionale-lidi-aspirazionale.html` (~625KB, **NON leggerlo raw**). È in `.claude/launch.json` come
config **`mockups`** (`python -m http.server 8090`): `preview_start` "mockups" → naviga a
`http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`. Mostra una schermata alla volta (nav via
sidebar; per sotto-schermate clicca una riga — usa `preview_eval`+`document.elementFromPoint` se i click sintetici non
triggerano gli handler React). Screenshot con `preview_screenshot`; misura i valori con `getComputedStyle` e **mappa su
token, non copiare hex**.

## 4. D-035 — servizio clienti parallelo + "assenze comunicate" (nota di visione)
Registrato in [`deferred.md`](../architecture/deferred.md). In un lido a **prevalenza abbonati** la "presenza" non è
catturabile dall'operatore (appello a 200-300 = utopico) né deducibile (l'abbonato non avvisa se salta un giorno) → per
questo «Presenza» è stato **rimosso** dalla mappa. Il dato può arrivare solo dal **cliente**: clausola **opt-in
"assenze comunicate"** al momento dell'abbonamento; se accettata, il cliente segnala dal proprio dispositivo (anche in
anticipo) di essere sicuro di non esserci in una fascia+giorno; **solo allora** l'operatore può rivendere quella fascia.
**Invariante:** nessuna presunzione d'assenza senza segnalazione esplicita. Sblocca la rivendita del posto abbonato
liberato senza fare presenze a mano; richiede un canale cliente separato (oggi inesistente).

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/`**; `apps/api` consuma il **buildato**. Dopo ogni modifica a
  `packages/contracts/src/index.ts`: `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api (o errori
  fuorvianti tipo-mancante). web-staff invece risolve i sorgenti via vite.
- **`coralyn_test` può essere stale** → `cd apps/api; DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy` (poi `prisma generate`).
- **Docker Desktop può essere giù**: gli e2e e la **mappa in dev** (che colpisce il backend reale, non MSW) richiedono
  DB su **5433** + container. Dopo cambi BE: `docker compose --profile full up -d --build api web` (container stale = 404
  = "card/mappa vuote").
- **Bash tool su Windows persiste la cwd** tra chiamate: usa path assoluti o resetta `cd /c/Users/Jays/Desktop/new`.
- **NON usare here-string PowerShell (`@'…'@`) nel tool Bash** (è POSIX sh → parse error / messaggio corrotto). Per
  messaggi commit multi-riga: scrivi un file e `git commit -F file`.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.
  Ricorda: **web-staff globa le spec di ui-kit** (i test ui-kit contano sia standalone sia dentro web-staff).
- **`.env`/`.env.test` alla ROOT** (gitignored) → `coralyn_*`. Login dev `admin@coralyn.dev` / `coralyn-admin-8473`;
  API `localhost:3000/api` (health `/health`); web `8080`; DB host `5433`.

## 6. Ancore di codice (VERIFICATE 2026-07-04)
- **Mappa:** [`MapView.vue`](../../apps/web-staff/src/features/map/MapView.vue) (`open()` con auto-select fascia;
  `openModal(presetType)`; `selectedSlotId`; box fasce cliccabili; bottone «Abbonamento») + [`MapView.spec.ts`](../../apps/web-staff/src/features/map/MapView.spec.ts).
- **Scheda cliente:** [`CustomerDetailView.vue`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue) +
  `CustomerHistoryCard`/`CustomerSubscriptionsCard`/`CustomerPaymentsCard`; [`useCustomers.ts`](../../apps/web-staff/src/features/customers/useCustomers.ts).
- **ui-kit:** `SectionCard.vue`/`Callout.vue`/`StatTile.vue` in [`packages/ui-kit/src/components`](../../packages/ui-kit/src/components); export in [`index.ts`](../../packages/ui-kit/src/index.ts).
- **Contracts/BE:** [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) `CustomerBookingDTO`;
  [`bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts) `listByCustomer`; [`customer-booking.projection.ts`](../../apps/api/src/bookings/customer-booking.projection.ts).
- **Prossimi slice:** [`ReportView.vue`](../../apps/web-staff/src/features/report/ReportView.vue) (mock);
  [`EstablishmentView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue) (mock).

## 7. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Per uno slice creativo: mock →
brainstorming/decisioni con l'utente → piano TDD (`superpowers:writing-plans`) → esecuzione subagent-driven (implementer
NON annida) un commit per layer → review → **DOPO presenta lo stato e attendi conferma**. Merge su `main` = FF, **con ok
esplicito dell'utente**.

## 8. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: `main` = `origin/main` = `9a6c71d`, tutto pushato. In sessione 2026-07-04 sono stati mergiati FF su `main`:
> Scheda Cliente 360° + redesign visivo (SectionCard/Callout/StatTile nel ui-kit + packageName/sectorName sul DTO),
> **fix mappa** (prenotazioni pomeridiane incassabili/annullabili), bottone **«Abbonamento»** collegato (apre il modale
> su type=subscription), **«Presenza» rimosso** (vedi D-035). Test: web-staff 170 · ui-kit 65 · api unit 113 · typecheck
> pulito (e2e NON ri-eseguiti, Docker era giù). ADR fino 0037 (prox 0038); D libero D-036.
>
> MACCHINA: SEMPRE `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. ⚠️ Rebuild
> container prima di testare la mappa in dev: `docker compose --profile full up -d --build api web`. DB `localhost:5433`;
> login `admin@coralyn.dev` / `coralyn-admin-8473`. Push su `main` solo con mio ok esplicito.
>
> PRIMA COSA (ADR-0009): leggi questo handoff `docs/handoff/2026-07-04-mappa-abbonamento-e-prossimi.md` (stato §1,
> prossimo §2, come vedere i mock §3, D-035 §4, gotcha §5, ancore §6), poi il ledger `.superpowers/sdd/progress.md`.
>
> TASK, in sequenza (mostrandomi i mock una schermata alla volta): (1) **Report** — mostrami il mock, decidiamo insieme i
> KPI, poi endpoint d'aggregazione + FE (piano TDD, subagent-driven). (2) **Stabilimento** — vista read-only (RBAC=D-025).
> (3) D-0xx: **D-024** o **D-012** — CONFERMA con me. Igiene aperta: `origin/feat/scheda-cliente-360` è 3 dietro main
> (prune remoto opzionale, chiedimi). DOPO ogni slice: presentami lo stato e attendi conferma.
