# ADR-0036: La dotazione è un catalogo di tipi + una composizione normalizzata (non più JSONB)

- **Status:** Accepted
- **Data:** 2026-07-03
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (**raffinato** da questo ADR: la "dotazione"
  dell'unità Ombrellone-pacchetto), [ADR-0010](0010-isolamento-multi-tenant.md) (RLS tenant, applicata alle nuove tabelle),
  [ADR-0009](0009-documentazione-di-design.md) (workflow), [D-012](../deferred.md) (cabine/servizi prenotabili — confine),
  [D-003](../deferred.md) (i18n — pluralizzazione). Spec:
  `docs/specs/2026-07-03-equipment-personalizzato-design.md`.

## Context

[ADR-0006](0006-dominio-prenotazioni-e-pricing.md) definì l'unità prenotabile come **Ombrellone-pacchetto**, dove il
`Pacchetto` "ne definisce la dotazione (n. lettini/sdraio)". Quella dotazione era modellata come `Package.equipment`, un
`Json @db.JsonB` free-form (`Record<string, number>`, es. `{ sunbeds: 2, deckchairs: 1 }`).

**Debito del JSONB opaco.** Le chiavi erano stringhe libere: nessuna consistenza dei nomi, nessun rename globale, nessuna
integrità referenziale; il DTO validava solo `@IsObject()` (qualsiasi forma passava); la mappa FE `EQUIP_IT` copriva a mano
solo 3 chiavi note. **Bug emerso dal vivo:** l'editor pacchetto modificava **solo** la chiave `sunbeds` — `openEditPackage`
leggeva `p.equipment.sunbeds` e `submitPackage` riscriveva `{ sunbeds: N }`, **distruggendo** (clobber) ogni altra voce
(`deckchairs`/`umbrellas`) a ogni salvataggio. La dotazione è però un **concetto di dominio reale** (insieme finito di tipi
che lo stabilimento possiede e compone nei pacchetti) e confina con [D-012](../deferred.md) (cabine/servizi accessori).

## Decision

**La dotazione è un catalogo tenant-scoped + una composizione normalizzata.** Due entità sostituiscono il JSONB:

- **`EquipmentType`** — catalogo dei tipi di dotazione dello Stabilimento (`id`, `establishmentId`, `name`, `archivedAt?`).
  Nome **unico per tenant** (`@@unique([establishmentId, name])`; normalizzazione **trim + case-insensitive** lato service,
  l'unique DB come rete). Solo `name`: niente prezzo, icona, immagine o descrizione (YAGNI).
- **`PackageEquipment`** — join normalizzato pacchetto↔tipo con `quantity` (`@@id([packageId, equipmentTypeId])`: un tipo
  compare **al più una volta** per pacchetto; `quantity ≥ 1` validato lato applicativo). `onDelete: Cascade` lato pacchetto
  (eliminare un pacchetto rimuove i suoi link, non i tipi), `onDelete: Restrict` lato tipo (un tipo referenziato non è
  hard-deletabile — coerente con l'archiviazione).

`Package.equipment JSONB` è **rimosso** con una migrazione dati (mappa `sunbeds→Lettino`, `deckchairs→Sdraio`,
`umbrellas→Ombrellone`, altre chiavi → `initcap`; `SUM`/`GROUP BY (packageId, equipmentTypeId)` per l'edge-case di due chiavi
che collassano sullo stesso nome, senza violare il PK composito).

**Composizione a set-assoluto (chiude il clobber).** `create`/`update` di un pacchetto ricevono l'intero array
`equipment: { equipmentTypeId, quantity }[]` e ne scrivono i link **in transazione** cancellando i precedenti e
reinserendo il set nuovo — idempotente, niente merge parziale. Validazione **422**: tipo inesistente/archiviato, `quantity`
< 1, `equipmentTypeId` duplicato nella richiesta. La projection risolve il `name` dal catalogo e ordina per nome, così il FE
rende senza secondo fetch; un tipo **archiviato ma ancora referenziato** si rende comunque (nome risolto), coerente con lo
storico.

**Archiviazione, mai hard-delete di un tipo referenziato.** Il CRUD `equipment-types` rispecchia quello dei pacchetti:
`?includeArchived`, `archive`/`restore` (soft-delete `archivedAt`), `DELETE` = **200 solo se archiviato + 0 riferimenti**,
altrimenti **409**. Un tipo archiviato non è selezionabile in nuove composizioni; i riferimenti esistenti restano.

**Etichetta "Quantità × Nome".** La UI rende `2 × Lettino · 1 × Cassaforte` (un solo campo `name`, nessuna
pluralizzazione): elimina il debito i18n della vecchia `EQUIP_IT`, rimandando l'internazionalizzazione a
[D-003](../deferred.md).

**`establishmentId` anche sul join (RLS uniforme).** `PackageEquipment` porta `establishmentId` + la policy
`tenant_isolation` identica a ogni altra tabella tenant + `@@index([establishmentId])`. È un **raffinamento** dello sketch
della spec (che ometteva l'`establishmentId` sul join): il ruolo applicativo `coralyn_app` è `NOBYPASSRLS` e possiede le
tabelle con `FORCE ROW LEVEL SECURITY`, quindi una tabella tenant senza `establishmentId` non potrebbe usare la policy
uniforme (ADR-0010). Corollario sulla **migrazione**: lo step-dati fa `ALTER TABLE "Package" NO FORCE` attorno alla lettura
del JSONB e ripristina `FORCE` dopo (altrimenti la SELECT sotto RLS leggerebbe zero righe, GUC `app.current_tenant` non
impostata in `migrate deploy`).

**Raffina ADR-0006.** La "dotazione" del Pacchetto non è più un attributo JSONB dell'unità Ombrellone-pacchetto ma una
relazione verso un catalogo `EquipmentType` con composizione normalizzata `PackageEquipment`. La decisione di dominio di
ADR-0006 (unità Ombrellone-pacchetto, dotazione personalizzabile) resta; cambia solo la **forma** della dotazione.

## Consequences

### Positive
- **Bug del clobber eliminato alla radice**: la scrittura set-assoluto sostituisce l'intero set; non esiste più un editor
  che tocca una sola chiave.
- **Integrità e consistenza**: FK reali, nomi consistenti (catalogo), rename globale (un solo `EquipmentType.name`),
  validazione forte al posto di `@IsObject()`.
- **Estendibile senza codice**: nuovi tipi di dotazione = dati (creabili al volo dall'editor), non chiavi hardcoded.

### Negative / Trade-off
- **Richiede una migrazione** (schema + dati) su dev e test — lo step-dati sotto RLS è la parte delicata (gestita, vedi
  Decision).
- **Più tabelle e join** rispetto al singolo campo JSONB: complessità relazionale maggiore, giustificata dal dominio reale
  e dall'integrità.

### Neutre / Note
- **Confine con [D-012](../deferred.md)**: la dotazione è un attributo del **pacchetto**, non una risorsa prenotabile né un
  extra-per-prenotazione. Cabine/servizi come risorse prenotabili restano D-012 (stesso pattern di Ombrellone; `EquipmentType`
  ne è un precursore naturale ma **non** una risorsa prenotabile in questo slice).
- **Nessun prezzo per voce**: il prezzo resta sul listino ([ADR-0032](0032-pricing-engine-precedenza.md)); la dotazione non
  ha costo proprio.
- **Pluralizzazione → [D-003](../deferred.md)**: l'etichetta "Quantità × Nome" evita di reintrodurre logica singolare/plurale.

## Alternatives considered

- **Restare su JSONB con un tampone all'editor** (leggere/riscrivere tutte le chiavi): chiuderebbe il clobber ma lascerebbe
  il debito del free-form (nessuna integrità, nessun catalogo, nessun rename globale). Scartata.
- **JSONB con chiavi = uuid del tipo** (middle-ground): recupera un id stabile ma non offre FK, integrità referenziale né il
  vincolo "un tipo per pacchetto" a livello DB. Scartata a favore del join normalizzato.
- **`PackageEquipment` senza `establishmentId`** (policy RLS via subquery sul pacchetto padre): romperebbe il pattern RLS
  uniforme del progetto e l'`@@index([establishmentId])` convenzionale. Scartata: `establishmentId` sul join è la scelta
  consistente e a costo trascurabile.

## Rubric check

1. **Professionalità** — modellazione relazionale di un concetto di dominio reale (catalogo + composizione) al posto di un
   blob opaco; archiviazione e integrità referenziale come in un gestionale serio.
2. **Convenzioni** — codice/DB in inglese, UI in italiano (ADR-0030); RLS uniforme su ogni tabella tenant (ADR-0010); CRUD
   `equipment-types` speculare a `packages` (stesso pattern di archiviazione).
3. **Modularità** — catalogo (`EquipmentType`) e composizione (`PackageEquipment`) separati; la scrittura set-assoluto vive
   nel service `catalog`; il FE compone senza secondo fetch (nome risolto in projection).
4. **Zero debito** — il debito del JSONB free-form (naming, integrità, clobber, `EQUIP_IT` hardcoded) è chiuso alla radice;
   le parti rimandate (equipment prenotabile → D-012, pluralizzazione → D-003) sono tracciate, non improvvisate.
