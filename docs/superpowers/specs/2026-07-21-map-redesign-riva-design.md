# Spec — Rework Mappa «Riva» (scena, cella Tessera, drawer overlay, strato informativo)

> **Data:** 2026-07-21 · **Stato:** proposto (in attesa review utente prima del piano).
> **Skills attive:** dev-discipline · dev-communication · frontend-design · brainstorming.
> **Mockup approvato:** [`docs/design/mockups/map-redesign-esplorazione.html`](../../design/mockups/map-redesign-esplorazione.html)
> (direzione «Riva» + cella **Tessera** scelte dall'utente; hovercard/legenda operativa/ricerca approvate).
>
> **⚠️ Iterazione post-merge (2026-07-21):** dopo il merge del piano è stata fatta un'**iterazione
> UI** su richiesta utente — scena **full-bleed** (niente cornice-card, mare+bagnasciuga+toolbar
> **sticky**), **filtri di stato spostati nella toolbar** e **legenda informativa in un `Popover`
> pillola** (nuovo primitivo ui-kit). Questa spec descrive il design **iniziale**; per lo stato
> **corrente** fa fede il living doc [`design-system.md`](../../design/design-system.md) §13.6/§13.8
> e il codice (commit `93cd232`).

## 1. Contesto & problema

La Mappa (`MapView.vue`) è il cuore operativo ma la resa attuale è sotto il livello del resto dell'app:
mare come barretta con icona («orrendo», cit. utente), palco a gradiente anonimo, celle-cerchio piatte,
dettaglio in **pannello inline** che stringe la mappa (in divergenza da ADR-0019 che prevede il **drawer
in overlay**), nessun dato d'insieme (occupazione), legenda solo decorativa, nessuna ricerca.

Decisione di brainstorming (utente): **rework completo** — scena, cella, interazione — come **ibrido
calibrato**: scena leggera ed evocativa, ma i **dati comandano**. Modello logico **invariato**
(Settore → Fila → Ombrellone, ADR-0005/0014; la planimetria libera resta D-005).

## 2. Obiettivi / non-obiettivi

**Obiettivi**
- Scena **«Riva»**: mare a orizzonte con velature in drift lento + bagnasciuga; sabbia con grana
  impercettibile; tipografia e spaziatura curate. Sobria: mai in competizione coi dati.
- Cella **«Tessera»**: quadrato arrotondato, split per fascia a **colonne verticali** (Mattina a
  sinistra), più densa e leggibile del cerchio a spicchi.
- **Dettaglio in drawer overlay** (riusa `Drawer` ui-kit) → mappa sempre a piena larghezza;
  **riallinea il codice ad ADR-0019** (chiude la divergenza pannello-inline).
- Strato informativo: **occupazione per settore** (nei tab) **e per fila** (righello), **legenda
  operativa** (evidenzia/filtra per stato), **ricerca/salto rapido** (numero o cliente).
- **Hovercard** al passaggio sulla cella (desktop): consultazione senza click. Nuovo primitivo ui-kit.
- Micro-polishing: reveal scaglionato per fila, hover-lift, ombra «da sole», impulso sul trovato.
  Tutto `prefers-reduced-motion`-aware.

**Non-obiettivi (YAGNI)**
- **No** barra KPI di giornata sulla mappa (incassi ecc.): esiste il Report (scelta utente).
- **No** coordinate libere / planimetria (D-005), **no** bottom-sheet tablet (D-054), **no** pattern
  colorblind sulle celle (D-020 — l'ink AA + aria-label restano la risposta MVP).
- **No** virtualizzazione DOM (lidi target = centinaia di celle, ADR-0020).
- **No** redesign del modale di prenotazione (fuori scope; resta com'è).

## 3. La scena «Riva» (stage)

Struttura verticale dello stage (dall'alto): **mare → bagnasciuga → corpo sabbia**.

- **Mare** (h ~64px): gradiente verticale `--color-sea-deep → --color-sea-3 → --color-sea-2 → --color-sea-1`
  + **3 velature** (pseudo-elementi/`div` con `border-radius` alto, bianco a bassa opacità) che
  **derivano** orizzontalmente in loop lento (19–33s, `transform` only). Label «MARE» discreta
  (top-right, tracking largo, `--color-sea-ink`). Sotto `prefers-reduced-motion`: velature statiche.
- **Bagnasciuga** (h ~16px): gradiente `--color-sea-1 → sabbia bagnata (#EDE6D2) → sabbia stage` +
  filo di «sheen» chiaro. Il mare *bagna* la sabbia, non finisce a spigolo.
- **Sabbia**: gradiente warm attuale (`--color-warm-075 → --color-warm-150`) + **grana**
  (SVG `feTurbulence` inline come `background-image` data-URI, `opacity ~.05`, `mix-blend-mode:
  multiply`). Niente altra decorazione.
- **Nuovi token** (primitivi in `theme.css` + documentati in design-system §2/§9):
  `--color-sea-deep: #8FC2D4` (cima del mare) e `--shadow-sun` (ombra «da sole» delle celle, vedi §4).
  Il vecchio blocco «Mare» a barretta viene rimosso.

**Header dello stage** (sopra le file): tab settori con **occupazione %**, conteggio postazioni,
**campo ricerca** (vedi §7). I tab restano `SegmentedControl`-like: si **estende `SegmentedControl`**
con un'opzione `hint` (testo secondario per opzione, qui la %) invece di creare un componente nuovo.

**File**: marcatore di fila a sinistra (label `FILA n` + sottotitolo opzionale «prima linea» per la
fila 1), celle al centro, **righello occupazione** a destra (vedi §6). **Reveal scaglionato per fila**
al mount (`animation-delay` crescente, già previsto da design-system §8).

**Settore Speciali**: resta il blocco dedicato in coda (convenzione attuale), stessa scena.

## 4. La cella «Tessera» (rework di `UmbrellaCell`, ui-kit)

Sostituisce il cerchio. **I 4 assi di ADR-0020 restano identici** (etichetta, stato, tipologia,
selezione) — cambia solo la resa. ADR-0020 non richiede emendamento (non fissa la forma); si aggiorna
il **living doc** design-system §13.

- **Forma**: quadrato arrotondato (**40px** in esteso, **44px** in compatto/touch). Il token
  `--cell-size` va aggiornato **34 → 40** nel living doc (design-system §9); `--cell-size-touch: 44`
  invariato.
- **Stato pieno**: riempimento pieno del token stato, numero centrato con ink AA per-stato (§3.1
  design-system, invariato).
- **Split per fascia**: **colonne verticali** in ordine `sortOrder` (Mattina a **sinistra**,
  Pomeriggio a destra — mappa mentale del giorno), divisore hairline `rgba(255,255,255,.55)`.
  **N-agnostico**: N fasce → N colonne uguali (con 3+ fasce le colonne si stringono: accettato,
  caso raro; il numero resta leggibile perché è sopra, non dentro gli spicchi).
- **Ink su split**: `--color-text` (scuro neutro), come oggi per il misto.
- **Profondità**: `--shadow-sun` (ombra calda portata in basso, tinta `--color-stage-1` a bassa
  opacità) + `inset` top-light. Hover: **lift** −2px con ombra che cresce (`transform`/`box-shadow`
  only). Active: scale .97.
- **Selezione**: invariata (outline `--color-brand` + alone `--color-brand-tint`).
- **Focus**: invariato (`--ring-focus`, coesiste con selezione).
- **Marcatore tipologia**: invariato (cerchietto surface top-right, icona `--color-accent`).
- **A11y**: `<button>` + `aria-label` completa, invariati; il contratto del componente
  (`label/ariaLabel/slotStates/typeIcon/selected`) **non cambia** → nessun impatto sui chiamanti.
- **Stati aggiuntivi UI** (per legenda/ricerca, vedi §6-§7): prop o classi `dimmed` (opacity .22 +
  desaturazione) e `found` (impulso 2×). Transizioni su opacity/filter.

## 5. Dettaglio in **drawer overlay** (riallineamento ADR-0019)

- L'`aside` inline di `MapView` viene sostituito dal **`Drawer` ui-kit** (overlay destro, scrim
  `--color-scrim`, focus-trap/Esc dal primitivo). Titolo: **«Ombrellone “etichetta”»**.
- **Contenuto invariato nella sostanza** (è già buono): chip tipologia + crumb Settore·Fila, blocco
  fasce cliccabili (stato per fascia), dettaglio prenotazione (cliente, importo, pagamento), azioni
  (Registra incasso / Annulla / Gestisci abbonamento / Nuova prenotazione / Abbonamento). Solo
  ricomposto dentro il drawer, con la spaziatura del drawer.
- Sotto `lg`: lo stesso drawer, `max-w-[86vw]` (come `NavDrawer`) — coerente con ADR-0051; su touch
  il tap apre direttamente il drawer (niente hovercard, §8).
- La selezione cella (anello coral) resta visibile sotto lo scrim leggero → l'operatore non perde il
  riferimento spaziale.

## 6. Strato informativo — occupazione e legenda operativa

**Metrica di occupazione** (unica, condivisa): una postazione è **occupata** se **almeno una fascia**
è `≠ free` (i `covered` **contano come occupati**: non prenotabili — semantica di *disponibilità
operativa*; il Report mantiene la sua metrica D-048, sono viste diverse e la spec lo documenta).

- **Tab settore**: `Centro · 82%` = postazioni occupate / totali del settore (tramite `hint` di
  `SegmentedControl`, §3).
- **Righello di fila**: track 4px + fill `--color-accent` (opacità .75) + label `9/12`
  (`tabular-nums`). Calcolo in un **composable puro testabile** (`useMapOccupancy` o util in
  `useDayMap`), non spalmato nel template.

**Legenda operativa**: i chip stato (Libero/Abbonato/Giornaliero/Prenotato/Non disponibile) diventano
**toggle multi-select**: con ≥1 attivo, le celle che non matchano nessuno stato attivo (su nessuna
fascia) prendono `dimmed`; clic di nuovo per spegnere. Hint testuale «clic per filtrare · di nuovo per
tutto». I chip sono `<button aria-pressed>`; il filtro è **solo visivo** (nessuna cella rimossa dal
DOM → tastiera/aria invariati).

## 7. Ricerca / salto rapido

Campo pill nell'header dello stage («Trova ombrellone o cliente…»):
- match su **etichetta esatta** (case-insensitive) **o** su **nome cliente substring** (dai bookings
  del giorno già in memoria — nessuna nuova API);
- le celle trovate prendono `found` (impulso coral 2×) e la **prima** viene scrollata in vista
  (`scrollIntoView` block:nearest, no scroll se `prefers-reduced-motion`);
- se il match è in **un altro settore**, si attiva il tab del settore del **primo** match (con
  l'input che resta focused);
- input vuoto = nessun effetto. Debounce leggero (~150ms).

## 8. Hovercard (nuovo primitivo ui-kit)

- **`HoverCard.vue`** in ui-kit, wrapper del primitivo **reka-ui `HoverCard`** (convenzione: reka-ui
  solo dietro ui-kit). API minima: trigger slot + content slot, `openDelay ~350ms`, `closeDelay`
  breve, side top, freccetta, surface + `--shadow-drawer`-like.
- Uso nella mappa: al passaggio sulla cella mostra **etichetta + Settore·Fila**, per ogni fascia
  **dot stato + nome stato + cliente** (se prenotata), footer «Clic per aprire il dettaglio».
- **Solo hover-capable**: il gating sta nel **chiamante** (`MapView`, via `useMediaQuery('(hover: hover)')`
  già esistente in web-staff, difensivo in jsdom) — il primitivo ui-kit resta agnostico. Su touch
  zero overhead, il tap apre il drawer.
- La hovercard è **consultazione**; non contiene azioni (le azioni stanno nel drawer).

## 9. Impatti trasversali

- **`SegmentedControl`**: estensione additiva `options[].hint?: string` (testo secondario).
  Nessun breaking (prop opzionale).
- **`UmbrellaCell`**: stessa API + prop opzionali nuove (`dimmed?`, `found?`). I 6 spec esistenti
  della cella vanno aggiornati alla nuova resa (bg computed cambia: da conic a colonne).
- **Design docs nello stesso task** (ADR-0009): design-system **§13** riscritto (Tessera, scena Riva,
  hovercard, legenda operativa, ricerca, occupazione, drawer), **§2/§9** (token nuovi
  `--color-sea-deep`, `--shadow-sun`), **§8** (drift velature). **Nessun nuovo ADR**: ADR-0020 resta
  valido (HTML/CSS, 4 assi, a11y — la forma è dettaglio del living doc); ADR-0019 viene
  **riallineato dal codice** (drawer overlay), non modificato.
- **Nessun impatto backend/contracts**: tutti i dati (stati per fascia, bookings, clienti) sono già
  nel FE. Nessuna nuova API.

## 10. Test (vitest, MSW; convenzioni repo)

- `UmbrellaCell`: resa colonne (pieno/split N-agnostico), ink, dimmed/found, badge tipologia,
  aria-label, selezione (aggiornamento dei 6 spec esistenti + nuovi casi).
- `useMapOccupancy` (o util): metrica occupazione per fila/settore (puro, deterministico).
- `MapView`: legenda toggle → dimmed sulle celle giuste; ricerca per etichetta e per cliente →
  found + cambio settore; apertura drawer al click (al posto dell'aside); azioni invariate
  (booking/cancel/settle già coperte dagli spec esistenti — da adattare al drawer).
- `HoverCard`: wrapper montabile, slot resi (jsdom non fa hover reale: si testa il contratto, la
  resa visiva è verifica browser — stessa regola del responsive).
- **Regola cross-file**: girare sempre l'intera suite `apps/web-staff` + typecheck.
- **Verifica visiva finale** nel browser (scena, hover, drawer, 375/768/1280): richiede login utente.

## 11. Rischi & mitigazioni

- **Grana sabbia su GPU deboli / tablet**: è un solo `background-image` statico, niente animazione →
  costo nullo; le velature animano solo `transform` (composited).
- **3+ fasce sulla Tessera**: colonne strette — accettato (caso raro); il numero resta sopra le
  colonne, leggibile su qualunque split (ink neutro scuro).
- **Hovercard e densità**: `openDelay` 350ms evita flicker passando il mouse sulla griglia.
- **Drawer copre celle**: mitigato dallo scrim leggero (`--color-scrim`) e dalla selezione visibile;
  su `lg+` il drawer è 380px su mappe che scrollano comunque.
