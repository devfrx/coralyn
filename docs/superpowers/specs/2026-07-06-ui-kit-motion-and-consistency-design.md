# Design — ui-kit: fondazioni di motion + sweep di coerenza (A+B)

> Slice di **qualità/design visivo** sui componenti condivisi `@coralyn/ui-kit`, non di dominio.
> Workflow [ADR-0009](../../architecture/decisions/0009-documentazione-di-design.md): spec → piano TDD →
> subagent-driven (un commit per layer, TDD, review a due stadi) → verifica LIVE (`preview_*`) →
> **presenta e attendi conferma dopo ogni slice**. Push su `main` = FF con ok esplicito.
> Deriva dal brainstorming del 2026-07-06 (scelte: livello = componenti ui-kit condivisi;
> dimensioni = stati/varianti mancanti + micro-interazioni/motion + coerenza trasversale;
> strade scelte = **A** motion & stati fondanti + **B** sweep di coerenza).

## 1. Contesto e problema

Il design system è maturo e ben tokenizzato ([theme.css](../../../packages/ui-kit/src/styles/theme.css):
colori/spazi/radius/shadow/easing come variabili CSS; i componenti non hardcodano), ma diversi
componenti sono volutamente "sottili" e manca uno strato di movimento. Audit del 2026-07-06:

- **Motion assente ovunque.** `Modal`/`Drawer` usano reka-ui ma senza animazioni di entrata/uscita
  (overlay senza fade, pannello senza slide/scala); `Toast` senza enter/leave; `Button` solo
  `transition-colors`. I token `--ease-standard`/`--ease-emphasized` esistono ma sono quasi
  inutilizzati. Il killer globale `@media (prefers-reduced-motion: reduce)` in theme.css già
  neutralizza `animation`/`transition` → aggiungere motion è **sicuro** e accessibile per default.
- **Stati/varianti mancanti.** `Button`: niente taglie, niente `loading`, disabled solo `opacity`.
  `EmptyState`: è un solo `<p>` (niente icona/titolo/CTA → le pagine lo improvvisano).
- **Duplicazione/incoerenza.** Il close-button è markup identico in `Modal`, `Drawer` e `Toast`
  (niente hover, niente focus-ring); focus-ring e pattern disabled applicati a macchia di leopardo.

## 2. Obiettivi / Non-obiettivi

**Obiettivi**
- Introdurre uno **strato di motion token-driven** e applicarlo agli overlay e ai toast.
- Completare gli **stati/varianti** dei componenti a più alto traffico (`Button`, `EmptyState`).
- Estrarre **un** primitivo condiviso `IconButton` ed eliminare la duplicazione dei close-button.
- **Sweep di coerenza** su focus-ring/hover/disabled/radius/padding degli interattivi restanti.
- **Non regredire** la baseline test: ui-kit **79** · web-staff **284** · web-platform **16** ·
  api unit **209** · api e2e **243** · typecheck pulito. (api non è toccata da questa slice.)

**Non-obiettivi (rinvii dichiarati)**
- **Toast multi-tono** — nessun caller (`pushToast(message)` è error-only). Deferito a quando
  esisterà un bisogno reale di success-toast (richiederà estendere la firma + `ToastHost`).
- **`Field→Input` invalid / stati `DataTable` loading-empty-error** — sono l'Approccio **C**
  (completezza form/dati), slice separata futura.
- **Modifiche a token/palette** — fuori scope per scelta iniziale (niente refresh design system).
- Nessun cambio di dominio, contracts, API o schema.

## 3. Principi di design

- **Token-driven:** ogni durata/easing/scala di movimento passa da variabili CSS in theme.css.
  Nessun valore di motion hardcoded nei componenti.
- **Reka-ui come sorgente di stato:** le animazioni di overlay si agganciano a `data-[state=open]`
  / `data-[state=closed]` esposti da `DialogOverlay`/`DialogContent`; niente stato di animazione
  gestito a mano nei componenti.
- **Retro-compatibilità:** ogni componente esistente resta usabile con la stessa API pubblica;
  le aggiunte sono opzionali (nuove prop con default, nuovi slot). Nessun call-site rotto.
- **Riuso prima di creazione** (dev-discipline): un solo `IconButton`, non tre close diversi.
- **Accessibilità:** focus-visible ring su ogni interattivo; `aria-label` sui bottoni icon-only;
  motion neutralizzato da reduced-motion; `aria-busy`/disabled coerenti nel loading.

## 4. Le sei slice

> Ogni slice = un incremento TDD autoconsistente, con presentazione e conferma prima della successiva.
> Le slice sono ordinate perché B (primitive) preceda ciò che A consuma.

### Slice 0 — Primitive di motion (fondazione, puramente additiva)
Aggiungere in `packages/ui-kit/src/styles/` (es. nuovo `motion.css` importato accanto a theme.css,
oppure blocco in theme.css) i token di durata e i `@keyframes`:
- Token: `--motion-fast` (~140ms), `--motion-base` (~200ms), `--motion-slow` (~260ms) —
  valori indicativi, da rifinire LIVE.
- Keyframes: `overlay-fade-in/out`, `dialog-in/out` (fade + `scale(.97)→1` + lieve translate),
  `drawer-in/out` (slide da destra), `toast-in/out` (slide/fade dal basso-destra).
- Tutti usano `--ease-standard`/`--ease-emphasized`. Nessun componente cambia comportamento in
  questa slice: solo CSS disponibile. Il killer reduced-motion già le disabilita.

**Test:** smoke/statico (le keyframes esistono, i token sono definiti). Nessuna regressione runtime.

### Slice 1 — Motion degli overlay
- `Modal.vue` / `Drawer.vue`: applicare classi che animano su `data-[state=open]`/`data-[state=closed]`
  a `DialogOverlay` (fade) e `DialogContent` (dialog-in/out o drawer-in/out). reka-ui tiene in vita
  il nodo durante la chiusura per la durata dell'animazione (comportamento standard delle keyframes
  su data-state; verificare LIVE che l'uscita si veda).
- `ConfirmDialog` eredita gratis (incapsula `Modal`).
- `Toast`: l'entrata/uscita della **lista** va orchestrata dal contenitore → wrappare i toast in un
  `<TransitionGroup>` nei due `ToastHost.vue` (web-staff **e** web-platform), con classi enter/leave
  che usano le keyframes toast. Il componente `Toast.vue` resta un leaf (riceve solo le classi).

**Test:** unit di presenza classi/attributi dove sensato; **verifica LIVE** con `preview_*`
(apertura/chiusura Modal, Drawer, comparsa/scomparsa Toast) — il motion non si unit-testa a fondo.

### Slice 2 — Primitiva `IconButton` condivisa
- Nuovo `packages/ui-kit/src/components/IconButton.vue`: bottone **icon-only** con
  `variant` (almeno `ghost` | `subtle`), `size` (sm/md), `aria-label` obbligatoria (prop o `$attrs`),
  hover, **focus-visible ring** (`var(--ring-focus)`), disabled coerente. Usa `Icon` internamente
  (prop `icon`) oppure espone slot per l'icona — da decidere nel piano, preferendo `icon` per uniformità.
- Rifattorizzare i close di `Modal`, `Drawer`, `Toast` per usarlo (comportamento identico: stessa
  `aria-label` "Chiudi", stesso `@click`/`DialogClose`). Markup unificato, hover+focus aggiunti.
- Export in `packages/ui-kit/src/index.ts`.

**Test:** spec `IconButton.spec.ts` (render, aria-label, click, disabled, focus-ring class);
aggiornare gli spec di Modal/Drawer/Toast se asseriscono il markup del close (probabile:
selezionare per `aria-label`, non per struttura). **Attenzione:** web-staff globa gli spec ui-kit →
il nuovo spec conta in entrambe le suite (aggiorna la baseline attesa in modo consapevole).

### Slice 3 — Completezza `Button`
- `size`: `sm` | `md` (default `md` = attuale). Padding/altezza/font per taglia via classi token.
- `loading?: boolean`: mostra spinner (`loader-2`, animato con `animate-spin`/keyframe), nasconde o
  affianca lo slot, imposta `disabled` + `aria-busy="true"`, previene il click.
- Feedback di **press**: `active:` con lieve scala/translate via easing token; transizione estesa
  oltre `colors` dove opportuno (con reduced-motion neutro).
- Focus-ring già presente: mantenere; disabled coerente con `IconButton`.
- **Icon-only NON su Button**: delegato a `IconButton` (niente duplicazione).
- **Registry:** aggiungere `loader-2` (`~icons/lucide/loader-2`) in
  [registry.ts](../../../packages/ui-kit/src/icons/registry.ts) — il registry è il gatekeeper.

**Test:** estendere `Button.spec.ts` (size, loading→disabled+aria-busy+spinner, click bloccato in
loading); `Icon.spec.ts`/registry se serve asserire la nuova icona.

### Slice 4 — `EmptyState` strutturato
- Nuove prop opzionali: `icon?` (nome registry), `title?`; slot default = corpo/messaggio (retro-compat
  con `message` e con `<slot>`); slot `action` per la CTA. Layout centrato: icona in cerchio tenue →
  titolo → messaggio → azione. Mantiene bordo tratteggiato e i token attuali.
- Adeguare i call-site che oggi improvvisano un empty (censirli nel piano; aggiornamento minimale,
  senza cambiare copy se non necessario).

**Test:** `EmptyState.spec.ts` (retro-compat `message`; con icon+title+action slot); spec dei
call-site aggiornati se asseriscono la vecchia struttura.

### Slice 5 — Coda di coerenza (sweep)
- Audit degli interattivi restanti: `Select`, `SegmentedControl`, `SearchInput`, righe `DataTable`,
  `PageToolbar`, `Textarea`. Uniformare: **focus-visible ring**, hover, **disabled**, radius/padding
  agli standard; applicare i token di motion dove esiste già una transizione (es. hover).
- Documentare lo standard risultante (breve nota nel design system / commento condiviso).
- **Nessun cambiamento funzionale**: solo allineamento visivo/di stato. Ogni modifica verificata
  che non alteri gli spec esistenti (o aggiornati con motivazione).

**Test:** aggiornare/estendere gli spec toccati; verifica LIVE a campione (`preview_*`).

## 5. Decisioni risolte (con l'utente, 2026-07-06)
1. **Primitiva condivisa = `IconButton` generico** (non un `CloseButton` stretto): serve i close
   *e* le azioni icon-only sparse; un solo standard, più leverage. (ADR-0033.)
2. **Spinner:** aggiungere `loader-2` (lucide) al registry per il `loading` di `Button`.
3. **Scope = A+B in 6 slice**, con conferma tra una e l'altra; rinvii: Toast multi-tono,
   form/dati (Approccio C), token/palette.

## 6. Strategia di test e verifica
- **Baseline da non regredire** (§2). Comando e2e api non necessario (api non toccata), ma il
  typecheck e le suite FE/ui-kit sì.
- **Gotcha ui-kit↔web-staff:** `apps/web-staff/vitest.config.ts` globa gli spec ui-kit → ogni nuovo
  spec (es. `IconButton.spec.ts`) conta in **entrambe** le suite; aggiornare i conteggi baseline con
  consapevolezza. Componenti con teleport (reka-ui) nei test: `attachTo: document.body` +
  `document.querySelector`.
- **Motion = verifica LIVE:** i `preview_*` (dev server) per Modal/Drawer/Toast/Button; screenshot a
  prova. NON claude-in-chrome. Alternativa Docker `:8080`/`:8081` (immagini da rebuildare).
- **Contracts/Prisma:** questa slice non tocca contracts né schema; se un build accidentale azzera il
  Prisma client, `pnpm --filter @coralyn/api exec prisma generate` (solo se si eseguono i test api).
- **pnpm, mai npm.**

## 7. Rischi e mitigazioni
- **Regressione visiva diffusa (sweep, slice 5):** mitigata tenendo lo sweep puramente di stato/allineamento,
  verificando LIVE a campione e non toccando i token globali.
- **Uscita animazione non visibile (reka-ui):** se il nodo si smonta prima dell'animazione di leave,
  usare il pattern data-state keyframe standard e verificare LIVE; fallback = `Transition`/`presence`
  di reka-ui se necessario.
- **Baseline test spostata dai nuovi spec:** aggiornare i conteggi attesi in modo esplicito nel piano,
  non "a sorpresa".
- **Retro-compat `EmptyState`/close-button:** selettori di test per `aria-label`/ruolo, non per markup.

## 8. Ordine di consegna
Slice 0 → 1 → 2 → 3 → 4 → 5, ciascuna: TDD → review → verifica LIVE dove pertinente →
**presenta e attendi conferma**. Ogni slice è un commit-set coerente; il merge su `main` (FF) solo
con ok esplicito dell'utente.
