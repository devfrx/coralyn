# Spec di design — Frontend UI/UX (app staff del Core)

- **Data:** 2026-06-28
- **Status:** Proposto (in revisione)
- **Ambito:** `apps/web-staff` — frontend del [Core operativo](2026-06-27-core-operativo-design.md)

## 1. Obiettivo

Definire il design del **frontend dell'app staff**: design system centralizzato, linguaggio
visivo, app-shell e pattern UI/UX, resa della mappa — **professionale e moderno**, **ancorato**
al design del Core e al suo modello dati. È la base del **piano di `apps/web-staff`**, pensato
per l'esecuzione **in parallelo** al backend (Piano 1), con `packages/contracts` come confine.

## 2. Scope

### In scope
- **Design system**: token, `ui-kit`, sistema di icone ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md), [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)).
- **App-shell** a sezioni + **drawer contestuale** + **responsive** desktop/tablet + **PWA** ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)).
- **Resa della Mappa**: cella a 4 assi, stati **slot-aware**, **tipologia**, settore **Speciali** ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)).
- Inventario delle **sezioni MVP** e dei pattern UI; accessibilità (WCAG AA).
- Strategia di **integrazione col backend** (`contracts` + mock-API).

### Fuori scope (rimandato)
- L'**implementazione** (oggetto del piano + esecuzione).
- Editor planimetria ([D-005](../architecture/deferred.md)), pattern colorblind ([D-020](../architecture/deferred.md)),
  i18n ([D-003](../architecture/deferred.md)), offline-sync completo ([D-008](../architecture/deferred.md)).

## 3. Decisioni di riferimento

| Tema | ADR |
|---|---|
| Design system (token-first, headless, ui-kit) | [0017](../architecture/decisions/0017-design-system-frontend.md) |
| Linguaggio visivo (palette, tipografia, stati, icone) | [0018](../architecture/decisions/0018-linguaggio-visivo.md) |
| App-shell e pattern UX (sezioni, drawer, responsive, PWA) | [0019](../architecture/decisions/0019-app-shell-e-ux.md) |
| Resa della mappa (HTML/CSS, cella a 4 assi, a11y) | [0020](../architecture/decisions/0020-resa-mappa.md) |
| Form factor e delivery (web+PWA, desktop+tablet) | [0004](../architecture/decisions/0004-form-factor-e-delivery.md) |
| Stack e layout (Vue 3+TS+Vite+Pinia, monorepo) | [0008](../architecture/decisions/0008-stack-e-layout.md) |
| Modello mappa · Tipologia/numerazione · slot | [0005](../architecture/decisions/0005-modello-mappa.md) · [0016](../architecture/decisions/0016-tipologia-ombrellone.md) · [0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) |
| Setup mappa · Console superuser | [0014](../architecture/decisions/0014-setup-mappa-strutturato.md) · [0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md) |
| Lingua (UI in italiano) | [0003](../architecture/decisions/0003-language-convention.md) |

## 4. Design system (sintesi — [ADR-0017](../architecture/decisions/0017-design-system-frontend.md)/[ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md))

- **Token-first**: CSS variables come fonte unica (colore, tipografia, spaziatura, raggi, ombre).
- **Tailwind sui token**; **Reka UI** (primitivi headless) per dialog/drawer/menu/combobox/…;
  **TanStack Table** per le tabelle complesse; **icone Iconify (bundled) + Lucide** dietro `<Icon>`.
- Tutto in **`packages/ui-kit`**: token → primitivi → componenti base (`Button`, `Input`,
  `Field`, `Card`, `Badge`, `DataTable`, `Drawer`, `Icon`, `OmbrelloneCell`, …) → schermate.

## 5. Linguaggio visivo (sintesi — [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md))

"Costiero professionale": brand **teal `#1F6F8B`** / **navy `#0F3A4A`**, accento **sabbia
`#E0A24E`**, neutri freddi; **Inter** con `tabular-nums`; spaziatura 4px; layout a **card** su
tela neutra. Stati mappa: Libero `#7BB661`, Abbonato `#5B8DEF`, Giornaliero `#E8843C`,
Prenotato `#F0C24A`, Selezionato = anello teal.

## 6. App-shell e navigazione ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md))

Topbar (brand/stabilimento · navigatore data · ricerca cliente · utente) + **sidebar** a
sezioni. **Mappa = home**. **Drawer contestuale** in overlay (non colonna fissa).
**Console superuser** voce separata, **solo** ruolo `superuser`. Responsive: desktop (sidebar
piena, drawer laterale) ↔ tablet (rail di icone, drawer bottom-sheet). PWA installabile.

## 7. Sezioni del MVP (inventario)

| Sezione | Scopo (MVP) | Riferimenti |
|---|---|---|
| **Mappa** (home) | Vista per data; stati per (ombrellone, fascia); clic → drawer | [ADR-0020](../architecture/decisions/0020-resa-mappa.md), [flows §2](../design/flows.md) |
| **Prenotazioni** | Elenco/ricerca prenotazioni, stato, incasso base | [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md), [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md) |
| **Clienti** | Anagrafica e ricerca del bagnante (primo verticale su API reale) | [data-model](../design/data-model.md) |
| **Listino** | Pacchetti, Stagioni, Fasce, Listino/Tariffe (admin) | [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) |
| **Report** | Statistiche minime | [spec Core §8](2026-06-27-core-operativo-design.md) |
| **Console superuser** | Audit/errori cross-tenant, sola lettura, **solo superuser** | [ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md) |
| *Setup struttura* (admin) | Settori/File/Ombrelloni con **etichette reali** e **Tipologie** | [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md), [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) |

## 8. La Mappa (dettaglio — [ADR-0020](../architecture/decisions/0020-resa-mappa.md))

- **Cella `OmbrelloneCell` a 4 assi**: **etichetta** (numero fisico reale) · **stato** (colore,
  **split** per fascia) · **tipologia** (marcatore a **icona modulare** da `Tipologia.icona`) ·
  **selezione** (anello teal). Speciali in un **settore dedicato**.
- **Drawer contestuale**: titolo "Ombrellone «etichetta»", **tipologia**, **settore/fila**,
  **stato per fascia**, dettaglio prenotazione, **stato pagamento** (Saldato/Parziale/Non pagato,
  importo, metodo — [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)), e le
  azioni dei flussi: **Nuova prenotazione**, **Assegna abbonamento**, **Registra presenza**
  ([flows §2](../design/flows.md)).
- **Mockup**: [frontend-app-shell.html](../design/mockups/frontend-app-shell.html).

## 9. Accessibilità

Contrasti **WCAG AA**; ogni ombrellone è un **elemento focusabile** con `aria-label` che porta
**stato/tipologia/fascia in testo** (il colore non è mai l'unico veicolo); primitivi headless
(focus trap, ESC, ARIA); **navigazione da tastiera**. Pattern colorblind sulle celle rimandato
([D-020](../architecture/deferred.md)).

## 10. Integrazione col backend (confine = `packages/contracts`)

- Il FE consuma i **DTO condivisi** e costruisce contro una **API mockata (MSW)** finché gli
  endpoint non esistono → **non bloccato** dal backend.
- **DTO oggi presenti**: `Ruolo`, `ClienteDTO`. **DTO da proporre** (handshake col backend):
  `OmbrelloneDTO` (`id`, `etichetta`, `tipologiaId`, stato per fascia, `filaId`), `SettoreDTO`,
  `FilaDTO`, `TipologiaDTO` (`id`, `nome`, `ordine`, **`icona`**), `FasciaDTO`; payload di
  creazione prenotazione/cliente.
- **Tenant**: header provvisorio `X-Stabilimento-Id` (Piano 2 → JWT). **`Tipologia.icona`**:
  estensione additiva da concordare ([ADR-0020](../architecture/decisions/0020-resa-mappa.md));
  fallback FE finché non disponibile.

## 11. Definition of Done (design)

- ADR **0017–0020** accettati; questa spec **approvata**; **mockup** aggiornato ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
- Token, app-shell e **linguaggio della mappa** definiti e **coerenti col modello** ([ADR-0005](../architecture/decisions/0005-modello-mappa.md)/[0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)/[0016](../architecture/decisions/0016-tipologia-ombrellone.md)).
- Strategia **`contracts` + mock-API** definita, pronta per il piano di `apps/web-staff`.

## 12. Riferimenti

[ADR 0017–0020](../architecture/decisions/) · [Form factor 0004](../architecture/decisions/0004-form-factor-e-delivery.md) · [Stack 0008](../architecture/decisions/0008-stack-e-layout.md) ·
[spec Core](2026-06-27-core-operativo-design.md) · [data-model](../design/data-model.md) ·
[flows](../design/flows.md) · [glossario](../architecture/glossary.md) ·
[mockup](../design/mockups/frontend-app-shell.html).
