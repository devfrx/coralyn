# ADR-0061: il tetto ai worker vive nelle configurazioni dei runner, non nello script condiviso

- **Status:** Accepted
- **Data:** 2026-07-26
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0059](0059-gate-link-documenti.md) (§2, perché un'asserzione sta in un
  package e non in uno script alla radice), [ADR-0002](0002-decision-rubric.md) (rubrica)
- **Origine:** [D-066](../deferred.md#d-066), trovata eseguendo la Fase G2 dell'audit
- **Chiude:** D-066

## Context

`pnpm run verify` (e `pnpm run test`, che la CI esegue) andava in OOM quando la macchina era sotto
pressione di memoria, con `FATAL ERROR: Zone Allocation failed`. La voce attribuiva la causa alla
concorrenza **fra pacchetti** e proponeva `--workspace-concurrency=N`; un addendum del 2026-07-26
correggeva il tiro dicendo che gli assi sono **due**, perché l'OOM arrivava anche su un pacchetto
solo.

Misurato su questa macchina — **32 core logici, 31,2 GB**, campionando processi e memoria residente
ogni secondo. Configurazione di partenza: jest a `maxWorkers: '50%'` (cioè **16 worker**), le sette
vitest **senza alcun limite** (default: un fork per file fino a `core − 1`).

| Configurazione | Tempo | Processi max | Picco RSS |
|---|---|---|---|
| **attuale** | 36 s | 55 | **10.473 MB** |
| `--workspace-concurrency=1` da solo | 48 s | 38 | 8.910 MB |
| `maxWorkers=8` | 51 s | 31 | 5.666 MB |
| `maxWorkers=4` | 76 s | 22 | 4.117 MB |
| `ws-conc=2` + `maxWorkers=4` | 82 s | 16 | 3.417 MB |
| `ws-conc=1` + `maxWorkers=4` | 94 s | 12 | 2.685 MB |
| `maxWorkers=2` | 132 s | 15 | 2.507 MB |

Ogni corsa è stata letta con **1174 test su 179 file/suite**: senza quel controllo un «verde più
veloce» può essere una suite che non è partita, che è il modo in cui questa voce fallisce.

Tre misure hanno deciso la forma della soluzione, e nessuna era nella voce:

1. **`ui-kit` da sola arriva a 5.338 MB** con 39 processi, cioè **più della RAM libera** nello
   scenario in cui D-066 è stata osservata (3,7–5,1 GB). Su un pacchetto solo
   `--workspace-concurrency` non ha nulla da limitare: sull'unico caso documentato dall'addendum
   l'asse A non è insufficiente, è **inapplicabile**.
2. **L'asse A da solo compra poco**: −15 % di memoria per +33 % di tempo. È il rapporto peggiore
   della tabella.
3. **`maxWorkers=2` è dominato**: costa 132 s per 2.507 MB, mentre `ws-conc=1 + maxWorkers=4` fa
   2.685 MB in 94 s — 38 secondi in meno per 178 MB in più.

⚠️ **Lo strumento di misura si è rotto per primo, di nuovo.** La prima versione del campionatore
riportava «picco 8 processi, 56 MB», e la RAM libera a 493 MB contro i 14,5 GB misurati un minuto
prima: l'operatore `-f` di PowerShell con `N0`/`N1` è **locale-dipendente** e rompeva il CSV. È stato
riscritto senza formattazione e **validato su un caso a risposta nota** (sei processi `node` lanciati
apposta) prima di essere creduto. In quest'area il conto sale: lo strumento si è rotto nove volte,
l'oggetto misurato zero.

## Decision

**1. Il tetto vive nelle configurazioni dei runner, non nello script condiviso.** `jest.config.ts` e
le sette `vitest.config.ts` dichiarano `maxWorkers`. Conseguenza voluta: `pnpm run test`, `verify` e
il workflow della CI **non vengono toccati** — e soprattutto il tetto vale per **ogni** punto
d'ingresso, compreso `pnpm --filter @coralyn/api test`, che è il comando che l'addendum di D-066
documenta come fallito. Un flag sullo script di root avrebbe lasciato scoperto proprio quello.

**2. La formula è «metà dei core, ma non più di 4»:**

```ts
const MAX_WORKERS = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
```

Il **tetto assoluto** è la parte che conta: una percentuale cresce con la macchina, cioè proprio dove
il problema è la macchina grande — `50%` su 32 core sono 16 worker, ed è con quel valore che
`apps/api` da sola arrivava a 7.807 MB. La metà dei core resta come limite inferiore per non
peggiorare le macchine piccole: sul runner CI (4 core) la formula dà **2**, che è esattamente il
`50%` di prima, quindi **jest in CI non cambia**. `availableParallelism()` e non `cpus().length`
perché rispetta i limiti di cgroup, che dentro un container sono la verità.

**3. `--workspace-concurrency` non si tocca.** Misurato: da solo vale poco (punto 2 del Context), e
col tetto in vigore servirebbe soltanto a scendere da 4,1 a 3,4 GB pagando 6 secondi — su una CI che
il problema non ce l'ha (runner dedicato, un job per volta) e a scapito di una macchina di sviluppo
dove il comando che si lancia sotto pressione è il singolo pacchetto, ormai a 1,4 GB.

**4. L'espressione è ripetuta in 8 file, e la ripetizione è resa sicura da un test.** Un modulo
condiviso avrebbe due forme, entrambe peggiori: importarlo fra pacchetti **dentro un file di
configurazione** creerebbe un arco che nel workspace non esiste, e un modulo alla radice non sarebbe
typecheckato — è la ragione di [ADR-0059](0059-gate-link-documenti.md) §2. È lo stesso patto di
[`tenant-id.spec.ts`](../../../apps/api/src/tenant/tenant-id.spec.ts): la ripetizione è ammessa e
**vincolata**.

**5. Il presidio è [`test-workers.spec.ts`](../../../packages/docs-lint/src/test-workers.spec.ts)**,
e controlla tre cose distinte perché ci sono tre modi diversi di perdere il tetto: una config senza
l'espressione, la costante dichiarata ma **non passata** a `maxWorkers`, e il ritorno a una
percentuale. Ha anche il proprio «guarda dove crede di guardare»: un glob che smettesse di matchare
darebbe un gate verde su zero file.

## Alternatives considered

- **Un flag sullo script di root (`pnpm -r test --maxWorkers=N`)** — scartata, ed era l'opzione
  apparentemente più economica. Non protegge le esecuzioni per-pacchetto, cioè il caso misurato che
  falliva; e tocca lo script su cui gira la CI, che è la superficie su cui il rischio non vale il
  guadagno.
- **Solo `--workspace-concurrency=N`**, la proposta originale della voce — scartata sui numeri:
  −15 % di memoria per +33 % di tempo, e nessun effetto sul caso a pacchetto singolo.
- **`maxWorkers=2`** — scartata perché dominata (vedi Context, punto 3).
- **Un package condiviso per la costante** — scartata: cinque righe non giustificano un package, e
  soprattutto una `vitest.config.ts` che importa da un altro pacchetto del workspace dichiara una
  dipendenza di build che non esiste.
- **Un tetto adattivo sulla memoria libera** (`min(freeGB / 1.2, …)`) — scartata, ed è la più
  seducente: renderebbe il gate non deterministico (stessa revisione, parallelismo diverso a ogni
  corsa) e allocherebbe **più** worker proprio quando la memoria sembra libera, che è la dinamica
  del difetto attuale, non la sua cura.

## Consequences

### Positive

- **Sul pacchetto che falliva, il tetto costa zero tempo.** `apps/api` da sola: **7.807 → 2.659 MB**
  (−66 %) con la stessa durata, **9 s** in entrambi i casi. I 16 worker di `50%` erano
  sovradimensionati per 59 file: pagavamo memoria senza comprare velocità.
- **`ui-kit` da sola: 5.338 → 1.383 MB** (−74 %). È il caso che rendeva l'asse A inapplicabile.
- **Gate completo: 9.615–10.473 → 3.737–4.099 MB** (più corse per configurazione; −61 % sul
  confronto peggiore), con **1180 test su 180 file/suite** — il totale letto insieme al conteggio
  delle suite, come la voce stessa impone.
- **Tre mutazioni, tre rossi**: config senza tetto → 2 rossi che nominano il file; costante non
  passata → 1; ritorno a `'50%'` → 2. Un pacchetto nuovo senza tetto non può passare inosservato,
  ed è l'unico modo in cui questa voce può riaprirsi.
- **La CI non cambia per jest**: 4 core → 2 worker, identico al `50%` precedente.

### Negative / Trade-off

- **Il gate completo passa da ~36 a 61–88 secondi** su questa macchina. ⚠️ Il numero è **instabile**:
  tre corse della stessa configurazione hanno dato **61, 76 e 88 s**, mentre il picco di memoria è
  restato dentro 3.737–4.099 MB. La varianza è dichiarata invece di scegliere il numero più comodo,
  e la conseguenza pratica è che **questo gate non serve a misurare regressioni di durata**: per
  quelle serve il confronto per pacchetto, dove la dispersione è molto minore. Il prezzo è accettato
  perché mezzo minuto in più su un comando che si lancia prima di un commit vale meno di un gate
  che, sotto pressione, dà verdi con 26 suite mai partite.
- **`ui-kit` da sola passa da 6 a 19 secondi.** È il pacchetto che perde di più in proporzione,
  perché è quello che sfruttava di più i 32 core.
- **L'espressione è in 8 copie.** Vincolata da un test, ma resta ripetizione: se il tetto dovesse
  diventare configurabile per pacchetto, questa è la decisione da rivedere per prima.
- **In CI vitest scende da 3 a 2 fork per pacchetto**, quindi il job `static` rallenta un poco.
  ⚠️ Non misurato: i 4 vCPU / 16 GB del runner sono la specifica documentata da GitHub, e il log dei
  job non è scaricabile senza token.

### Neutre / Note

- Il tetto non sostituisce `workerIdleMemoryLimit` di jest, che resta: sono due difese diverse — uno
  limita **quanti** processi, l'altro ricicla quello che **cresce troppo**.
- **Il tetto tocca sette pacchetti su otto, non due.** Vitest non apre più fork che file, quindi
  l'unico davvero sotto il tetto è `legal` (**1** file). Misurato per pacchetto, una corsa ciascuno,
  confrontando il tetto con `--maxWorkers=32`:

  | Pacchetto | File | Con tetto | Senza | Δ |
  |---|---|---|---|---|
  | `legal` | 1 | 1.962 ms | 1.909 ms | +2 % (rumore) |
  | `docs-lint` | 5 | 1.291 ms | 1.247 ms | +3 % |
  | `web-platform` | 7 | 5.254 ms | 4.659 ms | +12 % |
  | `web-customer` | 7 | 5.281 ms | 4.569 ms | +15 % |
  | `data-layer` | 5 | 2.655 ms | 2.057 ms | +29 % |
  | `ui-kit` | 39 | 19 s | 6 s | **+217 %** |

  ⚠️ Una stesura precedente di questa riga diceva che quei pacchetti «non raggiungevano comunque il
  tetto»: era **falsa per aritmetica** — il tetto è 4 e i loro file sono 5 e 7. L'ha trovata una
  review indipendente, non la rilettura, ed è il tipo di errore che questo ADR pretende di non
  contenere. Il tetto resta **portante** su `ui-kit` e `web-staff` (57 file), dove la memoria
  risparmiata è quella che chiude la voce; sugli altri il costo è di millisecondi, e vale il non
  dover ricordare quale pacchetto è cresciuto.

## Rubric check

1. **Professionalità** — nessun numero di questo ADR è stimato; la proposta della voce è stata
   **misurata e scartata** invece che eseguita, e il campionatore è stato validato su un caso a
   risposta nota prima di essere creduto.
2. **Convenzioni** — il valore sta dove sta già ogni altra impostazione di runner; il presidio segue
   la forma degli spec di `docs-lint`, compreso il «guarda dove crede di guardare».
3. **Modularità** — nessun arco nuovo fra pacchetti: le configurazioni restano indipendenti, e
   l'unico accoppiamento è un test che le legge.
4. **Zero debito** — l'unica ripetizione introdotta è dichiarata qui sopra e vincolata da tre test;
   il costo in tempo è dichiarato con la misura, non con un aggettivo.
