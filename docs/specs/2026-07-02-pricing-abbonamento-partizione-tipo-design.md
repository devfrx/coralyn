# Pricing — Abbonamento prezzato solo da tariffe Abbonamento (partizione del tipo) — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02. **Da pianificare ed
  eseguire** (ADR-0009).
- **Origine:** emerso testando dal vivo. Creando una prenotazione **Abbonamento** (Giorno Intero) il modale mostra
  **€ 28.00** con "Tariffa applicata: Giorno Intero — €28.00 forfait stagione", mentre il listino ha una tariffa
  dedicata **Abbonamento → €800 forfait/stagione**. L'abbonato pagherebbe €28 per l'intera stagione invece di €800.
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio
  pricing), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (precedenza — **raffinato** da questo
  slice), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow). **Nuovo ADR-0035** (vedi §3.4).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (su `main`, **post-merge
  Archiviazione**, verificata live 2026-07-03): **api unit 91 · api e2e 129 · web-staff 148 (globa ui-kit) · ui-kit
  standalone 55.** Questo slice parte da `main` con l'Archiviazione già inclusa.
- **Nessuna migrazione.** Cambia solo la logica del motore puro + un messaggio 422 + doc.

---

## 1. Situazione attuale (root cause verificata leggendo il codice)

Il motore ([`pricing.engine.ts`](../../apps/api/src/catalog/pricing.engine.ts)) sceglie tra le tariffe *applicabili* la
più specifica secondo l'ordine totale ADR-0032: **periodo › fila › settore › pacchetto › fascia › `tipo`**. `tipo` è
l'ultima dimensione (la più debole).

**Trace del bug** (prenotazione `subscription`, fascia Giorno Intero):

| Tariffa | `type` | `fascia` | vettore `[periodo,fila,settore,pacchetto,**fascia**,**tipo**]` |
|---|---|---|---|
| €28 Giorno Intero / Tutti | `null` (wildcard) | Giorno Intero | `[F,F,F,F,**T**,F]` |
| €800 Abbonamento / Tutte | `subscription` | `null` | `[F,F,F,F,**F**,T]` |

`isApplicable` ([`pricing.engine.ts:33`](../../apps/api/src/catalog/pricing.engine.ts:33)) considera **applicabile** la €28
perché `type=null` combacia con qualsiasi tipo, inclusa `subscription`. In `compareSpecificity` le prime quattro
dimensioni sono pari; alla **fascia** la €28 ha `T` e la €800 ha `F` → la €28 vince e il confronto si ferma **prima** di
arrivare a `tipo`. La €800 (specifica solo su `tipo`, l'ultima dimensione) è **irraggiungibile** ogni volta che esiste una
tariffa fascia-specifica a `type=null`.

**Aggravante — errore di categoria.** Alla [riga 91](../../apps/api/src/catalog/pricing.engine.ts:91):
`ctx.type === 'subscription' ? price : price*days`. Per un abbonamento il prezzo della tariffa vincente è usato **come
forfait di stagione**. La €28 — pensata come prezzo *al giorno* — diventa il prezzo dell'**intera stagione**. La label
"forfait stagione" (che usa il tipo corrente della prenotazione) fa sembrare tutto legittimo.

**Perché ADR-0032 non lo aveva previsto.** Quando fu scritto (2026-06-30), `type` era una semplice dimensione-filtro e il
prezzo era guidato da `Rate.unit`. Lo slice "Chiarezza tipi prenotazione" (2026-07-02) ha **cambiato il ruolo di `type`**:
ora determina la **formula** (subscription→forfait, daily/periodic→×giorni) e `unit` è stato rimosso. La precedenza (`type`
ultimo) non fu rivista dopo quel cambio: è lì il debito.

## 2. Obiettivo e principio (partizione dura del tipo)

**Principio (deciso):** il prezzo di una tariffa è un valore *al giorno*; il wildcard `type=null` rappresenta la famiglia
**a prezzo/giorno** (daily/periodic), **non** il forfait. Un abbonamento ha una formula diversa (forfait) e va prezzato
**solo** da una tariffa `type = subscription`. Così l'errore di categoria (prezzo/giorno reinterpretato come forfait
stagione) sparisce **alla radice**, non solo nel caso specifico.

**Scartate (con motivo):**
- **Solo riordino della precedenza** (portare `tipo` più in alto): fa vincere €800 su €28 *in questo caso*, ma con la
  sola catch-all €28 e nessuna tariffa Abbonamento l'abbonamento verrebbe ancora prezzato €28-come-forfait → fix
  parziale, debito residuo.
- **Guard/avviso a motore invariato**: tampone, non elimina la causa.

**Fuori scope (YAGNI):** nessun riordino della precedenza (§3.2); nessun avviso "manca Abbonamento" nell'editor (già
deciso NO nello slice "Chiarezza tipi" §7.4); nessun cambio a daily/periodic; nessun forfait per periodica (resta
**D-034**, deferred). Nessun tocco ad archiviazione/equipment.

## 3. Layer backend (unico layer di sostanza)

### 3.1 Motore — `isApplicable` ([`pricing.engine.ts:32-44`](../../apps/api/src/catalog/pricing.engine.ts:32))

Sostituire la sola riga del check sul tipo. **Prima:**
```ts
  if (r.type !== null && r.type !== ctx.type) return false;
```
**Dopo:**
```ts
  // 'subscription' ha formula forfait (non prezzo/giorno): dev'essere prezzato SOLO da tariffe
  // esplicitamente subscription. Il wildcard (type=null) rappresenta la famiglia a prezzo/giorno
  // (daily/periodic), NON il forfait di stagione (ADR-0035, raffina ADR-0032 §1).
  if (ctx.type === 'subscription') {
    if (r.type !== 'subscription') return false;
  } else if (r.type !== null && r.type !== ctx.type) {
    return false;
  }
```
- **daily/periodic:** comportamento **identico** (il wildcard continua ad applicarsi).
- **subscription:** applicabili **solo** le tariffe `type='subscription'`; le altre (incluse le wildcard) sono escluse.
- Simmetria già garantita: una tariffa `type='subscription'` non è mai applicabile a daily/periodic (il check
  `r.type !== ctx.type` la escludeva già) → nessun forfait moltiplicato ×giorni.

### 3.2 Precedenza — **invariata** (nessun riordino)

`specificity`/`compareSpecificity` restano identici. Motivazione da mettere a verbale (contro il "riordino"):
- Tra le tariffe subscription (tutte `type='subscription'`) la specificità normale (periodo/fila/settore/pacchetto/fascia)
  decide correttamente; `tipo` è costante → la sua posizione è irrilevante per gli abbonamenti.
- Tra le tariffe a prezzo/giorno, `tipo`-ultimo distingue ancora bene una tariffa daily-specifica dalla catch-all senza
  scavalcare la specificità di posizione. Riordinare introdurrebbe effetti indesiderati su daily/periodic senza servire il
  problema.

### 3.3 Messaggio 422 specifico ([`bookings.service.ts:50-56`](../../apps/api/src/bookings/bookings.service.ts:50))

`throwPriceError` diventa type-aware per il caso `NO_RATE`. **Firma:** aggiungere il parametro `type: BookingType`.
```ts
  private throwPriceError(outcome: Extract<QuoteOutcome, { ok: false }>, type: BookingType): never {
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    // NO_RATE
    if (type === 'subscription')
      throw new UnprocessableEntityException('Nessuna tariffa Abbonamento configurata per questa stagione');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino');
  }
```
**Call site 1** — `quote` ([riga 71](../../apps/api/src/bookings/bookings.service.ts:71)):
`if (!outcome.ok) this.throwPriceError(outcome, input.type);`
**Call site 2** — `priceAndWrite` (create/renew), [riga 197](../../apps/api/src/bookings/bookings.service.ts:197):
`if (!outcome.ok) this.throwPriceError(outcome, p.type);` (il tipo è `p.type` nella firma di `priceAndWrite`).
Sono gli **unici due** call site di `throwPriceError` (righe 71 e 197).

### 3.4 ADR-0035 (nuovo)

Creare [`docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md`](../architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md):
raffina **ADR-0032 §1** (semantica del wildcard) e formalizza il ruolo di `type` post-"Chiarezza tipi": `type=null` non
significa più "qualsiasi tipo incluso l'abbonamento" ma "famiglia a prezzo/giorno (daily/periodic)"; l'abbonamento è una
famiglia **forfait partizionata** che richiede una tariffa `type='subscription'`; il no-match resta 422 (mai forfait
silenzioso). Aggiungere in **ADR-0032** una riga di rimando ("Raffinato da ADR-0035, 2026-07-02") nell'intestazione/§2,
**senza** riscrivere la decisione originale.

## 4. Layer FE (nessun cambio di comportamento)

- Il modale prenotazione (`MapView.vue`) **già** gestisce `NO_RATE`/422 (blocca il confirm e mostra il messaggio del
  server). Dopo il fix: un abbonamento con tariffa Abbonamento mostra il forfait corretto (es. €800) e la label
  "€800 forfait stagione" si autocorregge; un abbonamento senza tariffa Abbonamento mostra il **422 specifico**.
- I test FE usano MSW: il mock `GET /api/bookings/quote` ([`server.ts:194-203`](../../apps/web-staff/src/mocks/server.ts:194))
  già ritorna €800 per `type=subscription` → i test FE **non** sono impattati dal cambio motore. Nessuna modifica FE
  necessaria oltre a un'eventuale verifica; **nessun** avviso editor (§2).

## 5. Piano di test (TDD)

**Unit motore ([`pricing.engine.spec.ts`](../../apps/api/src/catalog/pricing.engine.spec.ts)) — cuore dello slice:**
- **Sostituzione 1:1:** il test esistente "subscription → forfait, indipendente dai giorni"
  ([riga 79](../../apps/api/src/catalog/pricing.engine.spec.ts:79)) oggi usa una tariffa **wildcard** (`type:null`). Va
  aggiornato a una tariffa `type:'subscription'` (la premessa cambia: un abbonamento non è più prezzato da una wildcard).
- **Nuovo — il bug esatto:** subscription + { fascia-specifica €28 `type:null`, €800 `type:'subscription'` fascia null } →
  vince **€800** (la tariffa Abbonamento batte la fascia-specifica wildcard).
- **Nuovo — partizione:** subscription + solo catch-all `type:null` → **NO_RATE** (non più prezzata dalla wildcard).
- **Nuovo — nessuna regressione per/day:** daily con catch-all `type:null` → applicabile (invariato); periodic idem.

**e2e ([`bookings.e2e-spec.ts`](../../apps/api/test/bookings.e2e-spec.ts)):**
- subscription **senza** tariffa Abbonamento nella stagione → **422** con messaggio "Nessuna tariffa Abbonamento
  configurata per questa stagione" (nuovo comportamento). *(Attenzione all'helper condiviso
  [`seed-pricing.ts`](../../apps/api/test/helpers/seed-pricing.ts) che seeda una tariffa subscription: usare una stagione/setup
  senza tariffa subscription per questo caso, senza rompere gli altri test.)*
- conferma che una prenotazione subscription con tariffa Abbonamento è prezzata dal forfait (€800/€850) — **invariato**
  (l'helper e il seed hanno già la tariffa subscription; il caso non regredisce).

**Impatto rinnovi:** il renew genera una subscription; il seed 2027 ha la tariffa €850 → invariato. Verificare che
`renewal-campaigns.e2e` e `bookings.e2e` restino verdi.

## 6. Impatto e conseguenze (verificato)

- **Seed dev** ([`seed.ts:159-191`](../../apps/api/prisma/seed.ts:159)) ha già €800 (2026) e €850 (2027) subscription → il
  **bug dal vivo si risolve col solo cambio motore**, nessuna modifica al seed.
- **Helper e2e** ([`seed-pricing.ts`](../../apps/api/test/helpers/seed-pricing.ts)) seeda già una tariffa subscription → il
  pricing subscription negli e2e resta invariato.
- **1 solo test unit** aggiornato 1:1 (§5); tutto il resto è additivo. Baseline `main` (post-Archiviazione: api unit 91 ·
  e2e 129 · web-staff 148 · ui-kit 55) da non regredire: attesi **+3/4 unit** (motore) **+1/2 e2e** (422 abbonamento),
  **0 FE**.
- **Cambio di comportamento osservabile (voluto):** un listino privo di tariffa Abbonamento ora dà **422** su prenotazioni
  Abbonamento invece di un forfait errato silenzioso. Coerente con ADR-0032 §6 ("mai €0/prezzo silenzioso").

## 7. Decisioni (risolte in brainstorming 2026-07-02)

1. **Partizione dura del tipo** (non riordino, non guard): l'abbonamento è prezzato solo da tariffe `type='subscription'`;
   il wildcard è la famiglia a prezzo/giorno. Root-cause, senza debiti.
2. **Precedenza invariata** — la partizione basta; riordinare sarebbe incompleto e rischioso.
3. **422 specifico** per abbonamento senza tariffa Abbonamento ("Nessuna tariffa Abbonamento configurata per questa
   stagione") — più chiaro del generico.
4. **Nuovo ADR-0035** che raffina ADR-0032 §1 (+ rimando in 0032). Storia decisioni tracciabile.
5. **Nessun avviso editor** "manca Abbonamento" (coerente con "Chiarezza tipi" §7.4 = NO). FE invariato.

## 8. Scope, branch, logistica

- **Slice separato**, **nuovo branch da `main`** (ADR-0009). File toccati: `pricing.engine.ts` (+spec),
  `bookings.service.ts` (+e2e), nuovo ADR-0035, riga di rimando in ADR-0032. **Indipendente** dallo slice Archiviazione
  (già mergiato su `main`, che tocca catalog service/editor/contratti) → nessun conflitto di file. Un solo layer (backend)
  → probabile **un solo commit** (motore+service+e2e) + eventuale commit doc (ADR).
- **Workflow ADR-0009:** questa spec → (approvazione utente) → piano TDD (`writing-plans`) → esecuzione subagent-driven,
  test-first. Non regredire i conteggi (riverificati dal vivo).
