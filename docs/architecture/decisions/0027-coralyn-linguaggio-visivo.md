# ADR-0027: Coralyn — aggiornamento linguaggio visivo (da-0 redesign)

- **Status:** Accepted
- **Data:** 2026-06-29
- **Decisori:** Team di progetto
- **Supercede:** [ADR-0018](0018-linguaggio-visivo.md) — **solo palette e tipografia** (il sistema icone Iconify/Lucide rimane la decisione di ADR-0018)
- **ADR correlati:** [ADR-0017](0017-design-system-frontend.md) (token-first), [ADR-0020](0020-resa-mappa.md) (resa mappa), [ADR-0009](0009-documentazione-di-design.md) (mockup)

## Context

Il linguaggio visivo definito in ADR-0018 ("Costiero professionale", brand teal/navy) è stato
rivisto da zero (`da-0 redesign`). La revisione nasce da un confronto diretto sul design
del prodotto: il teal risultava **freddo e distante** per un contesto balneare; le superfici
in grigio freddo rendevano l'app più simile a un SaaS generico che a un tool pensato per chi
lavora in spiaggia. Si è cercata una direzione più **calda, distinta e memorabile**, senza
sacrificare la leggibilità e la serietà di un gestionale.

Il nuovo design concept si chiama **Coralyn** — dal corallo mediterraneo che è il nuovo colore
brand. Stesso impianto strutturale (ADR-0017–0020), valori e tono rivisti.

**Fonte di verità dei valori:** `packages/ui-kit/src/styles/theme.css` (implementazione reale;
il canvas `Coralyn.dc.html` è il riferimento visivo pixel).

## Decision

Direzione **"Mediterraneo Caldo"** — brand corallo-terracotta `#E0795A`, sidebar teal profondo
`#0F3C49`, accento teal secondario `#2F7281`, superfici avorio calde, tipografia **Inter/700**.

### Palette primitiva — Corallo (brand)

```css
--color-coral-500: #E0795A;  /* brand primario */
--color-coral-600: #C9603F;  /* hover/pressed */
--color-coral-700: #B65A38;  /* ink su tint */
--color-coral-100: #FBE8DF;  /* tint selezione/focus */
--color-coral-050: #FBF1EF;
```

### Palette primitiva — Teal profondo (sidebar/auth)

```css
--color-teal-900: #0B3543;
--color-teal-800: #0F3C49;        /* sidebar bg */
--color-teal-700: #16505E;        /* sidebar raised (nav item attivo) */
--color-teal-650: #1A5666;
--color-teal-600: #23606E;        /* sidebar border */
--color-teal-divider: #1C4E5B;
```

### Palette primitiva — Teal accento (su chiaro)

```css
--color-accent-500: #2F7281;      /* accento secondario su superfici chiare */
--color-accent-100: #E6EFEC;      /* tint accento */
--color-accent-150: #E2EDEE;
```

### Palette primitiva — Neutri caldi

```css
--color-warm-000: #FFFFFF;
--color-warm-050: #FBF6EE;        /* raised */
--color-warm-100: #F4ECE0;        /* bg area contenuto */
--color-warm-200: #ECE3D5;        /* canvas */
/* bordi */
--color-warm-border: #E7DCCB;
--color-warm-border-input: #E0D5C3;
--color-warm-border-row: #F1EADC;
/* ink */
--color-ink-900: #22303A;         /* testo principale / titoli */
--color-ink-700: #5E5648;         /* testo secondario */
--color-ink-500: #978C7B;         /* testo muto */
--color-ink-400: #B3A998;         /* placeholder */
```

### Token semantici (delta rispetto ad ADR-0018)

| Token semantico | Prima (ADR-0018) | Ora (ADR-0027) |
|---|---|---|
| `--color-brand` | `#1F6F8B` (teal) | `#E0795A` (corallo) |
| `--color-brand-hover` | `#155A73` | `#C9603F` |
| `--color-brand-tint` | `#DCECF2` | `#FBE8DF` |
| `--color-canvas` | `#E9EFF2` | `#ECE3D5` |
| `--color-bg` | `#F5F7F9` | `#F4ECE0` |
| `--color-surface` | `#FFFFFF` | `#FFFFFF` (invariato) |
| `--color-raised` | — | `#FBF6EE` (nuovo) |
| `--color-border` | `#D8E0E6` | `#E7DCCB` |
| `--color-text` | `#23323F` | `#22303A` |
| `--color-text-muted` | `#66727E` | `#978C7B` |
| Sidebar | navy `#0F3A4A` | **teal `#0F3C49`** |
| `--color-accent` | sabbia `#D4A347` | **teal `#2F7281`** + tint `#E6EFEC` |
| `--ring-focus` | `#1F6F8B` (teal) | coral glow `rgba(224,121,90,.16)` |

### Stati mappa — aggiornati con i valori Coralyn

I quattro colori di stato sono stati aggiornati nel redesign per armonizzarsi con la palette
calda (vedi nota in [ADR-0020](0020-resa-mappa.md)):

```
Libero      #8FBF9E  ink #1E3A16
Abbonato    #5E9AA6  ink #102945
Giornaliero #E89270  ink #3A1E08
Prenotato   #F1C879  ink #4A3711
```

Gli ink scuri per-stato sono **invariati** (già garantiscono contrasto WCAG AA). La verifica
del contrasto è mantenuta in CI (check automatico token↔ink).

### Tipografia — Inter confermata, peso 700 per i titoli

**Inter** è il font della UI — invariato rispetto ad ADR-0018. Il cambio rispetto al vecchio
contenuto errato di questo ADR: **Outfit non è mai stato implementato**. Inter era e rimane
la scelta reale, validata da `theme.css`.

Novità Coralyn: i titoli usano il peso **700** (in luogo del max 600 precedente) con
`letter-spacing` negativo (`-0.02em` su `--text-xl`/`--text-2xl`), per una gerarchia più
chiara e coerente col canvas. Pesi ammessi: 400/500/600/**700**.

### Icone — Iconify/Lucide confermato (ADR-0018)

Il sistema icone definito in ADR-0018 è **invariato** e rimane la decisione vigente:
`<Icon>` wrapper, Iconify offline/bundled, set primario Lucide, `unplugin-icons` + registry
(`packages/ui-kit/src/icons/registry.ts`), nessuno sprite custom. ADR-0027 supera ADR-0018
**esclusivamente per palette e tipografia**.

Il registry è stato **esteso** con le nuove icone Lucide usate dal canvas Coralyn (bell,
settings, euro, clock, phone, mail, refresh-cw, pencil, log-out, building-2, layers, filter,
chevron-down, arrow-up, arrow-down, waves, dot/circle) — questa è un'estensione, non un
cambio di decisione.

### Raggi — aggiornati

`--radius-sm: 9px` · `--radius-md: 11px` · `--radius-lg: 16px` · `--radius-xl: 18px` ·
`--radius-full: 999px`. Interfaccia più arrotondata e meno spigolosa.

### Ombre — soft, tinte di teal navy

```css
--shadow-card:   0 1px 3px rgba(15,60,73,.05);
--shadow-soft:   0 1px 2px rgba(15,60,73,.08);
--shadow-drawer: 0 12px 40px rgba(15,60,73,.13);
--shadow-modal:  0 24px 70px rgba(11,53,67,.34);
--shadow-brand:  0 2px 8px rgba(224,121,90,.3);   /* bottone primario corallo */
--ring-focus:    0 0 0 3px rgba(224,121,90,.16);   /* :root */
```

## Consequences

### Positive

- Identità visiva **più forte e memorabile**: il corallo è immediatamente riconoscibile,
  evoca il contesto balneare senza scivolare nell'estetica "AI generica".
- Superfici calde **meno affaticanti** per chi usa l'app in piena luce solare.
- La transizione è **additiva**: nessun cambio strutturale, solo valori CSS. I componenti
  ADR-0017 non cambiano contratto.
- Contrasti **WCAG AA mantenuti** su tutti i token di testo e sugli stati mappa.
- **Zero confusione icone**: ADR-0018 rimane vigente per le icone; scope chiaro.

### Negative / Trade-off

- Il corallo ha più **energia visiva** del teal: richiede disciplina nell'uso (solo brand
  primario, hover/active, focus ring, dot nav attiva) per non saturare l'interfaccia.
- Chi ha lavorato col mockup precedente deve **adattare il modello mentale** del colore brand.
- La sidebar è **teal** (non navy): chi aveva in mente il navy `#1A2A38` deve aggiornare.

### Neutre / Note

- `design-system.md` aggiornato contestualmente a questo ADR (valori 1:1 da `theme.css`).
- Mockup di riferimento corrente: `docs/design/mockups/Coralyn.dc.html`; bundle:
  `Coralyn - Gestionale Lidi.html`. `frontend-app-shell.html` resta **riferimento storico**.

## Alternatives considered

- **Raffinare il teal** invece di sostituirlo — valutato, ma il teal freddo è intrinsecamente
  distante dal contesto balneare; aggiustarlo in saturazione avrebbe prodotto un teal
  "forzatamente caldo", non un corallo.
- **Verde bosco / oliva** — carattere, ma troppo vicino ai colori di stato (Libero = verde);
  rischio di conflitto semantico sulla mappa.
- **Terracotta più scuro** (bordeaux) — perderebbe il senso di luminosità mediterranea;
  il corallo `#E0795A` tiene l'energia solare.
- **Outfit al posto di Inter** — valutato, ma Inter era già implementata e le sue qualità
  (leggibilità in densità, cifre tabulari, peso 700 con tracking negativo) la rendono la
  scelta giusta. Outfit non aggiunge valore sufficiente a giustificare la sostituzione.
- **Mantenere navy `#1A2A38` per la sidebar** — scartato: il teal `#0F3C49` si collega
  cromaticamente al mare ed è più coerente con la palette calda; il navy puro risultava
  troppo generico.

## Rubric check

1. **Professionalità** — palette curata e fedele al canvas approvato, contrasti AA, gerarchia
   tipografica chiara (Inter/700 con tracking negativo).
2. **Convenzioni** — token-first (`@theme`), CSS variables, Iconify/Lucide invariato,
   struttura ADR-0009 rispettata; nessuna deviazione dagli standard di progetto.
3. **Modularità** — cambio limitato a valori CSS in `theme.css`; zero impatto sui componenti
   e sui contratti; scope ADR chiaro (palette/tipografia, non icone).
4. **Zero debito** — doc riallineata alla realtà implementata (no valori fantasma come
   `#C4523A`, `Outfit`, navy `#1A2A38`); `frontend-app-shell.html` non cancellato ma
   etichettato come storico; D-020 (colorblind) invariato.
