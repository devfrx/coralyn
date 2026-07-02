# Consolidamento Catalogo — Slice A "Scritture sicure & leggibili" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (decisioni §5 risolte con l'utente il 2026-07-02)
- **Origine:** handoff [2026-07-02-catalog-consolidation-delegation.md](../handoff/2026-07-02-catalog-consolidation-delegation.md) §2 Slice A
- **ADR di riferimento:** [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow e mockup),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (errori di dominio 409/422 già mappati lato API),
  [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) (componenti ui-kit condivisi).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire:
  **api unit 83 · api e2e 110 · web-staff 100 · ui-kit 41** (riverifica live in corso all'atto di questa spec).

---

## 1. Situazione attuale (verificata leggendo il codice, non assunta)

### 1.1 `ApiError` scarta il messaggio del server

`apps/web-staff/src/lib/http.ts:27` lancia `throw new ApiError(res.status, path)` **prima di leggere
il body**: il messaggio diventa `"HTTP 409 su /packages/..."` (`http.ts:9`). Il backend però produce
messaggi di dominio **già pronti per l'utente** (italiano, specifici), che vengono buttati via:

- `catalog.service.ts:159` → 409 «Pacchetto in uso da tariffe o prenotazioni: non eliminabile.»
- `rates.service.ts:19` → 409 «Esiste già una tariffa con queste dimensioni per questa stagione.»
- `seasons.service.ts:25` → 400 «La data di inizio deve precedere la data di fine.»
- `renewal-campaigns.service.ts:25-31` → 422 (stagioni non valide/uguali/ordine), `:43` → 409
  «Campagna già aperta per questa stagione.»
- `bookings.service.ts:186` → 409 «Ombrellone riservato per prelazione», ecc.

Il body d'errore NestJS è `{ statusCode, message, error }` dove `message` può essere **string**
(eccezioni di dominio) o **string[]** (class-validator via `ValidationPipe`). Nota: il body può anche
essere vuoto o non-JSON (proxy, 502) → il parsing deve degradare al messaggio sintetico attuale.

### 1.2 Nessuna mutation ha `onError`; delete distruttivi senza conferma

- `PricingView.vue:250` — `deletePackage.mutate(p.id)` diretto: **né conferma né feedback** (il 409
  del pacchetto in uso muore in console). Contrasto con `confirmDeleteSeason` `:36-40` che ha
  `window.confirm` (ma neppure lui ha `onError`).
- `PricingView.vue:287` — `deleteRate.mutate(r.id)` idem (qui il delete è a basso rischio, ma il
  feedback d'errore manca comunque).
- `RenewalsView.vue:39-42` + `useRenewals.ts:40-46` — `openCampaign.mutate(...)`: i 422/409 del
  service campagne sono silenziosi.
- Tutte le altre mutation (`submitSeason` `:89`, `submitPackage` `:117-121`, `submitRate`
  `:165/:176`, `renew` `RenewalsView.vue:36`, `closeCampaign` `:46`) hanno solo `onSuccess`.

Punto di aggancio naturale: **`mutationResource`** (`apps/web-staff/src/lib/useQueryResource.ts:19-30`)
è la factory di TUTTE le mutation dell'app → un `onError` di default lì copre l'intera app in un punto.

### 1.3 `GET /rates` senza validazione (unico endpoint col query param raw)

`rates.controller.ts:11-14` usa `@Query('seasonId') seasonId?: string` senza DTO; il service
(`rates.service.ts:24-25`) ritorna `[]` se assente. Tutti gli altri endpoint con query usano un
query-DTO validato: `MapQueryDto`, `BookingsQueryDto`, `RenewalCampaignQueryDto`. Per gli UUID il
progetto valida la **forma** con `UUID_SHAPE` (`apps/api/src/common/uuid.ts` — niente `@IsUUID()`,
i seed usano UUID sintetici non-RFC).

### 1.4 `Modal` senza descrizione accessibile

`packages/ui-kit/src/components/Modal.vue` monta `DialogContent`+`DialogTitle` (`:11-15`) ma **nessun
`DialogDescription`** → reka-ui warna `aria-describedby` mancante su ogni modale dell'app.

### 1.5 `Input` tipato solo `string`

`packages/ui-kit/src/components/Input.vue:3` → `defineModel<string>()`. Vue applica automaticamente
il cast `.number` ai `v-model` su `<input type="number">` → l'input emette `Number` e il prop-check
runtime warna «Expected String, got Number». Usi con `type="number"`: `PricingView.vue:313`
(lettini) e `:361` (prezzo), entrambi con ref **stringa** (`pSunbeds = ref('2')`, `rPrice = ref('')`)
convertiti a mano con `Number(...)` al submit (`:116`, `:163`, `:173`).

### 1.6 Feedback UI: nessun primitivo toast

Inventario `packages/ui-kit/src/components/` verificato: 21 componenti, **nessun** Toast/Snackbar.

### 1.7 Honesty-pass documentale

- La tabella tariffe reale è a **prezzo singolo + unità** (`PricingView.vue:205-212`, `:278-281`) —
  fedele ad ADR-0032 (una `Rate` = un prezzo). I «tre tier» (Giornata/Settimana/Stagione) esistono
  solo nel mockup.
- I pacchetti reali mostrano nome + dotazione + conteggio tariffe (`:242-259`) — **niente badge
  marketing** («Top», «Più richiesto») né descrizione/prezzo: solo mockup.
- File **untracked** `docs/design/mockups/Coralyn - Gestionale Lidi (standalone).html`: mockup
  aspirazionale che mostra dati che il modello non ha; ha già fuorviato una richiesta di «redo».

## 2. Obiettivo e scope

Rendere le **scritture** del gestionale **sicure** (conferma sui delete distruttivi) e **leggibili**
(l'errore del server arriva all'utente), più quattro fix piccoli ad alto valore. Nessuna migrazione
DB, nessun nuovo endpoint: solo hardening di ciò che esiste.

- **In scope:** §3.1–§3.7 sotto.
- **Fuori scope:** fasce configurabili (Slice B), equipment personalizzato (Slice C), retry/offline,
  i18n dei messaggi (D-003), refactor di `DataTable`.

## 3. Design proposto

### 3.1 `ApiError` porta il messaggio del server

`http.ts`: su `!res.ok`, leggere il body (`await res.text()` + `JSON.parse` tollerante), estrarre
`message` (string o string[] → join), e costruire `ApiError` con **il messaggio server come
`.message`** quando presente, fallback all'attuale `HTTP {status} su {path}`. `ApiError` conserva
`status` (usato per 401 → logout) e guadagna il campo `serverMessage` (o equivalente). Nessun
chiamante esistente rompe: `ApiError` resta un `Error` con `status`.

### 3.2 Canale di feedback per gli errori di mutation (decisione §5.1)

Raccomandazione: **toast globale**. Primitivo `Toast` minimo in `ui-kit` (presentazionale,
token-first, coerente ADR-0033) + un composable/store leggero in `web-staff` (coda messaggi,
auto-dismiss). Aggancio: `mutationResource` (`useQueryResource.ts:19-30`) riceve un `onError` di
default che pubblica `error.message` come toast — **tutte** le mutation dell'app sono coperte senza
toccare i singoli call-site; i call-site possono continuare a passare il proprio `onError` puntuale
via `mutate(input, { onError })` quando serve un comportamento in più.

### 3.3 Conferma sui delete distruttivi

`window.confirm` (stesso pattern di `confirmDeleteSeason`, `PricingView.vue:36-40`) su
**delete-pacchetto** (`:250`). Il delete-tariffa (`:287`) è a basso impatto e ripristinabile in due
click: niente conferma (coerente con l'assenza di conferma sui delete non-cascata altrove), ma
l'errore ora arriva col toast. L'apertura campagna non è distruttiva → niente conferma, solo
feedback errore.

### 3.4 `GET /rates` validato con query-DTO

`RatesQueryDto` in `apps/api/src/catalog/dto/` con `seasonId` `@Matches(UUID_SHAPE)` —
obbligatorietà secondo decisione §5.2 (rec: obbligatorio → 400 se assente; il FE lo passa sempre,
`useRates` è `enabled` solo con stagione attiva).

### 3.5 `Modal` con descrizione accessibile

Prop opzionale `description?: string` + `<DialogDescription>` (visivamente discreta o `sr-only`
quando non passata — reka-ui supporta `aria-describedby="undefined"`? No: si monta sempre la
description, vuota = sr-only, oppure si usa `:aria-describedby` esplicito. Dettaglio da chiudere nel
piano TDD col comportamento reale di reka-ui). Fix in un punto, vale per tutti i modali.

### 3.6 `Input` accetta `string | number`

`Input.vue:3` → `defineModel<string | number>()`. I form con campi numerici (`PricingView.vue:313`,
`:361`) restano su ref stringa + conversione al submit (già corretto), ma il warn sparisce e il
componente smette di mentire sul tipo.

### 3.7 Honesty-pass documentale

- Annotare nella spec D-032 (o in `docs/design/`) che prezzo singolo e assenza badge sono **decisioni
  accettate**, non lacune.
- Mockup untracked: **decisione §5.3** (rec: committarlo in `docs/design/mockups/` con marcatura
  «aspirazionale — non è lo stato corrente» in testa al file/README, per ADR-0009).

## 4. Rischi e mitigazioni

- **Body d'errore non-JSON o vuoto** (502 dal proxy, ecc.) → parsing tollerante con fallback al
  messaggio sintetico attuale; test dedicato in `http.spec.ts`.
- **`message` array** (class-validator) → join leggibile; test dedicato.
- **Doppio feedback** (toast globale + `onError` locale futuro) → il default di `mutationResource`
  è documentato; se un call-site gestisce l'errore in modo esaustivo può sopprimere il toast
  (dettaglio API da chiudere nel piano; YAGNI finché nessun caso lo richiede).
- **Toast e test esistenti** — il default `onError` non deve rompere i 100 test web-staff (il toast
  è un side-effect passivo); verificare i test delle mutation esistenti.

## 5. Decisioni (RISOLTE con l'utente, 2026-07-02)

1. **Canale feedback errori → TOAST GLOBALE.** Primitivo `Toast` minimo in `ui-kit` + `onError` di
   default in `mutationResource`: copre tutte le mutation in un punto, inclusi delete fuori-modale e
   apertura campagna. Messaggio = quello del server (via §3.1).
2. **`GET /rates` — `seasonId` OBBLIGATORIO → 400** se assente o malformato. Motivazione (rubrica di
   progetto: professionalità, zero debito): il FE lo passa sempre, il listing cross-stagione non è un
   caso d'uso, e rispondere `[]` a una richiesta senza parametro maschererebbe un bug del chiamante
   — stesso principio del «mai €0 silenzioso» di ADR-0032.
3. **Mockup untracked → COMMIT marcato «aspirazionale»** in `docs/design/mockups/` con banner in
   testa «aspirazionale — non è lo stato corrente» (ADR-0009: i mockup si versionano). Resta come
   riferimento visivo per Slice B/C.

## 6. Fasi indicative (il piano TDD le espande dopo §5)

1. **web-staff `http.ts`**: ApiError col messaggio server (TDD su `http.spec.ts`).
2. **ui-kit**: `Toast` (se §5.1=toast) + `Modal.description` + `Input string|number` (spec ui-kit).
3. **web-staff**: aggancio feedback in `mutationResource` + conferma delete-pacchetto + test.
4. **api**: `RatesQueryDto` (unit/e2e sul 400).
5. **doc**: honesty-pass + risoluzione mockup.
