# ADR-0053: Ritiro ombrellone (soft-delete) — `retiredAt` + sgancio dalla fila

- **Status:** Accepted
- **Data:** 2026-07-22
- **ADR correlati:** [ADR-0052](0052-editor-struttura-cantiere.md) (guardia block-409 di `delete` + FK
  `Booking.umbrellaId` RESTRICT, il gap che genera questo ADR), [ADR-0016](0016-tipologia-ombrellone.md)
  (invariante label, qui ristretto agli attivi)
- **Deferred:** [D-055](../deferred.md)
- **Spec:** [2026-07-22-ritira-ombrellone-d055-design.md](../../superpowers/specs/2026-07-22-ritira-ombrellone-d055-design.md)

## Context

Un ombrellone con storico prenotazioni — anche solo scadute o cancellate — **non è eliminabile
by design**: la guardia di `remove` conta tutte le `Booking` collegate e la FK
`Booking.umbrellaId` è `RESTRICT` ([ADR-0052](0052-editor-struttura-cantiere.md)). La disdetta
anticipata libera il posto in mappa ma non tocca lo storico, quindi non sblocca l'eliminazione.
Gap dimostrato sul campo il 2026-07-22: l'unica via praticabile era distruggere storico
contabile a mano sul DB. Serve una **dismissione amministrativa** che tolga l'ombrellone dalla
spiaggia operativa senza toccare lo storico né la FK.

`Elimina` (esistente) e `Ritira` (nuova) restano entrambe, esplicite e distinte: `Elimina` è per
un ombrellone mai prenotato (dati distrutti, irreversibile); `Ritira` è per un ombrellone con
storico da conservare (dati intatti, reversibile via `Ripristina`).

## Decision

**`retiredAt` + sgancio dalla fila**, con archivio/restore nel Cantiere, sul pattern del
soft-archive già esistente dei pacchetti (`Package.archivedAt`, `POST :id/archive`/`:id/restore`
idempotenti) — nome di dominio proprio (`retiredAt`/`retire`) perché la dismissione fisica di un
ombrellone non è la stessa cosa dell'archiviazione di una configurazione di catalogo.

Su `Umbrella`:

- **`retiredAt DateTime?`** — `null` = attivo, valorizzato = ritirato.
- **`retiredFrom String?`** — snapshot testuale della posizione al momento del ritiro (es.
  «Centro · Fila 1»): è **storico** (una stringa congelata), non un riferimento vivo a
  Settore/Fila; azzerato al ripristino.
- **`rowId` reso nullable** — il ritiro **sgancia** l'ombrellone dalla fila (`rowId = null`), non
  si limita a marcarlo. `logicalOrder` di un ritirato conserva l'ultimo valore (privo di
  significato da sganciato); il ripristino lo ricalcola con `nextLogicalOrder(rowId)` sulla fila
  di destinazione scelta.
- **Unicità label ristretta agli attivi.** `@@unique([establishmentId, label])` è **rimosso dal
  DSL Prisma**; al suo posto un **indice unico parziale** creato a mano in SQL nella migration
  `20260722212844_umbrella_retire_soft_delete` (`--create-only`, editata):

  ```sql
  CREATE UNIQUE INDEX "Umbrella_establishmentId_label_active_key"
    ON "Umbrella" ("establishmentId", "label")
    WHERE "retiredAt" IS NULL;
  ```

  Il DSL Prisma non modella indici parziali: lo schema porta un commento esplicito accanto al
  campo che documenta l'indice invisibile e avverte di non reintrodurre `@@unique` lì. Ritirato il
  «12», un nuovo «12» attivo si può creare subito — è la label fisica reale, e la spiaggia può
  rinumerare un posto libero prima che lo storico del vecchio «12» sia mai consultato.

API (admin-only, `establishment/umbrellas`, stile del repo — `forTenant` + `@Roles(Role.Admin)`):

- **`POST :id/retire`** — guardia **409** se esistono prenotazioni **confermate con
  `endDate >= todayInRome()`** (copy: «Ombrellone con prenotazioni attive o future: disdici prima
  di ritirare»). Prenotazioni scadute o cancellate non bloccano. Effetto in transazione:
  `retiredAt = now()`, `rowId = null`, `retiredFrom` = snapshot da fila+settore correnti.
  **Idempotente**: ripetuto su un già-ritirato restituisce lo stato corrente senza rilanciare la
  guardia né toccare il timestamp (mirror dell'`archive` dei pacchetti).
- **`POST :id/restore`** — input `{ rowId }`: 404 se la fila non esiste nel tenant (RLS), **409** se un
  **attivo** ha già la stessa label (copy che spiega il conflitto, invita a rinominare prima).
  Effetto: `retiredAt = null`, `retiredFrom = null`, `rowId = input.rowId`,
  `logicalOrder = nextLogicalOrder(rowId)`. Idempotente su un già-attivo (no-op).
- **`GET :id/retired`** (route statica, dichiarata **prima** delle rotte parametriche `:id/...`
  per non farla catturare come un `id` letterale) — lista `RetiredUmbrellaDTO`, ordinata per
  `retiredAt` desc.

Filtro `retiredAt: null` aggiunto ai punti di contatto che devono ignorare i ritirati: clash label
in `create`/`update`/`generate`, validazione ombrellone alla creazione prenotazione, contatore
overview, metriche piattaforma, `findMany` delle operazioni bulk. Struttura/mappa/Cantiere sono
**esclusioni gratuite**: attraversano `row → umbrellas`, e un ritirato non ha fila.

Copy del 409 di `delete` aggiornata per suggerire «Ritira» come via che conserva lo storico.

## Alternatives

- **`retiredAt` senza sgancio dalla fila** (scartata): ogni proiezione che legge `row.umbrellas`
  (struttura, mappa, generatore, conteggio fila) dovrebbe ricordarsi di filtrare i ritirati — il
  filtro si sarebbe sparso in N punti invece di essere gratuito. Peggio: una fila con ombrelloni
  ritirati al suo interno resterebbe **ineliminabile** (la guardia di eliminazione fila conta i
  suoi ombrelloni), quindi il problema che questo ADR risolve per l'ombrellone **risalirebbe di
  livello** alla fila. Lo sgancio (`rowId = null`) elimina il problema alla radice: un ritirato
  semplicemente non appartiene più a nessuna fila da contare o filtrare.
- **Tabella archivio separata** (`RetiredUmbrella` o simile, scartata): **impossibile senza
  rompere lo storico**. La FK `Booking.umbrellaId` punta a `Umbrella` (`RESTRICT`, è il vincolo
  che genera questo ADR): spostare un ombrellone ritirato fuori da `Umbrella` richiederebbe
  riscrivere `Booking.umbrellaId` verso la nuova tabella o duplicare l'id, in entrambi i casi
  minando l'integrità referenziale che la FK esiste per garantire.
- **Rinomina della label al ritiro** (es. suffisso `#retired-<timestamp>`, scartata): libererebbe
  subito la label senza indice parziale, ma **muta lo storico**: le `Booking` passate
  mostrerebbero una label mai vista dal cliente al momento della prenotazione. L'indice parziale
  ottiene la stessa liberazione senza toccare una riga già scritta.

## Consequences

### Positive

- Chiude il gap dimostrato: un ombrellone con storico è ora dismettibile senza toccare il DB a
  mano, reversibile (`Ripristina`), con lo storico contabile intatto (FK mai violata, nessuna
  riga `Booking`/`BookingCoverage` toccata).
- Filtro `retiredAt: null` **gratuito** su struttura/mappa/Cantiere (attraversano `row`, un
  ritirato non ne ha una) invece che disseminato: l'alternativa scartata (a) lo avrebbe reso
  necessario in ogni proiezione.
- Pattern coerente col soft-archive già noto dei pacchetti: nessuna astrazione nuova da imparare,
  solo applicata a un dominio proprio.
- **FK `Umbrella.rowId` resta `ON DELETE RESTRICT`** (revertito deliberatamente dal `ON DELETE
  SET NULL` che Prisma genera di default per una relation resa opzionale): lo sgancio dalla fila è
  un atto esplicito del `retire` (`rowId = null` scritto dal service in transazione), mai un
  side-effect implicito della cancellazione di una fila. Con `SET NULL` la FK avrebbe potuto
  sganciare un ombrellone *attivo* silenziosamente se una `Row` viene eliminata mentre ha ancora
  ombrelloni collegati, producendo uno stato fantasma (`rowId = null` e `retiredAt = null`) invisibile
  sia a struttura/mappa sia a `listRetired`. `RESTRICT` mantiene la garanzia già esistente (la fila
  con ombrelloni collegati resta ineliminabile) e riserva lo sgancio al solo percorso applicativo
  del ritiro.

### Negative / Trade-off

- **Label riusabile ⇒ collisione storica accettata**: due ombrelloni «12» in epoche diverse
  (uno ritirato, uno attivo creato dopo) possono coesistere nello storico. **Accettato
  esplicitamente**: è la realtà fisica di uno stabilimento (il numero 12 riverniciato su un
  ombrellone nuovo dopo che il vecchio è stato dismesso), non un difetto del modello.
- **`rowId` nullable nel tipo**: ogni lettore di `Umbrella.rowId` deve ora gestire il caso
  `null` (già vero per i chiamanti che attraversano `row → umbrellas`, che semplicemente non
  vedono i ritirati; nuovo per chi legge `Umbrella` in isolamento, es. `listRetired`).
- **Indice parziale invisibile al DSL Prisma**: vive solo in SQL nella migration, con un commento
  nello schema che lo documenta e avverte di non reintrodurre `@@unique([establishmentId, label])`
  — un futuro `prisma migrate dev` che rigenera lo schema da zero non lo ricreerebbe da solo; va
  mantenuto come custom SQL a ogni migration successiva che tocchi `Umbrella`.
- **Race read-committed sulla guardia di `retire`**: il conteggio delle prenotazioni confermate
  future e l'update che valorizza `retiredAt` non sono nello stesso lock; una prenotazione confermata
  concorrente potrebbe intercalarsi tra le due letture. Stessa classe di race già accettata altrove
  nel repo per pattern equivalenti (check-then-write dentro `forTenant`, non un vincolo DB) — non
  introduce un rischio nuovo, lo estende a una nuova superficie.
- **Punti deliberatamente non filtrati** (scelta esplicita, non un buco): la guardia di
  eliminazione tipologia conta anche gli ombrelloni ritirati (una tipologia referenziata dallo
  storico non si elimina); la risoluzione label nei report di rinnovo resta senza filtro perché è
  display di dati storici — la label di un ritirato deve continuare a risolversi lì.

## Rubric check

1. **Professionalità** — soft-delete con indice parziale è il pattern standard per unicità
   "tra gli attivi"; niente reinvenzione, applicato dove la FK lo rende necessario.
2. **Convenzioni** — riuso del pattern `archivedAt`/`archive`/`restore` dei pacchetti, `forTenant`
   + `@Roles(Role.Admin)`, `ConflictException`/`UnprocessableEntityException` come altrove nel
   modulo `establishment`.
3. **Modularità** — un solo indice parziale, un solo snapshot testuale (`retiredFrom`), nessuna
   tabella nuova: la superficie di stato aggiunta a `Umbrella` è minima e locale.
4. **Zero debito** — il censimento dei punti di contatto (§4.1 della spec) è verificato sul
   codice, non presunto; le esclusioni sono dichiarate e motivate, non dimenticate.
