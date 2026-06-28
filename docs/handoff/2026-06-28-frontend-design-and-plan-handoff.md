# Handoff — Frontend: qualità visiva (`frontend-design`) e piano (`writing-plans`)

- **Data:** 2026-06-28
- **Scopo:** permettere a un nuovo agente, in sessione fresca, di riprendere **esattamente da
  qui**: portare il design del frontend di Driftly alla **qualità di produzione**
  (`frontend-design`) e scrivere il **PIANO eseguibile di `apps/web-staff`**
  (`writing-plans`), **in parallelo** all'esecuzione del backend (Piano 1), con
  `packages/contracts` come confine. Il *design* del frontend (ADR + spec) è **già fatto e su
  `main`**: questa sessione lo rifinisce e lo trasforma in un piano.

## 1. Missione del prossimo agente (in ordine)

1. **`frontend-design`** — elevare la **qualità visiva** del design system **già deciso**
   (token, componenti, app-shell, mappa) a livello produzione, evitando l'estetica "AI
   generica". Esito: raffinamento del linguaggio visivo / reference, eventuale base del
   `ui-kit`, mockup aggiornati ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
   **Resta ancorato agli ADR 0017–0020** (non ridiscuterli).
2. **`writing-plans`** — scrivere il **PIANO di `apps/web-staff`**, eseguibile **in parallelo**
   al Piano 1 backend. Deve includere: scaffolding di `apps/web-staff`, `packages/ui-kit`,
   sezioni + routing, mappa (`OmbrelloneCell`), **strategia mock-API (MSW)** + **handshake DTO**
   su `packages/contracts`, ownership/branch, Definition of Done.

> Usa `superpowers:brainstorming` **solo** se emergono scelte di design *nuove* (non già negli
> ADR); altrimenti vai diretto a `frontend-design` → `writing-plans`.

## 2. Stato attuale (al 2026-06-28)

- **Backend:** Piano 1 **Task 1–2 completati** (monorepo `@driftly/*` + `packages/contracts`
  skeleton) e committati su `main`; il backend ha anche aggiunto **[ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)**
  (Tipologia ombrellone). Branch corrente **`main`**, working tree pulito. Tool: **Node 24,
  pnpm 10, Docker**. Radice repo: `C:/Users/Jays/Desktop/new`.
- **Frontend design (deliverable 2) COMPLETO e su `main`:**
  [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) (design system),
  [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md) (linguaggio visivo + icone),
  [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) (app-shell/UX),
  [ADR-0020](../architecture/decisions/0020-resa-mappa.md) (resa mappa) +
  [spec UI/UX](../specs/2026-06-28-frontend-ui-ux-design.md) (Approvato) +
  [mockup](../design/mockups/frontend-app-shell.html) + rinvio [D-020](../architecture/deferred.md).
- **`packages/contracts`** esiste e builda; oggi espone **solo** `Ruolo` + `ClienteDTO`.

## 3. Decisioni FE già bloccate — NON rilitigare (sono ADR **accettati**)

- **Design system** ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)):
  **token-first** (CSS variables), **Tailwind-su-token**, **Reka UI** (primitivi headless),
  **TanStack Table** per tabelle complesse, tutto in **`packages/ui-kit`**.
- **Linguaggio visivo** ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)):
  "Costiero professionale" — teal `#1F6F8B` / navy `#0F3A4A` / sabbia `#E0A24E` + neutri freddi;
  **Inter** + `tabular-nums`; spaziatura 4px. Stati mappa: Libero `#7BB661`, Abbonato `#5B8DEF`,
  Giornaliero `#E8843C`, Prenotato `#F0C24A`, Selezionato = anello teal.
- **Icone** ([ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)): **Iconify in
  modalità BUNDLED/OFFLINE** (no API runtime — vincolo PWA) + **Lucide** set primario, dietro un
  `<Icon>` del `ui-kit`.
- **App-shell** ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)): layout **a card**;
  topbar + sidebar sezioni (**Mappa** home, Prenotazioni, Clienti, Listino, Report) + **Console
  superuser** gated; **drawer contestuale in overlay** (non colonna fissa); responsive desktop
  (sidebar piena/drawer laterale) ↔ tablet (rail icone/bottom-sheet); PWA.
- **Resa mappa** ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)): **HTML/CSS** (non
  SVG; SVG riservato alla planimetria futura [D-005](../architecture/deferred.md)). Cella
  **`OmbrelloneCell` a 4 assi**: **etichetta** = numero fisico reale; **stato** = colore (split
  per fascia); **tipologia** = marcatore a **icona modulare** (`Tipologia.icona`); **selezione**
  = anello teal. **Speciali** = settore dedicato. Ogni cella **focusabile con `aria-label`**
  (stato non solo-colore).

## 4. Principi di lavoro — NON negoziabili (l'utente ci tiene molto)

- **Decision rubric ([ADR-0002](../architecture/decisions/0002-decision-rubric.md))**:
  professionalità, convenzioni, modularità, zero debito — su **ogni** decisione, con "Rubric check".
- **Un ADR per ogni decisione** architetturale (file numerati **immutabili** in
  `docs/architecture/decisions/`; cambi via *supersede*; rinvii in
  [`deferred.md`](../architecture/deferred.md)); diagrammi Mermaid e mockup versionati
  ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)). **Numerazione ADR
  libera dal 0021.**
- **Lingua ([ADR-0003](../architecture/decisions/0003-language-convention.md))**: codice EN,
  dominio IT (Stabilimento, Cliente, Ombrellone, Fila, Fascia, **Tipologia**…), docs/UI IT.
- **Commit atomici per decisione**, messaggi tecnici in inglese, con trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Processo**: `frontend-design` → `writing-plans` (e `brainstorming` solo per scelte nuove).
- **Stile utente**: ragiona a fondo; chiede "cosa consigli secondo i nostri accordi?" → dai
  **raccomandazioni nette motivate per rubrica**, non elenchi neutri. **Comunica in italiano.**
  Vedi `MEMORY.md`.

## 5. Parallelizzazione e coerenza — IL PUNTO CHIAVE

- **Confine = `packages/contracts`** (DTO condivisi). La **dipendenza di scaffolding è RISOLTA**:
  monorepo + `contracts` **esistono** (Opzione A confermata) → il piano FE **assume**
  monorepo+contracts presenti e **parte da `apps/web-staff`**.
- **Fork** un worktree/branch FE da `main` (es. `feat/web-staff`). Il FE **possiede**
  `apps/web-staff`, **consuma** `contracts`. Il backend possiede `apps/api` + `prisma`, è editor
  primario di `contracts`. **Non toccare `apps/api`.**
- Il FE costruisce contro **`contracts` + API mockata (MSW)** → **non bloccato** dal backend.
- **DTO da proporre al backend (handshake):** `OmbrelloneDTO` (`id`, `etichetta`, `tipologiaId`,
  **stato per fascia**, `filaId`), `SettoreDTO`, `FilaDTO`, `TipologiaDTO` (`id`, `nome`,
  `ordine`, **`icona`**), `FasciaDTO`; payload creazione prenotazione/cliente. **`Tipologia.icona`**
  = estensione additiva ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)) da concordare;
  fallback FE finché non c'è. Merge del contratto **piccoli e frequenti**.
- **Tenant**: header provvisorio `X-Stabilimento-Id` (Piano 2 → JWT); in mock il FE usa lo stesso.

## 6. Documenti da leggere (in ordine)

1. [ADR 0017](../architecture/decisions/0017-design-system-frontend.md)–[0020](../architecture/decisions/0020-resa-mappa.md)
   + [spec UI/UX](../specs/2026-06-28-frontend-ui-ux-design.md) + [mockup](../design/mockups/frontend-app-shell.html).
2. [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) (Tipologia) — la mappa lo deve rispettare.
3. [Piano 1 backend](../plans/2026-06-28-core-foundation.md) — cosa esiste/espone (es. `GET/POST /clienti`).
4. [spec Core](../specs/2026-06-27-core-operativo-design.md), [data-model](../design/data-model.md), [flows](../design/flows.md).
5. [Architettura viva](../architecture/README.md), [deferred.md](../architecture/deferred.md), [glossario](../architecture/glossary.md).
6. Questo handoff + `MEMORY.md`.
7. *(Opzionale, scratch, può non esistere nel worktree perché gitignored):* note di lavoro del
   brainstorm in `.superpowers/brainstorm/.../DECISIONS-frontend.md`. **Fonte di verità = gli ADR/spec.**

## 7. Deliverable attesi (sessione prossima)

1. **(frontend-design)** Qualità visiva di produzione del design system: raffinamento
   token/componenti/app-shell/mappa, mockup aggiornati. Nuove micro-decisioni → ADR (0021+) o deferred.
2. **(writing-plans)** **Piano eseguibile di `apps/web-staff`**, parallelo al Piano 1: scaffolding
   (Vue 3 + TS + Vite + Pinia + PWA + Tailwind + Reka UI + Iconify bundled), `ui-kit`,
   sezioni + routing, mappa `OmbrelloneCell`, **mock-API MSW + handshake DTO** su `contracts`,
   ownership/branch, DoD.

## 8. Questioni aperte da decidere con l'utente (nel piano)

- **Scope del primo slice FE** (parallelo al Piano 1, che espone `/clienti` + `/health`):
  raccomandazione da portare → **app-shell + `ui-kit` + Clienti (verticale su API reale) + Mappa
  mockata (MSW)**.
- **Brand provvisorio in UI** ([D-017](../architecture/deferred.md)): wordmark "Driftly" o
  neutro/nome stabilimento.
- **Dettaglio responsive/PWA**: breakpoint, `manifest`, scope del service worker (offline-light,
  [D-008](../architecture/deferred.md)).
- Rinvii che restano fuori MVP: prezzo-per-tipologia ([D-018](../architecture/deferred.md)),
  pattern colorblind ([D-020](../architecture/deferred.md)), i18n ([D-003](../architecture/deferred.md)).

## 9. Prima mossa consigliata per il prossimo agente

Leggere §6, poi **confermare con l'utente il piano d'azione** (incluso lo **scope del primo
slice**) **prima** di produrre i deliverable. `frontend-design` per la qualità → `writing-plans`
per il piano. **Niente codice d'app finché il piano non è approvato**: è una sessione di
design-finishing + pianificazione.
