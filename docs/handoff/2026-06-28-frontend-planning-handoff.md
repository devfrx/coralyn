# Handoff — Pianificazione Frontend (parallela al Piano 1 backend)

> **Nota (aggiornamento 2026-06-28):** questo handoff è **superato** per la fase design+piano da
> [frontend-design-and-plan-handoff.md](2026-06-28-frontend-design-and-plan-handoff.md). Modello di
> lavoro attuale: **sequenziale su branch** (niente worktree).

- **Data:** 2026-06-28
- **Scopo:** permettere a un nuovo agente, in sessione fresca, di riprendere *esattamente* da qui: pianificare con l'utente il **frontend** di Coralyn in parallelo all'esecuzione del **Piano 1 (backend)**, senza introdurre incoerenze e rispettando i nostri principi.

## 1. Missione del prossimo agente (in ordine)

1. **Generare il messaggio di delega per il BACKEND** — un prompt completo e autosufficiente da consegnare a un *altro* agente che eseguirà il [Piano 1](../plans/2026-06-28-core-foundation.md) in una sessione dedicata (modalità subagent-driven o executing-plans). Deve includere: contesto, principi, percorso del piano, DoD, come eseguire i test.
2. **Co-progettare il FRONTEND con l'utente** — da zero ma **ancorato alla documentazione** e al Piano 1: **design centralizzato**, **linguaggio visivo** (design tokens), **UI/UX professionale**. Usare le skill `superpowers:brainstorming` (prima) e `frontend-design` (per la qualità, evitando l'estetica "AI generica").
3. **Scrivere il PIANO del frontend** — con `superpowers:writing-plans`, per `apps/web-staff`, **eseguibile in parallelo** al Piano 1 backend.

## 2. Stato attuale (al 2026-06-28)

- Codename **Coralyn** (provvisorio; scope package `@coralyn/*`; brand/dominio definitivo = D-017).
- **Design del Core MVP completo, coerente e verificato**: spec **Approvato**, 15 ADR, `deferred.md`, diagrammi Mermaid, mockup.
- **Piano 1 (backend) scritto e committato, NON eseguito**: foundation monorepo + NestJS + PostgreSQL/Prisma + **isolamento multi-tenant via RLS** (spike) + modulo `clienti`.
- Repo git **pulito**, tutto committato. Tool presenti: **Node 24, pnpm 10, Docker 29**. Radice repo: `C:/Users/Jays/Desktop/new`.

## 3. Principi di lavoro — NON negoziabili (l'utente ci tiene molto)

- **Decision rubric ([ADR-0002](../architecture/decisions/0002-decision-rubric.md))**: ogni decisione pesata su 4 filtri — **professionalità, convenzioni, modularità, zero debito**. Ogni ADR chiude con una sezione "Rubric check".
- **ADR per ogni decisione architetturale**: file numerati immutabili in `docs/architecture/decisions/`; cambi via *supersede* (mai cancellare); decisioni rimandate in `docs/architecture/deferred.md`; diagrammi in **Mermaid** versionati ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
- **Lingua ([ADR-0003](../architecture/decisions/0003-language-convention.md))**: **codice in inglese**, **termini di dominio in italiano** (Ombrellone, Fila, Abbonamento, Stabilimento…), **documentazione e UI in italiano**.
- **Commit atomici per decisione**, messaggi tecnici in inglese, con trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Processo**: `brainstorming` prima di progettare → `writing-plans` per i piani → esecuzione. Per la UI usare anche `frontend-design`.
- **Stile dell'utente**: ragiona a fondo, spesso chiede "cosa consigli secondo i nostri accordi?" → fornire **raccomandazioni nette motivate per rubrica**, non elenchi neutri. **Comunicare in italiano.** Vedi `MEMORY.md`.

## 4. Vincoli del frontend già fissati negli ADR (rispettarli)

- **Vue 3 + TypeScript + Vite + Pinia**, distribuito come **web app + PWA**, responsive **desktop + tablet** ([ADR-0004](../architecture/decisions/0004-form-factor-e-delivery.md), [ADR-0008](../architecture/decisions/0008-stack-e-layout.md)).
- **App a sezioni**: menù laterale (Mappa, Prenotazioni, Clienti, Listino, Report), **Mappa come home**, **drawer contestuale** al clic su un ombrellone. Direzione UI validata — mockup: [main-screen.html](../design/mockups/main-screen.html).
- Stati mappa: **libero / abbonato / giornaliero / prenotato**; **fasce** intera/mezza giornata ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)).
- **Console superuser** come sezione separata, visibile solo al ruolo `superuser` ([ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)).
- Il FE consuma l'**API REST** del backend tramite i **tipi condivisi** `@coralyn/contracts` ([ADR-0008](../architecture/decisions/0008-stack-e-layout.md)).

## 5. Parallelizzazione e coerenza — IL PUNTO CHIAVE

Per evitare incoerenze tra FE e BE che procedono in parallelo:

- **Confine di coordinamento = `packages/contracts`** (DTO/tipi condivisi). È il contratto su cui entrambi costruiscono. Concordare/estendere i DTO **prima** (il FE elenca ciò che gli serve; si allineano nel `contracts`).
- Il **frontend costruisce contro `contracts` + un'API mockata** (es. MSW o stub locali) finché gli endpoint backend non esistono → **non è bloccato** dal backend.
- **Ownership per evitare conflitti git**:
  - sessione **backend** → possiede `apps/api`, `apps/api/prisma`; editor primario di `packages/contracts`.
  - sessione **frontend** → possiede `apps/web-staff`; **consuma** `packages/contracts`.
  - le modifiche al contratto vanno **coordinate** (idealmente il FE propone i DTO necessari e il BE li integra).
- **Branch git separati** (niente worktree) per FE e BE, con `packages/contracts` come punto d'integrazione; lavoro **sequenziale**, merge frequenti del solo contratto.
- **Dipendenza di sequenza da gestire esplicitamente**: il Piano 1 backend (Task 1–2) crea lo **scaffolding del monorepo** (`pnpm-workspace`, `tsconfig.base`, `packages/contracts`). Per non avere due agenti che creano lo stesso scaffolding:
  - Opzione consigliata: il backend crea per primo monorepo + `contracts`; il piano FE **assume** monorepo+contracts presenti e parte da `apps/web-staff`.
  - In alternativa, il piano FE include uno scaffolding minimo proprio se parte prima.
  - **Il prossimo agente deve chiarire questa scelta con l'utente** e rifletterla nel piano FE.

## 6. Documenti da leggere (in ordine)

1. [Piano 1 backend](../plans/2026-06-28-core-foundation.md) — il focus.
2. [Spec del Core (Approvato)](../specs/2026-06-27-core-operativo-design.md).
3. [Architettura viva](../architecture/README.md) e gli [ADR](../architecture/decisions/) (0001–0015).
4. [Modello dati](../design/data-model.md), [Flussi](../design/flows.md), [Mockup main-screen](../design/mockups/main-screen.html).
5. [Decisioni rimandate](../architecture/deferred.md), [Glossario](../architecture/glossary.md).
6. `MEMORY.md` (profilo utente + stile decisionale).

## 7. Deliverable attesi

1. **Messaggio di delega backend** (per eseguire il Piano 1 in altra sessione).
2. **Design del frontend**: ADR per il **design system / linguaggio visivo** (design tokens, griglia, tipografia, palette, componenti, stati mappa, pattern drawer/responsive/PWA) + spec UI/UX. Via `brainstorming` + `frontend-design`.
3. **Piano del frontend** (`writing-plans`) per `apps/web-staff`, parallelizzabile, con strategia **mock-API** e dipendenza esplicita su `contracts`.

Tutto con la disciplina ADR/commit descritta sopra.

## 8. Prima mossa consigliata per il prossimo agente

Leggere i documenti (§6), poi **confermare con l'utente il piano d'azione** (e la scelta sulla dipendenza di scaffolding, §5) **prima** di produrre i deliverable. Niente codice in questa sessione: solo delega backend + design + piano frontend.
