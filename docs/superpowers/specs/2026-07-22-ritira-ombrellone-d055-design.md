# Spec — «Ritira ombrellone» (soft-delete, D-055)

> **Data:** 2026-07-22 · **Stato:** approvata dall'utente (brainstorming in sessione).
> **Contesto:** [deferred.md D-055](../../architecture/deferred.md) · [ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md) (guardia block-409 + FK RESTRICT).

## 1. Problema

Un ombrellone con storico prenotazioni — anche solo scadute o cancellate — **non è
eliminabile by design**: la guardia di `delete` conta tutte le `Booking` e la FK
`Booking.umbrellaId` è RESTRICT. La disdetta anticipata libera il posto in mappa ma non
sblocca l'eliminazione. Gap dimostrato sul campo (2026-07-22): l'unica via era distruggere
storico contabile a mano sul DB. Serve una **dismissione amministrativa** che tolga
l'ombrellone dalla spiaggia operativa preservando lo storico.

**Eliminazione vs Ritiro** (entrambe restano, esplicite):

| | Elimina (esistente) | Ritira (nuova) |
|---|---|---|
| Quando | mai stato prenotato | ha storico (o lo si vuole conservare) |
| Dati | distrutti | conservati |
| Reversibile | no | sì (Ripristina) |

## 2. Decisioni (dal brainstorming)

1. **Label**: l'unicità vale **solo tra gli attivi** — ritirato il «12», un nuovo «12» si
   crea subito. Implementazione: indice unico **parziale** (`WHERE "retiredAt" IS NULL`).
2. **Visibilità/reversibilità**: archivio «Ritirati» nel Cantiere + azione «Ripristina»
   con scelta della fila di destinazione e controllo conflitti.
3. **Modello**: `retiredAt` + **sgancio dalla fila** (`rowId` nullable) — scelto contro
   (a) `retiredAt` senza sgancio (ogni proiezione dovrebbe ricordarsi il filtro; fila con
   ritirati ineliminabile → il problema risale di livello) e (b) tabella archivio separata
   (impossibile: la FK dello storico punta a `Umbrella`).
4. **Pattern di riferimento**: il soft-archive esistente dei pacchetti
   (`Package.archivedAt`, `POST :id/archive`/`:id/restore` idempotenti). Nome di dominio
   proprio: `retiredAt`/`retire` — la dismissione fisica non è l'archiviazione di una
   configurazione.

## 3. Schema & migration

Su `Umbrella`:
- `retiredAt DateTime?` — null = attivo.
- `retiredFrom String?` — snapshot testuale della posizione al ritiro (es. «Centro ·
  Fila 1»): dato **storico**, non riferimento vivo; azzerato al ripristino.
- `rowId String?` — nullable: il ritiro sgancia dalla fila.
- `@@unique([establishmentId, label])` **rimosso dallo schema**; al suo posto indice unico
  parziale in SQL (`CREATE UNIQUE INDEX ... ON "Umbrella" ("establishmentId", "label")
  WHERE "retiredAt" IS NULL`) in una migration `--create-only` editata a mano, con
  commento nello schema Prisma che documenta l'indice invisibile al DSL.

Unica migration, additiva per i dati esistenti (tutti attivi, semantica invariata per loro).
`logicalOrder` di un ritirato conserva l'ultimo valore (privo di significato da sganciato);
il ripristino lo ricalcola con `nextLogicalOrder(rowId)`.

## 4. API (admin-only, stile del repo)

- **`POST /establishment/umbrellas/:id/retire`** — guardia 409 se esistono prenotazioni
  **confermate con `endDate >= todayInRome()`** (copy: «Ombrellone con prenotazioni attive
  o future: disdici prima di ritirare»). Effetto: `retiredAt = now()`, `rowId = null`,
  snapshot `retiredFrom` da fila+settore correnti. Idempotente se già ritirato.
- **`POST /establishment/umbrellas/:id/restore`** — input `{ rowId: string }`: valida la
  fila nel tenant (422 se estranea), 409 se un **attivo** ha già la stessa label (copy che
  spiega il conflitto). Effetto: `retiredAt = null`, `retiredFrom = null`,
  `rowId = input.rowId`, `logicalOrder = nextLogicalOrder(rowId)`.
- **`GET /establishment/umbrellas/retired`** — lista ordinata per `retiredAt` desc di
  `RetiredUmbrellaDTO { id, label, umbrellaTypeId, retiredAt, retiredFrom }`.

### 4.1 Punti di contatto esistenti (censimento verificato sul codice)

Filtro `retiredAt: null` da aggiungere:
- clash label in `create`/`update`/`generate` (`umbrellas.service.ts:40/59/94`) — le
  label dei ritirati tornano riusabili;
- validazione ombrellone alla creazione prenotazione (`bookings.service.ts:396`);
- contatore overview (`establishment.service.ts:25`);
- metriche piattaforma (`platform-metrics.service.ts:34`);
- `findMany` delle bulk (`umbrellas.service.ts:114`) — difensivo: i ritirati non sono
  selezionabili dalla UI ma l'API non deve operarci comunque.

Esclusione **gratuita** (nessun filtro): struttura, mappa e Cantiere attraversano
`row → umbrellas` e un ritirato non ha fila; l'eliminazione fila conta per `rowId`
(`rows.service.ts:55`) → i ritirati non la bloccano.

**Deliberatamente NON filtrati**:
- la guardia di eliminazione tipologia (`umbrella-types.service.ts:69`) conta anche i
  ritirati — una tipologia referenziata dallo storico non si elimina;
- la risoluzione label nei rinnovi in scadenza (`reports.service.ts:96`) — è display di
  dati storici, la label di un ritirato deve continuare a risolversi. L'**occupazione**
  dei report deriva dalla proiezione mappa → i ritirati ne escono già con lo sgancio.

Copy del 409 di `delete` aggiornata: suggerisce «Ritira» come via che conserva lo storico.

## 5. Contracts

```ts
export interface RetiredUmbrellaDTO {
  id: string; label: string; umbrellaTypeId: string | null;
  retiredAt: string;            // ISO
  retiredFrom: string | null;   // snapshot «Settore · Fila», null se non disponibile
}
export interface RestoreUmbrellaInput { rowId: string }
```
DTO esistenti invariati (strutture e mappa trasportano solo attivi).

## 6. Frontend (Cantiere, web-staff)

- **UmbrellaPanel**: «Ritira» in danger-zone accanto a «Elimina», ConfirmDialog dedicato
  con copy che spiega la differenza (storico conservato, reversibile). Toast su esito;
  `mutateAsync().then()` se il flusso chiude il pannello (gotcha vue-query).
- **BeachPanel**: sezione «Ritirati (N)» sotto le Tipologie — per riga: etichetta,
  `retiredFrom`, data ritiro, «Ripristina» con select della fila di destinazione
  (dall'albero struttura già in vista). Sezione assente se N = 0. Admin-only come le
  altre azioni (difesa in profondità).
- Data layer: `useRetiredUmbrellas` (query) + `useRetireUmbrella`/`useRestoreUmbrella`
  (mutation) in `useEstablishmentStructure.ts`; le mutation invalidano `structureKeys`
  **più** la chiave della lista ritirati. Handler MSW per i tre endpoint.
- Solo primitivi ui-kit e token semantici; nessun componente nuovo previsto.

## 7. Test (TDD ovunque)

- **Unit service**: guardia retire (prenotazione confermata futura → 409; scaduta o
  cancellata → ok), sgancio + snapshot, idempotenza, restore (fila estranea → 422,
  conflitto label attivo → 409, `logicalOrder` ricalcolato), clash label che ignora i
  ritirati, filtri overview/bulk.
- **E2e** `establishment-umbrellas-retire.e2e-spec.ts`: date **letterali** nella stagione
  seed `[2026-05-01, 2026-09-30]`, «oggi» congelato = **2026-07-15** — prenotazione con
  `endDate 2026-07-20` → retire 409; dopo disdetta → retire ok e sparito da struttura/
  mappa; label riusata da un nuovo attivo; restore con conflitto → 409; restore ok →
  riappare nella fila scelta. Regressione: creazione prenotazione su ritirato → 422.
- **Component (web-staff)**: UmbrellaPanel (Ritira con conferma, toast), BeachPanel
  (lista ritirati, ripristino, sezione assente a lista vuota), via MSW.
- Regole invariate: suite in sequenza, `enableAutoUnmount` dove serve, `:disabled` in OR
  col pending.

## 8. Documentazione (stesso branch, Definition of Done)

- **ADR-0053 «Ritiro ombrellone (soft-delete)»** in `docs/architecture/decisions/`:
  perché indice parziale + sgancio, alternative scartate, trade-off (label riusabile ⇒
  lo storico può mostrare due «12» in epoche diverse: accettato, è la realtà fisica).
- **`docs/design/data-model.md`**: ER aggiornato (campi nuovi, `rowId` nullable) +
  invariante label corretto in «unico tra gli ATTIVI per Establishment».
- **design-system §14**: pannello Ombrellone (danger-zone con Ritira) e pannello
  Spiaggia (sezione Ritirati).
- **deferred.md**: chiusura D-055 a merge avvenuto.

## 9. Fuori scope (dichiarato)

Bulk-retire; vista/di filtro dei ritirati in mappa; `includeRetired` sulle liste;
ritiro programmato. Si aggiungono se emergono usi reali (YAGNI).
