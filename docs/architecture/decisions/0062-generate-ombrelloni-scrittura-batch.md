# ADR-0062: il generatore di ombrelloni scrive in una sola INSERT; il budget delle transazioni è un tema a parte

- **Status:** Accepted
- **Data:** 2026-07-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0010](0010-isolamento-multi-tenant.md) (perché ogni scrittura passa da
  `forTenant`), [ADR-0052](0052-editor-struttura-cantiere.md) (il generatore e il suo cap),
  [ADR-0002](0002-decision-rubric.md) (rubrica)
- **Origine:** AUD-022 / [P9-003](../../audit/findings/P9-performance.md), fuori dal piano d'audit di
  proposito
- **Apre:** [D-067](../deferred.md#d-067) (budget esplicito di transazione e di pool)

## Context

`POST /establishment/umbrellas/generate` creava gli ombrelloni con un `tx.umbrella.create` **per
ombrellone**, dentro l'unica transazione aperta da
[`forTenant`](../../../apps/api/src/prisma/prisma.service.ts). Il DTO ammette `count` fino a **500**,
e 500 è il caso reale: è il lido grande il giorno dell'onboarding.

`forTenant` chiama `$transaction(fn)` **senza `transactionOptions`**, quindi vale il timeout di
default di Prisma. Il valore non è stato letto dalla documentazione ma **verificato sullo strumento
autoritativo** — una transazione da 8 s contro il client 5.22.0 installato risponde
`P2028 … The timeout for this transaction was 5000 ms`.

### La misura

Latenza iniettata da un proxy TCP fra client e Postgres, replicando la sequenza esatta di statement
del servizio. Round-trip contati sull'evento `query` del client, non stimati.

⚠️ **Lo scenario misurato ha `umbrellaTypeId: null`**, che è il caso del generatore usato senza
tipologia: con `umbrellaTypeId` valorizzato, `assertType` aggiunge una `findUnique` e ogni conto qui
sotto sale di **uno** (507 round-trip nel loop, 8 in batch). Non cambia nessuna conclusione — il
punto è che il loop è **lineare in `count`** e il batch **costante** — ma i numeri sono quelli di
quella condizione, non di ogni chiamata.

| RTT iniettato | Round-trip | Durata | Esito |
|---|---|---|---|
| diretta (~0) | 506 | 1.117 ms | ok |
| 2 ms | 506 | 2.667 ms | ok, ma **53 % del budget** |
| 6 ms | 506 | 4.886 ms | ok, ma sul filo — vedi la nota sotto |
| 8 ms | 427 (interrotta) | 5.009 ms | ❌ **P2028**, `created = 0` |
| 10 ms | 366 (interrotta) | 5.016 ms | ❌ **P2028**, `created = 0` |
| 30 ms | 144 (interrotta) | 5.039 ms | ❌ **P2028**, `created = 0` |

⚠️ **Quanto vale il «sul filo» a 6 ms, e quanto no.** La prima stesura di questo ADR diceva «2 % di
margine», ed era un numero **più preciso dello strumento che lo produce**: il proxy aggiunge ~1÷2 ms
per round-trip di suo, cioè **506÷1.012 ms** distribuiti sui 506 round-trip — un errore sistematico
più grande dei 114 ms che quel «2 %» pretendeva di misurare. Il numero onesto è un intervallo, non
una percentuale.

Ciò che la misura risolve davvero è il **bracket: 6 ms verde, 8 ms rosso**. Nettando l'overhead
dichiarato del proxy sul modello `1.117 + 506 × RTT` (la riga «diretta» dà la costante pulita,
2,21 ms per round-trip), il ginocchio **si estrapola** a ~**7,7 ms** — e le due classificazioni
reggono entrambe alla decontaminazione: 4.153 ms a 6 ms (dentro), 5.165 ms a 8 ms (fuori). Il 7,7 è
una **estrapolazione dichiarata**, non una misura: l'unica risoluzione che questa tabella rivendica
è l'intervallo fra 6 e 8.

E le due varianti batch, stesso scenario:

| RTT | `createManyAndReturn` | `createMany` + `findMany` |
|---|---|---|
| diretta | 7 round-trip · 84 ms | 8 round-trip · 93 ms |
| 2 ms | 7 · 115 ms | 8 · 137 ms |
| 10 ms | 7 · 214 ms | 8 · 245 ms |
| 30 ms | 7 · 458 ms | 8 · 524 ms |

**Il round-trip del batch è costante in `count`.** Il loop era lineare.

Due cose che la misura ha **corretto** rispetto all'enunciato del finding, e una che ha
**confermato**:

1. ❌→✅ **La soglia è più bassa.** P9-003 diceva «RTT 5 ms → ~2,5 s al pelo; RTT ≥10 ms → rottura».
   Misurato, a **6 ms** la transazione sta dentro e a **8 ms** è già P2028; decontaminato
   dall'overhead del proxy, il ginocchio si estrapola a ~**7,7 ms**. La finestra di sicurezza non è
   «sotto i 10 ms», è **sotto i ~7 ms** — e un Postgres gestito nella stessa region sta comunemente
   fra 1 e 5 ms: il margine reale è una manciata di millisecondi, non un ordine di grandezza.
2. ❌→✅ **`transactionOptions` non serve a chiudere AUD-022.** Con il batch, a RTT 30 ms la
   transazione chiude in 458 ms contro un tetto di 5.000: **un fattore 10 di margine**. Alzare il
   timeout avrebbe mascherato i round-trip lasciandoli lì. È l'unica delle tre che ha cambiato la
   **forma** della soluzione, non solo un numero.
3. ✅ **Confermato, non corretto: il fallimento è totale.** In tutti i casi rotti `created = 0` — la
   transazione fa rollback e l'operatore non ottiene *nessun* ombrellone. P9-003 lo diceva già
   («P2028, rollback totale»), e la misura lo ha verificato invece di darlo per buono. Sta qui
   perché è la conseguenza che decide l'urgenza, non perché fosse una scoperta.

### Lo strumento si è rotto prima dell'oggetto, di nuovo

La prima versione del proxy usava `setTimeout` e riportava **31 ms per query sia a RTT 10 che a
RTT 20** — cioè lo stesso numero per due condizioni diverse, che è la firma di uno strumento guasto.
Causa: su Windows la granularità del timer è **~15,6 ms** e vi si appiattisce *ogni* primitiva di
sleep, `setTimeout` e `Atomics.wait` incluse (misurato: `setTimeout(1)`, `(5)` e `(10)` durano tutti
~15,5 ms). L'orologio finale è uno **spin su `hrtime`**, preciso allo 0,2 % da 2 ms in su, e il
proxy è stato **rivalidato su un caso a risposta nota** — 40 query banali, delta per query pari
all'RTT iniettato — prima di credere a qualunque numero. Il proxy aggiunge ~1÷2 ms suoi, dichiarati.

## Decision

**Una sola `INSERT … RETURNING`** via `tx.umbrella.createManyAndReturn`, con `select: UMBRELLA_SELECT`.

`UMBRELLA_SELECT` è fatto di **soli scalari piatti** (`id`, `label`, `umbrellaTypeId`,
`logicalOrder`): non ha relazioni, che sono l'unico limite di `createManyAndReturn`. Il DTO che il
generatore restituisce è quindi ottenibile **senza una seconda query**.

`forTenant` **non cambia**: nessun `transactionOptions`, qui.

## Alternatives considered

- **`createMany` + `findMany` (la proposta del finding).** Funziona, ed è a un round-trip di
  distanza. Scartata perché quel round-trip è gratis da evitare (`RETURNING` esiste), e perché la
  ri-query per `label` reintroduce una domanda che l'`INSERT` aveva già risposto: *quali righe ho
  appena scritto?* Misurata comunque, ed è la riga di confronto nella tabella qui sopra.
- **Solo `transactionOptions` più larghi, lasciando il loop.** Scartata: sposta il muro senza
  toglierlo (a RTT 30 ms servirebbero ~15 s di tetto), e nel frattempo l'operatore aspetta. Un
  timeout più largo su una transazione di scrittura lunga è anche più tempo di lock sulle righe.
- **Batch a blocchi (es. 50 alla volta).** Complessità senza un problema che la giustifichi: 500
  righe × 6 colonne = ~3.000 parametri di bind, ben sotto il limite di 65.535 di Postgres, e il caso
  è provato end-to-end al cap.
- **`transactionOptions` espliciti su `forTenant`, in questa slice.** È la radice n. 3 di P9 — «il
  caso peggiore non è definito da nessuna parte» — e tocca **ogni** transazione dell'API, non il
  generatore. Va decisa insieme a `connection_limit` e ai timeout SMTP, con la sua misura. Metterla
  qui l'avrebbe fatta passare come corollario di un bugfix: è tracciata in
  [D-067](../deferred.md#d-067).

## Consequences

### Positive

- Il percorso peggiore del generatore passa da **506 round-trip a 7** (507 → 8 con la tipologia), e
  soprattutto da **lineare in `count` a costante**.
- L'onboarding del lido grande smette di dipendere dalla latenza verso il database.
- La e2e al cap di 500 gira in **186 ms** contro Postgres vero, RLS `FORCE` attiva e indice unique
  parziale in vigore.

### Negative / Trade-off

- `createManyAndReturn` è **PostgreSQL-only**. Il repo è già legato a Postgres in modo non
  negoziabile (RLS `FORCE`, `EXCLUDE` constraint, indici parziali), quindi non è un vincolo nuovo —
  ma è un vincolo in più sulla stessa direzione.
- L'ordine delle righe restituite dipende dall'ordine dei dati in ingresso. **Verificato** (3 corse
  su 300 righe, ordine sempre uguale all'input) e vincolato da due test, uno unit e uno e2e, che
  asseriscono la prima e l'ultima etichetta.

### Neutre / Note

- **Nessun cambio di comportamento osservabile**: `created`, `skipped` e l'ordine di `umbrellas`
  restano quelli di prima. Il collo di bottiglia era interamente nel *come*.
- La finestra di corsa su una `label` duplicata non cambia di segno: prima falliva una `INSERT`,
  ora fallisce la `INSERT` unica, e in entrambi i casi la transazione fa rollback.
- Il caso `toCreate` vuoto non scrive affatto — `createManyAndReturn` con `data: []` sarebbe un
  round-trip inutile, ed è presidiato da un test.

## Rubric check

1. **Professionalità** — ogni numero è misurato **tranne uno**, e quell'uno è etichettato: il
   ginocchio a ~7,7 ms è una **estrapolazione** dal modello `1.117 + 506 × RTT`, non un punto
   sperimentale. Il timeout di default è stato verificato sullo strumento, non letto; la soglia di
   rottura è stata trovata **restringendo** l'intervallo (6 ms verde, 8 ms rosso) invece che dedotta;
   lo strumento è stato validato su un caso a risposta nota **dopo** essersi rotto una volta.
   ⚠️ E la prima stesura conteneva un «2 % di margine» **più preciso dell'errore sistematico dello
   strumento che lo produceva** (114 ms rivendicati contro 506÷1.012 ms di overhead del proxy):
   trovato dalla review avversariale, non dalla rilettura, ed è la stessa classe di errore dei
   «63 MB» di ADR-0059. La lezione che resta: **un numero va confrontato con la risoluzione dello
   strumento prima di essere scritto**, non solo con l'oggetto misurato.
2. **Convenzioni** — la scrittura in batch segue la forma già in uso in
   [`catalog.service.ts`](../../../apps/api/src/catalog/catalog.service.ts) (`createMany` con
   `data: […].map`, guardato da un controllo di lunghezza); la misura controintuitiva sta nel
   commento accanto alla riga, non solo qui.
3. **Modularità** — nessun arco nuovo: il cambiamento è interno a un metodo, e `forTenant` resta
   intatto proprio per non far pagare a tutte le transazioni una decisione presa per una sola.
4. **Zero debito** — ciò che non è stato fatto è **dichiarato e tracciato** ([D-067](../deferred.md#d-067)),
   non lasciato implicito; e il presidio contro il ritorno del loop è stato provato per mutazione
   nei due versi (loop reintrodotto → 3 rossi, fra cui quello che si nomina; ripristino → 31 verdi).
