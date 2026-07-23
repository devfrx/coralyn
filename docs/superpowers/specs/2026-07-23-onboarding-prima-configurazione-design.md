# Onboarding guidato di prima configurazione — design

- **Data:** 2026-07-23 · **Stato:** approvato dall'utente (criterio: professionale, senza debiti,
  coerente, non pigra; approvazione esplicita su design + slice Platform Console)
- **Origine:** handoff [2026-07-23-chiusura-sessione-e-onboarding](../../handoff/2026-07-23-chiusura-sessione-e-onboarding.md) §5
  (ricognizione verificata sul codice: catena prerequisiti, edge case, sei domande aperte)
- **Scope:** wizard `/onboarding` in `web-staff` + endpoint `GET /establishment/setup-status` +
  flag `setupComplete` nella Platform Console. **Fuori scope:** modifiche alle guardie dei
  controller catalog (oggi Staff+, restano tali), self-registration (rifiutata by design, D-002),
  reason `UMBRELLA_RETIRED` nel quote (backlog D-055), D-060.

## Problema

Un lido appena provisionato (ADR-0028: fornitore + inviti) parte vuoto. Perché possa incassare la
prima prenotazione serve una catena di prerequisiti sparsa su quattro rotte (`/establishment`,
`/establishment/structure`, `/pricing`, opz. `/rentals/catalogo`), nota solo a chi conosce il
dominio: Settore → Fila → Ombrellone, almeno una Fascia, una Stagione che copre la data, una
Tariffa applicabile. Ogni anello mancante oggi si manifesta **a valle**, come 422 al momento della
prenotazione (`UMBRELLA_NOT_FOUND` / `NO_SEASON` / `NO_RATE`, `bookings.service.ts::throwPriceError`).
Non esiste alcun flusso guidato né una nozione interrogabile di «configurazione completa».

## Decisione

**Modello incrementale con ripresa, spina dorsale server-side.** Il wizard orchestra gli endpoint
per-entità esistenti; «atomico» è una proprietà di ogni passo (ogni passo commit-a tutto o niente,
il generatore ombrelloni è già batch); «completa» è uno stato **misurato dal server** da un nuovo
endpoint `setup-status`, che rende interrogabile la stessa semantica che oggi produce i 422.
La riavviabilità è conseguenza: a ogni ingresso il wizard rilegge lo stato reale e riprende dal
primo passo incompleto. Decisione registrata in **ADR-0054** (nuovo).

**Scartate:**
- *Endpoint aggregato transazionale* (tutto-o-niente vero): secondo write-path da mantenere in
  parallelo ai sei service per sempre (debito strutturale), e comunque inapplicabile al rilancio
  su lido già operativo — il ramo incrementale servirebbe lo stesso.
- *Ibrido aggregato-al-primo-giro*: due architetture per lo stesso flusso.
- *Wizard-hub a checklist* (rimandare alle pagine reali): zero duplicazione ma l'esperienza
  «creazione e spiegazione» degrada a to-do list con navigazione a rimbalzo.
- *Embedding degli editor completi nei passi*: il Cantiere è full-viewport con selection model
  proprio; incastonarlo produce UX compressa e accoppiamento fragile.

### 1. Contratto (`packages/contracts`)

```ts
export type SetupStepKey = 'structure' | 'timeSlots' | 'seasons' | 'rates';

/** Stato di completezza della prima configurazione (ADR-0054). Misura la catena
 *  reale dei prerequisiti di prenotazione: la stessa semantica dei 422
 *  NO_SEASON / NO_RATE / UMBRELLA_NOT_FOUND, resa interrogabile. */
export interface SetupStatusDTO {
  structure: { sectors: number; rows: number; activeUmbrellas: number; complete: boolean };
  timeSlots: { count: number; complete: boolean };
  /** usable = stagioni con endDate >= oggi (Europe/Rome): una stagione tutta nel
   *  passato non permette di incassare. */
  seasons: { usable: number; complete: boolean };
  /** count = tariffe delle stagioni usable; hasCatchAll = esiste una tariffa con
   *  tutte le dimensioni null (wildcard totale, ADR-0032) su una stagione usable. */
  rates: { count: number; hasCatchAll: boolean; complete: boolean };
  complete: boolean;                       // AND dei quattro passi
  firstIncompleteStep: SetupStepKey | null; // null quando complete
}
```

Semantica dei passi (ordine = catena di dipendenza reale, handoff §5.2):
- `structure.complete` = `sectors > 0 && rows > 0 && activeUmbrellas > 0` (attivi =
  `retiredAt IS NULL`: i ritirati non contano, ADR-0053).
- `timeSlots.complete` = `count > 0`.
- `seasons.complete` = `usable > 0`.
- `rates.complete` = esiste **almeno una stagione usable con ≥ 1 tariffa** (criterio «il lido può
  incassare»: basta un percorso di prezzo valido). `hasCatchAll` è **advisory**, non blocca: una
  tariffa tutta-wildcard garantisce che nessuna combinazione cada in `NO_RATE` (type null =
  wildcard anche sul tipo, quindi copre pure gli abbonamenti).

`PlatformEstablishmentDTO` += `setupComplete: boolean` (PII-free: un boolean derivato da count,
coerente con ADR-0040).

### 2. API (`apps/api`)

- **`GET /establishment/setup-status`** su `EstablishmentController`, **`@Roles(Admin)`**
  (alimenta UX admin-only; l'overview resta auth-only com'è).
- Nuovo `SetupStatusService` in `EstablishmentModule`, pattern `getOverview`:
  `TenantContext.require()` + `prisma.forTenant` + `Promise.all` di count + **funzione pura**
  `computeSetupStatus(counts): SetupStatusDTO` (projection separata, unit-testabile). Query:
  count settori/file/ombrelloni attivi, count fasce, stagioni con `endDate >= todayInRome()`
  (`common/dates.ts`), per le stagioni usable count tariffe via `Pricing` 1:1 + esistenza
  catch-all (`type/sectorId/rowId/packageId/timeSlotId/periodStart/periodEnd` tutti null).
- **Platform Console:** `EstablishmentModule` esporta `SetupStatusService`; `PlatformModule` lo
  importa e `platform-metrics.service.ts::metricsFor` valorizza `setupComplete` dentro il
  `forTenant` già aperto per le altre metriche (nessun loop aggiuntivo).

### 3. FE `web-staff` — feature `features/onboarding/`

**Rotta** `/onboarding` (`meta: { title, role: Role.Admin }`, precedente:
`/establishment/structure`), dentro l'AppShell. Nessun redirect forzato.

**Ingressi** (tutti gated `isAdmin`):
- `EstablishmentView`: card permanente «Configurazione guidata» (riapri quando vuoi) + `Callout`
  con CTA quando `!setupStatus.complete`.
- `MapView`: empty-state (quando la day-map non ha struttura) con CTA «Configura il tuo lido» —
  è il punto dove il bisogno si manifesta.

**Wizard** `OnboardingView.vue` + stepper feature-locale (precedente: `StructureGuidedSetup`;
nessun componente ui-kit nuovo finché non c'è un secondo uso). Passi:

1. **Benvenuto** — spiega la catena e cosa si otterrà (nessuna scrittura).
2. **Struttura** — crea settore → crea fila → genera ombrelloni. Il form del generatore si
   **estrae** da `RowPanel.vue` in componente condiviso della feature establishment (prefisso,
   da-numero, quantità ≤ `GENERATE_MAX`, tipologia opzionale, anteprima etichette) e viene riusato
   da entrambi — non duplicato. Link «apri il Cantiere» per strutture complesse.
3. **Fasce orarie** — crea fascia (nome, `HH:MM`).
4. **Stagione** — crea stagione (nome, date); avviso se le date sono tutte nel passato.
5. **Tariffe** — spiega la catch-all e guida a crearla: prezzo inserito dall'utente → `POST /rates`
   con tutte le dimensioni null sulla stagione scelta (selettore se più stagioni usable). Avviso
   se `!hasCatchAll` dopo creazioni specifiche. Nessun prezzo precompilato, nessun dato demo.
6. **Riepilogo** — setup-status ricaricato, spunte per passo, CTA «Vai alla mappa»; menzione del
   catalogo noleggio come approfondimento facoltativo (link, non un passo).

Ogni passo: intro didattica di 2–4 frasi + dettaglio espandibile «Perché serve?»; mostra le
entità **reali** già presenti (modalità rivedi/aggiungi sui passi completi); errori 409/422 resi
inline/toast col pattern esistente. Il wizard **non cancella mai nulla**: dove il dominio vieta
(ritiro, guardie 409) spiega e rimanda all'editor completo.

**Ripresa:** all'ingresso, stepper posizionato su `firstIncompleteStep`; i passi completati
restano navigabili.

**Data layer:** `useSetupStatus()` (query, `queryKeys.setupStatus(establishmentId)`); i passi
riusano le mutation esistenti (`useEstablishmentStructure`, `useTimeSlots`, `useSeasons`,
`useRates`) — zero logica dati nuova. Le liste di invalidazione di struttura (`structureKeys`) e
delle mutation catalog si estendono con la chiave setup-status, così ogni mutazione fatta anche
**fuori** dal wizard aggiorna lo stato.

### 4. FE `web-platform`

Lista lidi: `Badge` «Da configurare» (tone `neutral`) quando `setupComplete === false` e il lido
non è sospeso. Nessuna nuova vista.

### 5. Edge case (dal dominio, handoff §5.3)

- **Rilancio su lido operativo:** i passi mostrano lo stato reale e aggiungono; nessuna promessa
  di reset (le guardie 409 e il ritiro-non-eliminazione restano la verità, spiegata nel passo).
- **Stato parziale:** è il modello, non un'anomalia — la ripresa parte da lì.
- **Stagione solo-passata:** `seasons.usable = 0` → passo incompleto con spiegazione (caso
  «nuova stagione» del lido al secondo anno: l'onboarding è anche il flusso di ri-apertura).
- **Ombrelloni tutti ritirati:** `activeUmbrellas = 0` → struttura incompleta (coerente col 422
  che ne deriverebbe).
- **Stagioni sovrapposte:** ammesse (tie-break documentato in `resolveSeason`); il setup-status
  non se ne cura, conta le usable.
- **Ruoli:** rotta e setup-status admin-only; le mutazioni catalog restano Staff+ (stato attuale,
  fuori scope cambiarle — nota: handoff §5.3 su questo è impreciso, verificato sul codice:
  nessun `@Roles` nei controller catalog).

### 6. Test

- **api unit:** `computeSetupStatus` (vuoto / parziale per ogni anello / completo / ritirati
  esclusi / stagione passata / catch-all detection).
- **api e2e** (`setup-status.e2e-spec.ts`, calendario congelato 2026-07-15, date letterali nella
  stagione seed): 403 staff · tenant vuoto → `firstIncompleteStep: 'structure'` · progressione a
  passi fino a `complete: true` · stagione solo-passata non conta · tariffa su stagione passata
  non completa `rates`.
- **platform e2e:** `setupComplete` nella lista (lido vuoto false, lido seed true).
- **web-staff:** component test del wizard (ripresa da `firstIncompleteStep`, passi che invocano
  le mutation, revisit di un passo completo), `useSetupStatus`, Callout/card in
  `EstablishmentView`, empty-state CTA in `MapView` (visibile solo admin); spec del form
  generatore estratto (che copre anche il riuso in `RowPanel`).
- **web-platform:** badge nella lista.

### 7. Documentazione di design (DoD design-docs)

- **ADR-0054** «Onboarding incrementale con completezza misurata server-side»: contesto (catena,
  422, rilancio su lido operativo), decisione (no endpoint aggregato transazionale — motivazioni;
  setup-status unica fonte di verità; wizard orchestratore di endpoint esistenti), conseguenze
  (lo stato parziale è di prima classe; il setup-status deve evolvere con la catena dei
  prerequisiti; nessun secondo write-path).
- Mockup `docs/design/mockups/onboarding-wizard.html` (self-contained, nel task FE).
- `docs/design/flows.md`: sezione flusso onboarding (Mermaid, stati del wizard = proiezione del
  setup-status).

## Rubric check

1. **Professionalità** — la completezza è misurata dove nasce la verità (server, stessa semantica
   dei 422), non dedotta dal client; il wizard non promette ciò che il dominio vieta.
2. **Convenzioni** — pattern `getOverview` per l'endpoint; projection pura; composable e chiavi
   query centralizzate; primitivi ui-kit esistenti (`Callout`, `Badge`, `Card`, `EmptyState`).
3. **Modularità** — funzione pura di completezza; stepper feature-locale; generatore estratto e
   riusato invece che duplicato.
4. **Zero debito** — nessun write-path nuovo; contratti additivi (`SetupStatusDTO`,
   `setupComplete`); nessun breaking change.
