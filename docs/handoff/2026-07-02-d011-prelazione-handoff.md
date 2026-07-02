# Handoff — Prelazione abbonamenti (D-011), COMPLETATA

> Documento di consegna. **D-011 (prelazione abbonamenti) è COMPLETO** sul branch
> `feat/d011-prelazione`, non ancora mergiato su `main`. Segue
> [`2026-07-01-d011-prelazione-delegation.md`](2026-07-01-d011-prelazione-delegation.md) (la
> delega che ha aperto questo slice) e la spec
> [`2026-07-01-prelazione-abbonamenti-d011-design.md`](../specs/2026-07-01-prelazione-abbonamenti-d011-design.md).

---

## 0. Stato finale

- **Branch:** `feat/d011-prelazione`, partito da `main` (post D-032, HEAD `ec8e654`). **Non
  ancora mergiato.**
- **ADR nuovo:** [ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md) —
  Prelazione: finestre derivate a valutazione lazy, campagna come unico stato persistito.
- **Doc aggiornati:** `deferred.md` (D-011 → Risolte), `README.md` (indice ADR + modulo
  `bookings`), `data-model.md` (entità `RenewalCampaign` + invariante hold), `glossary.md` (voce
  **Prelazione** implementata), `0012-gestione-abbonamenti.md` (correlati + "fuori MVP" →
  realizzata da ADR-0034).
- **Commit-per-layer** (workflow ADR-0009, TDD): spec → piano → contratti → modello/migrazione →
  refactor prep → service+controller → hold → FE → fix copertura FE. Vedi `git log
  efcc4df..HEAD --oneline` sul branch.

## 1. Conteggi test (finali, verificati)

| Suite | Prima (baseline main post-D-032) | Dopo (D-011) |
|---|---|---|
| api unit | 77 | **83** |
| api e2e | 90 | **110** |
| web-staff | 93 | **100** |
| ui-kit | 41 | **41** (invariato — nessun componente nuovo) |

`corepack pnpm -r build` + `corepack pnpm eslint .` verdi.

## 2. Cosa è stato implementato

- **Entità `RenewalCampaign`** (nuova tabella, migrazione
  `apps/api/prisma/migrations/20260701221932_renewal_campaign/`): `originSeasonId`,
  `destinationSeasonId`, `deadline`, `createdAt`; RLS `ENABLE`/`FORCE` + policy
  `tenant_isolation` appesa a mano al `migration.sql` generato (stesso pattern di
  `20260630203447_pricing`). Unique `(establishmentId, destinationSeasonId)` — una sola campagna
  per stagione di destinazione.
- **Endpoint** (`apps/api/src/bookings/renewal-campaigns.controller.ts` +
  `renewal-campaigns.service.ts`, dentro `BookingsModule`):
  - `POST /api/renewal-campaigns` — apre (`originDate`/`destinationDate`/`deadline`); 422 su
    stagioni non risolte/uguali/direzione errata; 409 su duplicato (`23505`→`P2002`).
  - `GET /api/renewal-campaigns?destinationDate=` — campagna + `windows` (o **body vuoto** se
    nessuna campagna — vedi gotcha §4).
  - `DELETE /api/renewal-campaigns/:id` — chiude; 404 se fuori tenant/inesistente.
- **Stato finestra derivato lazy** (`open|exercised|expired`), mai persistito: proiezione dedicata
  in `apps/api/src/bookings/renewal-window.projection.ts`. Confronto con `todayInRome()`
  ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)) + rinnovo confermato
  nella stagione di destinazione.
- **Hold di disponibilità** dentro `BookingsService.priceAndWrite`
  (`apps/api/src/bookings/bookings.service.ts:148-184` ca., blocco `openCampaigns` +
  `assertNoPreemptionHold`): mentre una finestra è aperta, l'ombrellone+fascia dell'avente-diritto
  è riservato — un **altro** cliente riceve **409 "Ombrellone riservato per prelazione"**; il
  proprio rinnovo non è mai bloccato (esclusione per `customerId`). Rilascio lazy: nessuna riga da
  cancellare, il blocco semplicemente non scatta più quando `deadline` è passata o la campagna è
  stata chiusa.
- **Priorità = anzianità**: `computeSeniority` **estratto** da metodo privato di `BookingsService`
  a funzione condivisa in `apps/api/src/bookings/seniority.ts` (puro refactor, stesso
  comportamento, riusato da `RenewalCampaignsService`). `SeasonRange` (in
  `apps/api/src/catalog/catalog.service.ts`) ha guadagnato un campo additivo `id` (serviva alla
  campagna per persistere i `seasonId` risolti).
- **Nessun nuovo `BookingStatus`**: enum `confirmed|cancelled` intatto.
- **Contratti additivi** (`packages/contracts/src/index.ts`): `OpenRenewalCampaignInput`,
  `RenewalCampaignDTO`, `RenewalWindowState`, `RenewalWindowItemDTO`,
  `RenewalCampaignDetailDTO`. Nessun breaking change (`SubscriptionListItemDTO`/`BookingDTO`
  invariati).
- **FE** (`apps/web-staff/src/features/renewals/`): `RenewalsView.vue` esteso con overlay
  campagna — "Apri campagna di prelazione" (input scadenza) quando assente, scadenza + "Chiudi
  campagna" quando presente; righe = `windows` ordinate per anzianità dal server; badge
  Aperta/Rinnovato/Scaduta (toni neutral/success/warning, riuso ui-kit senza componenti nuovi);
  bottone Rinnova abilitato se `state !== 'exercised'`. `useRenewals.ts`: nuovi composable
  `useRenewalCampaign`/`useOpenCampaign`/`useCloseCampaign`. MSW handler per
  `GET/POST/DELETE /api/renewal-campaigns` in `mocks/server.ts`.

## 3. Ancore di codice (per la prossima sessione)

- **Service campagne**: `apps/api/src/bookings/renewal-campaigns.service.ts` — `open`/
  `getByDestinationDate`/`close`. Riusa `CatalogService.resolveSeasonWithin` (ora con `id`).
- **Hold**: `apps/api/src/bookings/bookings.service.ts`, dentro `priceAndWrite` — cerca
  `openCampaigns`/`assertNoPreemptionHold`/`'Ombrellone riservato per prelazione'`. Applicato a
  **ogni** chiamante di `priceAndWrite` (`create` e `renew`), non duplicato altrove.
- **Anzianità condivisa**: `apps/api/src/bookings/seniority.ts` (funzione `computeSeniority(tx,
  ids)`, RLS-safe, risalita iterativa via Prisma).
- **Proiezione finestra**: `apps/api/src/bookings/renewal-window.projection.ts` —
  `toRenewalWindowItemDTO`, unico posto dove si deriva `state`.
- **DTO**: `apps/api/src/bookings/dto/open-renewal-campaign.dto.ts`,
  `renewal-campaign-query.dto.ts` (+ relativi `.spec.ts`).
- **Migrazione**: `apps/api/prisma/migrations/20260701221932_renewal_campaign/migration.sql`.
- **E2E**: `apps/api/test/renewal-campaigns.e2e-spec.ts` (apertura/validazioni/duplicato/finestre/
  stato/priorità/hold/rilascio lazy/chiusura/isolamento RLS a 2 tenant).
- **FE**: `apps/web-staff/src/features/renewals/RenewalsView.vue`,
  `apps/web-staff/src/features/renewals/useRenewals.ts`,
  `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`.
- **`apiFetch`**: `apps/web-staff/src/lib/http.ts` (~riga 28-33) — ora tratta **204** e body-testo
  vuoto come `null` tipizzato (serviva per `GET /renewal-campaigns` quando non c'è campagna: NestJS
  serializza un ritorno `null` come body vuoto, non il literal JSON `"null"`).

## 4. Gotcha (verificati questa sessione)

- **`prisma migrate dev` ripropone una `DROP INDEX Rate_signature_key` spuria.** Ogni volta che si
  rigenera/riapplica una migrazione dopo D-032 (indice raw non-Prisma su `Rate`, vedi handoff
  D-032), il diff automatico di Prisma tende a **riproporre un `DROP INDEX
  "Rate_signature_key"`** nel nuovo `migration.sql` perché non lo riconosce come proprio (è stato
  aggiunto a mano). **Va sempre stralciato a mano** dal file generato prima di applicarlo — se
  passa, la migrazione cancella silenziosamente il vincolo di non-ambiguità del listino (409
  sparirebbe, sostituito da comportamento ambiguo silenzioso). Verificato sulla migrazione
  `20260701221932_renewal_campaign`: il file finale (letto a fondo) **non** contiene quella riga —
  è stata rimossa prima del commit `3ec5764`. Controllare sempre il diff generato prima di
  accettarlo, non fidarsi ciecamente di `prisma migrate dev`.
- **`GET /renewal-campaigns?destinationDate=` senza campagna ritorna corpo vuoto, non `"null"`
  letterale.** NestJS serializza un controller che ritorna `null` come **body HTTP vuoto** (non il
  JSON `null`). Il client FE doveva essere adattato: `apiFetch` (`apps/web-staff/src/lib/http.ts`)
  ora tratta **status 204** e **testo di risposta di lunghezza 0** come `null` tipizzato, altrimenti
  `JSON.parse('')` avrebbe lanciato. Se in futuro un altro endpoint ritorna `T | null`, questo
  comportamento di `apiFetch` è già coperto — non serve un adattamento ad-hoc.
- **Gli e2e usano scadenze fisse, non relative a `Date.now()`.** `deadline: '2099-12-31'` per
  simulare "finestra sempre aperta" e `deadline: '2000-01-01'` per "finestra già scaduta" (vedi
  `apps/api/test/renewal-campaigns.e2e-spec.ts`, es. righe 62 e 182). Evita flakiness legata alla
  data di esecuzione dei test e rende il test leggibile senza mock di `todayInRome()`. Se si
  estendono questi test, riusare le stesse due costanti concettuali (molto-futuro / molto-passato)
  invece di calcolare offset relativi a oggi.
- **Container API non ha il codice nuovo finché non lo rebuildi**: gotcha ricorrente (già in
  handoff D-032) — `docker compose --profile full up -d --build api` prima di verificare live;
  controllare `docker inspect coralyn-api --format '{{.Created}}'` contro l'ultimo commit BE.
- **`SeasonRange` ha guadagnato `id`** (`apps/api/src/catalog/catalog.service.ts`, ramo `ok:true`):
  additivo, i chiamanti A4.1/A4.2 lo ignorano, nessun test regredito. Se si tocca ancora il
  resolver, ricordare che ora **due** consumatori dipendono dal campo (`RenewalCampaignsService`
  in più).

## 5. Prossimo slice candidato

Nessun task è stato assegnato esplicitamente per dopo D-011. Candidati naturali, in ordine di
prossimità al lavoro appena fatto:

1. **[D-013](../architecture/deferred.md) — Sospensione/cessione/disdetta dell'abbonamento.** La
   spec D-011 (§"Fuori scope") nota che la **rinuncia esplicita** (rilascio anticipato prima della
   scadenza) è stata scartata perché spingerebbe verso un modello di finestra per-abbonato
   persistito — naturale prossimo passo se emerge la richiesta, e il modello scartato in
   ADR-0034 ("Alternative considered") è già lo scaffold concettuale da riprendere.
2. **Modulo Cassa e pagamenti** (roadmap modulo 2, `README.md`) — porta con sé [D-009](../architecture/deferred.md)
   (entità `Pagamento` ricca) e la caparra/pagamento anticipato per confermare la prelazione,
   esplicitamente fuori scope in D-011.
3. **Rifinitura UI** della vista Rinnovi/prelazione dopo verifica utente live (badge, copy,
   eventuale tono ui-kit mancante) — a basso rischio, se emergono richieste dopo il primo utilizzo
   reale.

Prima di iniziare uno di questi: sync standard (`git fetch --all --prune` +
`git checkout main && git merge --ff-only origin/main` **dopo** aver mergiato/pushato
`feat/d011-prelazione`), poi leggere ADR-0009 (tutta la doc prima di scrivere codice).

## 6. Machine sync

Come da convenzione: `git fetch --all --prune` poi `git checkout main && git merge --ff-only
origin/main` prima di fidarsi del tree o creare un branch. Path: `C:\Users\zagor\Desktop\coralyn`
(zagor) o `C:\Users\Jays\Desktop\new` (Jays). `feat/d011-prelazione` **non è ancora mergiato** su
`main` al momento di questo handoff — non presumere che `main` contenga già D-011 finché non
verificato con `git log`.
