# ADR-0018: Linguaggio visivo — palette, tipografia, stati mappa, icone

- **Status:** Superseded by [ADR-0027](0027-coralyn-linguaggio-visivo.md) (palette e tipografia)
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0017](0017-design-system-frontend.md) (dove vivono i token), [ADR-0004](0004-form-factor-e-delivery.md) (PWA/offline), [ADR-0016](0016-tipologia-ombrellone.md) (tipologia → marcatori), [ADR-0020](0020-resa-mappa.md) (resa/a11y degli stati), [ADR-0009](0009-documentazione-di-design.md) (mockup), [D-020](../deferred.md)

## Context

[ADR-0017](0017-design-system-frontend.md) fissa che i token sono la fonte unica, ma non i
loro **valori**. Serve definire il linguaggio visivo concreto: una direzione riconoscibile e
professionale che eviti l'estetica "AI generica", e un **sistema di icone** coerente e a
prova di offline. Gli **stati della mappa** sono il colore che lo staff legge tutto il
giorno: vanno fissati e resi accessibili.

## Decision

Direzione **"Costiero professionale"**: teal/navy come brand, sabbia come accento caldo,
neutri freddi puliti; calmo, sobrio, identità balneare riconoscibile.

**Palette (token di colore):**
- **Brand:** teal `#1F6F8B` (primario), teal profondo `#155A73` (hover/pressed), teal tint
  `#DCECF2` (selezione/focus), navy `#0F3A4A` (superfici profonde/sidebar).
- **Accento:** sabbia `#E0A24E` (caldo, con parsimonia), sabbia tint `#FBF3DE`.
- **Neutri:** sfondo `#F5F7F9`, superficie `#FFFFFF`, incassato `#ECF0F3`, bordo `#D8E0E6`,
  testo `#23323F`, testo muto `#66727E`; canvas (layout a card) `#E9EFF2`.
- **Feedback:** success `#3F9D5B`, warning `#E8A93C`, danger `#D6453D`, info `#4F86E0`.

**Stati della mappa** (token semantici): Libero `#7BB661`, Abbonato `#5B8DEF`, Giornaliero
`#E8843C`, Prenotato `#F0C24A`, Selezionato = **anello teal**. Resa e accessibilità in
[ADR-0020](0020-resa-mappa.md).

**Tipografia:** **Inter** per la UI. Scala: 12/13 (denso/tabelle), 14 (corpo), 16/18
(sezione), 22/26 (titolo); pesi 400/500/600. **`tabular-nums`** per prezzi, date e quantità.

**Token di forma:** spaziatura base 4px (4/8/12/16/24/32/48); raggi 6/8/12; ombre soft a
elevazione contenuta.

**Sistema di icone — Iconify (bundled/offline), set primario Lucide:**
- `@iconify/vue` in **modalità offline/bundled** (build-time, **tree-shaken** via
  `@iconify-json/*` + plugin): **niente API runtime** (vincolo PWA/offline,
  [ADR-0004](0004-form-factor-e-delivery.md)).
- **Lucide** come **set primario** (stile pulito, coerente con la direzione); altri set solo
  per colmare gap reali; **icone custom** (es. marcatori di [Tipologia](0016-tipologia-ombrellone.md))
  attraverso la stessa API.
- Le icone si usano via un componente **`<Icon>` del `ui-kit`**: un set primario per
  coerenza, **niente icone miste**.

**Accessibilità del colore:** il colore non è **mai** l'unico veicolo d'informazione. Gli
stati mappa sono accompagnati da testo/`aria-label` ([ADR-0020](0020-resa-mappa.md)); i
contrasti testo/sfondo rispettano **WCAG AA**. Una modalità a **pattern colorblind-safe**
sulle celle è valutata e **rimandata** ([D-020](../deferred.md)).

## Consequences

### Positive
- Identità **coerente e distintiva**, riusabile su app staff e booking online.
- Icone **unificate e a prova di offline**; cambiare/estendere set = un punto solo.
- Prezzi e date leggibili e allineati (`tabular-nums`), adatti a un gestionale.

### Negative / Trade-off
- Serve **disciplina** sui contrasti e sul set primario, per non reintrodurre incoerenza.
- La modalità colorblind-safe a pattern **non è nell'MVP** ([D-020](../deferred.md)).

### Neutre / Note
- I valori qui sono i **token**: vivono in `ui-kit` ([ADR-0017](0017-design-system-frontend.md))
  e si rendono come CSS variables. Il mockup aggiornato è in `docs/design/mockups/`
  ([ADR-0009](0009-documentazione-di-design.md)).

## Alternatives considered

- **SaaS neutro data-dense** e **Balneare vivace** — scartate: la prima troppo anonima per
  il dominio, la seconda rischia di sembrare poco "gestionale serio"; "Costiero
  professionale" tiene identità **e** sobrietà, in continuità col mockup già validato.
- **Set di icone singolo come pacchetto** (solo Lucide) — superato: Iconify dà accesso
  unificato a più set **e** icone custom con la stessa API, senza perdere coerenza (set
  primario).
- **Iconify in modalità API runtime** — scartata: dipendenza runtime e fallimento **offline**,
  inaccettabile per la PWA ([ADR-0004](0004-form-factor-e-delivery.md)).
- **System font** invece di Inter — valido per la velocità, ma Inter dà coerenza cross-OS e
  ottime cifre tabulari per un gestionale.

## Rubric check

1. **Professionalità** — palette/tipografia/icone curate, contrasti AA, niente estetica
   generica.
2. **Convenzioni** — Inter, token semantici e Iconify(bundled) sono prassi moderne; continuità
   con la direzione già validata.
3. **Modularità** — token **semantici** separati dai valori grezzi; icone dietro un `<Icon>`
   del `ui-kit`.
4. **Zero debito** — nessuna dipendenza runtime per le icone; il compromesso a11y (pattern
   colorblind) è **tracciato** in [D-020](../deferred.md), non silenzioso.
