# Handoff / Delega — Consolidamento Catalogo (Slice A/B/C), da eseguire nella PROSSIMA sessione

> Documento di consegna. **D-011 (prelazione abbonamenti) è COMPLETO, MERGIATO su `main` e PUSHATO**
> (HEAD `a44c313`). La prossima sessione è un **consolidamento del Catalogo/Listino** in **tre slice
> distinte** (A→B→C): prima i bug foundational + feedback errori, poi le due feature (fasce configurabili,
> equipment personalizzato). **NON** è un "redo D-032": l'editor spedito è già fedele al modello (vedi §3).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice
> scrivi PRIMA la spec di design (cita file:riga), RISOLVI con l'utente le decisioni aperte §4, poi scrivi il
> piano TDD ed eseguilo **subagent-driven, un commit per layer, test-first, da un NUOVO branch partendo da
> `main`**.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi la documentazione rilevante**: `docs/architecture/README.md`,
> [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (fascia **configurabile** —
> abilita Slice B), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (una `Rate` = un
> prezzo + una unità), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date/orari
> UTC round-trip), la spec D-032 (`docs/specs/2026-07-01-pricing-editor-d032-design.md`) e questo doc.

---

## 0. Situazione GIT

- **`main` = `origin/main` = `a44c313`** (D-011 mergiato FF + pushato). Niente branch pendenti, niente commit
  non pushati. All'avvio basta il sync standard §8.
- **File untracked da risolvere in Slice A**: `docs/design/mockups/Coralyn - Gestionale Lidi (standalone).html`
  — è il mockup aspirazionale (mostra dati che il modello NON ha: orari fascia, tier Giornata/Settimana/
  Stagione, descrizioni/badge/prezzo dei pacchetti). Decisione: **committarlo** in `docs/design/mockups/`
  marcato "aspirazionale" ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)) **oppure
  eliminarlo** — non lasciarlo lì a generare confusione (ha già fuorviato una richiesta di "redo").
- Nessuna migrazione pendente. Prossimo ADR libero: **0035**.

## 1. Stato attuale (post D-011)

- **Baseline test da NON regredire (verificata live)**: **api unit 83 · api e2e 110 · web-staff 100 · ui-kit 41.**
- Moduli rilevanti: `catalog` (Season/Package/TimeSlot/Pricing/Rate + engine), `bookings` (Booking, rinnovo,
  prelazione), FE `web-staff` feature `pricing` (editor listino, D-032) + `renewals` (campagna, D-011).
- `ui-kit` è headless/token-first, **no build step**; i test web-staff includono anche le spec di ui-kit.

## 2. IL TASK — consolidamento in 3 slice (ordine: A → B → C)

### Slice A — "Scritture sicure & leggibili" (bug foundational + feedback) — PRIORITÀ 1
Causa comune dei "409/422 muti in console": il FE **non mostra gli errori di scrittura**. Due strati:
1. **`ApiError` scarta il messaggio del server.** `apps/web-staff/src/lib/http.ts` lancia `ApiError(status,
   path)` → "HTTP 409 su …", buttando via il body NestJS `{message, statusCode}`. → far leggere e conservare
   il `message` (await res.json/testo del body d'errore) così la UI ha il motivo reale ("Ombrellone riservato
   per prelazione", "Impossibile eliminare: pacchetto in uso").
2. **Nessuna mutation ha `onError` né conferma.** `deletePackage.mutate(p.id)` a `PricingView.vue:250` è
   sparato senza feedback né `window.confirm` (a differenza del delete-stagione a `:36-40`). Idem l'apertura
   campagna in `renewals`.
   → serve un **canale di feedback coerente** (toast globale o errore inline nel modale — **decisione §4.1**)
   agganciato alle mutation, + conferma sui delete distruttivi.
Incluso in Slice A (tutti piccoli, alto valore):
- **`GET /rates` validation** (bug reale su `main`): `rates.controller.ts:11-14` usa `@Query('seasonId')
  seasonId?: string` **senza validazione**. → query-DTO con UUID (+ obbligatorio, **decisione §4.2**). Segue il
  pattern dei validator in `apps/api/src/common/` (`IsCalendarDate`, `UUID_SHAPE`).
- **Modal a11y**: `ui-kit/src/components/Modal.vue` ha solo `DialogTitle`, manca `DialogDescription`/
  `aria-describedby` (reka-ui warna). → prop `description?` opzionale + `<DialogDescription>` (o
  `aria-describedby`). Fix in un punto, vale per tutti i modali.
- **Input numerico**: `ui-kit/src/components/Input.vue:3` è `defineModel<string>()` ma è usato per campi
  `type="number"` (price, sunbeds) → warn "Expected String, got Number". → allargare a `string | number` e
  rendere coerente lo stato numerico nei form. Ripescare il repro esatto durante il fix.
- **Honesty-pass (decisioni-doc rapide)**: accettare la tabella tariffe a **prezzo singolo** (niente tier
  Giornata/Settimana/Stagione — vedi §3); **niente** badge marketing ("Top/Più richiesto") sui pacchetti;
  risolvere il file mockup untracked (§0).

### Slice B — "Fasce configurabili" (feature) — realizza ADR-0013
- L'utente vuole crearsi le proprie fasce (manca "Giornata intera"). **ADR-0013 prevede già la Fascia
  configurabile** → è la realizzazione, non una violazione. Modello `TimeSlot` (schema.prisma:94-106) ha già
  `name/startTime/endTime/sortOrder`; oggi solo seedate.
- Serve: `TimeSlotDTO` esteso con orari (`startTime`/`endTime` formattati "HH:MM", **round-trip UTC** per
  ADR-0031 — vietati metodi locali); `TimeSlotsController/Service` CRUD in `CatalogModule` (stesso pattern di
  `SeasonsController`/`RatesController` di D-032); editor FE nella vista Listino (le pill fasce oggi mostrano
  solo `name` a `PricingView.vue:263-269`). **Nota all'ADR-0013**: gli orari erano "non esposti" nel flusso di
  prenotazione; per l'editor si espongono — additivo, tracciare la nota.
- Chiude anche il nodo-1 dell'honesty-pass (orari) e la "Giornata intera" mancante.
- **Overlap tra fasce è ammesso e intenzionale** (es. Giornata intera 08–19 che copre Mattina/Pomeriggio):
  l'anti-overlap (`slotsOverlap`, semiaperto) già lo gestisce. Delete di una fascia referenziata da
  Rate/Booking → **decisione §4.3** (probabile 409 come per il pacchetto).

### Slice C — "Equipment personalizzato dei pacchetti" (feature)
- L'utente vuole prodotti custom, non solo lettini. **`Package.equipment` è già `Json @db.JsonB` arbitrario**
  (schema.prisma:191-201); il FE oggi edita solo `sunbeds` (`PricingView.vue:313`) e `equipmentLabel` (:49-61)
  già gestisce chiavi ignote. → per lo più **FE**: editor dinamico "voce + quantità" sul JSONB esistente.
- **Decisione §4.4**: free-form JSONB (leggero, ma niente riuso/coerenza nomi) vs entità `EquipmentType`
  catalogo (coerente/riusabile, nuova entità+CRUD). Rec: **free-form prima** (il modello lo regge già); il
  catalogo gestito è un follow-up eventuale (confina con D-012 "servizi accessori").

## 3. Perché NON è un "redo D-032" (contesto anti-confusione)
L'editor reale su `main` **è già fedele al modello** — i "dati fittizi" stanno solo nel mockup:
- Fasce: `PricingView.vue:267` mostra solo `f.name` (niente orari).
- Tariffe: **una** colonna Prezzo + unità (`/ giorno`|`/ periodo`), `:205-212`/`:278-281` — niente tre tier.
- Pacchetti: `name` + `equipmentLabel` + "N tariffe collegate" (`:242-259`) — niente descrizione/badge/prezzo.
Quindi Slice A/B/C sono **arricchimenti additivi + hardening**, non correzioni di dati fasulli in prod.

## 4. ⚠️ Decisioni di design da RISOLVERE con l'utente PRIMA (per slice)
1. **(A) Feedback errori: toast globale vs errore inline nel modale.** Verifica prima se `ui-kit` ha già un
   primitivo toast; se no, aggiungerne uno minimo è parte di Slice A (foundational). Rec: toast globale per gli
   errori di mutation, con messaggio dal server.
2. **(A) `GET /rates`: `seasonId` obbligatorio (400 se manca) o opzionale.** Rec: **obbligatorio** (il FE lo
   passa sempre; il listing cross-stagione non è un caso d'uso).
3. **(B) Delete fascia referenziata** da Rate/Booking → 409 con guardia reference-count (come il pacchetto,
   D-032) oppure altro. Verifica le FK reali (schema + migrazioni raw) prima di assumere il comportamento.
4. **(C) Equipment: free-form JSONB vs entità `EquipmentType`.** Rec: free-form prima (YAGNI).
5. **(B/C) Serve un ADR?** Slice B tocca ADR-0013 (nota/amendment, non un ADR nuovo). Slice C free-form
   probabilmente nessun ADR; l'entità `EquipmentType` sì. Valuta esplicitamente.

## 5. Insidie note (gotcha)
- **`apiFetch` body vuoto → null: GIÀ FATTO** in D-011 (`http.ts` + `http.spec.ts`). NON rifarlo.
- **Migrazione**: `prisma migrate dev` **ri-propone sempre** uno spurio `DROP INDEX "Rate_signature_key"`
  (indice raw `NULLS NOT DISTINCT` di D-032 non modellato da Prisma) → **rimuoverlo SEMPRE** dal `migration.sql`
  generato; non è drift. Vale valutare se una versione recente di Prisma lo esprime nello schema.
- **Lock advisory all'avvio container**: un `migrate dev` interrotto lascia una connessione idle che tiene
  `pg_advisory_lock(72707369)` → il `migrate deploy` dell'entrypoint va in timeout (container unhealthy). Fix:
  `docker exec coralyn-db psql -U coralyn -d coralyn_dev -tAc "select pg_terminate_backend(<pid>);"` (trova il
  pid idle con `pg_stat_activity` sui lock advisory), poi riavvia il container.
- **Container `coralyn-api`/`coralyn-web` stantii**: rebuilda prima di testare in dev
  (`docker compose --profile full up -d --build api web`). DB host su **`localhost:5433`** (non 5432): root
  `.env` (coralyn_dev), `.env.test` (coralyn_test). Prisma da host: `set -a; . ./.env; set +a; …`.
- **RLS FORCE** su tabelle tenant: `psql` diretto senza `app.current_tenant` mostra 0 righe (verifica via API
  con JWT o dentro `forTenant`). Le nuove tabelle tenant-scoped richiedono blocco RLS **raw** appeso alla
  migrazione (pattern `20260630203447_pricing/migration.sql`).
- **FE contratti**: dopo aver toccato `@coralyn/contracts`, `corepack pnpm --filter @coralyn/contracts build`
  e `rm -rf apps/web-staff/node_modules/.vite`.
- **Preview dev-server**: il proxy autoPort può essere morto → naviga direttamente alla porta Vite reale via
  `location.replace` (vedi `[[coralyn-dev-preview-env]]`). Login dev `admin@coralyn.dev` / `coralyn-admin-8473`.

## 6. Ancore di codice (file:riga, verificate questa sessione)
- **FE error/feedback**: `apps/web-staff/src/lib/http.ts` (`ApiError` :6-13, `apiFetch` :17-29),
  `apps/web-staff/src/lib/useQueryResource.ts` (`mutationResource`/`invalidates`),
  `apps/web-staff/src/features/pricing/PricingView.vue:250` (delete pacchetto senza onError/confirm; confronta
  con delete-stagione :36-40), feature `renewals` (`useOpenCampaign`).
- **`GET /rates`**: `apps/api/src/catalog/rates.controller.ts:11-14`; validator in `apps/api/src/common/`.
- **Modal a11y**: `packages/ui-kit/src/components/Modal.vue:11` (`DialogContent`, manca description).
- **Input numerico**: `packages/ui-kit/src/components/Input.vue:3` (`defineModel<string>()`).
- **TimeSlot**: `apps/api/prisma/schema.prisma:94-106`; DTO in `packages/contracts/src/index.ts` (oggi solo
  `name`); CRUD pattern in `apps/api/src/catalog/seasons.controller.ts`/`rates.controller.ts`; pill fasce FE
  `PricingView.vue:263-269`, opzioni da `useDayMap` (`dayMap.timeSlots`).
- **Package/equipment**: `schema.prisma:191-201`; FE `PricingView.vue:313` (solo sunbeds), `equipmentLabel`
  :49-61; modale pacchetto :309-319.

## 7. Stato test da preservare
Baseline **da NON regredire**: **api unit 83 · api e2e 110 · web-staff 100 · ui-kit 41**. `corepack pnpm -r
build` + `corepack pnpm eslint .` verdi. Riverifica dal vivo all'avvio (§8). Ogni slice aggiunge test
(commit-per-layer, TDD). Prossimo ADR libero: **0035**.

## 8. Macchina "zagor"/"Jays" (sync)
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima
di testare in dev. `main == origin/main == a44c313` all'atto di questo handoff.

---

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina può essere
> C:\Users\Jays\Desktop\new).
>
> STATO: D-011 (prelazione abbonamenti) è COMPLETO, MERGIATO su `main` e PUSHATO (HEAD `a44c313`). Verde su
> tutti i test (api unit 83 · e2e 110 · web-staff 100 · ui-kit 41), verificato live. Nessun branch pendente.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`
> prima di fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev:
> `docker compose --profile full up -d --build api web`. DB host su localhost:5433.
>
> PRIMA COSA (ADR-0009): leggi TUTTA la documentazione rilevante, in particolare l'handoff
> `docs/handoff/2026-07-02-catalog-consolidation-delegation.md` (contiene le 3 slice, le decisioni aperte §4,
> le ancore di codice §6, i gotcha §5), poi ADR-0013 (fascia configurabile), ADR-0032 (una Rate = un prezzo),
> ADR-0031 (date/orari), la spec D-032.
>
> TASK: consolidamento Catalogo in 3 slice, ordine A → B → C (NON è un redo D-032: l'editor è già fedele al
> modello). A) "Scritture sicure & leggibili": ApiError porta il messaggio server + canale feedback
> (toast/inline) + onError/conferma su delete-pacchetto (409) e apertura-campagna (422) + fix Modal
> aria-describedby + fix Input string|number + validazione GET /rates + honesty-pass doc (accetta prezzo
> singolo, niente badge, risolvi il mockup untracked). B) "Fasce configurabili": TimeSlot CRUD + orari +
> editor FE (realizza ADR-0013; nota all'ADR). C) "Equipment personalizzato": editor dinamico sul JSONB
> esistente (free-form vs entità EquipmentType, da decidere). Workflow ADR-0009 per OGNI slice: spec di design
> investigativa (cita file:riga) → RISOLVI con me le decisioni aperte §4 → piano TDD → implementa
> subagent-driven, un commit per layer, test-first, da un NUOVO branch partendo da main. Non regredire i
> conteggi test (riverificali dal vivo).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima della successiva.
