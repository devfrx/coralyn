# ADR-0017: Design system del frontend — token-first, primitivi headless, ui-kit

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0008](0008-stack-e-layout.md) (stack FE), [ADR-0004](0004-form-factor-e-delivery.md) (web+PWA), [ADR-0018](0018-linguaggio-visivo.md) (linguaggio visivo), [ADR-0019](0019-app-shell-e-ux.md) (app-shell), [ADR-0020](0020-resa-mappa.md) (resa mappa)

## Context

Lo stack frontend è fissato — **Vue 3 + TypeScript + Vite + Pinia**, web app + PWA
([ADR-0008](0008-stack-e-layout.md), [ADR-0004](0004-form-factor-e-delivery.md)) — ma non
*come* costruiamo lo strato UI. Serve un **design system centralizzato**, professionale e
**non "generico"**, riusabile dall'app staff e dal futuro booking online, senza lock-in di
una libreria né debito di stile. Il prodotto ha componenti a forte interazione (drawer
contestuale, dialog, combobox, tabelle) per cui l'**accessibilità** non è opzionale.

## Decision

Design system **token-first** con **primitivi headless** e **Tailwind sui token**,
impacchettato in **`packages/ui-kit`**.

- **Design token = fonte unica** (CSS variables): colore, tipografia, spaziatura, raggi,
  ombre. Definiti in `ui-kit`, consumati ovunque. **Nessun valore "magico"** (hex/px) nei
  componenti.
- **Tailwind configurato sui token** come motore di styling (utility mappate alle CSS
  variables) — nessuna palette parallela che possa divergere dai token.
- **Primitivi headless accessibili** (**Reka UI**) per i componenti con logica/ARIA non
  banale: dialog, drawer, menu, combobox, tooltip, tabs, popover, selezione data. **Logica
  e a11y dalla libreria, stile dai nostri token.**
- **Tabelle dati** complesse (ordinamento/filtri/paginazione/virtualizzazione):
  **TanStack Table** (headless) quando servono, skinnate sui token.
- **`packages/ui-kit`** è il confine: token → primitivi → componenti base (`Button`,
  `Input`, `Field`, `Card`, `Badge`, `DataTable`, `Icon`, …) → consumati da
  `apps/web-staff` (e in futuro da `apps/web-booking`).
- **Disciplina anti-debito:** (1) **solo token** come valori; (2) **regola di promozione** —
  se un componente è riusato o ha superficie a11y va in `ui-kit`, se è composizione di una
  singola schermata resta locale; (3) **lint** a supporto del confine e dei token.

## Consequences

### Positive
- Linguaggio visivo **distintivo e coerente** (niente "look da libreria"), con a11y
  garantita sui componenti critici.
- **Riuso pieno** tra app staff e booking online (stesso `ui-kit`, stessi token).
- Refactor sicuri: i **token sono il contratto stabile**, gli interni dei componenti sono
  sostituibili.

### Negative / Trade-off
- I componenti base li **costruiamo noi** (costo iniziale), mitigato dai primitivi headless
  e da TanStack per i casi complessi.
- Richiede **disciplina** sui confini di `ui-kit` (lint) per non degenerare in one-off.

### Neutre / Note
- **Escape hatch:** se un widget custom diventa troppo costoso da mantenere, si adotta un
  primitivo headless **solo per quello**, senza cambiare strategia (i token restano stabili).

## Alternatives considered

- **Libreria di componenti completa themable** (PrimeVue / Naive UI / Quasar) — scartata:
  rischio **estetica generica**, lotta col tema per renderla distintiva, **lock-in**; i
  "nostri token" diventerebbero una mappatura sulle variabili della libreria.
- **Utility-first puro** (solo Tailwind, senza primitivi) — scartata: l'a11y di
  drawer/dialog/menu resterebbe a carico nostro, con ruota reinventata e rischio di bug.
- **CSS/SCSS vanilla** (senza Tailwind) — valida ma più verbosa; Tailwind-su-token dà
  velocità e coerenza **restando ancorato ai token**.

## Rubric check

1. **Professionalità** — controllo totale del linguaggio visivo **+ a11y garantita** sui
   componenti critici (drawer/dialog sono ovunque in questo prodotto).
2. **Convenzioni** — token-first e primitivi headless sono lo standard moderno dei design
   system; Tailwind è convenzione consolidata in Vue/Vite.
3. **Modularità** — layer netti **token → primitivi → componenti → schermate**, con confine
   esplicito in `packages/ui-kit`.
4. **Zero debito** — nessun lock-in di tema; token come contratto stabile; reversibilità
   widget-per-widget; il compromesso (costruire i componenti base) è esplicito e circoscritto.
