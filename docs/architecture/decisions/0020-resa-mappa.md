# ADR-0020: Resa della mappa — HTML/CSS, cella a 4 assi, accessibilità

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0005](0005-modello-mappa.md) (modello mappa), [ADR-0016](0016-tipologia-ombrellone.md) (etichette reali, tipologia, speciali), [ADR-0013](0013-granularita-disponibilita-a-slot.md) (fasce/slot), [ADR-0018](0018-linguaggio-visivo.md) (stati/colori, icone), [ADR-0017](0017-design-system-frontend.md) (componenti), [D-005](../deferred.md) (planimetria), [D-020](../deferred.md) (pattern colorblind)

## Nota di aggiornamento — 2026-06-30

Nel redesign Coralyn ([ADR-0027](0027-coralyn-linguaggio-visivo.md)) i colori di riempimento
degli stati mappa sono stati aggiornati alla palette calda:

| Stato | Valore precedente | Valore Coralyn |
|---|---|---|
| Libero | `#7BB661` | **`#8FBF9E`** |
| Abbonato | `#5B8DEF` | **`#5E9AA6`** |
| Giornaliero | `#E8843C` | **`#E89270`** |
| Prenotato | `#EFB847` | **`#F1C879`** |

Gli ink scuri per-stato (`#1E3A16` / `#102945` / `#3A1E08` / `#4A3711`) e l'approccio WCAG AA
(etichetta sempre con ink scuro, verifica in CI) sono **invariati**. La struttura della cella
a 4 assi, HTML/CSS, accessibilità e coordinamento contratto restano le decisioni di questo ADR.

---

## Context

La Mappa è il cuore operativo. Il modello ([ADR-0005](0005-modello-mappa.md),
[ADR-0016](0016-tipologia-ombrellone.md)) e la disponibilità **a slot**
([ADR-0013](0013-granularita-disponibilita-a-slot.md)) impongono che ogni ombrellone in mappa
porti **più informazioni insieme**. Vanno scelti la **tecnica di resa** e il **linguaggio
della cella**.

Ogni cella ha **quattro assi** da comunicare: **etichetta** (numero fisico reale,
[ADR-0016](0016-tipologia-ombrellone.md)) · **stato** (libero/abbonato/giornaliero/prenotato,
eventualmente **diverso per fascia**, [ADR-0013](0013-granularita-disponibilita-a-slot.md)) ·
**tipologia** (Normale/Mini-palma/Palma…, [ADR-0016](0016-tipologia-ombrellone.md)) ·
**selezione**.

## Decision

**Resa in HTML/CSS** (non SVG) per la mappa strutturata dell'MVP.

- La mappa è una griglia di componenti **`OmbrelloneCell`** (Settore → Fila → Ombrellone,
  layout di default "file impilate verso il mare", [ADR-0014](0014-setup-mappa-strutturato.md)).
- **Linguaggio della cella (4 assi):**
  - **Etichetta** = il **numero fisico reale**, mostrato nella cella
    ([ADR-0016](0016-tipologia-ombrellone.md)); il drawer titola "Ombrellone «etichetta»".
  - **Stato** = **colore di riempimento** (token stato, [ADR-0018](0018-linguaggio-visivo.md));
    per le **fasce** (mezza giornata) la cella si **divide** (mattina/pomeriggio).
  - **Tipologia** = **marcatore a icona modulare** d'angolo, **data-driven** dal campo
    `Tipologia.icona` (nome Iconify) reso via `<Icon>` ([ADR-0018](0018-linguaggio-visivo.md));
    Normale (`NULL`) = nessun marcatore.
  - **Selezione** = **anello teal**.
- **Ombrelloni speciali** (palme): in un **settore "Speciali"** dedicato
  ([ADR-0016](0016-tipologia-ombrellone.md)).
- **Accessibilità:** ogni cella è un **elemento focusabile** (`button`) con **`aria-label`**
  che porta in testo **etichetta + fila/settore + tipologia + stato per fascia**, così lo stato
  **non dipende dal solo colore**; navigazione da tastiera (frecce/Tab). Il pattern
  colorblind sulle celle è rimandato ([D-020](../deferred.md)).
- **Coordinamento contratto:** i DTO mappa devono includere `etichetta`, `tipologia` (con
  `icona`) e lo **stato per fascia**. Il campo `Tipologia.icona` è un'**aggiunta additiva** da
  concordare su `packages/contracts` (e da riflettere lato dominio su
  [ADR-0016](0016-tipologia-ombrellone.md) quando integrato).

**Perché HTML/CSS e non SVG:** la mappa MVP usa il **layout strutturato di default** (non
coordinate libere). HTML/CSS rende i 4 assi (il mockup lo dimostra), è **accessibile per
default** (DOM focusabile, ARIA), semplice per eventi e responsive. **SVG/canvas** resta la
scelta per la futura **planimetria a coordinate libere** ([D-005](../deferred.md)), che è
**additiva** (presentazione separata dal modello, [ADR-0005](0005-modello-mappa.md)), non un
rifacimento.

## Consequences

### Positive
- **Accessibilità nativa** (focus, ARIA, tastiera) → risolve anche il limite "colore-da-solo".
- Semplicità di sviluppo e responsive; nessuna complessità SVG non necessaria ora (YAGNI).
- La cella è un **componente isolato** (`OmbrelloneCell`), testabile.

### Negative / Trade-off
- Mappe molto grandi (migliaia di celle) = molti nodi DOM; per i lidi target (centinaia) è
  gestibile, con **virtualizzazione** valutabile se servisse.

### Neutre / Note
- `Tipologia.icona` è una piccola estensione additiva: finché il backend non la espone, il FE
  usa un **fallback** di default (mappa nome-tipologia → icona) senza cambiare il contratto del
  componente.

## Alternatives considered

- **SVG da subito** — scartata per l'MVP: complessità (a11y, eventi, testo) non giustificata dal
  layout strutturato; i 4 assi si rendono in HTML/CSS. SVG **riservato alla planimetria**
  ([D-005](../deferred.md)).
- **Canvas** — scartata: perde DOM/a11y; serve solo a scala/performance estreme, fuori dai lidi
  target.
- **Stato a glifo (L/A/G/P) nella cella** invece del numero — scartata: l'**etichetta reale** è
  l'identificatore che lo staff usa; lo stato va in colore + `aria-label`.
- **Tipologia per forma della cella** invece che per marcatore — valutata: il **marcatore a
  icona modulare** scala meglio a tipologie **definite dall'utente** (icona scelta dall'admin).

## Rubric check

1. **Professionalità** — scelta guidata dall'accessibilità e dal caso reale, senza
   over-engineering.
2. **Convenzioni** — per una griglia strutturata, HTML/CSS accessibile è la via convenzionale;
   SVG per il disegno libero.
3. **Modularità** — `OmbrelloneCell` isolato; tipologia **data-driven** (icona); presentazione
   separata dal modello.
4. **Zero debito** — niente complessità SVG per una feature rimandata; la planimetria è additiva
   ([D-005](../deferred.md)); il pattern colorblind è tracciato ([D-020](../deferred.md));
   l'estensione di contratto è esplicita.
