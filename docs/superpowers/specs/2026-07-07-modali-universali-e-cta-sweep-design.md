# Design — Modali universali + applicazione CTA/microinterazioni in tutte le viste

> Fase di **qualità/UX** successiva al merge del layer ui-kit (motion/IconButton/Button/EmptyState/coerenza) su
> `main = cc497e7`. Nasce dal feedback dell'utente in verifica LIVE: (1) i modali "saltavano" in entrata — **già
> corretto su main** (keyframe TW v4); (2) le CTA non cambiavano cursore — **già corretto su main** (`button:not(:disabled){cursor:pointer}`);
> (3) header/footer dei modali devono restare fissi; (4) i modali devono avere un **layout universale**; (5) le
> **varianti CTA e le microinterazioni** vanno applicate davvero in **tutte le viste**, scelte per contesto.
> Workflow [ADR-0009](../../architecture/decisions/0009-documentazione-di-design.md). Branch: `feat/modal-layout-and-cta-sweep`.
> Decisioni confermate con l'utente (2026-07-07): modali → ristruttura completa + migrazione di tutti i consumer;
> punto 5 → **fase pianificata completa** (tutte le viste); branch → il layer ui-kit è **già mergiato**, questa fase è nuova.

## 1. Contesto
`main` contiene ora il design system aggiornato: motion token-driven, `IconButton`, `Button` (taglie/loading/press),
`EmptyState` strutturato, focus-ring coerente, cursore pointer globale. Restano due esigenze emerse in verifica LIVE:
- **A — Struttura dei modali:** `Modal`/`Drawer` sono contenitori a scroll unico → con contenuto lungo header e
  footer (le azioni) scorrono via. Serve una struttura **universale**: header fisso · corpo scrollabile · footer fisso.
- **B — Applicazione nelle viste:** l'app usa già **85 `<Button>`** ui-kit, ma restano **29 `<button>` grezzi** in 6 file
  (`Sidebar`, `Topbar`, `BookingsView`, `EstablishmentStructureView`, `MapView`, `PricingView`) e alcune azioni non
  seguono una scelta di variante coerente per contesto. Non tutti i `<button>` grezzi sono CTA (molti sono controlli
  bespoke: celle mappa, voci di navigazione, frecce data, tab) → serve un **audit con giudizio**, non un replace cieco.

## 2. Obiettivi / Non-obiettivi
**Obiettivi**
- **A:** `Modal` (e `Drawer`) con regioni **header (fisso) · body (scroll) · footer (fisso, slot `#footer` opzionale)**;
  migrare **tutti i 13 consumer** + `ConfirmDialog`. Layout identico e prevedibile per ogni modale.
- **B:** audit vista-per-vista (10 viste + i loro modali) applicando la **rubrica CTA** (§4) e garantendo che **ogni
  elemento interattivo** abbia gli stati/microinterazioni corretti (hover, focus-ring, press, disabled, loading dove async).
- Non regredire la baseline (aggiornata post-merge): ui-kit **100** · web-staff **305** · web-platform **16** · typecheck pulito.

**Non-obiettivi**
- Nessun cambio di dominio/logica/contracts/API/schema. È lavoro di presentazione/interazione.
- Nessun refresh di palette/token (fuori scope, come nella fase precedente).
- I `<button>` bespoke che NON sono CTA (celle mappa, nav) **non** vengono forzati a `<Button>`: si verificano solo i
  loro stati (hover/focus/cursore) — spesso già a posto. Niente churn gratuito.
- **Fuori:** i18n, colorblind-safe, 401 globale, e gli altri D-0xx del backlog restano deferiti.

## 3. Parte A — Layout universale dei modali

### 3a. `Modal.vue`
Struttura a 3 regioni dentro `DialogContent` (che diventa `flex flex-col max-h-[90vh]`, **senza** `overflow-auto`):
- **Header** (`shrink-0`, `border-b`): eyebrow/title/description + close `IconButton` — come oggi, invariato nella resa.
- **Body** (`flex-1 overflow-auto p-5`): lo slot **default**. È l'**unica** regione che scrolla.
- **Footer** (`shrink-0`, `border-t`, padding): nuovo slot **`#footer`**, reso **solo se presente** (`v-if="$slots.footer"`).
Retro-compat: se un consumer non usa `#footer`, il modale resta header + body (nessuna regione footer) — identico a prima
per i modali senza azioni. La `max-h-[90vh]` sul content garantisce che header/footer non escano mai dallo schermo.

### 3b. `Drawer.vue`
Stessa logica per uniformità ("layout universale"): header `shrink-0`, body `flex-1 overflow-auto`, footer `#footer`
opzionale. Il Drawer oggi non gestisce overflow → questo aggiunge lo scroll corretto del solo corpo.

### 3c. Migrazione consumer (13 file)
Spostare `<ModalFooter>` / i bottoni d'azione dallo slot default a `<template #footer>`. `ConfirmDialog` (che incapsula
`Modal` e mette `ModalFooter` nel default) passa a `#footer`. File: `MapView`, `TerminateSubscriptionModal`,
`EditCustomerModal`, `SettlePaymentModal`, `CreateEstablishmentModal`, `CustomerDetailView`, `CustomersView`,
`EstablishmentView`, `EstablishmentStructureView`, `RenewalsView`, `PricingView`, `EstablishmentDetailView` (web-platform),
`EstablishmentsListView` (web-platform) — solo quelli che effettivamente montano un footer d'azioni.
`ModalFooter` resta invariato come componente (vive dentro `#footer`); eventuale `pt-1` ridondante rimosso se il footer
region già dà padding.

## 4. Parte B — Rubrica CTA (confermata) e audit per vista
**Rubrica (scelta per contesto):**
- Azione **primaria** (submit, conferma, CTA principale della vista) → `Button variant="primary"`.
- **Secondaria** (annulla, indietro, chiudi non-icona) → `variant="secondary"`.
- **Terziaria / inline** (azioni leggere, link-like) → `variant="ghost"`.
- **Distruttiva** (elimina, disdici, void) → `variant="danger"`.
- **Solo-icona** (modifica, elimina, espandi, chiudi, rimuovi riga) → `IconButton` (variante `ghost`/`subtle` per contesto).
- Azioni **async** (chiamate API) → `Button :loading` durante la mutation.
- **Ogni** interattivo (anche bespoke): hover coerente (token), `focus-visible:[box-shadow:var(--ring-focus)]`, press dove
  è una CTA, `disabled` coerente. Cursore già globale.

**Viste in scope (audit + fix):**
- web-staff: `LoginView`, `BookingsView` (+`SettlePaymentModal`), `CustomersView`, `CustomerDetailView`
  (+`EditCustomerModal`, `TerminateSubscriptionModal`, `CustomerSubscriptionsCard`), `EstablishmentView`,
  `EstablishmentStructureView`, `MapView`, `PricingView`, `RenewalsView`, `ReportView`, shell (`Sidebar`, `Topbar`).
- web-platform: `LoginView`, `EstablishmentsListView`, `EstablishmentDetailView` (+`CreateEstablishmentModal`).

**Metodo per vista (un incremento per vista):** censire gli interattivi → per ciascuno decidere via rubrica se è una CTA
(→ `Button`/`IconButton` con la variante giusta) o un controllo bespoke (→ verifica solo gli stati) → applicare →
verificare che gli spec restino verdi (o aggiornarli minimamente) → verifica LIVE della vista.

## 5. Decisioni risolte (con l'utente, 2026-07-07)
1. Modali: **ristruttura completa** (header/body/footer, slot `#footer`) + migrazione di **tutti** i consumer.
2. Punto 5: **fase pianificata completa** — tutte le 10 viste + shell + modali, non solo le ad alto traffico.
3. Branch: il layer ui-kit è **già mergiato su main**; questa fase parte pulita su `feat/modal-layout-and-cta-sweep`.
4. I due bug LIVE (flash modale, cursore) sono **già risolti e su main** (`cc497e7`), non fanno parte di questa fase.

## 6. Sequenza di consegna
Due sotto-fasi, ciascuna con **piano proprio**, esecuzione TDD subagent-driven, e **conferma prima del merge**:
- **Fase A — Modali universali** (foundational: la sweep tocca anche i modali, quindi va prima). Piano dedicato, poi merge FF.
- **Fase B — Sweep CTA/microinterazioni per vista** (dopo A). Piano dedicato con un task per vista; pipeline vista-per-vista;
  verifica LIVE per ciascuna. Merge FF finale.

## 7. Test e verifica
- Baseline (post-merge) da non regredire: ui-kit 100 · web-staff 305 · web-platform 16 · typecheck pulito.
- Modali con teleport nei test: `attachTo: document.body` + `document.querySelector` (pattern esistente).
- Il `web-staff/vitest.config.ts` globa gli spec ui-kit → cambi a `Modal`/`Drawer` contano in entrambe le suite.
- **Verifica LIVE:** l'utente sta girando l'app (dev server, HMR attivo). Header/footer fissi, scroll del solo corpo,
  varianti CTA e microinterazioni si valutano dal vivo per ciascuna vista. Nota tooling: il preview interno ha un mismatch
  di porta (Vite→5174 perché 5173 occupato); si privilegia la verifica sull'istanza dell'utente o Docker.
- Nessuna modifica ad api/contracts/schema.

## 8. Rischi
- **Migrazione modali (13 file):** rischio di footer/azioni fuori posto → test dei consumer + verifica LIVE per campione.
- **Sweep viste:** rischio churn/over-conversion dei `<button>` bespoke → la rubrica §4 impone di NON convertire i
  controlli non-CTA; ogni conversione passa da un test/aggiornamento spec mirato.
- **Spec di view che asseriscono markup:** aggiornarli per verificare comportamento/testo, non struttura.
