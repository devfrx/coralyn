# Prelazione abbonamenti — D-011 — Design Spec

- **Data:** 2026-07-01
- **Stato:** In revisione — realizza la voce rimandata **[D-011](../architecture/deferred.md)**
  (*Prelazione abbonamenti completa*), il "fuori MVP" di
  [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md). Estende A4.2 (rinnovo + anzianità).
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR nuovo:** **[ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md)** — *Prelazione:
  finestre derivate a valutazione lazy, campagna come unico stato persistito*. A differenza di A4.2/D-032
  (nessun ADR), D-011 **introduce architettura nuova** (una nuova entità e una nuova invariante di
  disponibilità) → merita un ADR. Riafferma inoltre:
  [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md) (abbonamento = `Booking`
  `type=subscription`; rinnovo + storico/anzianità; **prelazione era il fuori-MVP**, ora realizzata),
  [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (invariante anti-overlap),
  [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (disponibilità slot-aware),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date di calendario Europe/Rome,
  round-trip UTC),
  [D-030](../architecture/deferred.md) (anti-overlap **applicativo**, non vincolo DB — stessa filosofia della
  prelazione lazy).
- **Prossimo ADR libero: 0034** (questo). Successivo libero dopo il merge: 0035.
- **Baseline test da NON regredire (su `main`, post D-032, da riverificare dal vivo):**
  **ui-kit 41 · web-staff 93 · api unit 77 · api e2e 90.**

---

## 1. Obiettivo e confini

**Automatizzare la campagna rinnovi con la prelazione.** Oggi (A4.2) il rinnovo è **manuale in un clic**
([`bookings.service.ts:207-246`](../../apps/api/src/bookings/bookings.service.ts)) e **nulla protegge il
posto** dell'abbonato uscente nella stagione entrante: finché non esiste una `Booking confirmed` nella nuova
stagione, l'anti-overlap ([`bookings.service.ts:129-140`](../../apps/api/src/bookings/bookings.service.ts))
non blocca nessuno, quindi **chiunque** può prenotare quell'ombrellone per la nuova stagione. D-011 aggiunge il
**diritto di prelazione**: per una stagione entrante, ogni abbonato confermato della stagione precedente ha una
**finestra con scadenza** entro cui rinnovare il proprio posto; finché la finestra è **aperta** il posto è
**riservato** (non prenotabile da altri); alla **scadenza** senza rinnovo il posto si **libera**
automaticamente. La **priorità per anzianità** ordina la campagna (i più anziani per primi).

**Insight di dominio (dall'handoff §2).** "Il posto" nella stagione entrante **non è occupato** da una
prenotazione finché non si rinnova. Quindi:
- Il **"riservare"** è una **nuova invariante di disponibilità** (un *hold* applicativo) che vive accanto
  all'anti-overlap, **non** una `Booking` fantasma.
- Il **"rilascio"** è la **fine dell'hold**, **non** l'annullamento di una prenotazione inesistente.
- La **finestra** e il suo **stato** (aperta/esercitata/scaduta) sono per lo più **derivati**; l'unico dato
  nuovo da persistere è la **scadenza** (più il legame stagione-origine → stagione-destinazione).

**Decisioni di design risolte con l'utente (handoff §4):**
1. **Modello finestra → entità `RenewalCampaign`** (una per stagione di destinazione): persiste **solo** la
   scadenza + le due stagioni. Lo stato per-abbonato è **derivato**.
2. **Rilascio → valutazione lazy** (nessun job/cron): "scaduta" è calcolata al momento della lettura e del
   tentativo di prenotazione, confrontando con `todayInRome()`. **Nessuna nuova infra** — coerente con
   l'anti-overlap applicativo ([D-030](../architecture/deferred.md)). *(Confermato: nessuno `@nestjs/schedule`,
   `@Cron`, `setInterval`, Bull in `apps/api`.)*
3. **Nessun nuovo `BookingStatus`**: lo stato della prelazione vive sulla campagna, **non** sulla `Booking`
   (l'enum `confirmed|cancelled` [`schema.prisma:53-56`](../../apps/api/prisma/schema.prisma) **resta
   intatto**; toccarlo propagherebbe a mappa/disponibilità/pagamenti).

### In scope (D-011)

- **Entità `RenewalCampaign`** (una migrazione: nuova tabella + RLS raw): `originSeasonId`,
  `destinationSeasonId`, `deadline`, `createdAt`.
- **Apertura campagna:** `POST /api/renewal-campaigns` — l'operatore apre la campagna per una stagione di
  destinazione, scegliendo la stagione di origine e la **scadenza**.
- **Lettura campagna + finestre:** `GET /api/renewal-campaigns?destinationDate=<ISO>` — ritorna la campagna
  (o `null`) con l'elenco delle **finestre** degli abbonati di origine, ciascuna col **`state`**
  (`open|exercised|expired`, derivato lazy), **ordinate per anzianità** (priorità).
- **Chiusura campagna:** `DELETE /api/renewal-campaigns/:id` — annulla una campagna aperta per errore; gli
  hold cadono immediatamente (sono derivati dall'esistenza della campagna).
- **Hold di disponibilità (nuova invariante):** nel percorso di scrittura (`create` e, di fatto, `renew`),
  oltre all'anti-overlap esistente, si **blocca** (409) una prenotazione su un ombrellone+fascia **riservato**
  da una finestra **aperta** a favore di **un altro** cliente. Il blocco **cade da solo** quando
  `today > deadline` (rilascio lazy). Il rinnovo dell'avente-diritto **non** è mai bloccato dal proprio hold.
- **Priorità per anzianità:** le finestre sono ordinate per `seniority` **decrescente** (server-autoritativo,
  testabile), riusando `computeSeniority` di A4.2.
- **FE — vista "Rinnovi" estesa:** apertura campagna (con scadenza), badge di stato finestra
  (Aperta/Scaduta/Rinnovato), ordinamento per anzianità, chiusura campagna. Il rinnovo A4.2 resta.
- **Contratti additivi:** `RenewalCampaignDTO`, `RenewalWindowItemDTO`, `RenewalCampaignDetailDTO`,
  `OpenRenewalCampaignInput`.
- **ADR-0034** + aggiornamento `deferred.md`/`README.md`/`data-model.md`/`glossary.md` + handoff.
- **Test** (TDD, commit-per-layer): unit (DTO), e2e a 2 tenant (apertura/validazioni/finestre/stato/hold/
  rilascio/chiusura/isolamento), web-staff (apertura campagna + badge stato + azione).

### Fuori scope (rimandati, tracciati — proposti e confermati)

- **Rinuncia esplicita** (rilascio *anticipato* del posto prima della scadenza): fuori. Il rilascio è **solo
  automatico** alla scadenza. La rinuncia esplicita richiederebbe persistenza per-abbonato (uno stato
  `declined`) → spinge verso il modello per-abbonato, gold-plating per questo slice; naturale vicina a
  **[D-013](../architecture/deferred.md)** (sospensione/cessione/disdetta).
- **Scadenze scaglionate per anzianità** (i più anziani con finestra prima/più lunga): fuori. La priorità qui
  è **ordinamento**, non finestre differenziate (handoff §4.4) — una scadenza **uniforme** per campagna.
- **Notifiche** di scadenza/rinnovo → **[D-006](../architecture/deferred.md)** (modulo notifiche).
- **Caparra/pagamento anticipato** per confermare la prelazione → **[D-009](../architecture/deferred.md)**.
- **Job schedulato / cron** per il rilascio → scartato per l'MVP (ADR-0034); il rilascio è lazy.
- **Nuovo `BookingStatus`** → non necessario (stato sulla campagna, ADR-0034).
- **Modifica della scadenza** (`PATCH`): fuori per ora (aprire → eventualmente chiudere e riaprire); additivo
  in futuro. Tracciato qui, non silenzioso.

---

## 2. Modello dati (Prisma) — UNA migrazione (nuova tabella + RLS raw)

A differenza di A4.2/D-032, D-011 **aggiunge una tabella**. Nuova entità `RenewalCampaign`, tenant-scoped come
tutte, con RLS `tenant_isolation` **aggiunta a mano** nella migrazione (Prisma non la genera — vedi il blocco
in [`20260630203447_pricing/migration.sql:106-129`](../../apps/api/prisma/migrations/20260630203447_pricing/migration.sql)).

```prisma
model RenewalCampaign {
  id                  String        @id @default(uuid()) @db.Uuid
  establishmentId     String        @db.Uuid
  originSeasonId      String        @db.Uuid   // stagione degli aventi-diritto (abbonati uscenti)
  destinationSeasonId String        @db.Uuid   // stagione entrante da riservare
  deadline            DateTime      @db.Date    // scadenza della finestra (uniforme per campagna); ADR-0031
  createdAt           DateTime      @default(now())

  establishment       Establishment @relation(fields: [establishmentId], references: [id])
  originSeason        Season        @relation("CampaignOrigin",      fields: [originSeasonId],      references: [id])
  destinationSeason   Season        @relation("CampaignDestination", fields: [destinationSeasonId], references: [id])

  @@unique([establishmentId, destinationSeasonId]) // una sola campagna per stagione di destinazione
  @@index([establishmentId])
}
```

Relazioni inverse **additive** (non-breaking, nessun dato tocco):
- `Establishment`: `renewalCampaigns RenewalCampaign[]`.
- `Season`: `campaignsAsOrigin RenewalCampaign[] @relation("CampaignOrigin")` e
  `campaignsAsDestination RenewalCampaign[] @relation("CampaignDestination")` (due relazioni allo stesso
  modello → **nomi espliciti obbligatori** in Prisma).

**Migrazione (raw appeso al generato)** — dopo `prisma migrate dev --name renewal_campaign`, appendere al
`migration.sql` (identico al pattern pricing):

```sql
ALTER TABLE "RenewalCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RenewalCampaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RenewalCampaign"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

> **Perché niente stato per-abbonato.** `deadline` è l'**unico** dato nuovo. `open/exercised/expired` derivano
> da: (a) `deadline` vs `todayInRome()`; (b) esistenza di un rinnovo confermato dell'abbonato nella stagione di
> destinazione (già derivabile via `previousBookingId`). Persistere lo stato per-abbonato sarebbe ridondante e
> soggetto a disallineamento (ADR-0034). **Nessun `BookingStatus` nuovo, nessun campo su `Booking`.**

---

## 3. Contratti (`@coralyn/contracts`) — additivi (nessun breaking change)

```ts
// --- Prelazione (D-011) ------------------------------------------------------

/** Input per aprire una campagna di prelazione. Le stagioni sono identificate da una data al loro interno
 *  (coerente con RenewBookingInput/subscriptions, che usano una data → Season). Server-autoritativo. */
export interface OpenRenewalCampaignInput {
  originDate: string;       // ISO yyyy-mm-dd: una data DENTRO la stagione di ORIGINE (aventi-diritto)
  destinationDate: string;  // ISO yyyy-mm-dd: una data DENTRO la stagione di DESTINAZIONE (da riservare)
  deadline: string;         // ISO yyyy-mm-dd: scadenza della finestra (uniforme per campagna)
}

/** Campagna di prelazione (una per stagione di destinazione). Date ISO yyyy-mm-dd. */
export interface RenewalCampaignDTO {
  id: string;
  originSeasonId: string;
  destinationSeasonId: string;
  deadline: string;         // ISO yyyy-mm-dd
}

/** Stato della finestra di un avente-diritto (derivato lazy). */
export type RenewalWindowState = 'open' | 'exercised' | 'expired';

/** Finestra di prelazione di un abbonato uscente, con priorità (anzianità) e stato derivato. */
export interface RenewalWindowItemDTO {
  sourceBookingId: string;  // l'abbonamento di ORIGINE (avente-diritto)
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  seniority: number;        // catena rinnovi (derivata, >= 1) — chiave d'ordinamento (priorità)
  state: RenewalWindowState;
}

/** Campagna + finestre (ordinate per anzianità decrescente). Ritorno di GET /renewal-campaigns. */
export interface RenewalCampaignDetailDTO extends RenewalCampaignDTO {
  windows: RenewalWindowItemDTO[];
}
```

- **`SubscriptionListItemDTO` invariato** (A4.2 non regredisce). Le finestre usano un DTO dedicato
  (`RenewalWindowItemDTO`) perché portano `sourceBookingId` + `state` (concetto di campagna, non di lista
  abbonati generica).
- **`BookingDTO` invariato.** Il rinnovo A4.2 resta l'azione che esercita la finestra; non serve nuovo campo.

---

## 4. Endpoint

### `POST /api/renewal-campaigns` — apre una campagna (nuovo)

- **Body:** `OpenRenewalCampaignDto` — `originDate`, `destinationDate`, `deadline`, tutti `@IsCalendarDate`
  **obbligatori**. `ValidationPipe({ whitelist, transform })` scarta ogni altro campo (gotcha ricorrente
  A3.2/A4.1/A4.2: i campi **devono** stare nel DTO).
- **Esito:** `201` + `RenewalCampaignDTO`.
- **Errori di dominio (nel service → status):**
  - `originDate`/`destinationDate` senza stagione → **422** "Nessuna stagione attiva per questa data".
  - stagione di origine **=** stagione di destinazione → **422** "Origine e destinazione devono differire".
  - destinazione **non successiva** all'origine (`destination.startDate <= origin.startDate`) → **422** "La
    stagione di destinazione deve seguire quella di origine" (la prelazione è in avanti nel tempo).
  - campagna **già esistente** per la stagione di destinazione (unique) → **409** "Campagna già aperta per
    questa stagione" (mappa `23505` → `P2002` → 409, come `Rate` in D-032).

### `GET /api/renewal-campaigns?destinationDate=<ISO>` — campagna + finestre (nuovo)

- **Query:** `RenewalCampaignQueryDto` (`destinationDate` `@IsCalendarDate`, **obbligatorio**).
- **Esito:** `200` + `RenewalCampaignDetailDTO` **oppure** `200` + `null` se non c'è campagna per la stagione
  che contiene `destinationDate`. Le `windows` sono gli abbonati **confermati** della stagione di **origine**
  della campagna, ciascuno con `seniority` e `state` (derivato lazy), **ordinate per `seniority` desc** (a
  parità, `sourceBookingId` per determinismo).
  - `state = exercised` se esiste un rinnovo **confermato** dell'abbonato **nella stagione di destinazione**.
  - `state = expired`   se non esercitata **e** `todayInRome() > deadline`.
  - `state = open`      altrimenti.

### `DELETE /api/renewal-campaigns/:id` — chiude/annulla una campagna (nuovo)

- **Esito:** `200` (idempotente-friendly) o `404` "Campagna non trovata" se fuori tenant/inesistente. Elimina
  la riga; **tutti gli hold derivati cadono** immediatamente (nessun posto "resta bloccato").

### `POST /api/bookings/:id/renew` — invariato nel contratto, **arricchito** nel dominio

Il rinnovo resta l'azione che **esercita** la finestra (A4.2). Nessun cambio di firma. L'unico effetto D-011:
esercitando la finestra, `state` passa a `exercised` alla lettura successiva, e l'hold sull'ombrellone diventa
la `Booking confirmed` reale (anti-overlap ordinario da lì in poi).

### Invariati

`POST /api/bookings` (**arricchito** dall'hold, vedi §5.2), `GET /api/bookings`, `GET /api/bookings/quote`
(**vedi nota §5.4**), `GET /api/bookings/subscriptions`, `DELETE /api/bookings/:id`,
`PATCH /api/bookings/:id/payment`, `GET /api/packages`, `GET /api/map` — firme **invariate**.

---

## 5. Backend — servizio, hold, modulo

### 5.1 Struttura (riuso, non duplicazione)

- **Nuovo `RenewalCampaignsService`** (dentro `BookingsModule`): apertura/lettura/chiusura campagna + calcolo
  finestre. **Riusa** `computeSeniority`.
- **Estrazione di `computeSeniority`** da metodo privato di `BookingsService`
  ([`bookings.service.ts:282-314`](../../apps/api/src/bookings/bookings.service.ts)) a **funzione condivisa**
  `computeSeniority(tx, ids)` in `apps/api/src/bookings/seniority.ts` (importata da entrambi i servizi). È un
  puro refactor **senza cambio di comportamento** (stessa risalita iterativa, RLS-safe); i test A4.2 di
  anzianità (`bookings.e2e-spec.ts:300-305`) restano verdi.
- **Nuovo `RenewalCampaignsController`** (rotta `renewal-campaigns`), registrato in `BookingsModule`.
- **Hold** implementato **dentro `BookingsService.priceAndWrite`** come query aggiuntiva (nessuna injection
  del service campagne in quello prenotazioni → nessun ciclo): la tabella `RenewalCampaign` si legge via
  `tx.renewalCampaign` nella stessa transazione `forTenant`.

### 5.2 Hold di prelazione — nuova invariante nel percorso di scrittura

In `priceAndWrite`, **dopo** l'anti-overlap esistente (`sameUmbrella`/`conflict`) e **prima** del pricing, si
aggiunge un controllo `assertNoPreemptionHold`:

```ts
// Hold di prelazione (D-011, ADR-0034): mentre una finestra è APERTA, l'ombrellone+fascia dell'avente-diritto
// è riservato a lui; un ALTRO cliente non può prenotarlo nella stagione di destinazione. Valutazione lazy:
// alla scadenza (today > deadline) la campagna non è più "aperta" e il blocco cade da solo (rilascio).
const today = todayInRome();
const openCampaigns = await tx.renewalCampaign.findMany({
  where: { deadline: { gte: toDbDate(today) } },            // aperte (scadenza non passata)
  include: { originSeason: true, destinationSeason: true },
});
for (const c of openCampaigns) {
  // La prenotazione ricade nella stagione di destinazione della campagna?
  if (!dateRangesOverlap(dbStart, dbEnd, c.destinationSeason.startDate, c.destinationSeason.endDate)) continue;
  // Aventi-diritto sull'ombrellone: abbonati CONFERMATI della stagione di ORIGINE, stesso ombrellone,
  // fascia sovrapposta, di un ALTRO cliente, NON ancora rinnovati nella stagione di destinazione.
  const os = c.originSeason;
  const holders = await tx.booking.findMany({
    where: {
      type: 'subscription', status: 'confirmed', umbrellaId: p.umbrellaId,
      startDate: { lte: os.endDate }, endDate: { gte: os.startDate },
      customerId: { not: p.customerId },                    // il proprio rinnovo non confligge col proprio hold
    },
    include: { timeSlot: true, renewals: true },
  });
  const held = holders.some(
    (h) => slotsOverlap(h.timeSlot, p.slot) &&
      !h.renewals.some((r) => r.status === 'confirmed' &&
        dateRangesOverlap(r.startDate, r.endDate, c.destinationSeason.startDate, c.destinationSeason.endDate)),
  );
  if (held) throw new ConflictException('Ombrellone riservato per prelazione');
}
```

**Correttezza (casi chiave):**
- **Rinnovo dell'avente-diritto:** `renew` passa `customerId = source.customerId` → escluso da
  `customerId: { not }` → **mai bloccato dal proprio hold**. (Inoltre `renewals` conterrà il rinnovo appena la
  finestra è esercitata.)
- **Altro cliente durante la finestra:** ricade nella stagione di destinazione, l'ombrellone ha un
  avente-diritto non rinnovato → **409** (riservato).
- **Dopo la scadenza (rilascio):** nessuna campagna "aperta" (`deadline < today`) → il ciclo salta → prenota
  liberamente. **Rilascio automatico e lazy**, senza job.
- **Chiusura campagna:** `DELETE` rimuove la riga → nessun hold → posto libero subito.
- **Qualsiasi `type`** (daily/periodic/subscription) di un altro cliente che sfora la stagione di destinazione
  è bloccato: se l'avente-diritto rinnovasse, occuperebbe **tutta** la stagione, quindi il posto non è
  pre-vendibile. Coerente con l'estensione dell'ombrellone dell'abbonamento.

### 5.3 `RenewalCampaignsService` — apertura, lettura (finestre), chiusura

- **`open(input)`**: `forTenant` → risolve `originSeason`/`destinationSeason` via
  `catalog.resolveSeasonWithin` (422 se assenti); valida distinte + direzione (422); `create` (unique →
  `P2002` → 409). Ritorna `RenewalCampaignDTO`.
  - **Piccola aggiunta additiva richiesta:** `resolveSeasonWithin` oggi ritorna `SeasonRange = { ok,
    startDate, endDate }` **senza `id`** ([`catalog.service.ts:57-69`](../../apps/api/src/catalog/catalog.service.ts)),
    ma la campagna deve persistere i **`seasonId`**. Il resolver è la "single source della risoluzione
    stagione" e ha già `seasons[0].id` (lo logga a riga 66). Si **estende `SeasonRange` con `id: string`**
    (campo additivo nel ramo `ok:true`): non-breaking (i chiamanti A4.1/A4.2 lo ignorano; nessun test
    regredisce), e la campagna riusa il resolver invece di duplicare la query stagione. Il confronto di
    direzione usa le `startDate` ISO (`destination.startDate <= origin.startDate` → 422).
- **`getByDestinationDate(date)`**: risolve la stagione di destinazione; trova la campagna (o `null`); carica
  gli abbonati **confermati** della stagione di origine (stessa query di `listSubscriptions`), `computeSeniority`,
  e per ciascuno deriva `state` (rinnovo confermato nella destinazione? → `exercised`; `today > deadline`? →
  `expired`; else `open`). **Ordina per `seniority` desc, poi `sourceBookingId`.** Ritorna
  `RenewalCampaignDetailDTO | null`.
- **`close(id)`**: `forTenant` → `deleteMany({ where: { id } })`; `count===0` → 404.

> **Stato derivato in un solo posto (per la lettura):** una proiezione `toRenewalWindowItemDTO(booking,
> seniority, state)` in `renewal-window.projection.ts`. Il predicato "rinnovato nella destinazione" è la
> stessa idea del flag `renewed` A4.2, **ristretto** alla stagione di destinazione della campagna.

### 5.4 Nota su `quote` (preview di prezzo)

`GET /bookings/quote` **non** applica l'hold (è una preview di **prezzo**, non una scrittura). L'hold è una
regola di **disponibilità**, applicata solo alla `create`/`renew` (come l'anti-overlap, che neppure `quote`
verifica). Coerente con A4.1. *(La FE non offre "quote" nel flusso prelazione; nessun impatto.)*

---

## 6. FE (`apps/web-staff`) — vista "Rinnovi" estesa

Estende [`RenewalsView.vue`](../../apps/web-staff/src/features/renewals/RenewalsView.vue) e
[`useRenewals.ts`](../../apps/web-staff/src/features/renewals/useRenewals.ts) **senza** rompere A4.2.

- **Selettori esistenti** (stagione origine `sourceDate`, destinazione `targetDate`) **restano**.
- **Overlay campagna:** `useRenewalCampaign(targetDate)` → `GET /renewal-campaigns?destinationDate=`.
  - **Nessuna campagna:** mostra un pannello **"Apri campagna di prelazione"** con un `<input type="date">`
    per la **scadenza** → `useOpenCampaign()` (`POST`), che invalida la query campagna. Finché non c'è
    campagna, la tabella resta quella A4.2 (lista abbonati origine, badge "Da rinnovare/Rinnovato") — **A4.2
    intatta**.
  - **Campagna presente:** mostra la **scadenza** e un'azione **"Chiudi campagna"** (`useCloseCampaign()`,
    `DELETE`). Le righe diventano le **`windows`** (già ordinate per anzianità dal server); la colonna **Stato**
    usa `state`:
    - `open` → badge neutro **"Aperta"** (con la scadenza),
    - `exercised` → badge success **"Rinnovato"**,
    - `expired` → badge warning/danger **"Scaduta"** (posto liberato).
  - Il bottone **Rinnova** resta per riga: abilitato se `state !== 'exercised'` **e** c'è `targetDate`.
    Rinnovare una finestra **scaduta** è ancora ammesso se il posto è libero (il backend risponde 409 se un
    altro l'ha preso nel frattempo — messaggio mostrato).
- **Riuso ui-kit** (ADR-0033): `Badge` (toni neutral/success/warning), `Button`, `DataTable`, `Avatar`,
  `EmptyState`. Nessun nuovo componente ui-kit previsto (se serve un tono "warning" mancante, verificarlo nel
  ui-kit prima — additivo e testato, come `trash-2` in D-032).
- **Composable/HTTP:** `useRenewalCampaign` (query), `useOpenCampaign`/`useCloseCampaign` (mutation) in
  `useRenewals.ts`; chiavi in `queryKeys.ts` (`renewalCampaign(estId, destinationDate)`). Su successo di
  apertura/chiusura/rinnovo → invalidare `renewalCampaign` (+ `subscriptions`, `map` come già fa il rinnovo).
- **MSW:** handler per `GET/POST/DELETE /api/renewal-campaigns`.
- **Pulire `apps/web-staff/node_modules/.vite`** dopo il cambio contratti (gotcha ricorrente).

---

## 7. ADR-0034 (nuovo) — contenuto in sintesi

`docs/architecture/decisions/0034-prelazione-finestre-lazy.md` (Status: Accepted). Punti:
- **Decisione:** la prelazione persiste **solo** la campagna (scadenza + stagioni); le finestre per-abbonato
  (aperta/esercitata/scaduta) sono **derivate**; il **rilascio è lazy** (nessuno scheduler); l'**hold** è una
  **invariante applicativa** nel percorso di scrittura, accanto all'anti-overlap; **nessun `BookingStatus`
  nuovo**; **priorità = ordinamento per anzianità**.
- **Alternative scartate:** (a) **job schedulato** (`@nestjs/schedule`) — nuova infra/dipendenza e stato di
  background sproporzionati per l'MVP; (b) **righe finestra per-abbonato** — più pesanti, abiliterebbero
  scadenze scaglionate/rinuncia (gold-plating → D-013); (c) **scadenza puramente derivata da formula** — toglie
  all'operatore il controllo della scadenza della campagna.
- **Conseguenze:** rilascio senza evento/audit (accettabile: stato deterministico e ricomputabile); la *race*
  create-vs-hold è la stessa classe dell'anti-overlap ([D-030](../architecture/deferred.md)), accettabile per
  il deploy mono-operatore dell'MVP; disciplina: ogni nuovo percorso di scrittura di `Booking` deve passare da
  `priceAndWrite` (già unico).
- **Rubric check** (professionalità/convenzioni/modularità/zero-debito).

Aggiornare l'**indice ADR** in `README.md` e i "correlati" in ADR-0012 (D-011 → realizzata da ADR-0034).

---

## 8. Test (TDD, commit-per-layer)

Target da **non** regredire (riverificare dal vivo): **ui-kit 41 · web-staff 93 · api unit 77 · api e2e 90.**

### api unit
- **`open-renewal-campaign.dto.spec`**: `originDate`/`destinationDate`/`deadline` obbligatori + calendariali;
  nessun altro campo accettato (whitelist).
- **`renewal-campaign-query.dto.spec`**: `destinationDate` obbligatorio + calendariale.
- **`seniority.spec`** (se utile dopo l'estrazione): la funzione condivisa calcola le profondità note (fresh=1,
  rinnovo=2) — o coperta implicitamente dagli e2e A4.2 già verdi.

### api e2e (`coralyn_test`, 2 tenant, seed listino 2026+2027 già esistente da A4.2)
- **apertura felice:** `POST /renewal-campaigns` (origine 2026 → destinazione 2027, scadenza futura) → **201**;
  DTO con le due `seasonId` + `deadline`.
- **validazioni apertura → 422:** origine=destinazione; destinazione precedente all'origine; data senza
  stagione. **duplicato → 409** (seconda campagna sulla stessa destinazione).
- **finestre + stato + priorità:** `GET /renewal-campaigns?destinationDate=<2027>` → `windows` degli abbonati
  2026, **ordinate per anzianità desc**; abbonato non rinnovato con scadenza futura → `state=open`; dopo
  `renew` di quell'abbonato in 2027 → `state=exercised`; con **scadenza passata** (campagna aperta con
  `deadline` < oggi) e non rinnovato → `state=expired`.
- **HOLD (cuore di D-011):** campagna 2026→2027 aperta; un **altro** cliente prova a creare una `subscription`
  (o `daily`) 2027 sull'ombrellone dell'avente-diritto → **409** "Ombrellone riservato per prelazione". Lo
  **stesso** avente-diritto che rinnova sullo **stesso** ombrellone → **201** (mai bloccato dal proprio hold).
- **RILASCIO lazy:** con `deadline` **passata**, l'altro cliente crea la 2027 sullo stesso ombrellone → **201**
  (posto liberato senza job).
- **CHIUSURA:** `DELETE /renewal-campaigns/:id` → **200**; subito dopo, l'altro cliente prenota l'ombrellone in
  2027 → **201** (hold caduto). `DELETE` di id inesistente/altro tenant → **404**.
- **isolamento RLS:** la campagna del tenant A è invisibile al tenant B (GET → `null`; DELETE → 404); l'hold di
  A non blocca le prenotazioni di B (stagioni/ombrelloni distinti).
- **A4.2 non regredita:** i test rinnovo/anzianità/anti-overlap esistenti
  ([`bookings.e2e-spec.ts:262-357`](../../apps/api/test/bookings.e2e-spec.ts)) restano verdi.

### web-staff (Vitest + MSW)
- `RenewalsView.spec` (estensione): senza campagna mostra "Apri campagna"; dopo apertura mostra la **scadenza**
  e i badge di stato **Aperta/Scaduta/Rinnovato**; l'azione **Rinnova** chiama la mutation; "Chiudi campagna"
  invoca `DELETE`. A4.2 (lista + rinnovo) resta coperta.

---

## 9. Verifica / DoD

- **Migrazione:** `prisma migrate dev --name renewal_campaign`, poi **appendere il blocco RLS** al
  `migration.sql` (vedi §2) e ri-applicare; `prisma generate`. Su macchina/DB stale: `prisma migrate deploy` su
  `coralyn_test` **e** `coralyn_dev`.
- **Container API:** `docker compose --profile full up -d --build api` (il container **non** ha il codice nuovo
  finché non lo rebuildi — gotcha handoff §5). Verificare data: `docker inspect coralyn-api --format
  '{{.Created}}'`.
- **Test verdi**, conteggi **≥** baseline + i nuovi. `corepack pnpm -r build` + `corepack pnpm eslint .` verdi.
- **Verifica live** (login `admin@coralyn.dev` / `coralyn-admin-8473`): nella vista **Rinnovi**, scegliere
  origine 2026 + destinazione 2027, **aprire** la campagna con una scadenza; verificare che i badge mostrino
  **Aperta**, che un tentativo di prenotare l'ombrellone riservato da un altro cliente dia errore, che il
  **rinnovo** porti la finestra a **Rinnovato**, e che **chiudere** la campagna liberi il posto. *(Gotcha
  preview handoff §5: se il proxy autoPort è morto, navigare direttamente alla porta Vite reale via
  `location.replace`.)*
- **Doc:** `deferred.md` (**D-011 → Risolte**, ref ADR-0034 + spec + piano; rimuovere dalla tabella);
  `README.md` (indice ADR += 0034; modulo `bookings` cita la prelazione); `data-model.md` (nuova entità
  `RenewalCampaign` + relazioni; l'invariante di hold); `glossary.md` (**Prelazione** → implementata (D-011));
  **handoff D-011**. ADR-0034 aggiunto; ADR-0012 "correlati" aggiornato.

---

## 10. Casi limite e regole d'integrità (riepilogo)

- **Server-autoritativo:** l'apertura riceve solo tre date; le stagioni sono risolte dal server; la scadenza è
  l'unico dato libero.
- **Una campagna per destinazione:** unique `(establishmentId, destinationSeasonId)`; duplicato → 409.
- **Direzione:** destinazione deve **seguire** l'origine (422) — la prelazione è in avanti (a differenza del
  rinnovo A4.2, che imponeva solo "stagione diversa"; per una *campagna* la direzione ha senso).
- **Hold ≠ Booking:** l'hold è **derivato** (nessuna riga fantasma); esiste finché la campagna è aperta e
  l'avente-diritto non ha rinnovato; **cade lazy** alla scadenza o alla chiusura.
- **Il proprio rinnovo non si auto-blocca:** `customerId: { not }` esclude l'avente-diritto; il rinnovo esercita
  la finestra e diventa la `Booking` reale (anti-overlap ordinario da lì).
- **Anzianità = priorità:** ordinamento `seniority` desc (riuso `computeSeniority`, RLS-safe, profondità
  minima); a parità, `sourceBookingId`.
- **Nessun nuovo stato di prenotazione:** `BookingStatus` intatto; mappa/pagamenti invariati.
- **Isolamento:** ogni query in `forTenant`; RLS FORCE anche su `RenewalCampaign`; e2e a 2 tenant.
- **Race create-vs-hold:** stessa classe dell'anti-overlap applicativo ([D-030](../architecture/deferred.md));
  accettabile per l'MVP mono-operatore; nessun vincolo DB introdotto (coerente con ADR-0034 lazy).

## 11. Decisioni chiuse

1. **Modello finestra:** entità `RenewalCampaign` (una per stagione di destinazione) come **unico** stato
   persistito (scadenza + stagioni); finestre per-abbonato **derivate**. (§1, §2 — handoff §4.1)
2. **Rilascio:** **lazy** (nessun job/cron), confronto con `todayInRome()` in lettura e in scrittura. (§5.2 —
   handoff §4.2, ADR-0034)
3. **Nessun nuovo `BookingStatus`:** lo stato vive sulla campagna. (§1, §2 — handoff §4.3)
4. **Hold come invariante applicativa** dentro `priceAndWrite`, accanto all'anti-overlap; il proprio rinnovo è
   escluso via `customerId`. (§5.2 — handoff §4.5)
5. **Priorità = ordinamento per anzianità** (server), riuso `computeSeniority` **estratto** in `seniority.ts`.
   (§5.1, §5.3 — handoff §4.4)
6. **Superficie API:** `POST`/`GET`/`DELETE /renewal-campaigns`; `subscriptions` e `renew` A4.2 invariati nelle
   firme. (§4)
7. **FE:** overlay campagna sulla vista Rinnovi (apri/chiudi + badge stato + ordinamento), A4.2 preservata. (§6)
8. **Fuori scope:** rinuncia esplicita [D-013], notifiche [D-006], caparra [D-009], scadenze scaglionate, job
   schedulato, `PATCH` scadenza. (§1)
9. **ADR-0034** perché D-011 introduce architettura nuova (entità + invariante), a differenza di A4.2/D-032. (§7)
```