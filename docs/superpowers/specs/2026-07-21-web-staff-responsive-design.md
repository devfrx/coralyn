# Spec — Responsività app-wide `web-staff` (tablet-first, mobile graceful)

> **Data:** 2026-07-21 · **Stato:** proposto (in attesa review utente prima del piano).
> **Skills attive:** dev-discipline · dev-communication · frontend-design · brainstorming.

## 1. Contesto & problema

`web-staff` è oggi **desktop-assumption puro**: una sola occorrenza di classi responsive in tutta la
codebase (`AuthLayout.vue`, `md:flex`). La shell (`AppShell.vue`) monta una `Sidebar` fissa
`w-[248px] flex-none` **sempre visibile e senza toggle**; tutte le viste full-width usano griglie a colonne
fisse (`grid-cols-4`, `grid-cols-3`, `grid-cols-[1.6fr_1fr]`, `grid-cols-[300px_1fr]`) che non collassano;
`DataTable` (ui-kit) ha `overflow-hidden` sul wrapper → una tabella densa (es. pagamenti a 6 colonne)
viene **clippata** su schermo stretto.

Il gestionale gira (o girerà) su **tablet in reception**. Serve responsività reale.

## 2. Obiettivi / non-obiettivi

**Obiettivi**
- Un **sistema responsive coerente**, mobile-first, che degrada correttamente **fino al telefono senza
  rompersi** a nessuna larghezza.
- I punti strutturali risolti **una volta sola** nei posti condivisi (shell, `DataTable`), non rattoppati
  vista-per-vista.
- Nessuna regressione desktop (≥ `lg` il layout resta identico a oggi).
- Zero debito: niente soluzioni che vadano rifatte quando/se il telefono diventa un target di primo piano.

**Non-obiettivi (YAGNI)**
- **No** redesign phone-specific delle tabelle dense in liste-a-card. Le tabelle scrollano orizzontalmente
  (soluzione standard, definitiva). Se in futuro emerge uso reale su telefono, la trasformazione card-list è
  un'estensione pulita, non un debito lasciato aperto.
- **No** nuovi breakpoint custom: si usano i default Tailwind v4.
- **No** refactoring non correlato delle viste.

## 3. Contratto di breakpoint (semantico)

Default Tailwind v4 (verificato: nessun override in `theme.css`): `sm 640 · md 768 · lg 1024 · xl 1280`.
Significato fisso, uguale in tutta l'app:

| Fascia | Larghezza | Device tipico | Shell | Griglie |
|---|---|---|---|---|
| **compatto** | `< lg` (< 1024) | tablet **portrait**, telefono | nav off-canvas (drawer + hamburger) | collassano |
| **esteso** | `≥ lg` (≥ 1024) | tablet **landscape**, desktop | sidebar piena (come oggi) | multi-colonna |

**Perché `lg` come soglia della shell:** iPad landscape (≥ 1133px) è il mounting tipico in reception → tiene
la sidebar; iPad portrait (744–834px) con la sidebar da 248px lascerebbe il contenuto troppo stretto → drawer.

## 4. Strato 1 — Shell / nav (la fondazione)

**Decisione (a): off-canvas drawer sotto `lg`, non icon-rail.** Recupera tutta la larghezza dove serve
(portrait/telefono); sul caso reception più comune (landscape) la sidebar piena resta comunque, quindi il
vantaggio del rail (nav sempre visibile) è già garantito senza il suo costo di manutenzione.

**Architettura (evita duplicazione della nav):**
- **`SidebarNav.vue`** (nuovo, `web-staff/src/app/`): estrae il *contenuto* della sidebar attuale
  (logo, switcher stabilimento, `nav[]`, footer utente/logout). Renderizzato in **un posto solo**, usato sia
  dall'`aside` statico che dal drawer. Nessuna logica nuova, solo estrazione.
- **`Sidebar.vue`**: diventa il guscio `aside` desktop → `hidden lg:flex`, monta `<SidebarNav />`.
- **`NavDrawer.vue`** (nuovo, **ui-kit**): primitivo lean off-canvas **sinistro** su reka-ui `Dialog`
  (stessa famiglia di primitive già incapsulate da `Modal`/`Drawer`/`ConfirmDialog`). Senza il chrome
  "titolo + X" del `Drawer` di dettaglio; slot-based; `open` via `defineModel`.
  - **Perché non riusare `Drawer`:** `Drawer` è ancorato a **destra**, `w-[380px]`, colore `surface`, con
    header titolo+chiudi — è un pannello di dettaglio. La nav è **sinistra**, scura (`sidebar-bg`), senza
    chrome. Forzarla nel `Drawer` significherebbe stravolgerne l'API per un solo uso (over-generalizzazione,
    con rischio sui consumatori esistenti). Due primitivi piccoli e focalizzati > uno pieno di flag.
  - **Perché in ui-kit e non nella shell:** la convenzione del repo è **reka-ui solo dietro ui-kit**
    (web-staff non dipende da reka-ui). Tenerlo in ui-kit dà focus-trap/Esc/`aria-modal` gratis senza
    introdurre reka-ui come dipendenza di web-staff. È anche genuinamente riusabile (la PWA `web-customer`
    è mobile-first).
- **`Topbar.vue`**: aggiunge un bottone **hamburger** a sinistra, visibile solo `< lg` (`lg:hidden`), che apre
  il `NavDrawer`.
- **`AppShell.vue`**: possiede lo stato `navOpen` (ref) passato a hamburger + `NavDrawer`. Il drawer si chiude
  su navigazione (route change) e — per non restare "aperto" fantasma quando si supera `lg` — su cambio
  breakpoint.
- **`useMediaQuery.ts`** (nuovo, `web-staff/src/lib/`, **solo se necessario**): piccolo composable
  `matchMedia('(min-width: 1024px)')` che AppShell osserva per forzare `navOpen = false` al passaggio ≥ `lg`.
  Aggiunto solo se il collasso CSS-only non basta a evitare l'overlay fantasma. Non-duplicato, riusabile.

**Comportamento nuovo interattivo → testato** (vedi §8).

## 5. Strato 2 — Griglie contenuto (scala di collasso coerente)

Una **sola scala**, applicata inline (convenzione repo: layout inline nelle viste, niente primitivo di layout
nuovo). Regole:

| Pattern attuale | Diventa |
|---|---|
| KPI/stat `grid-cols-4` | `grid-cols-2 lg:grid-cols-4` |
| `grid-cols-3` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| `grid-cols-2` (form/anagrafica) | `grid-cols-1 sm:grid-cols-2` |
| main/side `grid-cols-[1.6fr_1fr]` | `grid-cols-1 lg:grid-cols-[1.6fr_1fr]` |
| master/detail `grid-cols-[300px_1fr]` | `grid-cols-1 lg:grid-cols-[300px_1fr]` |
| `max-w-[940px]` / `max-w-[1040px]` | invariati (già larghezza-limitata); si verifica solo che il `px` regga fino a mobile |

**Inventario file toccati (dallo scan, esatto in fase di piano):**
`ReportView.vue` (:32, :39) · `PricingView.vue` (:426, :448, :465, :494) ·
`EstablishmentStructureView.vue` (:206, :213, :329, :353) · `EstablishmentView.vue` (:131, :149) ·
`RentalCatalogView.vue` (:204, :235) · `CustomerDetailView.vue` (:158, :166) · `CustomerPaymentsCard.vue` (:37).

## 6. Strato 3 — Tabelle (risolte una volta, nel componente condiviso)

**`DataTable.vue` (ui-kit):** oggi `overflow-hidden` sul wrapper → clippa. Fix nel componente: mantenere il
radius sul contenitore esterno ma introdurre una **regione interna `overflow-x-auto`**, così **ogni** tabella
dell'app scrolla in orizzontale quando non entra, a qualsiasi larghezza.
- ⚠️ **Modifica a componente condiviso ui-kit** → impatta tutti i consumatori. Additiva e a basso rischio
  (aggiunge scroll, non cambia markup delle celle). Segnalata esplicitamente; suite ui-kit + web-staff girate
  dopo la modifica.

## 7. Casi speciali (fase 3)

- **`MapView.vue`** (mappa ombrelloni): la griglia celle interattive è un caso a sé → scroll orizzontale del
  piano-settore, **non** forzata nella scala generica. Trattamento dedicato nella sua fase.
- **`Topbar` date-nav**, **modali** (`Modal`/`ModalFooter`), **form** (`Field`/`Input`/`Select`): pass di
  rifinitura a larghezza stretta (wrapping, padding, larghezze fisse residue).

## 8. Fasi (ognuna shippabile e testabile da sola)

1. **Fondazione** — `SidebarNav` estratto, `NavDrawer` (ui-kit), `Sidebar`→`hidden lg:flex`, hamburger in
   `Topbar`, stato in `AppShell` (+ `useMediaQuery` se serve); fix scroll `DataTable`.
2. **Griglie** — scala di collasso §5 su tutte le viste dell'inventario.
3. **Rifinitura** — `MapView`, `Topbar`, modali/form a larghezza stretta.

## 9. Verifica

- Le classi responsive **non** sono testabili in jsdom (niente layout reale) → i test unit coprono il
  **comportamento nuovo**: toggle del `NavDrawer` (apre/chiude, chiusura su navigazione), `SidebarNav`
  renderizzato in entrambi i contesti, `NavDrawer` (ui-kit) apre/chiude/`Esc`.
- Correttezza visiva ai breakpoint: verificata nella Browser pane ridimensionando (mobile/tablet/desktop +
  dark). La prova con login utente resta in carico all'utente.
- **Regola cross-file / time-bomb:** dopo ogni fase si gira **l'intera suite** `web-staff` (`vitest run`) +
  la suite `ui-kit` per le modifiche condivise, mai solo lo spec del componente toccato.

## 10. Rischi & mitigazioni

- **Componenti condivisi (`DataTable`, nuovo `NavDrawer` in ui-kit):** modifica/aggiunta con impatto
  cross-app → giro suite ui-kit + web-staff; `NavDrawer` è additivo (nessun consumatore esistente).
- **`grid-cols-[…fr]` con tabelle dense:** il collasso a colonna singola sotto `lg` + lo scroll `DataTable`
  eliminano l'overflow-grid (già mitigato oggi da `min-w-0` in `CustomerDetailView`; da preservare).
- **Overlay fantasma al resize ≥ lg:** gestito da §4 (chiusura su cambio breakpoint).

## 11. Fuori scope / deferred (non in questo lavoro)

- Trasformazione card-list delle tabelle su telefono (solo se emerge uso reale).
- Sync mockup `docs/design/mockups/Coralyn.dc.html` (item differito separato dall'handoff 2026-07-21).
- Audit time-bomb date hardcoded (item differito separato).
