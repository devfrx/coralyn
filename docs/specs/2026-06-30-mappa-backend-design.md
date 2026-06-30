# Mappa — Backend (modello + lettura) — Design Spec

- **Data:** 2026-06-30
- **Stato:** Approvata (delega handoff [2026-06-30-mappa-be](../handoff/2026-06-30-mappa-be.md))
- **Slice:** modello mappa + RLS + seed demo + endpoint di **sola lettura** `GET /api/mappa`
  + sgancio della `MappaView` dal mock MSW.
- **ADR di riferimento:** [ADR-0005](../architecture/decisions/0005-modello-mappa.md) (modello a 3 livelli),
  [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (fasce/slot),
  [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) (etichetta/tipologia/speciali),
  [ADR-0020](../architecture/decisions/0020-resa-mappa.md) (DTO a 4 assi),
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS),
  [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (tenant dal JWT).

## 1. Obiettivo e confini

Esporre la **struttura statica** della mappa di uno Stabilimento per una data, leggendo
da DB invece che dal mock MSW. La `MappaView` (FE) è già scritta contro
`MappaGiornoDTO` ([packages/contracts](../../packages/contracts/src/index.ts)): **il backend
si adatta al contratto**, non viceversa.

**In scope**

- 5 modelli Prisma tenant-scoped: `Settore`, `Fila`, `Ombrellone`, `Tipologia`, `Fascia`.
- RLS `tenant_isolation` su tutte e 5 (SQL grezzo in migrazione, come `Cliente`).
- Seed idempotente di una struttura demo per `DEV_STABILIMENTO_ID`.
- `GET /api/mappa?data=YYYY-MM-DD` → `MappaGiornoDTO` (protetto da `JwtAuthGuard` globale).
- Sgancio FE: mock `/api/mappa` spostato da `handlers.ts` (dev) a `server.ts` (test-only);
  `useMappaGiorno` passa `session.dataAttiva`.

**Fuori scope** (increment successivi)

- Setup-form / CRUD della mappa ([ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
- Prenotazioni e derivazione degli stati reali (`abbonato`/`giornaliero`/`prenotato`).
- Pricing / listino. `posizionePresentazione` (layer visivo, [D-005](../architecture/deferred.md))
  è **modellato nullable ma inutilizzato** in questo slice.

## 2. Modello dati (Prisma)

Tutte le entità portano `stabilimentoId @db.Uuid` + relazione a `Stabilimento` + indice
su `stabilimentoId`, come `Cliente`. Codice EN, dominio IT ([ADR-0003](../architecture/decisions/0003-language-convention.md)).

| Entità | Campi (oltre a `id`, `stabilimentoId`) | Note |
|---|---|---|
| `Tipologia` | `nome`, `ordine` (Int), `icona String?` | `icona` = chiave registry ui-kit ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)) |
| `Fascia` | `nome`, `oraInizio @db.Time`, `oraFine @db.Time`, `ordine` (Int) | orari **non** esposti nel DTO ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)) |
| `Settore` | `nome`, `ordine` (Int) | |
| `Fila` | `settoreId`, `etichetta`, `ordine` (Int) | FK a `Settore` |
| `Ombrellone` | `filaId`, `tipologiaId String? @db.Uuid`, `etichetta`, `ordineLogico` (Int), `posizionePresentazione Json?` | `tipologiaId NULL` = Normale ([ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)); `@@unique([stabilimentoId, etichetta])` |

**Tipo `time`:** `oraInizio`/`oraFine` usano il tipo SQL `time` (Prisma `DateTime @db.Time(0)`),
coerente col [data-model](../design/data-model.md). Non sono proiettati nel DTO: l'unico punto
che li scrive è il seed.

**RLS:** per **ciascuna** delle 5 tabelle, nella migrazione SQL grezza (Prisma non la genera):

```sql
ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<T>" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "<T>"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
```

Identico al pattern di [`20260628175658_rls`](../../apps/api/prisma/migrations/20260628175658_rls/migration.sql).
Tutte le query passano da `PrismaService.forTenant(tenantId, …)` (GUC `app.current_tenant`).

## 3. Endpoint `GET /api/mappa`

- **Query**: `data?` opzionale, formato ISO `YYYY-MM-DD`. Validata da un DTO
  (`@IsOptional()` + `@Matches(/^\d{4}-\d{2}-\d{2}$/)`). Default = **oggi**.
- **Auth**: nessun `@Public()` → la `JwtAuthGuard` globale richiede il Bearer; il tenant
  arriva dal JWT (`req.tenantId`). Senza Bearer → **401**.
- **Lettura** (dentro `forTenant(tenantId)`):
  - `tipologie` ordinate per `ordine`;
  - `fasce` ordinate per `ordine`;
  - `settori` ordinati per `ordine`, con `file` (ordinate per `ordine`) e `ombrelloni`
    (ordinati per `ordineLogico`) tramite `include` annidato.
- **Proiezione → `MappaGiornoDTO`** (funzione pura, unit-testabile):
  - `data` echeggiata; `tipologie[]` (`id/nome/ordine/icona?`); `fasce[]` (**solo** `id/nome/ordine`,
    niente orari); `settori[]→file[]→ombrelloni[]`.
  - `OmbrelloneDTO`: `id`, `etichetta`, `tipologiaId` (`null` se Normale), `filaId`,
    `statoPerFascia`.
  - **`statoPerFascia`**: in questo slice **ogni ombrellone è `libero` per ogni fascia**.
    Le chiavi sono **esattamente** gli `id` delle fasce ritornate; ogni ombrellone ha una
    entry per ogni fascia. La derivazione reale è il **confine d'incremento** (prenotazioni):
    va dichiarata con un commento nel codice. **Non** inventare altri stati.

`MappaModule` (controller + service) importato in `AppModule`.

## 4. Seed demo (idempotente)

Estende [`apps/api/prisma/seed.ts`](../../apps/api/prisma/seed.ts) per `DEV_STABILIMENTO_ID`,
con `upsert` su id stabili (idempotente), guardia `NODE_ENV=production` invariata. Forma
allineata a [`mappaSeed`](../../apps/web-staff/src/mocks/data/seed.ts) così la FE si sgancia
e renderizza come oggi:

- **Tipologie**: Mini-palma (`leaf`, ordine 1), Palma (`palmtree`, ordine 2). Icone valide
  nel [registry](../../packages/ui-kit/src/icons/registry.ts).
- **Fasce**: Mattina (08:00–13:00, ordine 1), Pomeriggio (13:00–19:00, ordine 2).
- **Settori**: Centro (ordine 1) con 3 file (~10 ombrelloni l'una → ~30); Speciali (ordine 99)
  con 1 fila "Palme" (~4 palme). Etichette reali (`"1"`, `"2"`, … `"P1"`…), buchi ammessi.
- Mini-palma sulle prime file del Centro, Normale (`tipologiaId NULL`) sul resto; Palma nelle
  Speciali. ~34 ombrelloni totali.

## 5. Sgancio FE

- `handlers.ts`: **rimuove** il mock `/api/mappa` → resta `[]` (il dev worker cade sul backend
  reale, `onUnhandledRequest: 'bypass'` in `main.ts`).
- `server.ts` (solo test): aggiunge `http.get('/api/mappa', () => HttpResponse.json(mappaSeed))`
  riusando la fixture `mappaSeed` (conservata).
- `useMappaGiorno.ts`: `apiFetch<MappaGiornoDTO>('/mappa?data=' + session.dataAttiva)`.
- Contratti `@coralyn/contracts`: **invariati** (già definiti, nessun rename/rimozione).

## 6. Verifica / DoD

- **Migrazione**: `migrate dev --name mappa` crea le 5 tabelle + RLS; `prisma generate`.
- **api e2e** (`coralyn_test`): `GET /api/mappa` 401 senza Bearer; con Bearer struttura
  seedata nel test per s1; isolamento (s2 non vede nulla); ordinamento corretto; `data` echeggiata.
- **api unit**: proiezione pura (`statoPerFascia` tutto `libero`, chiavi = fasce; default data = oggi).
- **FE**: `MappaView.spec` verde su fixture; `typecheck` + `build` OK; dev worker sul backend reale.
- **Docker**: `--profile full up -d --build` seeda; `GET /api/mappa` via `:8080` con Bearer
  ritorna la struttura.
- `pnpm -r build` verde. README aggiornato (prossimo passo → prenotazioni) + handoff successivo.
</content>
</invoke>
