# Spec — Loading state universale (skeleton + azioni)

> **Data:** 2026-07-21 · **Stato:** approvata a voce, in review scritta.
> **Obiettivo:** una gestione del loading riutilizzabile e riutilizzata in tutto il monorepo:
> skeleton per pagine/card/tabelle, loader per CTA e azioni, con anti-flicker uniforme.

## 1. Contesto e problema

- `Button` ha già `:loading` (spinner `loader-2`, `disabled`, `aria-busy`) e il design-system
  (§ Definition of Done componenti) impone «`:loading` col pending osservabile». Ma esiste drift:
  punti con `:disabled="isPending"` nudo senza spinner (reset password in `EstablishmentView` e
  `EstablishmentDetailView`, `AbsenceReleaseModal`), e `ModalFooter` non espone il loading del
  submit.
- Il caricamento dati è artigianale: 6 viste mostrano `<p>Caricamento…</p>` con classi
  leggermente diverse (`CustomersView`, `CustomerDetailView`, `MapView`, `EstablishmentsListView`,
  `EstablishmentDetailView`, `MySubscriptionsView`); `EstablishmentView` e `RenewalsView` non
  mostrano nulla durante il fetch. Nessun componente Skeleton/Spinner standalone in ui-kit.
- Vincolo di piattaforma: in `theme.css` `prefers-reduced-motion: reduce` azzera **tutte** le
  animazioni → ogni skeleton animato degrada a blocco statico senza lavoro aggiuntivo.

## 2. Decisioni approvate

1. **Approccio A** — primitivo + integrazioni nei componenti che possiedono il layout (non un
   boundary universale sopra TanStack Query, non solo l'atomo).
2. **Anti-flicker**: lo skeleton compare solo se l'attesa supera **150ms** e, una volta visibile,
   resta almeno **300ms**. Su cache/rete veloce non si vede nulla.
3. **Lo skeleton non sostituisce mai dati reali**: appare solo quando non ci sono righe/valori da
   mostrare. I refetch con dati stantii visibili restano silenziosi (comportamento TanStack).
4. Estetica dentro il design system Coralyn caldo: shimmer su neutri sabbia, token semantici,
   zero hex fuori da `theme.css`.

## 3. Componenti nuovi (ui-kit)

### 3.1 `Skeleton.vue` (atomo)

- Props: `variant: 'line' | 'block' | 'circle'` (default `'line'`), `width?: string`,
  `height?: string`. Default per variant: line `0.75em`×`100%`, block `64px`×`100%`, circle
  `32px`×`32px`.
- Sempre `aria-hidden="true"`: l'atomo è decorativo, lo stato lo annuncia il contenitore.
- Raggio: `--radius-sm` (line/block), `--radius-full` (circle).
- Sfondo `--color-skeleton` con **shimmer**: sweep di gradiente verso `--color-skeleton-sheen`,
  keyframe `skeleton-sheen` in `theme.css` (accanto alle altre keyframe), ~1.6s linear infinite.
  Niente pulse di opacità (smorto sul fondo sabbia).

### 3.2 `SkeletonText.vue`

- Prop `lines: number` (default 3): righe `Skeleton` con larghezze variate **per indice**
  (pattern deterministico, mai random — testabilità, niente shift tra render). Ultima riga più
  corta.

### 3.3 `useDelayedLoading.ts` (composable)

- Firma: `useDelayedLoading(source: Ref<boolean> | (() => boolean), opts?: { delay?: number;
  minVisible?: number }): Ref<boolean>` — default `{ delay: 150, minVisible: 300 }`.
- Logica pura coi timer, esportata da `index.ts`; spec dedicato con fake timers (stesso spirito
  di `tableData.ts`). Cleanup su unmount (scope effect).
- Nota YAGNI: il precedente «niente composable per un solo consumatore» non si applica — i
  consumatori sono tutti i componenti/viste con loading.

## 4. Integrazioni nei componenti esistenti

### 4.1 `DataTable` — prop `loading`

- `loading?: boolean` (il chiamante passa `isLoading` **grezzo**; il gate anti-flicker è
  interno via `useDelayedLoading` → ogni consumatore lo eredita gratis).
- In stato loading visibile e **0 righe**: header reale + `skeletonRows` righe skeleton
  (default 5) coerenti con le colonne correnti (una `Skeleton` line per cella, larghezze variate
  per indice riga+colonna), footer nascosto, `emptyMessage` soppresso, `aria-busy="true"` sul
  contenitore.
- Con righe presenti il loading non rende nulla di diverso (decisione §2.3).
- Solo API data-driven (l'API a slot resta congelata, come per `emptyMessage`).

### 4.2 `StatTile` — prop `loading`

- Label reale, valore sostituito da `Skeleton` line; gate interno come DataTable;
  `aria-busy` sul tile.

### 4.3 `ModalFooter` — prop `submitLoading`

- `submitLoading?: boolean` passata come `:loading` al Button di submit interno.

### 4.4 Card e pagine (composizione nelle viste)

- Le viste compongono `Skeleton`/`SkeletonText` dentro le loro SectionCard/card, con
  `useDelayedLoading` esplicito. Niente `SkeletonCard` rigido: le card del repo hanno forme
  troppo diverse, un preset unico mentirebbe.
- **Mappa**: skeleton bespoke minimale (blocco-canvas shimmer al posto della spiaggia), stessa
  primitiva.

## 5. Azioni: chiusura del drift CTA

- Ogni azione asincrona mostra il pending **sul controllo che l'ha innescata** via `:loading`.
- Migrazioni: `EstablishmentView` (reset password staff), `EstablishmentDetailView`
  (sospendi/riattiva, reset password admin), `AbsenceReleaseModal` (submit) → da `:disabled`
  nudo a `:loading` (o `submitLoading` dove c'è ModalFooter).
- Azioni per-riga (Lidi sospendi/riattiva): pending sulla riga giusta via `variables` come già
  fanno, ma con lo spinner del Button invece del solo disabled.

## 6. Accessibilità

- Contenitore in caricamento: `aria-busy="true"`; skeleton `aria-hidden="true"`.
- `Button :loading` già `aria-busy` + non emette click.
- `prefers-reduced-motion`: shimmer azzerato dalla regola globale → blocco statico.

## 7. Token nuovi (`theme.css`, sezione SEMANTIC)

```css
--color-skeleton: var(--color-warm-150);
--color-skeleton-sheen: var(--color-warm-050);
```

Keyframe `skeleton-sheen` accanto alle altre. Nessun hex nuovo.

## 8. Migrazione consumatori (tutta, in questo lavoro)

| Vista | App | Oggi | Diventa |
|---|---|---|---|
| CustomersView | web-staff | «Caricamento…» | `DataTable :loading` |
| RenewalsView | web-staff | nulla | `DataTable :loading` (entrambe le tabelle) |
| CustomerDetailView | web-staff | «Caricamento…» | SkeletonText nelle card anagrafica |
| EstablishmentView | web-staff | nulla | SkeletonText card info + team |
| MapView | web-staff | «Caricamento…» | skeleton-canvas bespoke |
| EstablishmentsListView | web-platform | «Caricamento…» | `DataTable :loading` |
| EstablishmentDetailView | web-platform | «Caricamento…» | `StatTile :loading` + SkeletonText |
| MySubscriptionsView | web-customer | «Caricamento…» | Skeleton card abbonamento |
| BookingsView / RentalsView / Pricing / Catalogo / Pagamenti | web-staff | nulla (day-scoped/veloci) | `DataTable :loading` dove c'è una query, a costo zero |

**Fuori scope dichiarato**: `SetPasswordView` («Verifica del link…» è un messaggio di stato del
token, non un caricamento dati → resta testo); skeleton per route-transition (non richiesto);
error handling (ha già i suoi pattern: toast, EmptyState).

## 9. Testing e docs

- Spec nuovi: `useDelayedLoading` (fake timers: sotto-soglia niente, sopra-soglia visibile,
  minVisible rispettato), `Skeleton`/`SkeletonText` (varianti, aria-hidden, determinismo
  larghezze), `DataTable` loading (righe skeleton, soppressione emptyMessage/footer, aria-busy,
  mai sopra dati reali), `ModalFooter` submitLoading; aggiornamento spec viste migrate.
- Regola cross-file: intera suite del pacchetto toccato + `pnpm -r typecheck`.
- jsdom non vede la resa (shimmer, gradiente) → la resa si giudica in browser a 375/768/1280 e
  con reduced-motion attivo.
- Design-system: voce «Skeleton» nuova in §10, aggiornamento voce DataTable/StatTile/ModalFooter,
  token in §3. Nessun ADR nuovo (componenti additivi, coerente con ADR-0033).
