# Spec — Fasce orarie ↔ mappa: rendere N fasce arbitrarie (assorbe 3 bug)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-06). **Pronta per `writing-plans` + esecuzione nella
> prossima sessione** (questa sessione si chiude dopo la spec). Slice **FE-only** (nessun backend, previa verifica §5).
> Decisioni: cella a **spicchi N-agnostici**; modale con **N box reali**; messaggio disponibilità **corretto**;
> modello fasce = **partizione disgiunta**; overlapping/"giornata intera" = **deferito** (§7).

---

## 1. Problema (una sola radice, 3 bug)

Il modello `TimeSlot` è **N fasce arbitrarie** (`name`/`startTime`/`endTime`/`sortOrder`, ADR-0013) e il dato è **già
N-aware**: ogni `UmbrellaDTO` ha `stateBySlot: Record<slotId, SlotState>` per **tutte** le fasce, e la logica di
prenotazione (`firstFreeSlot`, `slotIsBusy`, `openModal`) itera già `timeSlots`. **Ma il VISIVO comprime N→2**:

- [MapView.vue:55 `halfSlots`](../../../apps/web-staff/src/features/map/MapView.vue): prende inizio/fine giornata, **scarta**
  l'eventuale fascia "piena" (start=dayStart ∧ end=dayEnd) e tiene solo la **prima** (→"Mattina") e l'**ultima** (→"Pomeriggio").
- [MapView.vue:307-318](../../../apps/web-staff/src/features/map/MapView.vue): due box con label **hardcoded** "Mattina"/"Pomeriggio".
- [MapView.vue:333-335](../../../apps/web-staff/src/features/map/MapView.vue): messaggio **"disponibile per l'intera giornata"** fisso.
- [UmbrellaCell.vue](../../../packages/ui-kit/src/components/UmbrellaCell.vue): props `morningState`/`afternoonState` → cerchio
  mezzo/mezzo (2 stati).

**Conseguenze (bug reali, con 3+ fasce o config non standard):**
1. **Fasce centrali sparite:** con 3+ fasce, quella di mezzo è invisibile e **non prenotabile dalla mappa** (né in cella né in modale).
2. **Nomi/orari reali ignorati:** i box dicono sempre "Mattina/Pomeriggio" anche se le fasce si chiamano altrimenti.
3. **Messaggio disponibilità errato:** cliccando una fascia libera compare "intera giornata" **senza** controllare le altre fasce.

Nota: col **seed di default (2 fasce disgiunte** Mattina 08–13 / Pomeriggio 13–19**)** la mappa funziona; i bug emergono quando
l'admin configura **N≠2** dall'editor Struttura ([EstablishmentStructureView](../../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue)).

## 2. Principio di design

**Smettere di ridurre a 2. Renderizzare fedelmente le N fasce configurate** (ordinate per `sortOrder`), con nomi/orari reali,
stato per-fascia, prenotazione per-fascia, e messaggi calcolati dallo stato reale. Una sola resa **N-agnostica** — niente
special-case "2 vs N" (quello è il debito attuale).

## 3. Decisioni (CONFERMATE)

1. **Cella (`UmbrellaCell`) N-agnostica a spicchi.** Redesign: da `morningState`/`afternoonState` a **`slotStates: SlotState[]`**
   (ordine = `sortOrder`). Il cerchio 34px mostra **N spicchi** colorati per stato (es. `conic-gradient` a N archi uguali).
   Per N=1 → tinta piena; per N≥2 → spicchi. `typeIcon`/`selected`/`label`/`ariaLabel` invariati. **Nessun ramo speciale per N=2.**
   *(Nota implementazione: per N molto grande — improbabile — la resa resta valida ma poco leggibile; opzionale un fallback
   aggregato oltre una soglia, ma NON in v1: YAGNI.)*
2. **Modale a N box reali.** Sostituire i 2 `<button>` Mattina/Pomeriggio con un **`v-for` sulle fasce** (`timeSlots`,
   ordinate per `sortOrder`): ogni box mostra il **nome reale** (+ eventuale range `startTime–endTime`), lo **stato**
   (`stateBySlot[slot.id]` via `STATE_LABEL`/`STATE_COLOR`), è **selezionabile** (`selectSlot(slot.id)`,
   `aria-pressed = selectedSlotId === slot.id`). Rimpiazza `halfSlots`/`morning`/`afternoon`/`morningSlotId`/`afternoonSlotId`.
3. **Messaggio disponibilità corretto.** Quando non c'è `currentBooking`, il messaggio deriva dallo **stato reale**:
   - se **tutte** le fasce sono `free` → "Postazione libera tutto il giorno";
   - se **alcune** libere → "Libera nelle fasce: {nomi delle fasce free}";
   - se **nessuna** libera → nessun box "disponibile" (o "Nessuna fascia libera"). *(Copy da rifinire nel piano.)*
   In ogni caso **niente più "intera giornata" hardcoded**.
4. **Prenotazione per-fascia invariata nella logica**: `selectedSlotId` guida `createBooking` (già così); ora è
   selezionabile su **qualunque** fascia, non solo 2. `open()` continua ad auto-selezionare la fascia che ha una prenotazione.
5. **Modello fasce = partizione disgiunta** della giornata (bande non sovrapposte). La mappa le renderizza **indipendenti**
   (ognuna col suo `stateBySlot`). Slice **FE-only**.

## 4. Impatto per file (indicativo — dettaglio nel piano)

- **`packages/ui-kit/src/components/UmbrellaCell.vue`**: props `slotStates: SlotState[]` al posto di `morning/afternoonState`;
  resa a spicchi (`conic-gradient`) con fallback tinta piena per N=1; aggiornare `UmbrellaCell.spec.ts`. **Consumatori** da
  aggiornare: cercare tutti gli usi di `UmbrellaCell` (`morning-state`/`afternoon-state`) — principalmente `MapView.vue`.
- **`apps/web-staff/src/features/map/MapView.vue`**: rimuovere `halfSlots` e derivati a 2 (`morning`, `afternoon`,
  `morningSlotId`, `afternoonSlotId`, `liveSlotState`); introdurre `slotStatesFor(u): SlotState[]` (map su `timeSlots` →
  `stateBySlot`); template modale con `v-for` sulle fasce; `ariaLabel` per-fascia (elenco reale, non "mattina/pomeriggio");
  messaggio disponibilità computato (§3.3). Le celle in griglia passano `:slot-states="slotStatesFor(u)"`.
- **Test**: `UmbrellaCell.spec.ts` (spicchi N, N=1 tinta piena, selected/aria); `MapView.spec.ts` (con **3 fasce**: la fascia
  centrale è visibile e prenotabile; box coi nomi reali; messaggio disponibilità corretto in scenari all-free / some-booked).
  Aggiungere al mock una config a **3 fasce** per esercitare il caso N>2.

## 5. Verifica pre-implementazione (backend)
**Assunzione FE-only:** il map projection espone `stateBySlot` per **ogni** fascia configurata (non solo 2). È coerente col
codice attuale (la logica di booking già legge `stateBySlot[s.id]` per ogni `timeSlots`). **Il piano DEVE verificarlo** con un
caso a 3 fasce (mock FE + eventuale e2e map). Se il backend non popolasse tutte le fasce, aggiungere quello al piano (diventa
non-FE-only).

## 6. Test / baseline
- Baseline da non regredire (LIVE su `main`): ui-kit **73** · web-staff **257** · api unit **200** · api e2e **235** · typecheck pulito.
- Additivo: `UmbrellaCell.spec` (+N), `MapView.spec` (+ casi 3-fasce). Verificare **ui-kit E web-staff** (gli spec ui-kit sono globati da web-staff).

## 7. Fuori scope / deferito
- **Fasce sovrapposte / "giornata intera"** (una fascia che copre più bande, il cui booking deve **bloccare** le altre):
  richiede **logica di disponibilità cross-fascia lato backend** (release/override di occupazione) — **decisione di dominio
  separata**, NON coperta qui. La slice attuale rende le fasce **indipendenti**; una config sovrapposta si vedrebbe come box
  indipendenti (nessun blocco incrociato). **Candidata a nuovo D-0xx** (registrare in `deferred.md` quando si pianifica).
- Editor Struttura: eventuale validazione "fasce disgiunte" è fuori scope (altra slice).

## 8. Prossimi passi
`writing-plans` (TDD, 2 task: UmbrellaCell N-slices + MapView N-box/messaggio) → `subagent-driven-development` → review a due
stadi + whole-branch (opus) → verifica LIVE (ui-kit + web-staff) → merge FF con ok esplicito.
