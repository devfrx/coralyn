# Equipment personalizzato — catalogo tipi + composizione pacchetto (entità `EquipmentType`) — Design Spec

- **Data:** 2026-07-03
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-03. **Da pianificare ed
  eseguire** (ADR-0009).
- **Origine:** oggi `Package.equipment` è un `Json @db.JsonB` free-form (`Record<string, number>`, es. `{ sunbeds: 2 }`),
  ma l'editor FE (`PricingView.vue`) modifica **solo** la chiave `sunbeds`: `openEditPackage` legge `p.equipment.sunbeds` e
  `submitPackage` riscrive `{ sunbeds: N }`, **distruggendo** ogni altra voce (deckchairs/umbrellas) al salvataggio.
  L'obiettivo è una dotazione personalizzabile "voce + quantità" senza questo bug e senza il debito del JSONB opaco.
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio
  Ombrellone-pacchetto, **raffinato** da questo slice), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)
  (workflow). **Nuovo ADR-0036** (§7). Pattern di archiviazione ereditato dallo slice "Archiviazione pacchetti" (merged).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (su `main`, post-slice Pricing,
  verificata live 2026-07-03): **api unit 94 · api e2e 130 · web-staff 148 (globa ui-kit) · ui-kit standalone 55.** Questo
  slice parte da `main`.
- **Richiede una migrazione** (schema + dati): nuova entità + join + rimozione della colonna `Package.equipment`.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **Schema** ([`schema.prisma`](../../apps/api/prisma/schema.prisma)): `model Package { … equipment Json @db.JsonB … }`.
- **Contratto** ([`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts)):
  `PackageDTO.equipment: Record<string, number>`; `CreatePackageInput.equipment: Record<string, number>`;
  `UpdatePackageInput = Partial<CreatePackageInput>`.
- **DTO** ([`create-package.dto.ts`](../../apps/api/src/catalog/dto/create-package.dto.ts),
  [`update-package.dto.ts`](../../apps/api/src/catalog/dto/update-package.dto.ts)): validano solo `@IsObject()` — nessun
  vincolo su chiavi, valori, segno, annidamento.
- **Projection** ([`package.projection.ts`](../../apps/api/src/catalog/package.projection.ts)): passa `equipment` così com'è
  (`as Record<string, number>`).
- **FE** ([`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue)): `EQUIP_IT` mappa 3 chiavi note
  (`sunbeds/deckchairs/umbrellas`) a singolare/plurale IT; `equipmentLabel` rende "4 lettini", chiavi ignote com'è.
  **Editor: solo `sunbeds`** (campo "Lettini"), che clobbera le altre voci al salvataggio.
- **Seed**: [`seed.ts:126`](../../apps/api/prisma/seed.ts) crea `equipment: { sunbeds: 2, deckchairs: 1 }`;
  [`seed-pricing.ts`](../../apps/api/test/helpers/seed-pricing.ts) crea `equipment: { sunbeds: 2 }`.
- **Controller** di riferimento da rispecchiare: [`packages.controller.ts`](../../apps/api/src/catalog/packages.controller.ts)
  — `@Controller('packages')`, `GET /`, `POST /`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore`, `DELETE /:id`.

**Debito del free-form JSONB** (motiva l'entità, non il tampone): chiavi come stringhe libere → nessuna consistenza dei nomi,
nessun rename globale, nessuna integrità referenziale; `@IsObject()` accetta qualsiasi forma; `EQUIP_IT` hardcoded copre solo
3 chiavi. La dotazione è un **concetto di dominio reale** (insieme finito di tipi che lo stabilimento possiede e compone nei
pacchetti) e confina con **D-012** (cabine/servizi accessori come risorse prenotabili) sul roadmap.

## 2. Obiettivo e principio (deciso)

Modellare la dotazione come **catalogo tenant-scoped di tipi** (`EquipmentType`) che i pacchetti **referenziano** con una
quantità, tramite una **composizione normalizzata** (join `PackageEquipment`). Fix di radice del debito JSONB, non tampone.
Decisioni risolte in brainstorming (§8): entità completa + join table + archiviazione + migrazione dati; etichetta
"Quantità × Nome" (un solo campo `name`, niente pluralizzazione — evita debito i18n, che resta **D-003**); editor pacchetto
con picker a ricerca + **creazione al volo** del tipo, **più** una sezione catalogo per rinominare/archiviare.

**Fuori scope (YAGNI):** nessuna risorsa prenotabile né extra-per-prenotazione (resta **D-012**, deferred); nessun prezzo per
voce di dotazione (il prezzo resta sul listino, ADR-0032); nessun'icona/immagine/descrizione sul tipo (solo `name`); nessuna
pluralizzazione i18n (D-003). Nessun tocco a pricing/prenotazioni/archiviazione pacchetti.

## 3. Modello dati (schema + migrazione)

### 3.1 Schema ([`schema.prisma`](../../apps/api/prisma/schema.prisma))

```prisma
model EquipmentType {
  id              String             @id @default(uuid()) @db.Uuid
  establishmentId String             @db.Uuid
  name            String
  archivedAt      DateTime?
  establishment   Establishment      @relation(fields: [establishmentId], references: [id])
  packageLinks    PackageEquipment[]

  @@unique([establishmentId, name])   // no duplicati nel catalogo (nome trim-normalizzato lato service)
  @@index([establishmentId])
}

model PackageEquipment {
  packageId       String        @db.Uuid
  equipmentTypeId String        @db.Uuid
  quantity        Int
  package         Package       @relation(fields: [packageId], references: [id], onDelete: Cascade)
  equipmentType   EquipmentType @relation(fields: [equipmentTypeId], references: [id], onDelete: Restrict)

  @@id([packageId, equipmentTypeId])   // un tipo compare al massimo una volta per pacchetto
  @@index([equipmentTypeId])
}
```
- `Package.equipment Json @db.JsonB` **rimosso** (dopo la migrazione dati). Aggiungere `packageLinks PackageEquipment[]` e
  la relazione inversa `equipmentTypes EquipmentType[]` su `Establishment`.
- **`onDelete: Cascade`** lato `package` (eliminare un pacchetto rimuove i suoi link, non i tipi — deciso). **`onDelete:
  Restrict`** lato `equipmentType` (un tipo referenziato non è hard-deletabile: coerente con l'archiviazione, §4.3).
- **`quantity` ≥ 1** enforced applicativo (DTO), non un CHECK DB in questo slice (coerente con lo stile del progetto; il
  CHECK anti-overlap è **D-030**, deferred).

### 3.2 Migrazione dati (Prisma migration con step SQL — no JSONB orfano)

Una sola migration `add_equipment_type_and_package_equipment`:
1. `CREATE TABLE equipment_type`, `CREATE TABLE package_equipment` (con FK, unique, index).
2. **Popola il catalogo** dalle chiavi distinte in `package.equipment` per tenant, mappando i nomi:
   `sunbeds→'Lettino'`, `deckchairs→'Sdraio'`, `umbrellas→'Ombrellone'`; ogni altra chiave → `initcap(key)` (capitalizzata).
   `INSERT INTO equipment_type (id, "establishmentId", name) SELECT gen_random_uuid(), p."establishmentId", <CASE map>
   FROM package p, jsonb_each_text(p.equipment) e(key, val) GROUP BY p."establishmentId", <CASE map>` (DISTINCT per
   `(establishmentId, name)` — rispetta l'unique).
3. **Popola i link** (aggregando per evitare collisioni di PK): `INSERT INTO package_equipment
   ("packageId","equipmentTypeId",quantity) SELECT p.id, t.id, SUM((e.val)::int) FROM package p,
   jsonb_each_text(p.equipment) e(key,val) JOIN equipment_type t ON t."establishmentId"=p."establishmentId" AND
   t.name=<CASE map(key)> WHERE (e.val)::int > 0 GROUP BY p.id, t.id`. Il `GROUP BY p.id, t.id` + `SUM` gestisce il caso
   limite in cui due chiavi distinte mappano sullo **stesso** nome (es. `sunbeds` e una chiave `lettino`) → una sola riga
   `package_equipment` con quantità sommata, senza violare l'`@@id([packageId, equipmentTypeId])`.
4. `ALTER TABLE package DROP COLUMN equipment`.

Applicare a `coralyn_dev` e `coralyn_test`; `prisma migrate status` pulito su entrambi. Aggiornare **`seed.ts`** e
**`seed-pricing.ts`** al nuovo modello (creano `EquipmentType` + `PackageEquipment` invece del JSONB) — vedi §5/§6.

## 4. Backend (NestJS `catalog`)

### 4.1 Contratti ([`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts))

- Nuovi: `EquipmentTypeDTO { id: string; name: string; archived?: true }`;
  `CreateEquipmentTypeInput { name: string }`; `UpdateEquipmentTypeInput { name?: string }`.
- Cambiati: `PackageDTO.equipment: { equipmentTypeId: string; name: string; quantity: number }[]` (nome **risolto** dalla
  projection, così il FE rende senza secondo fetch); `CreatePackageInput.equipment: { equipmentTypeId: string; quantity:
  number }[]`; `UpdatePackageInput = Partial<CreatePackageInput>` (invariato come derivazione).

### 4.2 EquipmentType CRUD ([nuovo `equipment-types.controller.ts`](../../apps/api/src/catalog/equipment-types.controller.ts) — mirror `packages.controller.ts`)

- `GET /equipment-types?includeArchived=true` → default solo attivi; con flag include archiviati (mirror `listPackages`).
- `POST /equipment-types` `{ name }` → 201. Nome **trim** + unicità per tenant (case-insensitive lato service: confronto su
  `lower(trim(name))`; l'`@@unique` DB è la rete su exact) → 409 su duplicato.
- `PATCH /equipment-types/:id` `{ name? }` → rinomina (stessa validazione unicità).
- `POST /equipment-types/:id/archive` | `/restore` → 201 (soft-delete `archivedAt`).
- `DELETE /equipment-types/:id` → **200 solo se archiviato + 0 riferimenti** (`PackageEquipment`), altrimenti **409**
  "Archivia il tipo e rimuovilo dai pacchetti prima di eliminarlo definitivamente" (mirror hard-delete pacchetti).
- Projection `toEquipmentTypeDTO(row)`: `{ id, name, ...(archivedAt ? { archived: true } : {}) }`.

### 4.3 Composizione pacchetto (create/update package)

- `create`/`update` accettano `equipment: { equipmentTypeId, quantity }[]`. Validazione di dominio (422):
  - ogni `equipmentTypeId` **esiste nel tenant** e **non è archiviato** → altrimenti 422 "Tipo di dotazione non valido o
    archiviato";
  - `quantity` intero **≥ 1** → altrimenti 422;
  - nessun `equipmentTypeId` **duplicato** nella richiesta → altrimenti 422 (l'`@@id` composito è la rete DB).
  - Scrittura: sostituzione **set-assoluto** dei `PackageEquipment` del pacchetto in transazione (cancella i link
    esistenti, reinserisce quelli nuovi) — idempotente, niente merge parziale.
- `listPackages`/projection: caricano i `packageLinks` con il tipo (`include`), proiettano
  `equipment: links.map(l => ({ equipmentTypeId, name: l.equipmentType.name, quantity }))`, **ordinati per `name`**
  (deterministico). Un tipo **archiviato ancora referenziato** si rende comunque (il nome resta risolto) — coerente con lo
  storico prenotazioni archiviate.

## 5. Frontend ([`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue) + query/mock)

- **Sezione catalogo tipi**: griglia CRUD (crea/rinomina/archivia) + "Archiviati (N)" a scomparsa (Ripristina + Elimina
  definitivamente con `ConfirmDialog`), **rispecchiando** la UX dei pacchetti archiviati già in `PricingView`. Nuove query
  Vue Query `useEquipmentTypes`/`useAllEquipmentTypes` + mutation (create/update/archive/restore/delete), MSW mock in
  [`server.ts`](../../apps/web-staff/src/mocks/server.ts).
- **Editor pacchetto**: sostituire il singolo campo "Lettini" con un **compositore multi-riga**: ogni riga = picker con
  ricerca (scegli tipo attivo esistente **o** digita un nome nuovo → `+ Crea "<nome>"` crea il tipo via mutation e lo
  seleziona) + input quantità + rimuovi; pulsante "Aggiungi voce". `submitPackage` invia `equipment:
  [{ equipmentTypeId, quantity }]`. `openEditPackage` idrata le righe da `p.equipment` (che ora è l'array DTO).
- `equipmentLabel(equipment)` → `equipment.map(e => \`${e.quantity} × ${e.name}\`).join(' · ')` (es. "2 × Lettino · 1 ×
  Cassaforte"). **Rimuovere** la mappa `EQUIP_IT` e la logica singolare/plurale.

## 6. Piano di test (TDD)

- **Unit** (backend): `toEquipmentTypeDTO` (archived omesso quando attivo); `toPackageDTO` col nuovo array (nome risolto,
  ordinamento per nome); validazione composizione (tipo inesistente/archiviato/dup, quantity<1). Projection package pura.
- **e2e** ([`equipment-types.e2e-spec.ts`](../../apps/api/test/equipment-types.e2e-spec.ts), nuovo, mirror
  `packages.e2e-spec.ts`): CRUD + `?includeArchived`; archive/restore; DELETE 200 (archiviato+0rif) / 409 (referenziato o
  non archiviato); unicità nome → 409; isolamento tenant. **Composizione** in `packages.e2e-spec.ts`: create/update package
  con `equipment` (tipi validi → 201; tipo archiviato/inesistente/dup/quantity<1 → 422; il PATCH sostituisce il set senza
  clobber, il bug originario è chiuso). **Migrazione**: verifica che dopo la migration i package seed abbiano i link
  attesi e nessuna colonna `equipment` residua (dev+test).
- **web-staff**: catalogo tipi (crea/rinomina/archivia/ripristina/elimina con ConfirmDialog) + compositore pacchetto
  (aggiungi/rimuovi righe, creazione al volo, no-clobber di voci multiple), `equipmentLabel` nuovo formato. MSW aggiornato.
- Baseline da NON regredire: **api unit 94 · e2e 130 · web-staff 148 · ui-kit 55**; typecheck web-staff pulito. Attesi
  incrementi additivi su tutte le suite (nuova entità + composizione + FE).

## 7. ADR-0036 (nuovo)

Creare [`docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md`](../architecture/decisions/0036-equipment-catalogo-e-composizione.md):
formalizza la dotazione come **catalogo tenant-scoped `EquipmentType`** + **composizione normalizzata `PackageEquipment`**
(qty ≥1, un tipo per pacchetto), sostituendo il `Package.equipment` JSONB opaco; archiviazione (mai hard-delete di un tipo
referenziato) coerente con lo slice Archiviazione; etichetta "Quantità × Nome" (pluralizzazione i18n → D-003); confine con
**D-012** (equipment≠risorsa prenotabile in questo slice). **Raffina ADR-0006** (unità Ombrellone-pacchetto: la "dotazione"
passa da attributo JSONB a relazione catalogo) con una riga di rimando in ADR-0006, senza riscrivere la decisione originale.

## 8. Decisioni (risolte in brainstorming 2026-07-03)

1. **Entità `EquipmentType`** (non free-form JSONB, non middle-ground): catalogo tenant-scoped, la scelta professionale e
   senza debito (naming consistente, integrità referenziale, rename globale, validazione).
2. **Composizione normalizzata** via join `PackageEquipment` (non JSONB con chiavi=uuid): FK, integrità, `@@id` composito.
3. **Etichetta "Quantità × Nome"** — un solo campo `name`, nessuna pluralizzazione (i18n = D-003).
4. **Editor pacchetto con creazione al volo** + sezione catalogo dedicata (la UX più completa).
5. **Unicità nome tipo per tenant** (blocca duplicati) — trim + case-insensitive lato service, `@@unique` DB come rete.
6. **Tipo archiviato non selezionabile** in nuove composizioni; i riferimenti esistenti restano e si rendono.
7. **`onDelete: Cascade`** su `PackageEquipment` lato pacchetto; **`Restrict`** lato tipo (archivia-prima-di-eliminare).

## 9. Scope, branch, logistica

- **Slice separato**, **nuovo branch da `main`** (ADR-0009). File toccati: `schema.prisma` + nuova migration; contratti;
  nuovi `equipment-types.controller.ts`/service methods + `equipment-type.projection.ts`; `package.projection.ts` +
  create/update package (composizione); `seed.ts`/`seed-pricing.ts`; FE `PricingView.vue` + query/mutation + MSW; nuovo
  ADR-0036 + rimando ADR-0006. **Richiede migrazione** (schema+dati) su dev+test.
- **Layer previsti (un commit per layer):** (1) schema + migrazione dati + seed; (2) EquipmentType backend (contratti, CRUD,
  archiviazione, projection, e2e); (3) composizione pacchetto backend (contratti, validazione, projection, e2e); (4) FE
  catalogo tipi; (5) FE compositore pacchetto; (6) doc ADR-0036 + rimando. (Il controller/piano potrà accorpare dove
  sensato.)
- **Workflow ADR-0009:** questa spec → (approvazione utente) → piano TDD (`writing-plans`) → esecuzione subagent-driven,
  test-first, un commit per layer. Non regredire i conteggi (riverificati dal vivo).
