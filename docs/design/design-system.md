# Design system del frontend — token e linguaggio dei componenti

> **Fonte di verità visiva** del frontend Coralyn (app staff). Questo documento porta il
> linguaggio visivo deciso negli ADR a livello di **specifica d'implementazione** per
> `packages/ui-kit`: i valori esatti dei **token** e le regole dei **componenti**. È il
> *cosa* corrente (come i diagrammi); il *perché* sta negli ADR
> ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
>
> **Status:** aggiornato al redesign **Coralyn** (2026-06-30) — valori reali da `theme.css`.
> Lingua visiva "Mediterraneo Caldo": brand corallo-terracotta `#E0795A`, superfici avorio
> calde, sidebar teal profondo `#0F3C49`, accento teal `#2F7281`. Le scelte strutturali
> (ADR-0017–0020) sono **confermate**; palette e tipografia sono riviste dall'
> [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md) (**supera ADR-0018
> solo per palette e tipografia — le icone Iconify/Lucide rimangono invariate**).
>
> **Ancoraggio:** [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) (token-first,
> headless, ui-kit) · [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)
> (Coralyn — palette, tipografia) · [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)
> *superato da ADR-0027 solo per palette/tipografia (icone invariate)* · [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)
> (app-shell, responsive, PWA) · [ADR-0020](../architecture/decisions/0020-resa-mappa.md)
> (resa mappa, cella a 4 assi, a11y) · [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)
> (etichetta reale, Tipologia, Speciali) · [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
> (fasce/slot) · [ADR-0003](../architecture/decisions/0003-language-convention.md) (lingua:
> nomi token in EN, dominio/UI in IT).

## 1. Principi

1. **Token-first, zero valori magici.** Ogni colore/misura nei componenti è una CSS variable.
   Nessun hex/px letterale nel codice dei componenti ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)).
2. **Due livelli di token.** *Primitive* (la palette grezza, neutra rispetto all'uso) →
   *semantic* (il ruolo: `--color-surface`, `--state-libero`, …). I componenti consumano
   **solo** i semantic. Cambiare un valore = un punto solo; ritematizzare = rimappare i semantic.
3. **Accessibilità non opzionale.** Contrasti testo **WCAG AA**; il colore non è **mai** l'unico
   veicolo (etichette testuali + `aria-label`); focus sempre visibile; target tocco ≥ 44px su
   tablet ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)/[0019](../architecture/decisions/0019-app-shell-e-ux.md)/[0020](../architecture/decisions/0020-resa-mappa.md)).
4. **Motion funzionale e sobrio.** Le animazioni spiegano una transizione (apertura drawer,
   selezione), non decorano. Sempre dietro `prefers-reduced-motion`.
5. **Coerenza calda.** Neutri avorio caldi, ombre tinte di teal-navy (non nero puro): identità "Mediterraneo Caldo" — calore balneare senza perdere la serietà del gestionale.

## 2. Token — Colore (primitive)

Palette grezza. **Non usare direttamente nei componenti**: passare sempre dai semantic (§3).

> Aggiornato al redesign **Coralyn** ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)):
> brand corallo-terracotta `#E0795A`, sidebar teal profondo `#0F3C49`, accento teal `#2F7281`,
> neutri caldi, Inter/700. Valori 1:1 da `packages/ui-kit/src/styles/theme.css`.

```css
/* ===== PRIMITIVE — Brand corallo ===== */
--color-coral-500: #E0795A; /* brand primario */
--color-coral-600: #C9603F; /* hover/pressed */
--color-coral-700: #B65A38; /* ink su tint */
--color-coral-100: #FBE8DF; /* tint selezione/focus */
--color-coral-050: #FBF1EF;

/* ===== PRIMITIVE — Teal profondo (sidebar/auth) ===== */
--color-teal-900: #0B3543;
--color-teal-800: #0F3C49; /* sidebar bg */
--color-teal-700: #16505E; /* sidebar raised (nav item attivo) */
--color-teal-650: #1A5666;
--color-teal-600: #23606E; /* sidebar border */
--color-teal-divider: #1C4E5B;

/* ===== PRIMITIVE — Teal accento (su chiaro) ===== */
--color-accent-500: #2F7281;
--color-accent-100: #E6EFEC; /* tint accento */
--color-accent-150: #E2EDEE;

/* ===== PRIMITIVE — Testo su teal ===== */
--color-on-teal: #CFE0DF;
--color-on-teal-strong: #F6EEE1;
--color-on-teal-muted: #6E9197;
--color-on-teal-eyebrow: #577A80;
--color-on-teal-2nd: #9FBCC0;
--color-on-teal-check: #9FD0CB;

/* ===== PRIMITIVE — Neutri caldi ===== */
--color-warm-000: #FFFFFF;
--color-warm-025: #FCFAF5;
--color-warm-050: #FBF6EE; /* raised */
--color-warm-075: #FBF4E6;
--color-warm-100: #F4ECE0; /* bg area contenuto */
--color-warm-150: #F6EAD3;
--color-warm-200: #ECE3D5; /* canvas */
--color-warm-250: #EDE3D4;
/* bordi */
--color-warm-border: #E7DCCB;
--color-warm-border-input: #E0D5C3;
--color-warm-border-row: #F1EADC;
--color-warm-border-stage: #ECDFC8;
--color-warm-border-seg: #E2D6C3;
/* ink */
--color-ink-900: #22303A; /* testo principale / titoli */
--color-ink-canvas: #2B2722;
--color-ink-700: #5E5648; /* testo secondario */
--color-ink-600: #8A7E6B;
--color-ink-500: #978C7B; /* testo muto */
--color-ink-400: #B3A998; /* placeholder */

/* ===== PRIMITIVE — Stati mappa ===== */
--color-state-libero: #8FBF9E;        --color-state-libero-ink: #1E3A16;
--color-state-abbonato: #5E9AA6;      --color-state-abbonato-ink: #102945;
--color-state-giornaliero: #E89270;   --color-state-giornaliero-ink: #3A1E08;
--color-state-prenotato: #F1C879;     --color-state-prenotato-ink: #4A3711;
--color-state-normale-mark: #D8CDBB;

/* ===== PRIMITIVE — Mare (gradiente) ===== */
--color-sea-1: #E0EFF3; --color-sea-2: #BEDDE8; --color-sea-3: #A8D0DE;
--color-sea-deep: #8FC2D4; /* cima del mare nella scena «Riva», §13.8 */
--color-sea-veil: rgba(255,255,255,.16); --color-sea-veil-strong: rgba(255,255,255,.22); /* velature in drift, §13.8 */
--color-sea-ink: #2E6B81;

/* ===== PRIMITIVE — Feedback (bg/ink) ===== */
--color-success: #3F9D5B;   --color-success-bg: #E7F1E9;   --color-success-ink: #3E7A53;
--color-warning: #E8A93C;   --color-warning-bg: #FBF1DA;   --color-warning-ink: #9A7322;
--color-danger:  #C8503E;   --color-danger-bg:  #FBE3E0;   --color-danger-ink:  #A33A2C;
--color-danger-border: #EBB7AF;
--color-info: #4F86E0;
/* "In arrivo" */
--color-soon-bg: #F1E8D8;   --color-soon-ink: #B7A98F;
```

> I valori di stato mappa (Libero `#8FBF9E`, Abbonato `#5E9AA6`, Giornaliero `#E89270`,
> Prenotato `#F1C879`) sono stati aggiornati nel redesign Coralyn ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md),
> [nota ADR-0020](../architecture/decisions/0020-resa-mappa.md)). Gli ink scuri per-stato sono
> invariati. Tutti i valori sono 1:1 da `theme.css`.

## 3. Token — Colore (semantic)

Ruoli consumati dai componenti. Ogni colore "di sfondo" ha il suo `-ink` (testo sopra) verificato AA.

```css
/* Superfici */
--color-canvas:        var(--color-warm-200);   /* #ECE3D5 — tela dietro i contenuti */
--color-bg:            var(--color-warm-100);   /* #F4ECE0 — sfondo area contenuto */
--color-surface:       var(--color-warm-000);   /* #FFFFFF — card, drawer, popover */
--color-raised:        var(--color-warm-050);   /* #FBF6EE — superfici leggermente rialzate */
--color-border:        var(--color-warm-border);       /* #E7DCCB */
--color-border-input:  var(--color-warm-border-input); /* #E0D5C3 */
--color-border-row:    var(--color-warm-border-row);   /* #F1EADC — divisori tabella */

/* Testo */
--color-text:          var(--color-ink-900);    /* #22303A */
--color-text-2nd:      var(--color-ink-700);    /* #5E5648 */
--color-text-muted:    var(--color-ink-500);    /* #978C7B */
--color-placeholder:   var(--color-ink-400);    /* #B3A998 */

/* Brand corallo */
--color-brand:         var(--color-coral-500);  /* #E0795A */
--color-brand-hover:   var(--color-coral-600);  /* #C9603F */
--color-brand-ink:     var(--color-coral-700);  /* #B65A38 */
--color-brand-tint:    var(--color-coral-100);  /* #FBE8DF — selezione/focus su chiaro */

/* Accento teal (su chiaro) */
--color-accent:        var(--color-accent-500); /* #2F7281 */
--color-accent-tint:   var(--color-accent-100); /* #E6EFEC */

/* Sidebar teal profondo */
--color-sidebar-bg:      var(--color-teal-800);   /* #0F3C49 */
--color-sidebar-raised:  var(--color-teal-700);   /* #16505E — item nav attivo */
--color-sidebar-border:  var(--color-teal-600);   /* #23606E */
--color-sidebar-divider: var(--color-teal-divider); /* #1C4E5B */
--color-on-sidebar:        var(--color-on-teal);        /* #CFE0DF */
--color-on-sidebar-strong: var(--color-on-teal-strong); /* #F6EEE1 */
--color-on-sidebar-muted:  var(--color-on-teal-muted);  /* #6E9197 */

/* Scrim overlay (teal-900) — leggero per i drawer laterali, forte per i dialog bloccanti */
--color-scrim:        color-mix(in srgb, var(--color-teal-900) 30%, transparent); /* NavDrawer/Drawer */
--color-scrim-strong: color-mix(in srgb, var(--color-teal-900) 46%, transparent); /* Modal/ConfirmDialog */

/* Skeleton di caricamento */
--color-skeleton:        var(--color-warm-150); /* base skeleton di caricamento */
--color-skeleton-sheen:  var(--color-warm-050); /* sheen dello shimmer (sweep 1.6s, statico con reduced-motion) */

/* Feedback */
--color-success: #3F9D5B; --color-success-bg: #E7F1E9; --color-success-ink: #3E7A53;
--color-warning: #E8A93C; --color-warning-bg: #FBF1DA; --color-warning-ink: #9A7322;
--color-danger:  #C8503E; --color-danger-bg:  #FBE3E0; --color-danger-ink:  #A33A2C;
--color-info: #4F86E0;

/* Focus (ring corallo) */
--ring-focus: 0 0 0 3px rgba(224,121,90,.16); /* in :root, fuori @theme */

/* Stati mappa */
--color-state-libero:          var(--color-state-libero);        /* #8FBF9E */
--color-state-libero-ink:      var(--color-state-libero-ink);    /* #1E3A16 */
--color-state-abbonato:        var(--color-state-abbonato);      /* #5E9AA6 */
--color-state-abbonato-ink:    var(--color-state-abbonato-ink);  /* #102945 */
--color-state-giornaliero:     var(--color-state-giornaliero);   /* #E89270 */
--color-state-giornaliero-ink: var(--color-state-giornaliero-ink); /* #3A1E08 */
--color-state-prenotato:       var(--color-state-prenotato);     /* #F1C879 */
--color-state-prenotato-ink:   var(--color-state-prenotato-ink); /* #4A3711 */
--color-state-normale-mark:    var(--color-state-normale-mark);  /* #D8CDBB */

/* Cella mappa — Tessera (divisore colonne-fascia + riflesso "luce dall'alto", §13.2) */
--color-cell-divider: rgba(255,255,255,.55);
--color-cell-glare:   rgba(255,255,255,.35);
```

### 3.1 Contrasto verificato (etichetta su stato — testo piccolo, soglia AA 4.5)

| Stato | Riempimento | Ink etichetta | Contrasto* |
|---|---|---|---|
| Libero | `#8FBF9E` | `#1E3A16` | ~6.2 ✓ |
| Abbonato | `#5E9AA6` | `#102945` | ~5.1 ✓ |
| Giornaliero | `#E89270` | `#3A1E08` | ~5.4 ✓ |
| Prenotato | `#F1C879` | `#4A3711` | ~8.1 ✓ |

\* Stima sui valori sRGB; da verificare in CI con un check di contrasto sui token (vedi §15).
L'etichetta usa **sempre ink scuro** su tutti gli stati: leggibilità e coerenza, niente testo
bianco a basso contrasto.

## 4. Token — Tipografia

Font **Inter** (UI). Aggiornato al redesign Coralyn ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)):
Inter è confermata come font della UI — leggibilità eccellente in densità, cifre tabulari native,
pieno supporto al peso **700** usato per i titoli con tracking negativo.
Bundled offline in `packages/ui-kit` via `@fontsource/inter` (subset latin, pesi 400/500/600/700 ≈ 36 KB gzip).

```css
--font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
/* applicato a prezzi/date/quantità/etichette cella: font-variant-numeric: tabular-nums */

--text-xs:   12px;  --lh-xs:   16px; /* denso, micro-label, tabelle fitte */
--text-sm:   13px;  --lh-sm:   18px; /* tabelle, meta */
--text-base: 14px;  --lh-base: 20px; /* corpo */
--text-md:   16px;  --lh-md:   24px; /* sezione */
--text-lg:   18px;  --lh-lg:   26px; /* sezione enfatica */
--text-xl:   22px;  --lh-xl:   28px; /* titolo */
--text-2xl:  26px;  --lh-2xl:  32px; /* titolo grande */

--fw-regular: 400;
--fw-medium:  500;
--fw-semibold:600;
--fw-bold:    700; /* headings — con letter-spacing negativo (es. -0.02em su --text-xl/2xl) */

--tracking-caps: 0.05em; /* micro-label maiuscole (legende, eyebrow, header tabella) — utility `tracking-caps`.
                            I caps "display" più larghi (brand sidebar, eyebrow stage mappa, ≥.08em) sono valori propri deliberati. */
```

Regole: prezzi, date, quantità, **etichette ombrellone** → `font-variant-numeric: tabular-nums`.
Pesi ammessi: 400/500/600/**700**. I titoli di sezione usano `--text-xl`/**700** con
`letter-spacing: -0.02em`; i titoli di pagina usano `--text-2xl`/700. Questo è un cambio
rispetto al vecchio ADR (che limitava a 600): il peso 700 con tracking negativo dà gerarchia
chiara senza appesantire il testo corpo.

## 5. Token — Spaziatura

Base **4px** ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)). Usare solo gli step.

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

## 6. Token — Raggi

```css
--radius-sm:   9px;   /* input, chip, badge */
--radius-md:   11px;  /* bottoni, nav item */
--radius-lg:   16px;  /* card, drawer */
--radius-xl:   18px;  /* modal, canvas shell */
--radius-full: 999px; /* pill, avatar */
```

## 7. Token — Elevazione (ombre)

Ombre **soft, tinte di teal navy** (rgb 15,60,73), elevazione contenuta; brand shadow corallo.

```css
--shadow-card:   0 1px 3px rgba(15,60,73,.05);    /* card, superfici leggere */
--shadow-soft:   0 1px 2px rgba(15,60,73,.08);    /* chip, cella */
--shadow-drawer: 0 12px 40px rgba(15,60,73,.13);  /* drawer laterale, popover */
--shadow-modal:  0 24px 70px rgba(11,53,67,.34);  /* dialog / modal */
--shadow-brand:  0 2px 8px rgba(224,121,90,.3);   /* bottone primario corallo */
--shadow-sun:    0 5px 9px -3px rgba(138,110,63,.30), 0 1px 2px rgba(138,110,63,.12);
                 /* ombra "da sole" delle celle mappa (tinta stage-1 calda) */
--ring-focus:    0 0 0 3px rgba(224,121,90,.16);  /* :root — anello focus coral glow */
```

## 8. Token — Motion

```css
:root {
  --motion-fast: 140ms;  /* hover, focus */
  --motion-base: 200ms;  /* selezione, fade */
  --motion-slow: 260ms;  /* enter di drawer/sheet */
  --ease-standard:   cubic-bezier(.2, 0, .2, 1);
  --ease-emphasized: cubic-bezier(.2, 0, 0, 1); /* enter espressivi (drawer/sheet) */
}
@media (prefers-reduced-motion: reduce) {
  /* I componenti azzerano transizioni/animazioni non essenziali. */
}
```

Uso: hover cella (translateY -1px + `--shadow-soft`, `--motion-fast`); apertura drawer (slide-in da
destra per il drawer contestuale, da sinistra per il `NavDrawer` in layout compatto,
`--motion-slow`/`--ease-emphasized`); drift velature mare (`map-sea-drift`, 19–33s, transform-only)
e reveal scaglionato per fila (`map-row-in`); impulso ricerca `cell-found`. Tutte neutralizzate da
`prefers-reduced-motion`.

## 9. Token — Layout, z-index, breakpoint

```css
:root {
  --shell-gutter: var(--space-3);     /* spazio tra le card della shell */
  --sidebar-width: 220px;             /* esteso: sidebar piena */
  --drawer-width: 380px;              /* esteso: drawer laterale */
  --topbar-height: 56px;
  --cell-size: 40px;                  /* esteso; la Tessera usa 40/44 */
  --cell-size-touch: 44px;            /* tablet: target tocco ≥44px */

  --z-base: 0;
  --z-sticky: 10;    /* topbar */
  --z-drawer: 40;
  --z-overlay: 50;   /* scrim del drawer/dialog */
  --z-toast: 60;
}
```

Breakpoint ([ADR-0051](../architecture/decisions/0051-responsive-drawer-e-telefono-graceful.md), che emenda [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)/[ADR-0004](../architecture/decisions/0004-form-factor-e-delivery.md)) — due stati, soglia `lg` (default Tailwind, 1024px):

| Nome | Range | App-shell |
|---|---|---|
| **compatto** | < 1024px (`< lg`) | sidebar nascosta → nav in **drawer off-canvas** (`NavDrawer`, hamburger in topbar); pannello mappa **impilato** (bottom-sheet: [D-054](../architecture/deferred.md)); celle a `--cell-size-touch` |
| **esteso** | ≥ 1024px (`≥ lg`) | sidebar **piena**; drawer **laterale** in overlay; celle a `--cell-size` |

> Sotto 768px (telefono) vale lo stesso layout compatto: **target graceful** ([ADR-0051](../architecture/decisions/0051-responsive-drawer-e-telefono-graceful.md)) — deve funzionare senza debiti, ma densità e flussi restano tarati su desktop + tablet.

## 10. Componenti base (linguaggio)

Layer `ui-kit`: **token → primitivi headless (Reka UI) → componenti base → schermate**
([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)). Stati comuni a tutti gli
interattivi: **default / hover / active / focus-visible / disabled**; focus = `--ring-focus` (coral glow).

- **Button** — varianti `primary` (sfondo `--color-brand` corallo, `--shadow-brand`, hover
  `--color-brand-hover`), `secondary` (outline: bordo `--color-border`, bg `--color-raised`,
  testo `--color-accent`), `ghost`, `danger` (`--color-danger`). Raggio `--radius-md`,
  altezza ≥ 36px (≥44px su tablet), icona opzionale a sx.
- **Field / Input** — label (`--text-sm`/600, `--color-text-2nd`), control (`--radius-md`,
  bordo `--color-border-input`, sfondo `--color-surface`; focus = bordo `--color-brand` +
  `--ring-focus`), testo d'aiuto/errore (`--text-xs`, errore in `--color-danger`). Un solo
  pattern per tutti i form.
- **Card** — `--color-surface`, `--radius-lg`/`--radius-xl`, `--shadow-card`, bordo
  `--color-border`. Unità di superficie della shell.
- **Badge / Chip** — pill `--radius-full`, `--text-xs`/600; per la **tipologia** nel drawer:
  sfondo `--color-accent-tint` (`#E6EFEC`), testo `--color-accent` (`#2F7281`), icona a sx.
- **Icon** — wrapper unico su **Iconify bundled/offline + Lucide** (set primario), dietro
  `<Icon>` ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)). **Il sistema
  icone è confermato invariato** dal redesign Coralyn (ADR-0027 supera ADR-0018 solo per
  palette/tipografia, non per le icone). Il registry (`packages/ui-kit/src/icons/registry.ts`)
  è stato esteso con le nuove icone Lucide del canvas (bell, settings, euro, clock, phone,
  mail, refresh-cw, pencil, log-out, building-2, layers, filter, chevron-down, ecc.);
  nessuno sprite custom. `currentColor`, `stroke-width` 1.75, dimensioni 14/16/20/24.
  **Niente icone fuori dal wrapper.**
- **DataTable** — componente `ui-kit` skinnato sui token: header `10.5px` maiuscolo,
  tracking `--tracking-caps` (utility `tracking-caps` — il token è definito nel `@theme` di
  `theme.css`; drift `0.07em` chiuso, vedi §3), `--color-text-muted`, bg header
  `--color-raised`, righe `13px`, divisori
  `--color-border-row`, hover `--color-raised` su ogni riga. Due API, retro-compatibili
  ([ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)): **a slot** (il
  chiamante scrive `<tr>/<td>` a mano nel body — usata dove servono celle molto particolari o
  comportamenti custom) e **data-driven** (prop `rows`/`rowKey`, colonne tipizzate
  `DataTableColumn[]`, slot `#cell-<key>` per celle ricche). L'API a slot resta **congelata**
  (retro-compatibilità, nessuna feature nuova): tutte le viste correnti del monorepo (incluso
  `web-platform`) sono migrate alla data-driven, che è dove vive ogni evoluzione futura. Le
  costanti `TD`/`TD_FIRST`/`TD_RIGHT`/`TD_NUM` (ex `styles/table.ts`, ADR-0033 §3.6) sono state
  **rimosse**: le classi cella vivono solo nel builder interno del componente.
  - **Colonne**: `numeric` → `tabular-nums` + `whitespace-nowrap`, allineato a destra via
    `align: 'right'`; `wrap: 'truncate'` + `maxWidth` per celle lunghe (title nativo col valore
    intero, solo se la colonna non usa uno slot custom); `hideBelow: 'sm' | 'md' | 'lg'` nasconde
    la colonna sotto il breakpoint via classi statiche (`max-sm:hidden` ecc., niente CSS
    generato a runtime); `sortable` + `sortValue` opzionale per un accessor di ordinamento
    diverso dal valore raw della cella.
  - **Ordinamento**: click sull'header cicla asc → desc → nessuno; header sortable resi come
    `<button>` (accessibili da tastiera); `aria-sort` sul `th` riflette lo stato corrente,
    indicatore icona in `--color-accent` quando la colonna è ordinata. Si applica prima della
    paginazione.
  - **Paginazione**: `pageSize` opt-in (client-side) + `v-model:page` — componente
    *controlled-capable*: fallback di stato interno se il chiamante non aggancia il `v-model`,
    stesso componente pronto per un domani paginato lato server senza cambi d'API. Reset a
    pagina 1 al cambio delle righe.
  - **Footer**: conteggio/pager su sfondo `--color-raised`, testo `12.5px` muted, cifre
    `tabular-nums`; visibile con almeno una riga e `pageSize` attivo o `showCount: true`.
  - **Densità**: `density="compact"` (`py-2` invece di `py-3.5`, font invariato) per contesti
    densi (es. tabella pagamenti nel dettaglio cliente).
  - **`emptyMessage`**: con 0 righe rende `EmptyState` dentro la card stessa (solo API
    data-driven).
  - **`loading`**: skeleton in-card (`skeletonRows`, default 5) con gate anti-flicker interno —
    il chiamante passa `isLoading` grezzo. Solo con 0 righe; `emptyMessage` e footer soppressi
    durante lo skeleton; `aria-busy` sul contenitore. Solo API data-driven.
  - **`maxHeight`**: scroll verticale interno alla card + `thead` sticky. Le due prop sono
    vincolate insieme: dentro una card con `overflow-hidden`/`overflow-x-auto`, `position:
    sticky` rispetto allo scroll di pagina non funziona (antenato con overflow) — sticky regge
    solo nello scroll interno che `maxHeight` attiva.
  - **`row-click`/`rowClass`**: cursor a mano solo se il chiamante aggancia l'emit `row-click`
    (l'hover resta su ogni riga a prescindere); `rowClass` aggiunge una classe per riga (es.
    tariffe archiviate `opacity-60`).
  - Spec di riferimento: [spec DataTable QoL](../superpowers/specs/2026-07-21-datatable-qol-design.md).
  Consumatori: `web-staff` (Clienti, Prenotazioni, Noleggi, Listino, Catalogo noleggi, Rinnovi,
  Pagamenti cliente) e `web-platform` (Lidi). Nessuna tabella scritta a mano resta nel monorepo.
- **EmptyState** — blocco vuoto ("Nessun/a…"): `--radius-lg`, bordo tratteggiato
  `--color-border`, testo `--color-text-2nd`. Prop `message`; slot `#default` per contenuto
  ricco (es. icona). Standalone solo dove la condizione **non** è «0 righe di una tabella»
  (guida alla selezione in Rinnovi/Catalogo noleggi, entità di dominio assenti in
  Listino/Catalogo, errore nel dettaglio Lido, abbonamenti in web-customer); per le tabelle
  con 0 righe il pattern è `emptyMessage` del DataTable (EmptyState in-card, vedi sopra).
- **Select** — componente **composto su reka-ui** (dietro ui-kit, come `Modal`/`Popover`):
  trigger stilato gemello di `Input.vue` (stesso raggio/bordo/focus) con **chevron staccata dal
  bordo**, e menu **popper** portalato a larghezza del trigger con option stilate e indicatore
  `check` sull'opzione attiva. Si usa dentro `Field`. `v-model` (stringa) + `props.options` **o**
  slot `#default` col componente dedicato **`Option`** (`value` + label via slot, `disabled`
  opzionale). Attributi (`data-test*`, `class`, `disabled`) inoltrati al trigger. Una `Option` con
  `value=""` resta selezionabile come stato reale («Scegli…», «Tutte»): reka-ui vieta l'item a
  stringa vuota, quindi ui-kit mappa `''` a una **sentinella interna** trasparente ai consumatori.
  Nei test l'interazione passa dall'helper `selectOption(trigger, label)` (il menu vive in
  `document.body` solo da aperto). Nota di contratto rispetto al `<select>` nativo: un `v-model`
  che non corrisponde ad alcuna `Option` mostra un trigger **vuoto** (non la prima opzione, come
  faceva il nativo) — quindi inizializza sempre il modello a `''` o a un valore valido.
- **Skeleton / SkeletonText** — placeholder di caricamento: `variant: line | block | circle`
  (default `line`), `width`/`height` (default per variante: line `100%`×`0.75em`, block
  `100%`×`64px`, circle `32px`×`32px`); shimmer `skeleton-sheen` sui token
  `--color-skeleton`/`--color-skeleton-sheen` (sweep 1.6s, statico con reduced-motion); sempre
  `aria-hidden` (lo stato lo annuncia il contenitore con `aria-busy`). `SkeletonText :lines`
  (default 3) = righe a larghezze deterministiche per indice (mai random), ultima al 60%.
  Anti-flicker centralizzato in `useDelayedLoading(source, { delay: 150, minVisible: 300 })`:
  visibile solo oltre 150ms di attesa, poi per almeno 300ms. Regola: lo skeleton non sostituisce
  MAI dati reali (refetch con dati stantii = silenzioso) — nelle viste dettaglio il ramo
  contenuto dopo lo skeleton è sempre `v-else-if="<dato>"`, mai un `v-else` nudo (il dato assente
  ha comunque un ramo esplicito, es. errore/not-found). Spec:
  [loading-states](../superpowers/specs/2026-07-21-loading-states-design.md).
- **StatTile** — tessera metrica (`--color-raised`, valore `text-2xl font-bold tabular-nums`,
  label `--color-text-muted`); `layout: value-first` (default) o `label-first`, `tone: default |
  accent` (accent → `--color-brand-ink`). Prop `value` ora **opzionale** (default `''`): con
  `loading` true lo skeleton (56×20px) sostituisce solo il valore, la label resta reale e
  visibile — un chiamante può montare la tessera col solo `label` in attesa del dato. Gate
  anti-flicker interno (`useDelayedLoading`, come Skeleton/DataTable sopra); `aria-busy` sul
  contenitore.
- **ModalFooter** — coppia bottoni Annulla (secondary) / Conferma (`submitVariant`, default
  primary) in fondo ai modali. Prop `submitLabel` (obbligatoria), `cancelLabel`/
  `submitDisabled`/`submitVariant`/`submitLoading` opzionali, slot `#extra`; emit
  `cancel`/`submit`. `submitLoading` mostra lo spinner sul bottone di conferma **e** lo
  disabilita insieme a `submitDisabled` (`:disabled="submitDisabled || submitLoading"` —
  necessario per il fallthrough attributi di Vue). La classe `pt-1` di default è sovrascrivibile
  dal chiamante (`class="pt-2"`) dove serve.
- **PageToolbar** — header di lista: slot `#left` + spacer `flex-1` + slot `#right`/`#actions`.
  Wrapper `mb-4 flex flex-wrap items-center gap-3`. Per Prenotazioni/Clienti (non adottato dove
  il contenitore ha classi di padding incompatibili, es. Mappa).
- **Drawer** — su primitivo dialog/drawer Reka UI: focus trap, ESC, ARIA. `--color-surface`,
  `--radius-lg`, `--shadow-drawer`; scrim `--z-overlay`. Vedi §13.7.
- **SegmentedControl** — `role="radiogroup"` di bottoni `radio`; opzione attiva su
  `--color-surface`/`--shadow-soft`, le altre in `--color-ink-600`. Estensione additiva
  `options[].hint?`: testo secondario `tabular-nums` accanto alla label (es. la percentuale di
  occupazione nei tab settore della mappa, §13.8), in `--color-accent` se l'opzione è attiva,
  `--color-stage-2` altrimenti. Usato per i tab settore della mappa e per la fascia nel modale
  di prenotazione.
- **HoverCard** — wrapper del primitivo `HoverCard` di Reka UI (trigger/content a slot,
  `openDelay` ~350ms, `closeDelay` breve, side `top` con freccetta, superficie `--color-surface`
  + `--shadow-drawer`-like). **Solo consultazione**: nessuna azione al suo interno; il gating
  hover-capable resta nel chiamante (prop `disabled`), il primitivo è agnostico. Uso: hovercard
  delle celle mappa, §13.9.
- **Popover** — wrapper del primitivo `Popover` di Reka UI (trigger/content a slot, **click**
  invece di hover — funziona anche su touch; `side`/`align` configurabili, freccetta, stessa
  superficie della HoverCard; Esc/click-fuori chiudono dal primitivo). Uso: pillola «Legenda»
  della mappa, §13.6.

### 10.1 Stato degli interattivi

Regole valide per **ogni** componente interattivo del `ui-kit` (sweep di coerenza,
verificate su `Button`/`IconButton`/`Input`/`Textarea`/`Select`/`SearchInput`/
`SegmentedControl`/`PageToolbar`/`DataTable`):

- **Focus visibile**: ogni elemento interattivo mostra l'anello `var(--ring-focus)` — input/select/
  textarea su `focus:`, bottoni e controlli non testuali su `focus-visible:`. Mai `focus:outline-none`
  senza un sostituto: rimuovere l'outline nativo senza ridisegnare il focus è una regressione a11y.
- **Hover**: le superfici che cambiano su hover usano i token (`--color-raised`,
  `--color-accent-tint`, …), mai colori hardcoded.
- **Disabled**: `opacity-50 cursor-not-allowed`.
- **Transizioni**: `--ease-standard` / `--motion-fast`.
- **Riferimenti canonici**: `Button`, `IconButton`, `Input`.

### Rubrica CTA contestuale (size-by-context)

La CTA eredita la densità del suo contenitore.

| Contesto | Trattamento |
|---|---|
| CTA primaria di pagina (header vista) | `Button` size `md` (default) |
| Azione in header di card/sezione | `Button` size `sm` |
| Azione inline in riga/lista/toolbar/drawer | `Button` size `sm` |
| Solo icona (edit/elimina/espandi/chiudi/rimuovi) | `IconButton` (mai `Button` con solo `<Icon>`); variante `ghost`/`subtle`/`danger` |
| Async | `:loading` col pending osservabile |
| Distruttiva | `danger` |

I cluster di 2+ azioni si compongono con `<ActionBar>` (layout centralizzato: `align`/`gap`/`wrap`), non con `flex gap` a mano. I controlli bespoke non-CTA (nav, frecce, chip, celle mappa, toggle disclosure, valori cliccabili) restano tali: si verificano solo gli stati.

## 11. App-shell ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md))

Layout **a card su tela neutra** (`--color-canvas`), gutter `--shell-gutter`.

- **Topbar** (`card`, `--color-brand`, `--z-sticky`): **brand = nome stabilimento** (es. "Lido
  Sole", icona ombrellone) — il wordmark "Coralyn" resta **discreto** (login/about), perché è un
  codename ([D-017](../architecture/deferred.md)) e lo staff si identifica col proprio lido ·
  **navigatore data** (pill `‹ Sab 27 giu 2026 ›`, `tabular-nums`) · **ricerca cliente** (campo
  chiaro) · **avatar** utente.
- **Sidebar** (`--color-sidebar-bg` = teal `#0F3C49`, `--sidebar-width`): logo Coralyn +
  wordmark; switcher stabilimento; eyebrow "OPERATIVO"; voci **Mappa**, **Prenotazioni**,
  **Clienti**, **Listino**, **Report**; voce **attiva** = `--color-sidebar-raised` (teal
  rialzato `#16505E`) + **dot corallo** (`--color-brand`) — non riempimento corallo pieno;
  hover = velo teal leggermente più chiaro. In fondo, separata da divisore, la **Console
  superuser** e il **footer utente** (avatar iniziali, email, ruolo, "Esci") — Console
  visibile **solo** al ruolo `superuser`
  ([ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)).
- **Area contenuto** (`card`, `--color-surface`/`--color-bg`): ospita la sezione attiva; il
  **drawer** appare **in overlay** qui, non come colonna fissa.
- **Responsive** ([ADR-0051](../architecture/decisions/0051-responsive-drawer-e-telefono-graceful.md)):
  esteso (`≥ lg`) = sidebar piena + drawer laterale; compatto (`< lg`) = sidebar nascosta, nav in
  **drawer off-canvas** (`NavDrawer` ui-kit) aperto dall'hamburger in topbar e chiuso su cambio
  route o al ritorno `≥ lg`; pannello mappa **impilato**. Vedi §9.
- **PWA** ([ADR-0004](../architecture/decisions/0004-form-factor-e-delivery.md)): installabile,
  **shell in cache** (offline-light); sync dati rimandato ([D-008](../architecture/deferred.md)).

## 12. Sezioni (inventario UI)

Mappa (home) · Prenotazioni · Clienti · Listino · Report · Console superuser (gated) · Setup
struttura (admin). Dettaglio e riferimenti nella
[spec UI/UX §7](../specs/2026-06-28-frontend-ui-ux-design.md).

## 13. La Mappa ([ADR-0020](../architecture/decisions/0020-resa-mappa.md))

Resa **HTML/CSS** (non SVG). Griglia **Settore → Fila → Ombrellone**, layout di default
"**file impilate verso il mare**" ([ADR-0005](../architecture/decisions/0005-modello-mappa.md)/[ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
In testa la scena **«Riva»** (mare a velature + bagnasciuga + sabbia, §13.8); gli **Speciali** in
un settore dedicato in coda, stessa scena.

### 13.1 `UmbrellaCell` — la Tessera, anatomia a 4 assi

| Asse | Resa | Sorgente dato |
|---|---|---|
| **Etichetta** | numero/identificativo fisico, centrato, `tabular-nums`, ink per-stato | `Ombrellone.etichetta` (stringa libera; buchi e "20bis" ammessi, [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)) |
| **Stato** | colore di riempimento; **split in colonne verticali** se diverso per fascia (§13.2) | derivato per (ombrellone, data, fascia) — [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) |
| **Tipologia** | **marcatore a icona** d'angolo (top-right); Normale (`NULL`) = nessun marcatore | `Tipologia.icona` = **chiave del registry icone** del `ui-kit` (nome breve, es. `palmtree`); fallback FE finché il backend non espone `icona` ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)) |
| **Selezione** | **anello brand** (corallo `--color-brand`) + alone tint `--color-brand-tint` | stato UI effimero (cella aperta nel drawer) |

Forma: **Tessera** — quadrato arrotondato (`border-radius: 12px`), `--cell-size` (**40px**,
esteso) / `--cell-size-touch` (**44px**, compatto/touch — coincide con la soglia `lg` del
breakpoint, §9), `--shadow-sun` (ombra "da sole" portata in basso) + riflesso `--color-cell-glare`
(velo chiaro sul 35% superiore). Hover: lift −2px (`translateY`, solo `transform`); active: `scale(.97)`. È un **`<button>`** (vedi §13.5). Sostituisce il
precedente cerchio a spicchi conici ([spec rework Riva](../superpowers/specs/2026-07-21-map-redesign-riva-design.md)
§4) — i 4 assi restano quelli di ADR-0020 invariati (nessun emendamento: la forma è dettaglio del
living doc, non dell'ADR).

**Resa «rest»** (estensione additiva, [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md)):
`slotStates` è **opzionale** — omesso o `null` → riempimento neutro **`--color-warm-025`**, ink
**`--color-ink-700`**, **nessuno stato** (niente split per fascia, niente colore semantico). Usata
**solo** dall'editor Struttura — il Cantiere (§14), dove non esistono prenotazioni/fasce da
rappresentare; la Mappa (§13.2) continua a passare sempre `slotStates` esplicito. Se `slotStates` è
un array vuoto (`[]`), la resa ricade su `'free'` (non su «rest»): «rest» è distinto da «assenza di
prenotazioni», è l'assenza stessa del concetto di stato. Anello di selezione, marcatore tipologia e
focus (§13.3–§13.5) sono invariati sulla resa «rest» — cambiano solo riempimento e ink.

### 13.2 Stato — colore e split per fascia (colonne verticali)

- **Pieno** (stesso stato tutto il giorno): riempimento = `--state-*`, etichetta = `--state-*-ink`.
- **Split** (fasce diverse, [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
  **colonne verticali** in ordine `sortOrder` (prima fascia, es. Mattina, a **sinistra** —
  mappa mentale del giorno), N-agnostico (N fasce → N colonne di larghezza uguale; con 3+ fasce
  le colonne si stringono, caso raro accettato), divisore hairline **`--color-cell-divider`**
  (`rgba(255,255,255,.55)`) tra le colonne. **Niente più conic-gradient** sulla cella: sostituisce
  lo split a spicchi circolari del cerchio precedente.
- L'etichetta resta centrata sopra le colonne: l'ink scuro neutro (`--color-text` sullo split,
  `--state-*-ink` sul pieno) resta leggibile su qualunque combinazione (tutti gli stati hanno ink
  scuro, §3.1).
- Contrasto AA dell'etichetta: vedi tabella §3.1.

### 13.3 Marcatore tipologia

Cerchietto `--color-surface` con `--shadow-soft`, icona `--color-accent` (`#2F7281`),
posizionato top-right e **sopra** l'eventuale anello di selezione/focus (e sopra il riflesso
`--color-cell-glare` della Tessera). Data-driven: l'admin sceglie l'icona per ogni `Tipologia`;
il valore di `Tipologia.icona` è la **chiave del registry** del `ui-kit` (nome breve, es.
`palmtree`, `leaf`) — **non** il nome Iconify completo — risolta a un'icona **Lucide
bundled/offline** dal `<Icon>`. **Fallback** finché manca `icona`: chiave di default (es.
`umbrella`), senza cambiare il contratto del componente.

> **Convenzione di handshake:** i valori ammessi di `Tipologia.icona` sono le **chiavi del registry**
> condiviso (offline). Il backend usa quelle chiavi; nomi sconosciuti ricadono sul fallback.

### 13.4 Selezione, focus e stati aggiuntivi (`dimmed` / `found`)

- **Selezione** (persistente, cella aperta nel drawer): `outline: 2px solid var(--color-brand);
  outline-offset: 2px;` + alone `box-shadow: 0 0 0 4px var(--color-brand-tint)`.
- **Focus da tastiera** (`:focus-visible`): `--ring-focus` (coral glow 3px) — sempre
  visibile su qualsiasi colore di stato. Selezione e focus possono coesistere.
- **`dimmed`** (nuovo, guidato dai **chip filtro stato** nella toolbar, §13.6): la cella si attenua —
  `opacity: .25` + `saturate(.5)`, transizione ~200ms su `opacity`/`filter` — quando ≥1 stato è
  attivo nel filtro e nessuna fascia dell'ombrellone lo corrisponde. Puramente visivo: la cella
  resta nel DOM, `<button>`/`aria-label` invariati (tastiera e aria non impattati).
- **`found`** (nuovo, guidato dalla **ricerca rapida**, §13.8): impulso coral 2× (`animation:
  cell-found 1.15s var(--ease-standard) 2`, §8) sopra `--shadow-sun` quando la cella matcha la
  ricerca. Neutralizzato da `prefers-reduced-motion`.
- Selezione, focus, `dimmed` e `found` sono indipendenti e composabili sulla stessa cella.

### 13.5 Accessibilità della cella ([ADR-0020](../architecture/decisions/0020-resa-mappa.md))

- Ogni cella è un **`<button>`** focusabile, in una griglia navigabile da tastiera (frecce + Tab).
- **`aria-label` testuale completa**, es.: *"Ombrellone 8, Settore Centro Fila 2, tipologia
  Normale, mattina prenotato, pomeriggio libero"* → lo **stato non dipende dal solo colore**.
- Pattern colorblind sulle celle: **rimandato** ([D-020](../architecture/deferred.md)); l'ink +
  `aria-label` + legenda coprono l'MVP.

### 13.6 Settore Speciali, filtri di stato e legenda

- **Speciali** (palme): settore dedicato in coda — un blocco per **ogni** settore `kind: special`,
  discriminato per `Sector.kind` e non per nome (D-056), intestato col nome reale del settore —
  celle leggermente più grandi col proprio marcatore tipologia
  ([ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)).
- **Filtri Stato — nella toolbar** (separati dalla legenda): i chip Libero / Abbonato /
  Giornaliero / Prenotato / **Non disponibile** (`covered`, D-048) vivono nella **toolbar della
  scena** (§13.8) come **toggle multi-select** compatti (`<button aria-pressed>`, in un
  `role="group"`): con ≥1 chip attivo, le celle senza **nessuna** fascia in uno stato attivo
  prendono `dimmed` (§13.4); un nuovo clic sull'ultimo chip attivo spegne il filtro. Filtro
  **solo visivo**: nessuna cella rimossa dal DOM, tastiera/aria invariati.
- **Legenda informativa — pillola «Legenda»** (`Popover` ui-kit, §10) nella toolbar: contenuto
  puramente consultivo, separato dai comandi — «Stato misto» (pallino `conic-gradient`), la nota
  «stato per fascia», l'istruzione d'uso dei chip, e la **Tipologia** (Normale
  `--color-state-normale-mark` + tipi con icona). Un click apre, Esc/click-fuori chiude
  (dal primitivo).

### 13.7 Dettaglio in `Drawer` overlay (riallineamento ADR-0019)

- Al clic su una cella ([flows §2](flows.md)) il dettaglio appare nel **`Drawer` ui-kit in
  overlay** (non più un pannello inline nella colonna della mappa) — **riallinea il codice ad
  [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) §Decision** (drawer contestuale in
  overlay), chiudendo una divergenza storica; la mappa resta sempre a piena larghezza.
- Titolo **"Ombrellone «etichetta»"**, chip **tipologia**, crumb **Settore · Fila**, blocco
  **stato per fascia** (Mattina/Pomeriggio, fasce cliccabili), dettaglio prenotazione (cliente,
  importo, stato pagamento badge — Saldato/Parziale/Da incassare, [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)),
  e le azioni in footer: **Nuova prenotazione**, **Abbonamento** (più, quando c'è una
  prenotazione, Registra incasso / Annulla / Gestisci abbonamento).
- Su viewport strette lo stesso drawer non sfora: `max-w-[calc(100vw-24px)]` (uniforme, senza breakpoint).
- La selezione cella (anello coral) resta visibile sotto lo scrim leggero (`--color-scrim`):
  l'operatore non perde il riferimento spaziale mentre il drawer è aperto.

### 13.8 La scena «Riva» (stage, full-bleed)

Lo stage è **full-bleed**: riempie l'intera area contenuto della vista, senza cornice-card
(niente bordo/raggio/ombra né padding esterno). Lo scroll vive in uno **scroller interno**
(`.map-scroll`) dentro lo stage, così la grana di sabbia copre sempre il viewport della scena.
Struttura verticale dall'alto (`apps/web-staff/src/styles/map-scene.css`):

- **Mare** (`.map-sea`, h ~64px, **sticky in cima**: l'orizzonte resta ancorato mentre le file
  scorrono sotto): gradiente verticale `--color-sea-deep → --color-sea-3 →
  --color-sea-2 → --color-sea-1` + **3 velature** (`.map-sea-veil`, token `--color-sea-veil`/`-strong`,
  `border-radius` alto) in drift orizzontale lento (`map-sea-drift`, 19–33s, solo `transform`,
  `linear infinite`). Label discreta "MARE" (tracking largo, `--color-sea-ink`). Il vecchio
  specchio "mare" a barretta è rimosso.
- **Toolbar della scena** (`.map-toolbar`, **sticky sotto il bagnasciuga**): vetro leggero
  (`color-mix` su `--color-warm-075` + `backdrop-filter: blur`), contiene i comandi — tab
  settore, **chip filtro stato** (§13.6), **ricerca rapida**, pillola **«Legenda»** (§13.6).
- **Bagnasciuga** (`.map-shore`, h ~16px, **sticky sotto il mare**): gradiente `--color-sea-1` →
  sabbia bagnata `#EDE6D2` (tonalità di transizione, unica eccezione ai token in questo file) →
  `--color-warm-075`: il mare *bagna* la sabbia invece di finire a spigolo.
- **Sabbia** (`.map-stage`): gradiente `--color-warm-075 → --color-warm-150` + **grana**
  impercettibile (SVG `feTurbulence` inline via `background-image` data-URI, `opacity .05`,
  `mix-blend-mode: multiply`) — costo nullo, nessuna animazione.
- **Caption in scena**: sotto la toolbar, la riga "Spiaggia · Settore X" + conteggio postazioni
  (i comandi stanno tutti nella toolbar sticky, §sopra).
- **File**: marcatore fila a sinistra (`FILA n`, sottotitolo "prima linea" sulla fila 1), celle al
  centro, **righello occupazione** a destra (track 4px + fill `--color-accent` opacità .75 +
  etichetta `occupate/totali` `tabular-nums`) — occupata = **almeno una fascia `≠ free`** (i
  `covered` contano come occupati: semantica di disponibilità operativa, distinta dalla metrica
  del Report, D-048).
- **Reveal scaglionato per fila** al mount (`.map-row-in`, `animation-delay` crescente, §8).
- **Ricerca rapida**: match su etichetta esatta (case-insensitive) o nome cliente (substring, dai
  bookings del giorno già in memoria), debounce ~150ms; i match prendono `found` (§13.4) e il
  primo viene scrollato in vista (`scrollIntoView({block:'nearest'})`, istantaneo sotto
  `prefers-reduced-motion`); se il match è in un altro settore, il tab di quel settore si attiva
  automaticamente (l'input resta focused).
- **Settore Speciali**: stessa scena, blocco dedicato in coda.

Riferimenti: [spec rework Riva](../superpowers/specs/2026-07-21-map-redesign-riva-design.md)
§3/§6/§7 · mockup [`map-redesign-esplorazione.html`](mockups/map-redesign-esplorazione.html).

### 13.9 Hovercard delle celle (`HoverCard` ui-kit, §10)

- Al passaggio del mouse su una Tessera, **solo su dispositivi hover-capable** (gating nel
  chiamante `MapView`, via `useMediaQuery('(hover: hover)')`; il primitivo ui-kit resta
  agnostico), appare una card di **consultazione**: etichetta + Settore · Fila, per ogni fascia
  un pallino di stato + nome stato + cliente (se prenotata), footer "Clic per aprire il
  dettaglio".
- **Nessuna azione** al suo interno: le azioni restano nel `Drawer` (§13.7). Su touch: overhead
  zero, il tap apre direttamente il drawer.
- `openDelay` ~350ms evita flicker passando velocemente sulla griglia.

## 14. L'editor Struttura — il Cantiere ([ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md))

Editor di `Settore/Fila/Ombrellone` (`EstablishmentStructureView`, `/establishment/structure`,
admin-only) in modello **canvas + ispettore**: la scena «Riva» **a riposo** è l'editor stesso, un
pannello laterale ospita form e azioni contestuali sulla selezione corrente. Il paradigma di
costruzione resta **per form + numerazione automatica** ([ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md),
confermato) — cambia dove vivono i form (in scena, non modali), non il modello. Spec:
[2026-07-22-struttura-cantiere-design.md](../superpowers/specs/2026-07-22-struttura-cantiere-design.md).

### 14.1 La scena «Cantiere»

- **Riuso dei mattoni Riva** di `map-scene.css` (§13.8: mare a velature, bagnasciuga, sabbia con
  grana, toolbar vetro sticky) — zero duplicazione. Le classi editor-specifiche vivono affiancate in
  `apps/web-staff/src/styles/structure-scene.css` (prefisso `.st-*`).
- **Toolbar**: `role="tablist"` con un tab per settore (nome + conteggio posti — qui non esiste
  occupazione, non ci sono prenotazioni da mostrare), tab ghost **«+ Settore»**, e a destra il
  toggle **«Seleziona»** (`aria-pressed`, §14.3).
- **Fila** (`StructureRow`): rail sinistro cliccabile (`FILA n`, conteggio ombrelloni), azioni
  rapide **su hover/selezione** — genera ⚡ (`IconButton variant="ghost"`) e svuota/elimina 🗑
  (`IconButton variant="danger"`, [ADR-0044](../architecture/decisions/0044-iconbutton-variante-danger.md)) —
  scorciatoie delle stesse azioni del pannello Fila; celle al centro; **ghost «+»** in coda alla fila
  per aggiungere un ombrellone.
- **Tessera «a riposo»**: `UmbrellaCell` in resa **rest** (§13.1) — stessa anatomia della cella
  Mappa, nessuna occupazione da mostrare.
- **Selezione visiva**: cella → stesso anello coral della Mappa (§13.4); fila → inset ring sul
  blocco (`box-shadow: inset 0 0 0 1.5px var(--color-brand)`); settore → tab attivo. Click sulla
  sabbia nuda deseleziona (torna al pannello Spiaggia).
- **Settore Speciali**: è un tab come gli altri (contesto di *editing*, un settore alla volta) —
  diverge deliberatamente dalla convenzione Mappa (blocco Speciali sempre in coda, §13.6): contesti
  d'uso diversi, non un'incoerenza.

### 14.2 Ghost-affordance (creazione in-place)

Niente modali di creazione: le forme tratteggiate in scena aprono il pannello di creazione
corrispondente nell'ispettore.

- Cella **`+`** in coda a una fila → pannello «Nuovo ombrellone» su quella fila.
- Fascia tratteggiata **«+ Nuova fila»** in coda al settore, con hint («etichetta e, se vuoi, genera
  subito gli ombrelloni») → pannello «Nuova fila».
- Tab **«+ Settore»** in toolbar → pannello «Nuovo settore».
- Stile: bordo tratteggiato `--color-border-input`; hover → `--color-coral-050` + `--color-brand-ink`
  (stesso vocabolario coral della selezione).
- Una fila senza ombrelloni mostra comunque il testo d'aiuto («Nessun ombrellone: aggiungi col «+» o
  genera dalla fila») accanto alla cella ghost: la scena guida senza un wizard separato (§14.5).

### 14.3 L'ispettore

Un pannello visibile alla volta (eyebrow + titolo + crumb «Settore · Fila»), `lg+` colonna fissa
(`--color-raised`, bordo sinistro); **sotto `lg` nel `Drawer` ui-kit in overlay**, aperto alla
selezione e chiuso = deselezione (stesso pattern del dettaglio Mappa, [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)/
[ADR-0051](../architecture/decisions/0051-responsive-drawer-e-telefono-graceful.md)).

| Pannello | Contenuto |
|---|---|
| **Spiaggia** (default, selezione vuota) | Stat 2×2 (settori/file/ombrelloni/tipologie), **Tipologie** con CRUD inline (niente modale), sezione **«Ritirati (N)»** sotto le Tipologie (assente a N=0): per riga etichetta + `retiredFrom` + data ritiro + **«Ripristina»** con select della fila di destinazione ([D-055](../architecture/deferred.md)/[ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md)), hint d'uso |
| **Settore** | Nome, disposizione (griglia/speciali), danger-zone «Elimina settore» |
| **Fila** | Etichetta, generatore (prefisso/da numero/quantità/tipologia + anteprima live, limite 1..500 esplicito: oltre `GENERATE_MAX` hint «Massimo 500 per volta» e submit disabilitato, niente clamp silenzioso), danger-zone «Svuota fila (N)» + «Elimina fila» |
| **Ombrellone** | Etichetta (hint «numero fisico reale, unico»), tipologia, Salva; danger-zone «Elimina ombrellone» + **«Ritira ombrellone»** con `ConfirmDialog` dedicato (copy: storico conservato, reversibile — [D-055](../architecture/deferred.md)/[ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md)) |
| **Selezione multipla** | Conteggio (`aria-live="polite"`) + chip etichette, «Assegna tipologia a tutti», «Elimina N» |
| **Nuovo settore / Nuova fila / Nuovo ombrellone** | Form di creazione; «Nuova fila» compone crea-fila + generate in due chiamate (`mutateAsync`, guardia anti doppio-create) |

Regole trasversali:

- **Salvataggio esplicito**: submit del form del pannello (Enter), mai autosave; `:loading` sul
  bottone durante il pending.
- **Toast su ogni esito** — crea/rinomina/elimina/bulk — via `pushToast`; gli errori (409/422/404)
  passano dal toast di default di `mutationResource` (`onError` globale), invariato.
- **Invalidazione sistematica**: ogni mutation invalida sia `establishmentStructure` sia
  `establishmentOverview`, così i contatori della pagina Stabilimento restano coerenti.
- **`ConfirmDialog` riservato al distruttivo**: elimina settore/fila/ombrellone/tipologia, svuota
  fila, elimina in blocco, **ritira ombrellone** (dedicato, distinto da quello di elimina — copy
  che ne spiega la reversibilità). Tutto il resto (rinomina, crea, genera, assegna tipologia in
  blocco, **ripristina un ritirato**) è inline senza interruzioni: `Ripristina` è costruttiva, non
  passa da conferma.

### 14.4 Selezione multipla e bulk

- Modalità **«Seleziona»** esplicita (toggle in toolbar, `aria-pressed`): il click su una cella
  aggiunge/toglie dalla selezione. **Maiusc+clic** attiva la modalità al volo su qualunque cella (la
  sola scorciatoia da tastiera non è scopribile né disponibile su touch).
  **`Esc`** esce dalla modalità e svuota la selezione — **con guardia**: se un `[role="dialog"]`/
  `[role="alertdialog"]` (`ConfirmDialog`) è aperto, `Esc` annulla solo quello (gestito dal
  primitivo reka-ui), senza collassare anche il pannello sottostante. La selezione **non persiste**
  al cambio di settore o vista.
- **Bulk = endpoint backend dedicati**, mai iterazione FE di delete singoli (niente N richieste
  separate, niente perdita di atomicità): `POST /establishment/umbrellas/bulk-delete` (`{ ids }` →
  `{ deleted, skipped }`, in una transazione) e `POST /establishment/umbrellas/bulk-assign-type`
  (`{ ids, umbrellaTypeId }` → `{ updated }`).
- **Semantica «salta e riporta», mai 409 sul batch** — speculare al `generate`: `bulk-delete` elimina
  gli ombrelloni senza prenotazioni e **salta** quelli con prenotazioni (conteggiati in `skipped`,
  insieme a eventuali id non trovati/estranei al tenant); `bulk-assign-type` risponde 422 solo se la
  *tipologia* è estranea al tenant (come il create singolo), non per singoli id di ombrellone.
- **«Svuota fila» riusa `bulk-delete`** con tutti gli id della fila lato FE: un solo endpoint per
  svuota-fila e multi-select, nessuna API per-fila dedicata.
- Toast riepilogo sull'esito: «Eliminati N · saltati M (con prenotazioni)» per «Svuota fila»
  (RowPanel); il bulk della selezione multipla (MultiPanel) usa «Eliminati N · saltati M» senza
  suffisso / «Tipologia assegnata a N ombrelloni».

### 14.5 Setup guidato ed empty-state

- Card «Costruiamo la tua spiaggia» sulla sabbia, **finché la spiaggia non ha nessun ombrellone**
  (contati su tutto l'albero, non sul solo settore corrente) — non solo a 0 settori. Al primo
  ombrellone creato la card sparisce definitivamente; la scena (mare/sabbia) resta visibile sotto la
  card in ogni passo — si costruisce *sulla* spiaggia, non in un wizard a schermo intero.
- Il passo attivo è **derivato dall'albero**, non fisso: nessun settore → 1 (Crea un settore);
  settori ma nessuna fila in tutto l'albero → 2 (Aggiungi una fila, sul primo settore); file ma
  nessun ombrellone → 3 (Genera gli ombrelloni, sulla prima fila del primo settore che ne ha). I
  passi già superati si mostrano **completati** (spunta ✓ + «Fatto», stile attenuato) invece del
  numero; il mapping passo→azione (`create-sector` / `create-row` / `select-row`) sta nella scena
  (`StructureScene.vue`), la card (`StructureGuidedSetup.vue`) è presentazionale.
- Con settori/file già presenti la card convive con le ghost-affordance del settore corrente
  (§14.2) — fascia «+ Nuova fila» e cella «+» restano visibili e funzionanti sotto la card: le due
  guide non si escludono a vicenda.

### 14.6 Architettura FE (scomposizione)

`EstablishmentStructureView.vue` (shell: query, stato `selection: {kind, id[]} | null`, layout due
colonne/`Drawer`) · `InspectorPanels.vue` (ramo unico dei pannelli, montato sia nell'aside desktop
che nel `Drawer` mobile — un solo punto da cablare) · `StructureScene.vue` (scena, tab settori,
modalità Seleziona) · `StructureRow.vue`
(rail + celle + ghost di una fila) · `panels/` (un SFC per pannello: `BeachPanel`, `SectorPanel`,
`RowPanel`, `UmbrellaPanel`, `MultiPanel`, `SectorCreatePanel`, `RowCreatePanel`,
`UmbrellaCreatePanel`) · `StructureGuidedSetup.vue` (card 3-passi, §14.5) ·
`useEstablishmentStructure.ts` (query + mutation, incluse le 2 bulk — tutte invalidano anche
l'overview, §14.3).

## 15. Accessibilità (trasversale)

- Contrasti testo **AA**; verifica dei token di stato/ink in CI (un test che calcola il rapporto
  di contrasto etichetta↔stato fallisce sotto 4.5).
- Focus **sempre** visibile (`--ring-focus`); navigazione completa da tastiera; primitivi Reka UI
  per focus trap/ESC/ARIA su drawer, dialog, menu, combobox.
- Colore **mai** unico veicolo: testo + `aria-label` ovunque (celle, badge di stato, legende).
- Target tocco ≥ 44px su tablet; `prefers-reduced-motion` rispettato.

## 16. Disciplina anti-debito ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md))

1. **Solo token** come valori nei componenti (niente hex/px) — verificato da lint.
2. **Regola di promozione**: se un elemento è riusato o ha superficie a11y → `ui-kit`; se è
   composizione di una singola schermata → resta locale.
3. **Lint** a supporto del confine `ui-kit` e dell'uso dei token.
4. Le estensioni di contratto necessarie alla mappa (`Tipologia.icona`, stato per fascia) sono
   **tracciate** e additive ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)); fallback FE
   finché il backend non le espone.

## 17. Riferimenti

[ADR-0017](../architecture/decisions/0017-design-system-frontend.md) ·
[ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md) *(Coralyn — supercede ADR-0018 per palette/tipografia)* ·
[ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) ·
[ADR-0020](../architecture/decisions/0020-resa-mappa.md) ·
[ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) ·
[ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) *(editor Struttura — il Cantiere, §14)* ·
[spec UI/UX](../specs/2026-06-28-frontend-ui-ux-design.md) ·
[spec editor Cantiere](../superpowers/specs/2026-07-22-struttura-cantiere-design.md) ·
[mockup Coralyn *(corrente)*](mockups/Coralyn.dc.html) ·
[mockup app-shell *(storico)*](mockups/frontend-app-shell.html) ·
[data-model](data-model.md) · [flows](flows.md) ·
[deferred](../architecture/deferred.md).
