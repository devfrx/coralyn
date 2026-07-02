# ADR-0035: Il tipo prenotazione partiziona la formula di prezzo (abbonamento ≠ wildcard)

- **Status:** Accepted
- **Data:** 2026-07-02
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0032](0032-pricing-engine-precedenza.md) (**raffinato** da questo ADR: §1 semantica wildcard),
  [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (dominio pricing),
  [ADR-0009](0009-documentazione-di-design.md) (workflow). Spec:
  `docs/specs/2026-07-02-pricing-abbonamento-partizione-tipo-design.md`.

## Context

[ADR-0032](0032-pricing-engine-precedenza.md) definì `type` come una normale dimensione-filtro con `type=null`
"wildcard" (vale per qualsiasi tipo, abbonamento incluso) e `type` come **ultima** dimensione di precedenza (la più
debole). All'epoca il prezzo era guidato da `Rate.unit` (`day`/`period`).

Lo slice "Chiarezza tipi prenotazione" (2026-07-02) ha **cambiato il ruolo di `type`**: ora è `type` a determinare la
**formula** — `subscription` → forfait di stagione, `daily`/`periodic` → prezzo × giorni — e `unit` è stato rimosso. La
precedenza (`type` ultimo) non fu rivista dopo quel cambio: da lì il debito.

**Bug emerso dal vivo.** Un abbonamento (Giorno Intero) veniva prezzato **€28** — una tariffa fascia-specifica a
`type=null` — invece della tariffa dedicata **Abbonamento €800**. Il wildcard `type=null` combaciava con `subscription`;
nella precedenza la fascia (dimensione 5) batte il tipo (dimensione 6), così la tariffa €800 (specifica solo su `type`,
l'ultima dimensione) era **irraggiungibile** ogni volta che esisteva una tariffa fascia-specifica a `type=null`.
Aggravante: per un abbonamento il prezzo vincente è usato **come forfait di stagione**, quindi un prezzo *al giorno* (€28)
diventava il prezzo dell'intera stagione. Errore di categoria.

## Decision

**Il tipo partiziona la formula.** Il prezzo di una tariffa è un valore *al giorno*; il wildcard `type=null` rappresenta
la famiglia **a prezzo/giorno** (`daily`/`periodic`), **non** il forfait. Un abbonamento ha una formula diversa (forfait
di stagione) e va prezzato **solo** da una tariffa `type='subscription'`.

Operativamente, nel motore puro (`pricing.engine.ts`, `isApplicable`):

- **`ctx.type === 'subscription'`**: applicabili **solo** le tariffe con `type === 'subscription'`. Le tariffe wildcard
  (`type=null`) e quelle daily/periodic sono **escluse**.
- **`ctx.type ∈ {daily, periodic}`**: comportamento **invariato** — il wildcard `type=null` continua ad applicarsi; una
  tariffa `type='subscription'` non è mai applicabile (già escluso dal check `r.type !== ctx.type`), quindi nessun forfait
  moltiplicato ×giorni.

**Raffinamento di ADR-0032 §1.** `type=null` non significa più "qualsiasi tipo, abbonamento incluso" ma "famiglia a
prezzo/giorno (daily/periodic)". L'abbonamento è una famiglia **forfait partizionata** che richiede una tariffa
`type='subscription'`.

**Precedenza invariata.** `specificity`/`compareSpecificity` (l'ordine periodo › fila › settore › pacchetto › fascia ›
tipo) **non** cambiano. La partizione è sufficiente:
- Tra le tariffe subscription (tutte `type='subscription'`) `tipo` è costante → la sua posizione è irrilevante; la
  specificità normale (periodo/fila/settore/pacchetto/fascia) decide correttamente.
- Tra le tariffe a prezzo/giorno, `tipo`-ultimo distingue ancora una tariffa daily-specifica dalla catch-all senza
  scavalcare la specificità di posizione. Riordinare introdurrebbe effetti indesiderati su daily/periodic senza servire il
  problema.

**No-match esplicito (mai forfait silenzioso).** Un abbonamento in un listino privo di tariffa `subscription` produce
`NO_RATE` → **422** con messaggio dedicato "Nessuna tariffa Abbonamento configurata per questa stagione" (coerente con
ADR-0032 §6, "mai €0/prezzo silenzioso"). Il messaggio generico resta per gli altri no-match.

## Consequences

### Positive
- **Errore di categoria eliminato alla radice**: un prezzo/giorno non può più essere reinterpretato come forfait di
  stagione. Il fix non dipende dalla presenza o meno di una tariffa fascia-specifica.
- **Diagnostica chiara**: un listino senza tariffa Abbonamento dà un 422 che indica esattamente cosa manca, invece di un
  forfait errato silenzioso.
- **Precedenza intatta**: nessun rischio di regressione su daily/periodic da un riordino delle dimensioni.

### Negative / Trade-off
- **Cambio di comportamento osservabile (voluto)**: un listino privo di tariffa Abbonamento ora **rifiuta** (422) le
  prenotazioni Abbonamento invece di prezzarle col wildcard. Un listino ben formato con tariffa Abbonamento non è
  impattato (il seed dev/e2e la contiene già).

### Neutre / Note
- **Nessuna migrazione**: cambia solo la logica del motore puro + un messaggio 422 + questa doc.
- **FE invariato**: il modale già gestisce il 422 (blocca il confirm, mostra il messaggio del server); nessun avviso
  editor (deciso NO nello slice "Chiarezza tipi" §7.4).

## Alternatives considered

- **Solo riordino della precedenza** (portare `tipo` più in alto): fa vincere €800 su €28 *in questo caso*, ma con la sola
  catch-all €28 e nessuna tariffa Abbonamento l'abbonamento verrebbe ancora prezzato €28-come-forfait → fix parziale,
  debito residuo. Scartata.
- **Guard/avviso a motore invariato**: tampone, non elimina la causa (il wildcard resterebbe applicabile). Scartata.

## Rubric check

1. **Professionalità** — il fix è alla radice (partizione della formula), non un riordino tattico; il no-match esplicito a
   422 è la scelta sicura di un engine di pricing.
2. **Convenzioni** — motore puro unit-testato in isolamento (coerente con ADR-0032 §4); messaggi di dominio in italiano,
   codice in inglese (ADR-0030).
3. **Modularità** — la partizione vive interamente in `isApplicable` (motore `catalog`); il messaggio type-aware nel
   `BookingsService`; nessuna dipendenza nuova.
4. **Zero debito** — il debito lasciato aperto da "Chiarezza tipi" (precedenza non rivista dopo il cambio di ruolo di
   `type`) è qui chiuso e tracciato; la precedenza resta invariata per scelta motivata, non per inerzia.
