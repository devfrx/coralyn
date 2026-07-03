# Scheda Cliente — Redesign visivo (allineamento al mock aspirazionale) — Design Spec

- **Data:** 2026-07-03
- **Stato:** Approvato in brainstorming con l'utente (2026-07-03). Da scrivere piano ed eseguire (ADR-0009).
- **Origine:** la vista dettaglio cliente [`/customers/:id`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue) è ora **funzionalmente completa** (slice "Scheda Cliente 360°": header + anagrafica + 3 card reali alimentate da `GET /customers/:id/bookings`). L'utente ha fornito il **mock aspirazionale** ([`docs/design/mockups/gestionale-lidi-aspirazionale.html`](../../docs/design/mockups/gestionale-lidi-aspirazionale.html), schermata `data-screen-label="Scheda cliente"`) come **target visivo per le sole schede**. Questo slice porta la vista alla **qualità del mock**, estraendo i primitivi condivisi nel `ui-kit` (professionale, riutilizzabile, senza debiti).
- **Scope (deciso con l'utente):** **SOLO** la Scheda cliente (header + 3 card). Le altre 7 schermate del mock (Mappa, Prenotazioni, Clienti, Listino, Report, Stabilimento, Struttura) **non** sono in questo slice; l'utente le mostrerà separatamente se/quando servirà.
- **ADR di riferimento:** ADR-0033 (mappe stato→presentazione), ADR-0009 (workflow). Nessun nuovo ADR: è allineamento visivo + estrazione di componenti di presentazione sull'architettura esistente.
- **Convenzione:** codice/DB in inglese; UI/doc in italiano. **Baseline test da NON regredire** (branch `feat/scheda-cliente-360`, live 2026-07-03): **api unit 111 · api e2e 158 · web-staff 156 · ui-kit standalone 55.** Typecheck pulito. Incrementi additivi.
- **Branch:** questo slice **estende** `feat/scheda-cliente-360` (dipende da `CustomerBookingDTO` + `listByCustomer`, non ancora mergiati; la Scheda cliente è la stessa feature). Nuovi layer/commit sul branch esistente.

---

## 1. Situazione attuale vs target (mock)

**Attuale** (dopo lo slice 360°): 3 card funzionali ma semplici — Storico (lista raggruppata per stagione), Abbonamento/anzianità (righe con seniority + badge Rinnovato + nota prelazione testuale), Pagamenti (saldo/incassato + lista). Nessun header-a-icona, niente numero-grande anzianità, niente stat-box/tabella strutturata, callout prelazione minimale.

**Target (mock)** — ogni card ha un **header con quadratino-icona tinto + titolo** (+ azione a destra dove serve). In dettaglio:
1. **Abbonamento e anzianità** (icona ☆): per ogni subscription una riga con **chip ombrellone** `«C · 15»` (settore · label), **badge pacchetto** «Comfort», **badge verde «Rinnovato»**; a destra un **numero grande** `2` + label `STAGIONI`; sottotitolo `Estate 2026 · posto riservato`; testo `Abbonato da N stagioni consecutive`; se prelazione aperta, un **callout ambra** `⏱ Prelazione aperta per Estate 2027 · scade il 31 mar 2027`.
2. **Storico prenotazioni** (icona 📅): **raggruppato per stagione** con header `ESTATE 2026` + conteggio `1 prenotazioni`; righe: `Stagione 2026` · **badge tipo** (coral, «Abbonamento») · chip ombrellone · **importo** `€ 940,00` · **badge stato** (verde «Confermata»). Cancellate attenuate.
3. **Pagamenti e saldo** (icona €): due **stat box** — `SALDO APERTO € 540,00` (coral) e `INCASSATO STAGIONE € 400,00` — poi una **tabella** con colonne `PERIODO · OMBRELLONE · IMPORTO · METODO · STATO` (badge stato pagamento).

**Valori del mock** (misurati, da mappare sui token, NON hardcodare): card bianca `radius 16px` (`--radius-lg`), warm border `#E7DCCB`, ombra tenue, padding `20px 22px`; callout `bg #FBF1EC` / `ink #8A4B2C` / `radius 11px` → `--color-coral-*`; sfondo pagina cream `#ECE3D5` → `--color-warm-*` (già in uso).

## 2. Principio (deciso): estrarre i primitivi condivisi, riusare l'esistente

Il mock usa **lo stesso vocabolario visivo in ogni card/schermata**. Per non creare debito né stili one-off, i pattern ripetuti diventano componenti `ui-kit`; il resto **riusa** i componenti esistenti.

### 2.1 Nuovi componenti `ui-kit`
- **`SectionCard`** — compone [`Card`](../../packages/ui-kit/src/components/Card.vue) + header standard: quadratino-icona tinto (stesso stile di [`KpiCard`](../../packages/ui-kit/src/components/KpiCard.vue): `size-[34px] rounded-[10px]`, `iconBg`/`iconInk`) + `title`, slot opzionale `#action` (es. «Modifica»), slot default = corpo (padding `20px 22px`). Props: `{ title: string; icon?: string; iconBg?: string; iconInk?: string }`. È il pattern di **ogni** card del mock (riuso futuro su tutte le schermate).
- **`Callout`** — box tinto con icona opzionale + contenuto; prop `tone: 'warm' | 'accent' | 'neutral'` (default `warm`), slot `#icon` + default. Mappa `warm`→`--color-coral-050`/`--color-coral-700`. Usato per la nota **Prelazione** (riutilizzabile per avvisi inline).

### 2.2 Estensione minima (retro-compatibile)
- **`StatTile`** — aggiungere DUE prop opzionali retro-compatibili: `tone?: 'default' | 'accent'` (default `default`; `accent` colora il valore coral per il **SALDO**) e `layout?: 'value-first' | 'label-first'` (default `value-first` = comportamento attuale invariato). Il mock mostra la **label sopra** il valore → i due box Pagamenti usano `layout="label-first"`. I chiamanti esistenti non passano nulla → nessun cambiamento.

### 2.3 Riuso diretto (nessuna modifica)
- [`DataTable`](../../packages/ui-kit/src/components/DataTable.vue) + `TD/TD_FIRST/TD_RIGHT/TD_NUM` — tabella Pagamenti.
- [`Badge`](../../packages/ui-kit/src/components/Badge.vue) — toni: tipo prenotazione (coral→`accent`/nuovo mapping), stato (`success`/`warning`/`danger`/`neutral`), «Rinnovato» (`success`).
- [`Avatar`](../../packages/ui-kit/src/components/Avatar.vue), [`Icon`](../../packages/ui-kit/src/components/Icon.vue) — header cliente.
- Chip ombrellone: piccolo badge testuale `«{sectorName} · {umbrellaLabel}»` (riusa `Badge` tono neutral o un piccolo stile inline; NON `UmbrellaCell`, che è il pallino-stato della mappa, semantica diversa).

## 3. Backend — arricchimento etichette (deciso: soluzione professionale, senza debiti)

Per rendere fedeli le etichette del mock servono due campi in più sul DTO di lettura (stesso pattern di `umbrellaLabel`/`seasonName`, join server-side, RLS via `forTenant`).

`CustomerBookingDTO` ([`packages/contracts`](../../packages/contracts/src/index.ts)) **+=**:
```ts
  packageName?: string;   // nome del Package (se packageId presente); il FE non carica il catalogo
  sectorName?: string;    // nome del Settore dell'ombrellone (per il chip «C · 15»)
```
`BookingsService.listByCustomer` ([`bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts)):
- estende l'`include`: `{ umbrella: { include: { row: { include: { sector: true } } } }, package: true, renewals: true }`;
- projection: `packageName = b.package?.name`, `sectorName = b.umbrella.row.sector.name`.

Nessuna migrazione, nessun cambio di schema (relazioni già esistenti: `Umbrella.row → Row.sector → Sector.name`; `Booking.package → Package.name`).

## 4. Frontend — le 3 card ridisegnate

Header cliente + card «Anagrafica e contatti» **restano funzionalmente identici** ma passano a `SectionCard` per coerenza visiva (Anagrafica: `#action` = «Modifica»). Le 3 card diventano:

### 4.1 Abbonamento e anzianità
`SectionCard` (icona `star`). Per ogni subscription: chip ombrellone `«{sectorName} · {umbrellaLabel}»`, badge `packageName` (se presente), badge `success` «Rinnovato» (se `renewed`); a destra numero-grande `{seniority}` + label `STAGIONE/STAGIONI`; sottotitolo `{seasonName} · posto riservato`; riga `Abbonato da {seniority} stagioni consecutive`; se `prelazione`, un `Callout tone="warm"` con icona `clock`: «Prelazione aperta per {destinationSeasonName} · scade {deadline}». Empty state «Nessun abbonamento».

### 4.2 Storico prenotazioni
`SectionCard` (icona `calendar`). Righe **raggruppate per `seasonName`** (header uppercase + conteggio «N prenotazioni»), gruppi/righe dal più recente. Ogni riga: etichetta stagione · badge tipo (`TYPE_LABEL`, tono coral/accent) · chip ombrellone · importo `€` · badge stato (Confermata=`success` / Annullata=`danger`). Cancellate attenuate (opacità). Empty state.

### 4.3 Pagamenti e saldo
`SectionCard` (icona `euro`). Due `StatTile`: SALDO APERTO (`tone="accent"`, = `Σ(totalPrice − amountCollected)` sulle non-cancellate) e INCASSATO (`Σ amountCollected`). Sotto, `DataTable` con colonne PERIODO (`seasonName`/date) · OMBRELLONE (chip) · IMPORTO · METODO (`PAYMENT_METHOD_LABEL[b.paymentMethod]`) · STATO (`PAY_LABEL`/`PAY_TONE`). Non-cancellate. Empty state.

Nuova piccola mappa in [`statusMaps.ts`](../../apps/web-staff/src/lib/statusMaps.ts): `PAYMENT_METHOD_LABEL: Record<PaymentMethod,string>` (cash→'Contanti', card→'Carta', transfer→'Bonifico', other→'Altro').

## 5. Piano di test (TDD)

- **ui-kit unit** (Vitest): `SectionCard` (rende titolo/icona, slot action e body); `Callout` (tone→classi/token corretti, slot icona+contenuto); `StatTile` (nuova prop `tone`/`layout` retro-compatibile: default invariato, `accent` colora il valore). Incremento su ui-kit 55.
- **api e2e** (`customer-bookings.e2e-spec.ts`): estendere gli assert → una subscription con pacchetto ritorna `packageName`; ogni booking ritorna `sectorName`; una prenotazione senza pacchetto → `packageName` assente.
- **api unit**: aggiornare `customer-booking.projection.spec.ts` per `packageName`/`sectorName` (mappa presente/assente).
- **FE** (web-staff): aggiornare `CustomerDetailView.spec.ts` + seed MSW (aggiungere `packageName`/`sectorName`) → asserire: header-a-icona presente, chip «C · …», badge pacchetto, numero-grande anzianità, callout prelazione, storico raggruppato con conteggio, due StatTile con saldo/incassato corretti, tabella pagamenti con metodo tradotto. Empty states.
- Baseline da NON regredire: **api unit 111 · e2e 158 · web-staff 156 · ui-kit 55**; typecheck pulito.

## 6. Confini e note (YAGNI)

- **Solo la Scheda cliente.** Nessun'altra schermata del mock.
- **Nessuna nuova azione di scrittura** (le card restano read-only; nessun bottone funzionale nuovo oltre l'esistente «Modifica» anagrafica).
- **Token, non hex.** Se un valore del mock non ha un token corrispondente, si aggiunge un token in `theme.css` (non si hardcoda un hex nel componente).
- **Nessuna migrazione, nessun nuovo ADR.**
- `SectionCard`/`Callout`/l'estensione `StatTile` sono generici (nessun accoppiamento alla Scheda cliente): pronti per le schermate successive.

## 7. Decisioni (risolte in brainstorming 2026-07-03)

1. **Scope = solo Scheda cliente** (schede), non l'intero mock.
2. **Estrarre i primitivi condivisi** (`SectionCard`, `Callout`, estensione `StatTile`) nel `ui-kit`, riusare l'esistente (DataTable, Badge, StatTile, Avatar, Icon) — professionale, riutilizzabile, senza debiti.
3. **Arricchimento backend completo** (`packageName` + `sectorName`) per etichette fedeli al mock — coerente col pattern d'arricchimento esistente, non pigro.
4. **Token, non hex**; nessuna migrazione; nessun nuovo ADR; read-only.

## 8. Layer previsti (il piano TDD stratifica)

1. **ui-kit**: `SectionCard` + `Callout` + estensione `StatTile` (`tone`/`layout`) + specs. *(Nessuna dipendenza dal resto; ui-kit senza build — attenzione ai glob di test di web-staff.)*
2. **contracts + backend**: `packageName`/`sectorName` su `CustomerBookingDTO` + `listByCustomer` (include+projection) + unit projection + e2e. *(Layer accoppiati per compilazione: stesso commit.)*
3. **FE**: ridisegno delle 3 card (+ header Anagrafica → `SectionCard`) usando i primitivi, `PAYMENT_METHOD_LABEL`, seed MSW + test render.
