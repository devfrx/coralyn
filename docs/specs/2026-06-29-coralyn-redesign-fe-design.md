# Coralyn — redesign FE (da-0): token, icone, componenti, viste

> **Status:** Draft per review · **Data:** 2026-06-29 · **Branch:** `feat/coralyn-redesign-fe` (da `main`)
>
> Spec d'implementazione del redesign **Coralyn** del frontend staff (`apps/web-staff` +
> `packages/ui-kit`). **Fonte di verità visiva unica:** `Coralyn.dc.html` (canvas del design tool)
> e il bundle `Coralyn - Gestionale Lidi.html` — trattati come **riferimento pixel**.
>
> Ancoraggi: [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) (token-first, ui-kit) ·
> [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md) (da riscrivere, §8) ·
> [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) (app-shell/responsive) ·
> [ADR-0020](../architecture/decisions/0020-resa-mappa.md) (resa mappa) ·
> [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md) (icone Iconify/Lucide — **confermato**).

## 1. Contesto e problema

Il redesign "Coralyn" è stato prodotto nel design tool come `Coralyn.dc.html`. La documentazione
era già stata aggiornata a "Coralyn" (ADR-0027, `design-system.md`) ma con **valori derivati e non
corrispondenti** al design reale, e il **codice** (`ui-kit/.../theme.css`) è ancora interamente il
vecchio linguaggio teal/Inter di ADR-0018. "Ristudiare da 0" significa: **ricostruire il layer di
design centralizzato (token, icone, componenti, viste) fedele a `Coralyn.dc.html`, e riallineare la
documentazione alla decisione reale**.

### 1.1 Discrepanze doc ↔ design reale (riferimento)

| Aspetto | Doc attuale (errata) | `Coralyn.dc.html` (reale) |
|---|---|---|
| Brand | `#C4523A` | **`#E0795A`** (deep `#C9603F`) |
| Sidebar | navy `#1A2A38` | **teal `#0F3C49`** |
| Accento 2° | — | **teal `#2F7281`** + tint `#E6EFEC` |
| Font | Outfit | **Inter** (400/500/600/**700**) |
| Titoli | max 600 | **700**, tracking negativo |
| Testo | `#231F1B` | `#22303A` |
| Canvas | `#EFE9E0` | `#ECE3D5` (bg contenuto `#F4ECE0`) |
| Abbonato | `#5B8DEF` | **`#5E9AA6`** |
| Giornaliero | `#E8843C` | **`#E89270`** |
| Icone | Iconify/Lucide | **Iconify/Lucide** (confermato) |

## 2. Decisioni prese (brainstorming)

- **Scope:** redesign **completo** — token + icone + tutti i componenti `ui-kit` + ristyling di
  tutte le viste esistenti + **nuove** viste **Login**, **Registrazione**, **Stabilimento**.
- **Branch:** nuovo `feat/coralyn-redesign-fe` da `main` (isola dal branch auth non mergiato).
- **Icone:** **Iconify/Lucide confermato** (ADR-0018 invariato). Si **estende** il registry con le
  icone usate dal design; nessuno sprite custom.
- **ADR-0027:** **riscritto in loco** per documentare la decisione reale (sidebar teal, Inter,
  `#E0795A`, accento teal, titoli 700, colori-stato rivisti). ADR-0018 superato **solo** per
  palette/tipografia (non per le icone).
- **Meccanismo token:** invariato — Tailwind v4 `@theme` in `packages/ui-kit/src/styles/theme.css`
  (consumato via CSS variables nelle classi arbitrarie). Cambio = solo valori + nuovi ruoli.
- **Fonte:** locale `Coralyn.dc.html` (no MCP import).

## 3. Architettura (invariata, ADR-0017)

`token (@theme) → ui-kit (primitivi headless Reka UI + componenti base) → shell/layout → viste`.
Build già pronta: Vite + Vue 3 + Tailwind v4 (`@tailwindcss/vite`) + `unplugin-icons`
(`@iconify-json/lucide`, compiler vue3) + Reka UI + Pinia + vue-router + TanStack Query + MSW + PWA.

## 4. Layer Token — Coralyn (`theme.css`)

Due livelli: **primitive** (palette grezza) → **semantic** (ruoli consumati dai componenti).
Valori estratti 1:1 dal canvas/bundle.

### 4.1 Primitive (estratto)

```
/* Brand corallo */         coral-500 #E0795A · coral-600 #C9603F · coral-700 #B65A38 · coral-100 #FBE8DF
/* Teal sidebar/profondo */ teal-900 #0B3543 · teal-800 #0F3C49 · teal-700 #16505E · teal-650 #1A5666
                            · teal-600 #23606E · teal-divider #1C4E5B
/* Teal accento (chiaro) */ teal-accent #2F7281 · teal-accent-tint #E6EFEC · #E2EDEE
/* Testo su teal */         on-teal #CFE0DF · on-teal-strong #F6EEE1 · on-teal-muted #6E9197/#7FA0A6/#577A80 · on-teal-2nd #9FBCC0
/* Neutri caldi */          warm-000 #FFFFFF · #FCFAF5 · warm-050 #FBF6EE · #FBF4E6/#F6EAD3 (stage) ·
                            warm-100 #F4ECE0 (bg) · warm-200 #ECE3D5 (canvas) · #EDE3D4 (segmented)
/* Bordi */                 #E7DCCB (principale) · #E0D5C3 (input) · #F1EADC (riga tabella) · #ECDFC8 (stage) · #E2D6C3 (segmented)
/* Ink */                   #22303A (testo/titoli) · #2B2722 (body canvas) · #5E5648 (2°/label) ·
                            #8A7E6B (seg inattivo) · #978C7B (muted) · #B3A998 (placeholder)
/* Stati mappa */           libero #8FBF9E · abbonato #5E9AA6 · giornaliero #E89270 · prenotato #F1C879
                            · inks (scuri, AA): #1E3A16 / #102945 / #3A1E08 / #4A3711 · normale-mark #D8CDBB
/* Mare */                  #E0EFF3→#BEDDE8→#A8D0DE · sea-ink #2E6B81
/* Feedback (bg/ink) */     success #E7F1E9/#3E7A53 · warning #FBF1DA/#9A7322 · danger #FBE3E0/#A33A2C (border #EBB7AF, text #C8503E) · info #4F86E0
/* "In arrivo" */           bg #F1E8D8 · ink #B7A98F
```

### 4.2 Semantic (ruoli)

```
--color-canvas #ECE3D5 · --color-bg #F4ECE0 · --color-surface #FFFFFF · --color-raised #FBF6EE
--color-border #E7DCCB · --color-border-input #E0D5C3 · --color-border-row #F1EADC
--color-text #22303A · --color-text-2nd #5E5648 · --color-text-muted #978C7B · --color-placeholder #B3A998
--color-brand #E0795A · --color-brand-hover #C9603F · --color-brand-ink #B65A38 · --color-brand-tint #FBE8DF
--color-accent #2F7281 · --color-accent-tint #E6EFEC
--sidebar-bg #0F3C49 · --sidebar-raised #16505E · --sidebar-border #23606E · --sidebar-divider #1C4E5B
--on-sidebar #CFE0DF · --on-sidebar-strong #F6EEE1 · --on-sidebar-muted #6E9197
--state-libero/-abbonato/-giornaliero/-prenotato (+ -ink) · --color-sea-* · --color-success/-warning/-danger/-info (+ -bg/-ink)
--shadow-card 0 1px 3px rgba(15,60,73,.05) · --shadow-drawer 0 12px 40px rgba(15,60,73,.13)
--shadow-modal 0 24px 70px rgba(11,53,67,.34) · --shadow-brand 0 2px 8px rgba(224,121,90,.3)
--ring-focus 0 0 0 3px rgba(224,121,90,.16) (+ bordo --color-brand)
--radius-sm 9px · --radius-md 11px · --radius-lg 16px · --radius-xl 18px · --radius-full 999px
--font-sans 'Inter', system-ui, … · pesi 400/500/600/700
```

> **A11y:** contrasti testo AA; l'etichetta cella usa **sempre ink scuro** per-stato; colore mai unico
> veicolo (testo + `aria-label`); focus sempre visibile. Verifica contrasto stato↔ink (CI, già prevista).

## 5. Layer Icone (Iconify/Lucide — ADR-0018)

Si mantiene `<Icon name>` + `icons` registry (`packages/ui-kit/src/icons/registry.ts`), tree-shaken
via `~icons/lucide/*` (offline, PWA-safe). **Si estende** il registry con le icone usate dal canvas,
mappate al nome Lucide più vicino:

| chiave registry | Lucide | uso |
|---|---|---|
| già presenti | map, calendar, users, tag, bar-chart-3, shield, search, umbrella, tree-palm, leaf, plus, star, check, x, chevron-left, chevron-right | nav/mappa/azioni |
| **nuove** | bell, settings (gear), euro, clock, phone, mail, refresh-cw (renew), pencil (edit), log-out (logout), building-2, layers, filter, chevron-down, arrow-up, arrow-down, waves (wave), dot/circle | topbar, drawer, report, scheda, stabilimento, listino |

Contratto invariato: `Tipologia.icona` = chiave del registry, fallback `umbrella`.

## 6. Layer Componenti (`ui-kit`)

Stati comuni: default / hover / active / focus-visible / disabled. Tutto via token.

**Aggiornati**
- **Button** — varianti `primary` (corallo, `--shadow-brand`), `secondary` (outline: bordo `--color-border`,
  bg `--color-raised`, testo `--color-accent`), `ghost`, `danger` (link/outline `--color-danger`). Raggio `md`.
- **Input / Field / Textarea** — bordo `--color-border-input`, raggio `md`, focus = bordo brand + `--ring-focus`;
  label `13px`/600 `--color-text-2nd`; help/errore `xs`.
- **Card** — `--color-surface`, raggio `lg/xl`, `--shadow-card`, bordo `--color-border`.
- **Badge** — pill; varianti di stato (success/warning/danger/info), **tipologia** (accent-tint + icona),
  **ruolo** (Admin/Staff/Superuser), **"in arrivo"** (neutra). Coppie bg/ink dal §4.1.
- **Icon** — invariato (estensione registry).
- **DataTable** — header `10.5px` maiuscolo `tracking` `--color-text-muted`, bg header `--color-raised`,
  righe `13px`, divisori `--color-border-row`, numeri `tabular-nums` a destra, riga cliccabile (hover).
- **Drawer** — Reka UI; nel layout mappa è **pannello affiancato** (340px) sul desktop, bottom-sheet su tablet.
- **OmbrelloneCell** — 4 assi invariati; **ristyling**: fill = nuovi `--state-*`, ink scuro per-stato,
  marcatore tipologia = cerchio bianco + icona `--color-accent`, selezione = anello brand.

**Nuovi**
- **Avatar** — iniziali, tinta per-cliente (coppie bg/ink), size sm/md/lg.
- **SegmentedControl** — toggle a pill (settori mappa, filtri prenotazioni): bg `#EDE3D4`, item attivo
  `--color-surface` + ombra; inattivo `--color-text-muted`. ARIA `tablist`/`tab`.
- **Modal / Dialog** — Reka UI Dialog centrato; scrim `rgba(11,53,67,.46)`, `--shadow-modal`, raggio `xl`.
- **StatTile** — riquadro numerico (`#FBF6EE`) per "Struttura della spiaggia".
- **KpiCard** — icona tinta + valore `28px`/700 `tabular-nums` + trend (freccia + colore).
- **BarChart** / **StackedBar** — leggeri, solo div + token (incassi 7 giorni; mix stato ombrelloni).

## 7. Shell, Layout e Viste

### 7.1 Shell e layout
- **AppShell** — `display:flex` a tutta altezza: sidebar teal a sinistra (248px), `main` con topbar
  sticky + area scroll. (Sostituisce il layout "a card su canvas" attuale, in linea col canvas.)
- **Sidebar** — bg `--sidebar-bg`; logo Coralyn + wordmark; **switcher stabilimento** (card raised);
  eyebrow "OPERATIVO"; nav (Mappa/Prenotazioni/Clienti/Listino/Report) con **dot corallo** sull'attiva;
  in fondo **Console · super** (gated `Ruolo.Superuser`), divisore, **footer utente** (avatar iniziali,
  email, ruolo, azione esci). Responsive → rail icone su tablet (ADR-0019).
- **Topbar** — `--color-raised` con bordo inferiore: **titolo + sottotitolo** (da route meta) ·
  **navigatore data** (pill `‹ Sab 27 giu 2026 ›`, `tabular-nums`) · **ricerca** (pill) · **bell** con dot.
- **AuthLayout** — split: pannello sinistro gradiente teal (`#1A5666→#0F3C49→#0B3543`) con logo, headline,
  bullet; pannello destro form. Usato da Login e Registrazione (fuori dall'AppShell).

### 7.2 Viste (mappate ai tipi di `@coralyn/contracts`)
| Vista | Route | Note |
|---|---|---|
| **Mappa** | `/mappa` | SegmentedControl settori · stage (sand gradient, header "Mare", file di celle, Speciali/Palme, legenda Stato+Tipologia) · Drawer contestuale (chip tipologia, crumb, Mattina/Pomeriggio split, dettaglio prenotazione, stato pagamento, azioni). Dati: `MappaGiornoDTO`. |
| **Prenotazioni** | `/prenotazioni` | SegmentedControl (Tutte/Confermate/Bozze/Concluse) · Filtri · Nuova · tabella (avatar, badge stato, incasso `tabular-nums`). |
| **Clienti** | `/clienti` | ricerca · count · Nuovo cliente · tabella; riga → scheda. Dati: `ClienteDTO`. |
| **Scheda cliente** | `/clienti/:id` | back · header sintesi (avatar 60px, contatti) · card Anagrafica · 3 card placeholder **"In arrivo"** (Abbonamento/Storico/Pagamenti). |
| **Listino** | `/listino` | selettore stagione · pacchetti (grid 3 card) · fasce (chip) · tabella tariffe. |
| **Report** | `/report` | 4 KpiCard · BarChart incassi 7gg · StackedBar mix stato · lista abbonamenti in scadenza (Rinnova). |
| **Stabilimento** (nuovo) | `/stabilimento` | header logo · Informazioni · Struttura (StatTile) · Utenti e ruoli (badge ruolo, "Tu") · Sessione/Esci. |
| **Console** | `/console` | gated `Superuser`; ristyling minimale coerente. |
| **Login** (nuovo) | `/login` | AuthLayout; form email/password, stato errore, link a registrazione. |
| **Registrazione** (nuovo) | `/registrazione` | AuthLayout; "Crea il tuo stabilimento" (nome, email, password+conferma). |

### 7.3 Routing, sessione, dati mock
- Aggiungere route `/login`, `/registrazione` (rese **fuori** dall'AppShell), `/stabilimento`.
- Route meta `{ title, subtitle }` per pilotare la Topbar.
- **Seam auth mock** (il vero auth vive sul branch backend, qui fuori scope): `session` ottiene un flag
  `authenticated`; il guard reindirizza a `/login` se non autenticato; "Accedi"/"Crea stabilimento"
  → `authenticated=true` → `/mappa`; "Esci" → `/login`. Aggiungere a `session`: `utenteEmail`, `ruolo`
  display; aggiornare `nomeStabilimento` → "Lido Maestrale", `dataAttiva`.
- Dati delle nuove sezioni (Prenotazioni/Listino/Report/Stabilimento) via **MSW** + seed coerenti col
  canvas; nessun nuovo contratto backend richiesto in questa fase.

## 8. Documentazione (Definition of Done)

1. **`theme.css`** riscritto (§4) — fonte token.
2. **`design-system.md`** riscritto sui valori reali (palette, Inter, titoli 700, accento teal, sidebar
   teal, stati mappa rivisti, raggi, ombre, icone Iconify confermate).
3. **ADR-0027** riscritto in loco: decisione reale "Mediterraneo Caldo" (valori §4), supera ADR-0018
   **solo** per palette/tipografia; icone Iconify/Lucide **confermate**.
4. **ADR-0020** — nota di aggiornamento colori-stato (Abbonato `#5E9AA6`, Giornaliero `#E89270`).
5. **`design/README.md`** — pointer mockup → `Coralyn.dc.html` / bundle (corrente).
6. **PWA manifest** (`vite.config.ts`) — `theme_color` `#E0795A`, `background_color` `#ECE3D5`.
7. **`deferred.md`** — se emergono tagli (es. ricerca globale, gestione utenti reale), tracciati lì.

## 9. Fuori scope / Deferred

- Auth reale FE (login→JWT) — vive sul branch backend; qui solo seam mock.
- Ricerca globale funzionante, notifiche reali, gestione inviti utenti — placeholder/"in arrivo".
- Sezioni Scheda cliente (abbonamento/storico/pagamenti) — placeholder come da design.
- Telefono < 768px — fuori MVP (ADR-0004); tablet degrada in modo accettabile.

## 10. Verifica

- `pnpm --filter @coralyn/web-staff typecheck` + build verdi.
- Test esistenti (`OmbrelloneCell`, `Button`, `Icon`, viste con spec) **verdi** dopo il ristyling;
  aggiornare assert legati ai vecchi token/teal dove necessario.
- Confronto visivo schermata-per-schermata col bundle `Coralyn - Gestionale Lidi.html` (desktop 1280).
- Nessun valore magico (hex/px) nei componenti fuori dai token (disciplina ADR-0017).

## 11. Rubric check (ADR-0002)

1. **Professionalità** — fedeltà pixel al design approvato, contrasti AA, palette curata.
2. **Convenzioni** — token-first/`@theme`, Iconify/Lucide, Reka UI, struttura ADR-0009; nessuna deviazione.
3. **Modularità** — token semantici separati dai grezzi; componenti `ui-kit` isolati e riusati dalle viste;
   nuovi componenti (Avatar/SegmentedControl/Modal/KpiCard) promossi correttamente (regola di promozione).
4. **Zero debito** — doc riallineata alla realtà (no ADR fantasma); seam auth mock esplicito e tracciato;
   tagli in `deferred.md`.
