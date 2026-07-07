# ADR-0045: Rubrica CTA contestuale (size-by-context) e primitiva `ActionBar`

- **Status:** Accepted
- **Data:** 2026-07-07
- **ADR correlati:** [0002](0002-decision-rubric.md), [0044](0044-iconbutton-variante-danger.md)
- **Spec:** [2026-07-07-cta-coherence-audit-design.md](../../superpowers/specs/2026-07-07-cta-coherence-audit-design.md)

## Context
La rubrica CTA (Fase B) definiva la variante ma non la dimensione: azioni di riga/header-card
erano rese `md` (troppo grandi per il contesto denso), alcune icone-sole erano `Button` boxati
invece di `IconButton`, e ogni cluster d'azione era un `flex gap` scritto a mano (spaziature
incoerenti, wrap accidentali). L'utente ha chiesto una soluzione centralizzata/modulare, non
stili per-elemento.

## Decision
1. **Rubrica v2 (size-by-context):** la CTA eredita la densità del contenitore — header pagina `md`;
   card/riga/toolbar/drawer `sm`; icona-sola sempre `IconButton`; async `:loading`; distruttiva `danger`.
2. **Primitiva `ActionBar`:** i cluster di 2+ azioni si compongono con `<ActionBar>` (props `align`/`gap`/
   `wrap`), unico punto di verità per il layout del cluster. Gemello non-modale di `ModalFooter`.
   Non impone size ai figli (resta per-Button secondo la rubrica).

## Consequences
- **+** Coerenza visiva e densità corrette in tutte le viste; layout dei cluster centralizzato.
- **+** Zero stili per-elemento: si usano solo `size`/`variant`/`IconButton`/`ActionBar`.
- **−** Un nuovo componente ui-kit (`ActionBar`) da mantenere; adozione progressiva vista-per-vista.
