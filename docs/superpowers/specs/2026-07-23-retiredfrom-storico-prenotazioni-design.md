# Wiring di `retiredFrom` nello storico prenotazioni — design

- **Data:** 2026-07-23 · **Stato:** approvato dall'utente (criterio: professionale, senza debiti)
- **Origine:** backlog D-055 ([ADR-0053](../../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md),
  handoff [2026-07-23-ritira-ombrellone](../../handoff/2026-07-23-ritira-ombrellone.md) §5)
- **Scope:** solo lettura dello storico. Fuori scope (restano in backlog): reason `UMBRELLA_RETIRED`
  nel quote, guardia su `update`/`remove` dei ritirati, canary indice parziale.

## Problema

`CustomerBookingDTO.sectorName` è proiettato da `b.umbrella.row?.sector.name`
(`bookings.service.ts`, `listByCustomer`). Un ombrellone **ritirato** (D-055) ha `rowId = null`:
il chip posizione della Scheda cliente rende «— · 12» in tre punti (storico, abbonamenti,
pagamenti) e l'operatore non sa né dov'era l'ombrellone né perché è sparito dalla mappa.
Lo snapshot per ripararlo esiste già: `Umbrella.retiredFrom` («Settore · Fila», congelato al
ritiro, ADR-0053).

## Decisione

**Posizione storica + marca «ritirato»**, additiva sul contratto. Scartate: il fallback dentro
`sectorName` (sporca un campo documentato come «nome del Settore» vivo con una stringa
«Settore · Fila» storica) e il riempimento senza marca (l'operatore non capirebbe perché
l'ombrellone non è più in mappa).

### 1. Contratto (`packages/contracts`, `CustomerBookingDTO`)

Due campi opzionali nel blocco «arricchimenti server-side»:

```ts
umbrellaRetiredAt?: string;    // ISO datetime; presente SOLO se l'ombrellone è ritirato (D-055)
umbrellaRetiredFrom?: string;  // snapshot «Settore · Fila» al ritiro; presente solo se ritirato e noto
```

Due campi, non uno: ritirato-senza-snapshot è possibile a contratto (`retiredFrom` è nullable
difensivo) e la **marca** non deve sparire se manca lo snapshot. `sectorName` resta invariato
(assente per i ritirati).

### 2. API (`bookings.service.listByCustomer` + `customer-booking.projection`)

- `CustomerBookingEnrichment` += `umbrellaRetiredAt?: string` e `umbrellaRetiredFrom?: string`;
  la projection li copia nel DTO come gli altri arricchimenti.
- In `listByCustomer`: valorizzati da `b.umbrella.retiredAt` / `b.umbrella.retiredFrom`
  (`retiredFrom` passato solo se `retiredAt` è valorizzato: la coppia è coerente per costruzione
  del retire/restore, ma il gate esplicita l'invariante «presente solo se ritirato»).
- **Zero query aggiunte**: l'`include` di `umbrella` carica già gli scalari.
- Il canale cliente (`listSubscriptionsForCustomer` → riusa `listByCustomer`) eredita i campi:
  coerente (l'abbonato con ombrellone ritirato a metà stagione vede la posizione storica).
  `web-customer` oggi usa solo `umbrellaLabel`: nessuna modifica FE lì.

### 3. FE `web-staff` (Scheda cliente)

I tre punti che oggi triplicano `{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}`:
`CustomerHistoryCard.vue`, `CustomerSubscriptionsCard.vue`, `CustomerPaymentsCard.vue`.

- Nuovo helper condiviso `positionLabel(b: CustomerBookingDTO): string` (file utility della
  feature customers): ritirato → `«{umbrellaRetiredFrom ?? '—'} · {umbrellaLabel}»`
  (es. «Centro · Fila 1 · 12»); vivo → `«{sectorName ?? '—'} · {umbrellaLabel}»` (invariato).
  L'estrazione evita di triplicare anche il ramo condizionale nuovo.
- Nei tre punti, `Badge` «Ritirato» (tone `neutral`, primitive ui-kit esistente) quando
  `b.umbrellaRetiredAt` è presente. Nessun nuovo token/hex.

### 4. Test

- **Projection spec** (`customer-booking.projection.spec.ts`): caso ritirato — campi copiati,
  assenti per i vivi.
- **E2e `customer-bookings`**: booking concluso su ombrellone poi ritirato → lo storico espone
  `umbrellaRetiredAt`/`umbrellaRetiredFrom` e `sectorName` assente; un booking su ombrellone
  vivo nello stesso run conserva `sectorName` e NON ha i campi nuovi. Date letterali dentro la
  stagione seed, calendario congelato al 2026-07-15 (contratto in testa al setup).
- **Web-staff**: spec delle card aggiornate (chip storico + Badge «Ritirato»); unit dell'helper
  `positionLabel`; MSW allineato se i handler servono `CustomerBookingDTO`.

## Rubric check

1. **Professionalità** — lo storico mostra il dato storico vero (snapshot ADR-0053), marcato
   come tale; nessun campo vivo riciclato per semantica storica.
2. **Convenzioni** — arricchimenti server-side flat opzionali come gli esistenti
   (`packageName`/`seasonName`); Badge ui-kit; helper condiviso invece di triplicazione.
3. **Modularità** — un helper puro testabile; projection invariata nella forma.
4. **Zero debito** — additivo su contratto condiviso, nessun breaking; l'unica duplicazione
   esistente (chip triplicato) viene ridotta, non aumentata.
