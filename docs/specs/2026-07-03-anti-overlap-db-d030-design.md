# Anti-overlap a livello DB (D-030) — Design Spec

- **Data:** 2026-07-03
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-03. **Da pianificare ed
  eseguire** (ADR-0009).
- **Origine:** l'invariante di disponibilità ("nessuna sovrapposizione tra prenotazioni confermate sullo stesso ombrellone")
  è oggi enforced **solo a livello applicativo**, dentro la transazione `forTenant` della create
  ([`bookings.service.ts:133-144`](../../apps/api/src/bookings/bookings.service.ts), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)).
  Due create concorrenti sullo stesso ombrellone+fascia possono passare entrambe il controllo (finestra di *race*) e
  produrre un doppione. Questo slice porta l'invariante **anche nel DB** come garanzia strutturale (difesa-in-profondità).
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (l'invariante
  anti-overlap è "la correttezza al cuore del prodotto"), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
  (fascia come granularità), [ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md) (prelazione/rinnovo),
  [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow). **Nuovo ADR-0037** (§7).
- **Convenzione:** codice/DB in inglese; UI/doc in italiano. Baseline test da NON regredire (su `main`, post-slice Equipment,
  verificata live 2026-07-03): **api unit 97 · api e2e 142 · web-staff 153 (globa ui-kit) · ui-kit standalone 55.** Typecheck
  web-staff pulito.
- **Richiede una migrazione** (schema + dati): 2 colonne su `Booking` + backfill + trigger + constraint + estensione.
  **Slice backend-only** (nessun tocco FE).

---

## 1. Situazione attuale (verificata leggendo il codice)

- **Definizione di conflitto** ([`booking.availability.ts`](../../apps/api/src/bookings/booking.availability.ts)): due
  prenotazioni confliggono se stesso `umbrellaId`, entrambe `status='confirmed'`, **intervalli di date sovrapposti**
  (`dateRangesOverlap`, estremi **inclusi**: `aStart ≤ bEnd && bStart ≤ aEnd`) **e fasce sovrapposte** (`slotsOverlap`,
  semiaperto `[start,end)`: contigue **non** collidono). L'overlap di fascia usa gli **orari** (`TimeSlot.startTime/endTime`),
  **non** l'uguaglianza di `timeSlotId`: "Giorno Intero" (08–19) confligge con "Mattina" (08–13) pur essendo fasce diverse.
- **Enforcement** ([`bookings.service.ts:133-144`](../../apps/api/src/bookings/bookings.service.ts)): dentro `create`,
  `tx.booking.findMany({ umbrellaId, status:'confirmed', id ≠ previousBookingId })` + filtro `dateRangesOverlap && slotsOverlap`
  in JS → `ConflictException('Fascia non disponibile per questo ombrellone')` (409). Il `id ≠ previousBookingId` esclude la
  **sorgente di un rinnovo** dal conflitto (evita un 409 spurio del rinnovo contro sé stesso).
- **Campagna rinnovo** ([`renewal-campaigns.service.ts:31-32`](../../apps/api/src/bookings/renewal-campaigns.service.ts)):
  `open()` valida oggi `dest.startDate > origin.startDate` ("la destinazione deve seguire l'origine") — **troppo debole**:
  la destinazione può ancora **sovrapporsi** all'origine (es. origine `[05-01, 09-30]`, destinazione `[06-01, 10-31]`).
- **Schema** ([`schema.prisma` `model Booking`](../../apps/api/prisma/schema.prisma)): `Booking` ha `umbrellaId`,
  `timeSlotId`, `startDate`/`endDate` (`@db.Date`), `status`, `previousBookingId`. Nessun orario denormalizzato.
- **Pattern raw-SQL esistente**: l'indice `Rate_signature_key` (`NULLS NOT DISTINCT`) è già un oggetto DB non modellato da
  Prisma, con mapping `23505 → 409` nel service ([D-032](../architecture/deferred.md)). Lo riusiamo come precedente.

**Debito**: l'invariante più importante del prodotto è garantita solo dal controllo applicativo; sotto concorrenza reale
(due operatori, o una scheda duplicata) c'è una finestra di race che può corrompere i dati. Additivo, tracciato in
[D-030](../architecture/deferred.md).

## 2. Obiettivo e principio (deciso)

Portare l'invariante anti-overlap **nel DB** come `EXCLUDE` constraint (garanzia strutturale, indipendente dall'app: regge
anche a SQL diretto o a un bug applicativo), **mantenendo** il controllo applicativo come percorso primario (messaggio
gentile 409 + contesto rinnovo/prelazione che il DB non può esprimere). Il constraint è la **rete di sicurezza** che chiude
la race; quando scatta, l'errore tecnico è tradotto nello stesso 409.

**Principio chiave:** il constraint deve avere **la stessa semantica** del controllo applicativo (stessa definizione di
overlap), altrimenti diverge e rifiuta prenotazioni valide o ne ammette di invalide.

**Fuori scope (YAGNI):** nessun cambio al modello di prenotazione oltre alle 2 colonne di occupazione; nessun tocco FE;
niente riscrittura del controllo applicativo (resta primario); niente prelazione (il constraint non la esprime, resta
applicativa). Split periodica multi-stagione = **D-033** (invariato).

## 3. Modello dati (schema + migrazione)

### 3.1 Perché servono 2 colonne su `Booking`

Un `EXCLUDE` constraint può riferire **solo colonne (o espressioni immutabili) della riga stessa**: non può fare join a
`TimeSlot` per leggere gli orari. Confrontare per `timeSlotId WITH =` sarebbe **più debole** del controllo applicativo
(mancherebbe il caso Giorno-Intero-vs-Mattina → doppione reale ammesso). Quindi l'**intervallo orario della fascia va
materializzato sulla riga `Booking`**.

Si aggiungono due colonne **minuti-dalla-mezzanotte** (interi, per usare `int4range` immutabile nel constraint):

```prisma
model Booking {
  // …campi esistenti…
  slotStartMin  Int   // minuti-dalla-mezzanotte, denormalizzato da TimeSlot.startTime
  slotEndMin    Int   // minuti-dalla-mezzanotte, denormalizzato da TimeSlot.endTime
}
```

Semantica: l'**occupazione oraria è intrinseca alla prenotazione**, fissata alla creazione. Modificare in seguito gli
orari di una fascia **non** sposta retroattivamente le prenotazioni già fatte (correttezza storica, non debito).

### 3.2 Popolamento DB-autoritativo (trigger)

Le due colonne sono popolate da un **trigger `BEFORE INSERT OR UPDATE`** su `Booking` che legge `TimeSlot.startTime/endTime`
della `timeSlotId` e converte in minuti (`EXTRACT(HOUR)*60 + EXTRACT(MINUTE)`). L'app **non** le scrive (sarebbe difesa più
debole). Il trigger fa parte della garanzia: le colonne non possono divergere dalla fascia referenziata al momento della
scrittura.

```sql
CREATE OR REPLACE FUNCTION booking_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME;
BEGIN
  SELECT "startTime", "endTime" INTO s, e FROM "TimeSlot" WHERE id = NEW."timeSlotId";
  IF s IS NULL THEN RAISE EXCEPTION 'TimeSlot % inesistente per la prenotazione', NEW."timeSlotId"; END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "timeSlotId" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_fill_slot_minutes();
```

### 3.3 Il constraint

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- per mischiare '=' (uuid) e '&&' (range) in un gist EXCLUDE

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap EXCLUDE USING gist (
  "umbrellaId"                                WITH =,
  daterange("startDate", "endDate", '[]')     WITH &&,   -- inclusivo: allineato a dateRangesOverlap
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&  -- semiaperto: allineato a slotsOverlap
) WHERE (status = 'confirmed');                          -- solo confermate bloccano (cancellate no)
```

- `daterange('[]')` = estremi **inclusi** (come `dateRangesOverlap`).
- `int4range('[)')` = **semiaperto** (come `slotsOverlap`; fasce contigue non collidono).
- Partial `WHERE status='confirmed'`: le cancellate non bloccano (come l'app).

### 3.4 Migrazione (una sola, con backfill sotto RLS)

`Booking` è tenant-scoped con `FORCE ROW LEVEL SECURITY` e il ruolo di migrazione (`coralyn_app`) è `NOBYPASSRLS`: il
backfill che legge `Booking`/`TimeSlot` va fatto con la stessa **manovra `NO FORCE`/`FORCE`** dello slice Equipment,
altrimenti legge zero righe (GUC `app.current_tenant` non impostata in `migrate deploy`). Ordine:

1. `CREATE EXTENSION IF NOT EXISTS btree_gist;`
2. `ALTER TABLE "Booking" ADD COLUMN "slotStartMin" INT, ADD COLUMN "slotEndMin" INT;` (nullable per ora).
3. `ALTER TABLE "Booking" NO FORCE ROW LEVEL SECURITY; ALTER TABLE "TimeSlot" NO FORCE ROW LEVEL SECURITY;`
4. **Backfill** delle prenotazioni esistenti dai rispettivi `TimeSlot`:
   ```sql
   UPDATE "Booking" b SET
     "slotStartMin" = EXTRACT(HOUR FROM t."startTime")::int*60 + EXTRACT(MINUTE FROM t."startTime")::int,
     "slotEndMin"   = EXTRACT(HOUR FROM t."endTime")::int*60   + EXTRACT(MINUTE FROM t."endTime")::int
   FROM "TimeSlot" t WHERE t.id = b."timeSlotId";
   ```
5. `ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY; ALTER TABLE "TimeSlot" FORCE ROW LEVEL SECURITY;`
6. `ALTER TABLE "Booking" ALTER COLUMN "slotStartMin" SET NOT NULL, ALTER COLUMN "slotEndMin" SET NOT NULL;`
7. Funzione + trigger (§3.2).
8. Constraint + estensione (§3.3).

Applicare a `coralyn_dev` e `coralyn_test`; `prisma migrate status` pulito su entrambi. (Le colonne sono modellate da
Prisma; trigger/constraint/estensione sono raw-SQL non visti da Prisma → si aggiungono al drift pre-esistente di
`Rate_signature_key` su `migrate dev`, coerente col pattern già in uso.)

## 4. Backend (NestJS)

### 4.1 Mapping errore constraint → 409

In `bookings.service.ts create`, avvolgere la scrittura così che una **exclusion violation** Postgres (`SQLSTATE 23P01`,
non `23505`) sia tradotta in `ConflictException('Fascia non disponibile per questo ombrellone')` — stesso messaggio del
controllo applicativo, così client e test non distinguono chi ha bloccato. Prisma espone il codice nativo via
`PrismaClientKnownRequestError.meta` / `code` (o si ispeziona il messaggio); il pattern è già usato per `Rate_signature_key`
(`23505 → 409` in `rates.service`). Riusare quel pattern.

### 4.2 Controllo applicativo invariato (resta primario)

`bookings.service.ts:133-144` **non cambia**: dà il 409 gentile nel caso normale e gestisce l'esclusione del rinnovo
(`id ≠ previousBookingId`) e la prelazione (che il constraint non esprime). Il constraint è la rete per la sola finestra di
race.

### 4.3 Invariante stagioni di una campagna rinnovo (rende il constraint rinnovo-safe)

Il constraint è più severo dell'app: non sa auto-escludere la sorgente di un rinnovo. Scatterebbe (409 spurio) **solo** se la
stagione di **destinazione** di una campagna si sovrappone all'**origine** (stesso ombrellone+fascia). Si chiude alla radice
**rafforzando** la validazione già presente in `renewal-campaigns.service.ts:31-32`:

- **Da:** `if (dest.startDate <= origin.startDate) → 422`
- **A:** `if (dest.startDate <= origin.endDate) → 422` con messaggio "La stagione di destinazione deve iniziare dopo la fine
  di quella di origine".

Così un rinnovo (destinazione) non può mai sovrapporsi in date alla sua sorgente (origine) → il constraint non lo rifiuta
mai. Il seed usa stagioni non contigue (2026 `[05-01,09-30]`, 2027 `[05-01,09-30]`) → l'irrobustimento non rompe i test
rinnovo esistenti.

## 5. Piano di test (TDD)

- **Unit** (backend): helper di conversione `time → minuti-dalla-mezzanotte` (puro, casi 08:00→480, 13:00→780, 19:00→1140).
  Il controllo applicativo (`slotsOverlap`/`dateRangesOverlap`) è già coperto — nessuna regressione.
- **e2e** ([`bookings.e2e-spec.ts`](../../apps/api/test/bookings.e2e-spec.ts) o dedicato):
  - stessa fascia, stesso ombrellone, date sovrapposte → **409** (il constraint/app blocca);
  - **Giorno Intero vs Mattina** (fasce diverse ma orari sovrapposti) stesso ombrellone/data → **409** (il caso che
    `timeSlotId WITH =` mancherebbe: prova la correttezza della semantica oraria);
  - fasce **contigue** (Mattina 08–13 + Pomeriggio 13–19) stesso ombrellone/data → **201** (non collidono);
  - una prenotazione **cancellata** non blocca una nuova sovrapposta → **201**;
  - **rinnovo** su stagione futura (non sovrapposta) → **201** (nessun 409 spurio);
  - `open()` campagna con destinazione che **si sovrappone** all'origine → **422** (invariante §4.3);
  - (difesa-in-profondità) la colonna `slotStartMin/slotEndMin` è popolata correttamente dal trigger (verificabile via il
    comportamento del constraint; opzionale un assert diretto).
- **Migrazione**: dopo la migration, le prenotazioni seed/esistenti hanno `slotStartMin/slotEndMin` coerenti con la loro
  fascia; `migrate status` pulito su dev+test.
- Baseline da NON regredire: **api unit 97 · e2e 142 · web-staff 153 · ui-kit 55**; typecheck pulito. Incrementi additivi su
  unit (+helper) ed e2e (+casi constraint/invariante).

## 6. Confine con altri D-0xx

- **D-033** (periodica multi-stagione) invariato: il constraint lavora per riga, indipendente dallo split multi-stagione.
- **D-015** (fasce a orari arbitrari) invariato: il modello a minuti-dalla-mezzanotte è già generale su qualsiasi orario.
- La prelazione (D-011/ADR-0034) resta applicativa: il constraint non la esprime, per scelta.

## 7. ADR-0037 (nuovo)

Creare [`docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md`](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md):
formalizza l'invariante anti-overlap **a livello DB** via `EXCLUDE USING gist` (btree_gist) su `umbrellaId` + `daterange`
inclusivo + `int4range` semiaperto dei minuti-fascia, `WHERE status='confirmed'`; l'occupazione oraria **denormalizzata**
su `Booking` (`slotStartMin/slotEndMin`) e mantenuta **DB-autoritativa** da un trigger (intrinseca alla prenotazione, non
un lookup vivo); il controllo applicativo resta **primario** (constraint = backstop di race, `23P01 → 409`); l'**invariante
stagioni non-sovrapposte** di una campagna rinnovo rende il constraint rinnovo-safe. **Raffina ADR-0006** (l'invariante
anti-overlap ora ha una garanzia strutturale) e **ADR-0013**; rimando in ADR-0006 e in [ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md)
(la validazione stagioni rafforzata). Rubric check (4 punti).

## 8. Decisioni (risolte in brainstorming 2026-07-03)

1. **Constraint DB `EXCLUDE`** (non solo controllo applicativo): garanzia strutturale contro la race, la scelta professionale
   per l'invariante centrale del prodotto.
2. **Occupazione oraria materializzata su `Booking`** (`slotStartMin/slotEndMin`, minuti-dalla-mezzanotte): necessaria perché
   l'`EXCLUDE` non può fare join; `timeSlotId WITH =` sarebbe più debole (mancherebbe Giorno-Intero-vs-Mattina).
3. **Popolamento via trigger DB** (non app-set): mantiene la garanzia DB-autoritativa, indipendente da bug applicativi.
4. **Nessuna colonna `GENERATED`**: l'`EXCLUDE` usa espressioni immutabili inline (`daterange`, `int4range`) sulle colonne
   memorizzate.
5. **Semantica allineata all'app**: date inclusive `[]`, fasce semiaperte `[)`, partial `status='confirmed'`.
6. **Controllo applicativo primario, constraint backstop**: `23P01 → 409` con lo stesso messaggio; niente doppio messaggio.
7. **Invariante rinnovo-safe rafforzando la validazione esistente** (`dest.startDate > origin.endDate`): il constraint non
   rifiuta mai un rinnovo valido, e la regola è semanticamente corretta (si rinnova verso il futuro).

## 9. Scope, branch, logistica

- **Slice separato**, **nuovo branch da `main`** (ADR-0009). File toccati: `schema.prisma` + nuova migration (colonne +
  backfill + trigger + constraint + estensione); `bookings.service.ts` (mapping `23P01 → 409`); `renewal-campaigns.service.ts`
  (validazione rafforzata); nuovo helper `time → minuti` + unit test; e2e (nuovi casi); nuovo ADR-0037 + rimandi ADR-0006/0034.
  **Backend-only, nessun FE.**
- **Layer previsti (un commit per layer; il piano potrà accorpare dove sensato):** (1) schema + migrazione (colonne, backfill,
  trigger, constraint) + helper minuti; (2) mapping `23P01 → 409` in create + validazione stagioni rafforzata + e2e; (3) doc
  ADR-0037 + rimandi. (Nota: 1 e 2 potrebbero accorparsi se la migrazione senza il mapping lascerebbe l'e2e a metà — il piano
  decide.)
- **Workflow ADR-0009:** questa spec → (approvazione utente) → piano TDD (`writing-plans`) → esecuzione subagent-driven,
  test-first, un commit per layer. Non regredire i conteggi (riverificati dal vivo).
