# Handoff — Esecuzione Frontend, slice 1 (`apps/web-staff`)

- **Data:** 2026-06-28
- **Scopo:** permettere a un nuovo agente, in **sessione fresca**, di **eseguire** da zero il primo
  slice del frontend di Driftly seguendo il [Piano FE](../plans/2026-06-28-web-staff-foundation.md),
  con `subagent-driven-development`, su **branch** `feat/web-staff` (**niente worktree**),
  **sequenzialmente** rispetto al backend. Design e piano sono **già fatti e su `main`**: questa
  sessione **scrive codice d'app**.

## 0. Il tuo compito in una frase

Esegui **interamente** il [Piano FE](../plans/2026-06-28-web-staff-foundation.md) (13 task) e
realizza lo **slice 1**: **app-shell + `@driftly/ui-kit` + Clienti + Mappa (mockata)**, come
*walking skeleton* dell'app staff. Niente di più (no Prenotazioni/Listino/Report reali, no
TanStack Table: sono slice successivi).

## 1. Skill e metodo (obbligatorio)

- All'inizio sessione applica **`superpowers:using-superpowers`**.
- Esegui con **`superpowers:subagent-driven-development`** (raccomandato: subagent fresco per task +
  **due review per task** — prima spec-compliance, poi code-quality). In alternativa
  `superpowers:executing-plans`.
- **OVERRIDE esplicito dell'utente:** **NIENTE worktree.** Si lavora **solo con branch**, in modo
  **sequenziale** col backend. **Non** usare `using-git-worktrees`: crea un branch normale
  `git checkout -b feat/web-staff` da `main`.
- **TDD** dove il piano lo prescrive (Icon, Button, http client, ClientiView, OmbrelloneCell):
  scrivi prima il test che fallisce, poi l'implementazione minima — non saltare il "rosso".
- Prima di dichiarare "fatto" usa **`superpowers:verification-before-completion`** (mostra l'output
  dei comandi). Alla fine usa **`superpowers:finishing-a-development-branch`**.

## 2. Contesto prodotto

**Driftly** (codename provvisorio, brand rimandato [D-017](../architecture/deferred.md)) è un
**gestionale SaaS multi-tenant per lidi balneari**. Si sta costruendo il **Core operativo (MVP)**.
Disambiguazione: **`Cliente` = il bagnante**; il **tenant** è lo **`Stabilimento`** (mai
"cliente" nel codice). Vedi [glossario](../architecture/glossary.md).

## 3. Stato attuale del repo (preciso, al 2026-06-28)

- **`main` pulito.** Monorepo `@driftly/*` (pnpm workspaces) con `packages/contracts` (espone
  **solo** `Ruolo` + `ClienteDTO`). **`apps/` NON esiste ancora**: lo crei tu (Task 1).
- **Design FE completo e su `main`:** ADR **0017–0021**, [design-system.md](../design/design-system.md)
  (token + linguaggio componenti, **ink scuro per-stato per AA**), mockup di produzione
  [frontend-app-shell.html](../design/mockups/frontend-app-shell.html).
- **Piano FE su `main`:** [docs/plans/2026-06-28-web-staff-foundation.md](../plans/2026-06-28-web-staff-foundation.md) — **il copione da eseguire**.
- **Backend Piano 1:** **Task 1–2 fatti** (monorepo + contracts); **Task 3–7 NON fatti** → gli
  endpoint `GET /health` e `GET/POST /clienti` **non sono ancora attivi**.
- **Audit di coerenza docs già fatto e fix applicati** (worktree→branch, indice ADR-0021,
  convenzione icona, `main-screen` storico, mockup self-contained): **non ripeterlo**, il piano è
  già allineato.
- **Ambiente:** Node 24, pnpm 10, Docker. Windows 11, shell **PowerShell** (+ **Bash** POSIX). I
  comandi del piano sono POSIX: eseguili con Bash o adattali a PowerShell.

## 4. Cambio di direzione — CRITICO (leggi due volte)

- **NIENTE worktree.** Solo **branch** `feat/web-staff` da `main`.
- **Esecuzione sequenziale** col backend (non due sessioni concorrenti). Confine di coordinamento =
  `packages/contracts`.
- **Sequencing di "Clienti su API reale":** richiede il backend Piano 1 **Task 3–7** (`/clienti`).
  Finché non esistono, **sviluppo e test usano MSW** (anche per `/clienti`); la verifica
  end-to-end su API reale si fa **quando il backend è pronto**. **Non è un blocco**: lo slice 1 si
  completa contro MSW. In dev, il proxy Vite `/api → http://localhost:3000` colpirà il backend
  reale solo quando sarà attivo.

## 5. Principi NON negoziabili (l'utente ci tiene molto)

1. **Decision rubric** ([ADR-0002](../architecture/decisions/0002-decision-rubric.md)): ogni
   decisione pesata su **professionalità, convenzioni, modularità, zero debito**.
2. **Un ADR per ogni decisione architetturale** — file immutabili in
   `docs/architecture/decisions/`, **numerazione libera dal 0022**; cambi via *supersede*; rinvii in
   [`deferred.md`](../architecture/deferred.md). Se aggiungi un ADR, **aggiorna l'indice** in
   [architecture/README.md](../architecture/README.md). Le scelte **tattiche** stanno già nel piano
   (sezione "Scelte tattiche"): non servono ADR nuovi salvo decisioni davvero nuove.
3. **Lingua** ([ADR-0003](../architecture/decisions/0003-language-convention.md)): codice **EN**,
   dominio **IT** (`Stabilimento`, `Cliente`, `Ombrellone`, `Fila`, `Fascia`, `Tipologia`…), docs/UI **IT**.
4. **Commit atomici per task/step**, messaggi tecnici in inglese, ognuno col trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
5. **Stile utente:** ragiona a fondo; quando una scelta è aperta dai una **raccomandazione netta
   motivata per rubrica**, non un elenco neutro. **Comunica in italiano.** Vedi `MEMORY.md`.

## 6. Vincoli FE già decisi — NON rilitigare (ADR accettati)

- [ADR-0017](../architecture/decisions/0017-design-system-frontend.md): design system **token-first**,
  **Tailwind sui token**, **Reka UI** (headless), **TanStack Table** (tabelle complesse, *slice 2+*),
  tutto in **`packages/ui-kit`**.
- [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md): "Costiero professionale"
  (teal/navy/sabbia + neutri freddi), **Inter** + `tabular-nums`, **Iconify bundled/offline + Lucide**,
  stati mappa (Libero/Abbonato/Giornaliero/Prenotato).
- [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md): app-shell a card, sidebar a sezioni,
  **drawer contestuale in overlay**, responsive desktop↔tablet, **PWA**.
- [ADR-0020](../architecture/decisions/0020-resa-mappa.md): mappa **HTML/CSS**, **`OmbrelloneCell` a
  4 assi** (etichetta/stato-split-per-fascia/marcatore tipologia/selezione), **a11y** (`<button>` +
  `aria-label`).
- [ADR-0021](../architecture/decisions/0021-server-state-frontend.md): **server-state =
  TanStack Query**, **stato UI = Pinia**; validazione runtime (zod) rimandata ([D-021](../architecture/deferred.md)).
- [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md): etichetta = numero fisico
  reale; Tipologia ortogonale; speciali come Settore dedicato.
- [design-system.md](../design/design-system.md): **spec implementativa** dei token (`@theme`) e dei
  componenti (incluso l'**ink scuro per-stato** per il contrasto AA).

## 7. Scope confermato dello slice 1 + decisioni dell'utente

- **Scope:** app-shell + `ui-kit` (token + componenti base + `Icon` + `OmbrelloneCell`) + **Clienti**
  (verticale; su MSW finché il backend non espone `/clienti`) + **Mappa** (mockata MSW).
- **Brand:** **nome stabilimento** in topbar (es. "Lido Sole"); "Driftly" **discreto** (D-017).
- **PWA:** **offline-light** (manifest + precache della shell); il SW della PWA è **disattivo in
  dev** (`devOptions.enabled: false`) per non confliggere col service worker di **MSW**.

## 8. Mappa dei 13 task del piano (ordine = dipendenze; esegui in sequenza)

1. Scaffold `apps/web-staff` (Vite vue-ts) + wiring workspace.
2. `@driftly/ui-kit` skeleton + **token in `@theme`**.
3. **Tailwind v4** sui token (consumo del tema nel web-staff).
4. **Vitest** + componente **`<Icon>`** offline (unplugin-icons + registry) — TDD.
5. Componenti base ui-kit (Button, Card, Badge, Field, Input).
6. **Session store** (Pinia) + Router + **app-shell** (Topbar/Sidebar/AppShell) con **console gated**.
7. **Data-layer**: http client (header `X-Stabilimento-Id`) + TanStack Query — TDD.
8. **Handshake DTO**: estendi `@driftly/contracts` con i DTO mappa (proposta FE).
9. **MSW** (mock Mappa) + wiring dev/test.
10. **Clienti** (query + mutation; tabella + form) — TDD con MSW.
11. **Mappa**: `OmbrelloneCell` (TDD a11y) + `Drawer` (Reka UI) + render dal mock.
12. **PWA** (vite-plugin-pwa: manifest + precache).
13. Lint/typecheck + **Definition of Done**.

## 9. Punti tecnici da verificare in esecuzione (NON blocchi noti; se un test/cmd fallisce, debugga con `systematic-debugging`)

- **Tailwind v4 CSS-first** (`@tailwindcss/vite` + `@theme`): verifica che le CSS variables dei
  token siano emesse su `:root` e che le classi arbitrarie (`bg-[var(--color-...)]`) rendano.
- **Icone offline**: `unplugin-icons` + `@iconify-json/lucide`; le chiavi del registry sono **nomi
  nudi** (es. `palmtree`, `leaf`); aggiungi `"unplugin-icons/types/vue"` ai `types` del tsconfig che
  compila `src` (di solito `tsconfig.app.json`).
- **MSW v2** (`http`/`HttpResponse`): in **dev** mocka `/api/mappa` e lascia passare `/api/clienti`
  (`onUnhandledRequest: 'bypass'`); in **test** mocka tutto (anche `/api/clienti`).
- **PWA vs MSW**: `devOptions.enabled: false` → in dev il SW attivo è quello di MSW; il SW PWA solo
  in build/preview.
- **Inter offline**: nel `ui-kit` va **bundled** (es. `@fontsource/inter`); il *mockup* di design
  usa solo il fallback di sistema (è un doc, non l'app).
- **Test env jsdom**: il `fetch` relativo (`/api/...`) richiede una base URL; se serve, imposta
  `test.environmentOptions.jsdom.url` in `vitest.config.ts`.
- **Vite proxy**: `/api → http://localhost:3000` (backend Piano 1) con `rewrite` che toglie `/api`.

## 10. Handshake col backend (confine = `packages/contracts`)

Il piano (**Task 8**) propone in `contracts` i DTO mappa: `StatoSlot`, `TipologiaDTO`
(`icona` = **chiave del registry icone**, non nome Iconify completo), `FasciaDTO` (proiezione
ridotta), `OmbrelloneDTO`, `FilaDTO`, `SettoreDTO`, `MappaGiornoDTO`. Commit dedicato
`feat(contracts): propose map DTOs ... [FE handshake]`. **Coordina col backend** per allinearli al
dominio ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)/[ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md));
non rinominare i termini di dominio. `Tipologia.icona` è additiva (fallback FE finché manca).

## 11. Ownership / confini

- **Possiedi** `apps/web-staff` e `packages/ui-kit`; **consumi** `packages/contracts` (puoi
  **proporre** i DTO mappa). **NON toccare `apps/api` né `prisma`** (sono del backend).
- Lavora su **`feat/web-staff`**. Commit atomici per task/step.

## 12. Documenti da leggere (in ordine, prima di toccare codice)

1. [Piano FE](../plans/2026-06-28-web-staff-foundation.md) — **il copione**.
2. [design-system.md](../design/design-system.md) — token e componenti.
3. ADR [0017](../architecture/decisions/0017-design-system-frontend.md)–[0021](../architecture/decisions/0021-server-state-frontend.md) + [0016](../architecture/decisions/0016-tipologia-ombrellone.md).
4. [spec UI/UX FE](../specs/2026-06-28-frontend-ui-ux-design.md) + [mockup](../design/mockups/frontend-app-shell.html).
5. [data-model](../design/data-model.md), [flows](../design/flows.md); [deferred](../architecture/deferred.md) (D-017, D-021, D-008, D-003, D-020); [glossario](../architecture/glossary.md).
6. [Architettura viva](../architecture/README.md); [Piano 1 backend](../plans/2026-06-28-core-foundation.md) (per `/clienti` e l'header `X-Stabilimento-Id`).
7. Questo handoff + `MEMORY.md`.

## 13. Definition of Done dello slice 1 (dal piano — non dichiarare "fatto" senza)

- `pnpm install` ok; `@driftly/ui-kit` e `@driftly/web-staff` agganciati al workspace.
- App-shell (topbar col nome stabilimento, sidebar a 5 sezioni + **console gated**), routing, layout a card sui token.
- `ui-kit` token-first; componenti base + `Icon` (offline) + `OmbrelloneCell`.
- **Clienti**: elenco + creazione (TanStack Query, invalidazione dopo create) — **verificato via MSW** finché il backend non espone `/clienti`.
- **Mappa**: render dal mock MSW, cella a 4 assi (ink AA, `aria-label`), drawer contestuale.
- **PWA** installabile (shell precache); SW PWA off in dev.
- **contracts**: DTO mappa proposti e buildano.
- **Test verdi**, **typecheck** pulito, **lint** pulito; commit atomici; working tree pulito.

## 14. Prima mossa consigliata

`using-superpowers` → leggi §12 → `git checkout -b feat/web-staff` (**NO worktree**) →
`subagent-driven-development` per i 13 task (due review per task, TDD) →
`finishing-a-development-branch`. Comunica in italiano; raccomandazioni nette per rubrica.
