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
```

### 3.1 Contrasto verificato (etichetta su stato — testo piccolo, soglia AA 4.5)

| Stato | Riempimento | Ink etichetta | Contrasto* |
|---|---|---|---|
| Libero | `#8FBF9E` | `#1E3A16` | ~6.2 ✓ |
| Abbonato | `#5E9AA6` | `#102945` | ~5.1 ✓ |
| Giornaliero | `#E89270` | `#3A1E08` | ~5.4 ✓ |
| Prenotato | `#F1C879` | `#4A3711` | ~8.1 ✓ |

\* Stima sui valori sRGB; da verificare in CI con un check di contrasto sui token (vedi §14).
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

--tracking-caps: 0.05em; /* micro-label maiuscole (legende, eyebrow, header tabella) */
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
--radius-full: 999px; /* pill, avatar, cella ombrellone */
```

## 7. Token — Elevazione (ombre)

Ombre **soft, tinte di teal navy** (rgb 15,60,73), elevazione contenuta; brand shadow corallo.

```css
--shadow-card:   0 1px 3px rgba(15,60,73,.05);    /* card, superfici leggere */
--shadow-soft:   0 1px 2px rgba(15,60,73,.08);    /* chip, cella */
--shadow-drawer: 0 12px 40px rgba(15,60,73,.13);  /* drawer laterale, popover */
--shadow-modal:  0 24px 70px rgba(11,53,67,.34);  /* dialog / modal */
--shadow-brand:  0 2px 8px rgba(224,121,90,.3);   /* bottone primario corallo */
--ring-focus:    0 0 0 3px rgba(224,121,90,.16);  /* :root — anello focus coral glow */
```

## 8. Token — Motion

```css
:root {
  --motion-fast: 120ms;  /* hover, focus */
  --motion-base: 180ms;  /* selezione, fade */
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
`--motion-slow`/`--ease-emphasized`); load della mappa con reveal **scaglionato per fila**
(`animation-delay` crescente, sobrio).

## 9. Token — Layout, z-index, breakpoint

```css
:root {
  --shell-gutter: var(--space-3);     /* spazio tra le card della shell */
  --sidebar-width: 220px;             /* esteso: sidebar piena */
  --drawer-width: 380px;              /* esteso: drawer laterale */
  --topbar-height: 56px;
  --cell-size: 34px;                  /* desktop */
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
- **DataTable** — componente `ui-kit` skinnato sui token: header `10.5px` maiuscolo
  `--tracking-caps` `--color-text-muted`, bg header `--color-raised`, righe `13px`, divisori
  `--color-border-row`, numeri `tabular-nums` a destra, riga cliccabile (hover). Due API,
  retro-compatibili ([ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)):
  **a slot** (il chiamante scrive `<tr>/<td>` a mano nel body — usata dove servono celle molto
  particolari o comportamenti custom come il click-riga di Clienti) e **data-driven** (prop
  opzionali `rows`/`rowKey`; genera le righe con le classi cella standard `TD`/`TD_FIRST`/
  `TD_RIGHT`/`TD_NUM`, slot `#cell-<key>` per celle ricche). Per Clienti/Prenotazioni/Rinnovi.
- **EmptyState** — blocco vuoto ("Nessun/a…"): `--radius-lg`, bordo tratteggiato
  `--color-border`, testo `--color-text-2nd`. Prop `message`; slot `#default` per contenuto
  ricco (es. icona). Usato da liste (Prenotazioni, Rinnovi).
- **Select** — `<select>` stilizzato gemello di `Input.vue` (stesso raggio/bordo/focus),
  usabile dentro `Field`. `v-model` + `props.options` **o** slot `#default` per `<option>`
  custom (gruppi, opzioni disabilitate). Passthrough attributi nativi.
- **ModalFooter** — coppia bottoni Annulla (secondary) / Conferma (`submitVariant`, default
  primary) in fondo ai modali. Prop `submitLabel` (obbligatoria), `cancelLabel`/
  `submitDisabled`/`submitVariant` opzionali, slot `#extra`; emit `cancel`/`submit`. La classe
  `pt-1` di default è sovrascrivibile dal chiamante (`class="pt-2"`) dove serve.
- **PageToolbar** — header di lista: slot `#left` + spacer `flex-1` + slot `#right`/`#actions`.
  Wrapper `mb-4 flex flex-wrap items-center gap-3`. Per Prenotazioni/Clienti (non adottato dove
  il contenitore ha classi di padding incompatibili, es. Mappa).
- **Drawer** — su primitivo dialog/drawer Reka UI: focus trap, ESC, ARIA. `--color-surface`,
  `--radius-lg`, `--shadow-drawer`; scrim `--z-overlay`. Vedi §13.4.

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
In testa lo **specchio "mare"**; gli **Speciali** in un settore dedicato in coda.

### 13.1 `OmbrelloneCell` — anatomia a 4 assi

| Asse | Resa | Sorgente dato |
|---|---|---|
| **Etichetta** | numero/identificativo fisico, centrato, `tabular-nums`, ink per-stato | `Ombrellone.etichetta` (stringa libera; buchi e "20bis" ammessi, [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)) |
| **Stato** | colore di riempimento; **split** se diverso per fascia | derivato per (ombrellone, data, fascia) — [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) |
| **Tipologia** | **marcatore a icona** d'angolo (top-right); Normale (`NULL`) = nessun marcatore | `Tipologia.icona` = **chiave del registry icone** del `ui-kit` (nome breve, es. `palmtree`); fallback FE finché il backend non espone `icona` ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)) |
| **Selezione** | **anello brand** (corallo `--color-brand`) + alone tint `--color-brand-tint` | stato UI effimero (cella aperta nel drawer) |

Forma: cerchio `--radius-full`, `--cell-size` (desktop) / `--cell-size-touch` (tablet),
`--shadow-soft`. È un **`<button>`** (vedi §13.5).

### 13.2 Stato — colore e split per fascia

- **Pieno** (stesso stato tutto il giorno): riempimento = `--state-*`, etichetta = `--state-*-ink`.
- **Split** (fasce diverse, [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
  divisione **sinistra = Mattina / destra = Pomeriggio**, hard-stop al 50% con divisore sottile
  (`--color-surface` a bassa opacità). L'etichetta resta centrata: l'ink scuro è leggibile su
  entrambe le metà (tutti gli stati hanno ink scuro, §3.1).
- Contrasto AA dell'etichetta: vedi tabella §3.1.

### 13.3 Marcatore tipologia

Cerchietto `--color-surface` con `--shadow-soft`, icona `--color-accent` (`#2F7281`),
posizionato top-right e **sopra** l'eventuale anello di selezione/focus. Data-driven: l'admin
sceglie l'icona per ogni `Tipologia`; il valore di `Tipologia.icona` è la **chiave del registry**
del `ui-kit` (nome breve, es. `palmtree`, `leaf`) — **non** il nome Iconify completo — risolta a
un'icona **Lucide bundled/offline** dal `<Icon>`. **Fallback** finché manca `icona`: chiave di
default (es. `umbrella`), senza cambiare il contratto del componente.

> **Convenzione di handshake:** i valori ammessi di `Tipologia.icona` sono le **chiavi del registry**
> condiviso (offline). Il backend usa quelle chiavi; nomi sconosciuti ricadono sul fallback.

### 13.4 Selezione e focus (distinti)

- **Selezione** (persistente, cella aperta nel drawer): `outline: 2px solid var(--color-brand);
  outline-offset: 2px;` + alone `box-shadow: 0 0 0 4px var(--color-brand-tint)`.
- **Focus da tastiera** (`:focus-visible`): `--ring-focus` (coral glow 3px) — sempre
  visibile su qualsiasi colore di stato. Selezione e focus possono coesistere.

### 13.5 Accessibilità della cella ([ADR-0020](../architecture/decisions/0020-resa-mappa.md))

- Ogni cella è un **`<button>`** focusabile, in una griglia navigabile da tastiera (frecce + Tab).
- **`aria-label` testuale completa**, es.: *"Ombrellone 8, Settore Centro Fila 2, tipologia
  Normale, mattina prenotato, pomeriggio libero"* → lo **stato non dipende dal solo colore**.
- Pattern colorblind sulle celle: **rimandato** ([D-020](../architecture/deferred.md)); l'ink +
  `aria-label` + legenda coprono l'MVP.

### 13.6 Settore Speciali e legenda

- **Speciali** (palme): settore dedicato in coda, celle leggermente più grandi col proprio
  marcatore tipologia ([ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)).
- **Legenda** sempre presente: **Stato** (Libero/Abbonato/Giornaliero/Prenotato + "mezza
  giornata") e **Tipologia** (Normale + tipi con icona). Micro-label maiuscole `--tracking-caps`.

### 13.7 Drawer contestuale della mappa

Al clic su una cella ([flows §2](flows.md)): titolo **"Ombrellone «etichetta»"**, chip
**tipologia**, crumb **Settore · Fila**, blocco **stato per fascia** (Mattina/Pomeriggio),
dettaglio prenotazione (cliente, pacchetto, periodo — `tabular-nums`), **stato pagamento**
(Saldato/Parziale/Non pagato · importo · metodo, [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)),
e le azioni: **Nuova prenotazione**, **Assegna abbonamento**, **Registra presenza**.

## 14. Accessibilità (trasversale)

- Contrasti testo **AA**; verifica dei token di stato/ink in CI (un test che calcola il rapporto
  di contrasto etichetta↔stato fallisce sotto 4.5).
- Focus **sempre** visibile (`--ring-focus`); navigazione completa da tastiera; primitivi Reka UI
  per focus trap/ESC/ARIA su drawer, dialog, menu, combobox.
- Colore **mai** unico veicolo: testo + `aria-label` ovunque (celle, badge di stato, legende).
- Target tocco ≥ 44px su tablet; `prefers-reduced-motion` rispettato.

## 15. Disciplina anti-debito ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md))

1. **Solo token** come valori nei componenti (niente hex/px) — verificato da lint.
2. **Regola di promozione**: se un elemento è riusato o ha superficie a11y → `ui-kit`; se è
   composizione di una singola schermata → resta locale.
3. **Lint** a supporto del confine `ui-kit` e dell'uso dei token.
4. Le estensioni di contratto necessarie alla mappa (`Tipologia.icona`, stato per fascia) sono
   **tracciate** e additive ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)); fallback FE
   finché il backend non le espone.

## 16. Riferimenti

[ADR-0017](../architecture/decisions/0017-design-system-frontend.md) ·
[ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md) *(Coralyn — supercede ADR-0018 per palette/tipografia)* ·
[ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) ·
[ADR-0020](../architecture/decisions/0020-resa-mappa.md) ·
[ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) ·
[spec UI/UX](../specs/2026-06-28-frontend-ui-ux-design.md) ·
[mockup Coralyn *(corrente)*](mockups/Coralyn.dc.html) ·
[mockup app-shell *(storico)*](mockups/frontend-app-shell.html) ·
[data-model](data-model.md) · [flows](flows.md) ·
[deferred](../architecture/deferred.md).
