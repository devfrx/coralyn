# Design system del frontend — token e linguaggio dei componenti

> **Fonte di verità visiva** del frontend Driftly (app staff). Questo documento porta il
> linguaggio visivo deciso negli ADR a livello di **specifica d'implementazione** per
> `packages/ui-kit`: i valori esatti dei **token** e le regole dei **componenti**. È il
> *cosa* corrente (come i diagrammi); il *perché* sta negli ADR
> ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
>
> **Status:** aggiornato al redesign **Coralyn** (2026-06-29). Lingua visiva "Mediterraneo
> Caldo": brand corallo-terracotta, superfici avorio, navy profondo caldo. Le scelte
> strutturali (ADR-0017–0020) sono **confermate**; i *valori* di palette e tipografia sono
> rivisti dall'[ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md).
>
> **Ancoraggio:** [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) (token-first,
> headless, ui-kit) · [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)
> (Coralyn — palette, tipografia) · [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)
> *superato da ADR-0027* · [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)
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
5. **Coerenza fredda.** Neutri freddi, ombre tinte di navy (non nero puro): identità "Costiero
   professionale", calma e da gestionale serio — non estetica "AI generica".

## 2. Token — Colore (primitive)

Palette grezza. **Non usare direttamente nei componenti**: passare sempre dai semantic (§3).

> Aggiornato al redesign **Coralyn** ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)):
> brand spostato da teal a corallo-terracotta; neutri freddi → caldi; navy leggermente riscaldato.
> Stati mappa e accento sabbia: **invariati**.

```css
:root {
  /* Brand — Corallo (sostituisce teal, ADR-0027) */
  --coral-800: #7A2E1C;
  --coral-700: #9E3D2A; /* hover/pressed */
  --coral-600: #B24832;
  --coral-500: #C4523A; /* primario */
  --coral-100: #FAE8E4; /* tint: selezione/focus su chiaro */
  --coral-050: #FDF3F1;

  /* Brand — Navy profondo caldo (superfici profonde) */
  --navy-900: #1A2A38; /* sidebar/superfici profonde */
  --navy-800: #22364A;
  --navy-700: #2E4560; /* divisori su navy */

  /* Accento — sabbia (caldo, con parsimonia) — invariato */
  --sand-600: #A87A20;
  --sand-500: #C49535;
  --sand-400: #D4A347;
  --sand-100: #FDF4E3;

  /* Neutri caldi (sostituisce cool-*, ADR-0027) */
  --warm-000: #FFFFFF;
  --warm-050: #FDFAF6; /* bg area contenuto */
  --warm-100: #F5F0EA;
  --warm-150: #EFE9E0; /* canvas del layout a card */
  --warm-200: #E0D8CF; /* bordo */
  --warm-300: #C8BFB4; /* bordo sottile / disabled / swatch "Normale" */
  --warm-400: #9A9089; /* placeholder */
  --warm-500: #726960; /* testo muto */
  --warm-700: #4D4740; /* testo secondario forte */
  --warm-900: #231F1B; /* testo */

  /* Feedback — invariati */
  --green-500: #3F9D5B; /* success */
  --amber-500: #E8A93C; /* warning */
  --red-500:   #D6453D; /* danger */
  --blue-500:  #4F86E0; /* info */

  /* Stati mappa (riempimento) — invariati */
  --state-free-500:   #6BBF7B; /* Libero */
  --state-sub-500:    #5B8DEF; /* Abbonato */
  --state-day-500:    #E87C3C; /* Giornaliero */
  --state-booked-500: #EFB847; /* Prenotato */

  /* Ink per gli stati mappa — scuri, contrasto AA (vedi §3.1) */
  --state-free-ink:   #183E1E;
  --state-sub-ink:    #102945;
  --state-day-ink:    #3A1A08;
  --state-booked-ink: #4A3711;
}
```

> I quattro stati mappa e l'accento sabbia sono **invariati** ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)).
> Il brand corallo e i neutri caldi sono **vincolati** da ADR-0027. I valori intermedi e gli *ink*
> sono derivati per completare la scala e garantire AA: esecuzione, non nuove scelte.

## 3. Token — Colore (semantic)

Ruoli consumati dai componenti. Ogni colore "di sfondo" ha il suo `-ink` (testo sopra) verificato AA.

```css
:root {
  /* Superfici */
  --color-canvas:        var(--warm-150); /* tela dietro le card */
  --color-bg:            var(--warm-050); /* sfondo area contenuto */
  --color-surface:       var(--warm-000); /* card, drawer, popover */
  --color-sunken:        var(--warm-100); /* campi, righe alternate, ghost btn */
  --color-border:        var(--warm-200);
  --color-border-subtle: var(--warm-300);

  /* Testo */
  --color-text:         var(--warm-900);
  --color-text-muted:   var(--warm-500);
  --color-text-strong:  var(--warm-900);
  --color-text-2nd:     var(--warm-700);
  --color-on-brand:     #FFFFFF;    /* testo su corallo — AA ok */
  --color-on-navy:      #D4E6EF;    /* testo su sidebar navy */
  --color-on-navy-muted:#8AAABB;

  /* Brand / interazione */
  --color-brand:        var(--coral-500);
  --color-brand-hover:  var(--coral-700);
  --color-brand-tint:   var(--coral-100); /* sfondo selezione/hover su chiaro */
  --color-accent:       var(--sand-400);
  --color-accent-hover: var(--sand-500);
  --color-accent-tint:  var(--sand-100);

  /* Feedback */
  --color-success: var(--green-500);
  --color-warning: var(--amber-500);
  --color-danger:  var(--red-500);
  --color-info:    var(--blue-500);

  /* Focus */
  --color-focus-ring: var(--coral-500);

  /* Stati mappa (semantic) — invariati */
  --state-libero:          var(--state-free-500);
  --state-libero-ink:      var(--state-free-ink);
  --state-abbonato:        var(--state-sub-500);
  --state-abbonato-ink:    var(--state-sub-ink);
  --state-giornaliero:     var(--state-day-500);
  --state-giornaliero-ink: var(--state-day-ink);
  --state-prenotato:       var(--state-booked-500);
  --state-prenotato-ink:   var(--state-booked-ink);
  --state-normale-mark:    var(--warm-300); /* swatch tipologia "Normale" in legenda */
}
```

### 3.1 Contrasto verificato (etichetta su stato — testo piccolo, soglia AA 4.5)

| Stato | Riempimento | Ink etichetta | Contrasto* |
|---|---|---|---|
| Libero | `#7BB661` | `#1E3A16` | ~5.9 ✓ |
| Abbonato | `#5B8DEF` | `#102945` | ~4.9 ✓ |
| Giornaliero | `#E8843C` | `#3A1E08` | ~5.6 ✓ |
| Prenotato | `#F0C24A` | `#4A3711` | ~7.9 ✓ |

\* Stima sui valori sRGB; da verificare in CI con un check di contrasto sui token (vedi §14).
L'etichetta usa **sempre ink scuro** su tutti gli stati: leggibilità e coerenza, niente testo
bianco a basso contrasto.

## 4. Token — Tipografia

Font **Outfit** (UI). Aggiornato al redesign Coralyn ([ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)):
warm geometric sans, più contemporaneo e caldo di Inter senza perdere leggibilità in densità.
Cifre tabulari garantite via `font-variant-numeric: tabular-nums`.
Bundled offline in `packages/ui-kit` (subset latin, pesi 400/500/600 ≈ 30 KB gzip).

```css
:root {
  --font-sans: 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-numeric: 'tabular-nums'; /* applicato a prezzi/date/quantità/etichette */

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

  --tracking-caps: 0.05em; /* micro-label maiuscole (legende, eyebrow) */
}
```

Regole: prezzi, date, quantità, **etichette ombrellone** → `font-variant-numeric: tabular-nums`.
Pesi ammessi: 400/500/600 (niente 700+, mantiene la sobrietà). Titoli di sezione: `--text-xl`/600.

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
:root {
  --radius-sm:   6px;   /* input, chip, badge */
  --radius-md:   9px;   /* bottoni, nav item */
  --radius-lg:   14px;  /* card, drawer */
  --radius-xl:   18px;  /* canvas shell */
  --radius-full: 999px; /* pill, avatar, cella ombrellone */
}
```

## 7. Token — Elevazione (ombre)

Ombre **soft, tinte di navy caldo** (rgb 26,42,56), elevazione contenuta.

```css
:root {
  --shadow-xs: 0 1px 3px rgba(26,42,56,.09);              /* cella, chip */
  --shadow-sm: 0 2px 12px rgba(26,42,56,.09);             /* card */
  --shadow-md: 0 8px 28px rgba(26,42,56,.13);             /* drawer laterale, popover, menu */
  --shadow-lg: 0 16px 44px rgba(26,42,56,.17);            /* dialog, bottom-sheet */
  --shadow-focus: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-focus-ring); /* anello focus a doppio bordo */
}
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

Uso: hover cella (translateY -1px + `--shadow-sm`, `--motion-fast`); apertura drawer (slide-in da
destra su desktop, slide-up come bottom-sheet su tablet, `--motion-slow`/`--ease-emphasized`);
load della mappa con reveal **scaglionato per fila** (`animation-delay` crescente, sobrio).

## 9. Token — Layout, z-index, breakpoint

```css
:root {
  --shell-gutter: var(--space-3);     /* spazio tra le card della shell */
  --sidebar-width: 220px;             /* desktop: sidebar piena */
  --sidebar-rail: 64px;               /* tablet: rail di icone */
  --drawer-width: 380px;              /* desktop: drawer laterale */
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

Breakpoint ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)/[ADR-0004](../architecture/decisions/0004-form-factor-e-delivery.md)):

| Nome | Range | App-shell |
|---|---|---|
| **tablet** | 768–1023px | sidebar → **rail di icone**; drawer → **bottom-sheet**; celle a `--cell-size-touch` |
| **desktop** | ≥ 1024px | sidebar **piena**; drawer **laterale** in overlay; celle a `--cell-size` |

> Sotto 768px (telefono) è **fuori MVP** ([ADR-0004](../architecture/decisions/0004-form-factor-e-delivery.md)): il layout tablet degrada in modo accettabile, non è un target di design.

## 10. Componenti base (linguaggio)

Layer `ui-kit`: **token → primitivi headless (Reka UI) → componenti base → schermate**
([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)). Stati comuni a tutti gli
interattivi: **default / hover / active / focus-visible / disabled**; focus = `--shadow-focus`.

- **Button** — varianti `primary` (sfondo `--color-brand`, testo `--color-on-brand`, hover
  `--color-brand-hover`), `ghost` (sfondo `--color-sunken`, testo `--color-brand`), `danger`
  (`--color-danger`). Raggio `--radius-md`, altezza ≥ 36px (≥44px su tablet), icona opzionale a sx.
- **Field / Input** — label (`--text-sm`/500), control (`--radius-sm`, bordo `--color-border`,
  sfondo `--color-surface`; focus = bordo `--color-brand` + `--shadow-focus`), testo d'aiuto/errore
  (`--text-xs`, errore in `--color-danger`). Un solo pattern per tutti i form.
- **Card** — `--color-surface`, `--radius-lg`, `--shadow-sm`. Unità di superficie della shell.
- **Badge / Chip** — pill `--radius-full`, `--text-xs`/600; per la **tipologia** nel drawer:
  sfondo `--color-brand-tint`, testo `--teal-700`, icona a sx.
- **Icon** — wrapper unico su **Iconify bundled/offline + Lucide** (set primario), dietro
  `<Icon>` ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)). `currentColor`,
  `stroke-width` 1.75, dimensioni 14/16/20/24. **Niente icone fuori dal wrapper.**
- **DataTable** — su **TanStack Table** (headless) skinnata sui token: header `--text-xs` maiuscolo
  `--tracking-caps` `--color-text-muted`, righe `--text-sm`, zebra `--color-sunken`, numeri
  `tabular-nums` allineati a destra. Per Clienti/Prenotazioni.
- **Drawer** — su primitivo dialog/drawer Reka UI: focus trap, ESC, ARIA. `--color-surface`,
  `--radius-lg`, `--shadow-md`; scrim `--z-overlay`. Vedi §13.4.

## 11. App-shell ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md))

Layout **a card su tela neutra** (`--color-canvas`), gutter `--shell-gutter`.

- **Topbar** (`card`, `--color-brand`, `--z-sticky`): **brand = nome stabilimento** (es. "Lido
  Sole", icona ombrellone) — il wordmark "Driftly" resta **discreto** (login/about), perché è un
  codename ([D-017](../architecture/deferred.md)) e lo staff si identifica col proprio lido ·
  **navigatore data** (pill `‹ Sab 27 giu 2026 ›`, `tabular-nums`) · **ricerca cliente** (campo
  chiaro) · **avatar** utente.
- **Sidebar** (`card`, `--navy-900`, `--sidebar-width`): voci **Mappa** (home), **Prenotazioni**,
  **Clienti**, **Listino**, **Report**; voce **attiva** = sfondo `--color-brand`, testo bianco;
  hover = velo chiaro. In fondo, separata da divisore, la **Console superuser** — visibile **solo**
  al ruolo `superuser` ([ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)).
- **Area contenuto** (`card`, `--color-surface`/`--color-bg`): ospita la sezione attiva; il
  **drawer** appare **in overlay** qui, non come colonna fissa.
- **Responsive**: desktop = sidebar piena + drawer laterale; tablet = **rail di icone** (tooltip
  sul nome) + **bottom-sheet** trascinabile. Vedi §9.
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
| **Selezione** | **anello teal** + alone tint | stato UI effimero (cella aperta nel drawer) |

Forma: cerchio `--radius-full`, `--cell-size` (desktop) / `--cell-size-touch` (tablet),
`--shadow-xs`. È un **`<button>`** (vedi §13.5).

### 13.2 Stato — colore e split per fascia

- **Pieno** (stesso stato tutto il giorno): riempimento = `--state-*`, etichetta = `--state-*-ink`.
- **Split** (fasce diverse, [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
  divisione **sinistra = Mattina / destra = Pomeriggio**, hard-stop al 50% con divisore sottile
  (`--color-surface` a bassa opacità). L'etichetta resta centrata: l'ink scuro è leggibile su
  entrambe le metà (tutti gli stati hanno ink scuro, §3.1).
- Contrasto AA dell'etichetta: vedi tabella §3.1.

### 13.3 Marcatore tipologia

Cerchietto `--color-surface` con `--shadow-xs`, icona `--color-brand` (o `--cool-700`),
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
- **Focus da tastiera** (`:focus-visible`): `--shadow-focus` (doppio anello bianco+teal) — sempre
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
- Focus **sempre** visibile (`--shadow-focus`); navigazione completa da tastiera; primitivi Reka UI
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
