# ADR-0059: Le asserzioni sui documenti vivono in un package, e il gate dei link è un test

- **Status:** Accepted
- **Data:** 2026-07-26
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0058](0058-package-data-layer-condiviso.md) (§7, il modello:
  «cosa la renderebbe rossa se smettesse di esserlo?»),
  [ADR-0009](0009-documentazione-di-design.md) (i documenti sono parte del lavoro, non un contorno),
  [ADR-0002](0002-decision-rubric.md) (rubrica)
- **Origine:** audit 2026-07-25, Fase H — l'item «spostare le asserzioni verificabili dai documenti
  ai test»
- **Chiude:** il residuo principale della Fase H

## Context

La Fase H ha corretto **~100 link markdown rotti in 22 documenti**. Due cose, misurate durante quella
stessa correzione, dicono perché il fix non poteva finire lì:

1. **Nella sessione che li correggeva ne sono stati introdotti due nuovi**, e li ha presi lo
   strumento di misura, non la rilettura. Un link rotto è invisibile a occhio: il testo è quello
   giusto, solo la destinazione non esiste.
2. **Il numero storico «67 link rotti» era sbagliato per un bug del misuratore**, che contava solo i
   link inizianti per `.` e saltava tutti i `docs/...` nudi — compreso l'intero README di root.

C'è un terzo fatto, ed è quello che decide *dove* mettere il gate. Costruendo lo strumento sono stati
trovati **quattro** bug al suo interno, tutti da casi a risposta nota e nessuno dalla rilettura:

| # | Bug | Effetto misurato |
|---|---|---|
| 1 | `anchorsOf` mascherava l'inline-code **dentro gli heading** | `## Con \`codice\`` produceva lo slug sbagliato |
| 2 | la variation selector U+FE0F (categoria `Mn`) sopravviveva al filtro | un carattere invisibile nello slug → anchor corretti segnalati rotti |
| 3 | una patch applicata via shell ha raddoppiato i backslash | il filtro cancellava le lettere `u/F/E/0/D` da **ogni** slug: 6 casi rossi |
| 4 | `**DoD [ADR-0009]:**`, grassetto spezzato su due righe, letto come *link reference definition* con destinazione `**` | **18 rotti dichiarati invece di 17** |

Sommati ai tre della sessione precedente (link nudi non contati, slug con `\s+` invece di ` `,
`fs.existsSync` case-insensitive su Windows), fanno **sette bug nello strumento** contro **zero**
scoperte sbagliate sull'oggetto misurato. Un gate che sbaglia è peggio di nessun gate: il primo tipo
di errore lascia passare il debito, il secondo insegna a ignorare il rosso.

## Decision

**1. Nuovo package privato `packages/docs-lint` (`@coralyn/docs-lint`).** Non ha mappa `exports` e
nessuno lo importa: non è una libreria, è **il posto dove vivono le asserzioni sui documenti**, come
`single-source.spec.ts` è il posto dove vive quella su `ApiError`. Il criterio di appartenenza è
quello di ADR-0058 §1 applicato ai documenti: un'asserzione vive nel package che possiede l'oggetto
di cui parla, e nessuno dei package esistenti possiede `docs/`.

**2. Il gate è uno spec, non uno script.** `doc-links.spec.ts` gira dentro `pnpm -r test` e
`tsc --noEmit` dentro `pnpm -r typecheck`. Conseguenza voluta: **`verify` e il workflow della CI non
vengono toccati**. Il job `static` esegue `lint`, `typecheck` e `test` come step separati — non
esegue `verify` — quindi uno script di root avrebbe richiesto **due** modifiche al gate condiviso,
che è esattamente la superficie su cui il rischio non vale il guadagno.

**3. Lo strumento ha uno spec suo.** `link-check.spec.ts` contiene i casi che hanno smascherato tutti
e sette i bug, come casi permanenti: link nudi senza `./`, `## Due  spazi` → `#due--spazi`, un file
esistente con il case sbagliato, il grassetto spezzato su due righe, l'inline-code dentro un heading.
Spedire il misuratore senza casi a risposta nota sarebbe stato istituzionalizzare l'errore invece di
chiuderlo.

**4. L'elenco dei file viene da `git ls-files`, non da una `readdir`.** `RUNBOOK.local.md` e tutto
`.superpowers/` sono gitignorati: scandirli farebbe fallire il gate su file che non stanno nel repo,
cioè rosso su una macchina e verde su un'altra.

**5. Il confronto dei path è case-sensitive per costruzione**, segmento per segmento contro
`readdir`, e non tramite `fs.existsSync`. Su Windows e macOS un link con il case sbagliato passa in
locale e dà 404 su GitHub e in CI: è la classe di difetto che un gate *deve* prendere, ed è invisibile
alla macchina su cui questo repo viene sviluppato.

**6. L'allow-list ha una voce sola, e non può invecchiare.** Una voce dichiarata che non risulta più
rotta **fa rosso** il gate e va cancellata. Senza questa regola l'allow-list diventerebbe
`deferred.md`: ~74k caratteri con voci chiuse ancora in tabella che nessuno rilegge. Ogni voce porta
la **ragione** per cui il link non è riparabile, e il test pretende che ci sia.

**7. I link rotti storici si riparano o si de-linkano; si dichiarano solo se non c'è altra via.**
L'audit ne dava 17 da mettere in allow-list. Riesaminati caso per caso:

| Trattamento | Quanti | Criterio |
|---|---|---|
| **Riparati** | 2 | ADR-0010 e ADR-0015: il testo visibile è «ADR-00NN» e resta vero. `git log --diff-filter=A` dimostra che i due filename citati **non sono mai esistiti** — quei link erano rotti dalla nascita, quindi ripararli non falsifica un verbale |
| **De-linkati** | 14 | il path era **già il testo visibile** del link: togliere il link e lasciare il path in `code` conserva la frase **byte per byte** e non lascia un 404 |
| **Dichiarati** | 1 | il placeholder `NNNN-....md` del template ADR, che deve restare un link perché insegna la forma da copiare |

Il de-link è la via che l'audit non aveva considerato, ed è migliore delle due che aveva: dichiarare
lascia un 404 in piedi, ripuntare l'href a `packages/data-layer` farebbe dire a un handoff del
2026-07-21 che un file stava dove sarebbe arrivato quattro giorni dopo.

## Alternatives considered

- **Uno script `.mjs` alla radice più uno step in `verify` e in CI** — scartata. È la forma che
  sembra più leggera e costa di più: `eslint` lo coprirebbe, ma **niente lo typechecka e niente lo
  testa**, e in questo file sono stati trovati sette bug. In più tocca il gate condiviso in due
  punti invece di zero. Il guadagno reale — non aggiungere un processo a `pnpm -r test` — è discusso
  sotto ed è il trade-off vero di questa decisione.
- **Uno spec dentro un package esistente** — scartata. Non esiste un package che possieda i
  documenti: metterlo in `data-layer` o in `legal` sarebbe accoppiamento arbitrario, e romperebbe
  proprio il criterio che rende difendibile la collocazione di `single-source.spec.ts`.
- **Solo un job CI, fuori da `verify`** — scartata. Il link rotto lo scopriresti a push fatto, che è
  il modo in cui nasce il debito che questo ADR chiude: nella sessione della Fase H i due link rotti
  li ha presi lo strumento **in locale**, prima del commit.
- **Dipendere da `github-slugger` invece di riprodurne l'algoritmo** — scartata. Sarebbe una
  dipendenza nuova (decisione strutturale) per ~20 righe, su un repo dove **2 link su 3117** usano un
  anchor. La riproduzione è vincolata da casi a risposta nota, che è ciò che serviva davvero.
- **Verificare anche i link esterni (http)** — scartata: un gate che fa rete è un gate che diventa
  rosso perché un sito è giù. Gli 8 link esterni del repo restano fuori perimetro, dichiarato nel
  tipo `Verdict`.

## Consequences

### Positive

- **Un link rotto nuovo fa rosso nominando file e riga.** Provato iniettandone due in
  `deferred.md` — uno verso un file inesistente e uno verso `0058-package-data-layer-CONDIVISO.md`,
  che esiste solo in minuscolo: il gate li ha presi entrambi, e sul secondo ha stampato il nome
  reale del file. Quel secondo caso è invisibile al filesystem di questa macchina.
- **Sette mutazioni, sette rossi, con attribuzione.** Nessuna è passata inosservata: `\s+` negli
  slug → **4 rossi**; `DEFINITION` senza ancora → **2**; confronto case-insensitive → **2**;
  estrazione che non salta i fence → **2**; link rotto nuovo → **1**; allow-list svuotata → **2**;
  rotto dichiarato riparato → **2** (fra cui «nessuna voce inutile»).
- **Il gate ha un controllo positivo sui dati veri**, non solo su una fixture: la voce di allow-list
  è un link rotto reale, e il test «riconosce ancora un link rotto quando c'è» diventa rosso se il
  checker smettesse di vederne. Un misuratore che si azzera non può più dare falsi verdi.
- **+47 test** (1613 → **1660**), **0 warning di lint nuovi**, `typecheck` da 8 a **9** progetti.
- **Il repo passa da 17 link rotti a 1**, e quell'uno ha una ragione scritta.

### Negative / Trade-off

- **Un processo in più in `pnpm -r test`**, cioè sull'asse di [D-066](../deferred.md), che è aperta.
  È il costo dichiarato di questa collocazione. Mitigazione strutturale, non promessa: l'ambiente è
  `node` e non `jsdom`, e la suite dura **~460 ms** contro i secondi delle suite a componenti.
  ⚠️ **Un'A/B onesta sull'OOM non è stata possibile**: la misura di oggi è avvenuta con 3,7–5,1 GB
  liberi, cioè **sotto** la soglia a cui D-066 riproduce comunque, e in quelle condizioni il crash
  arriva anche su un pacchetto solo (vedi l'addendum a D-066). Il numero manca, e non è stato
  sostituito da una stima.
- **L'algoritmo degli slug è una riproduzione**, non la libreria. Vincolata da casi noti, ma se
  GitHub cambiasse regole il gate non se ne accorgerebbe da solo.
- **14 documenti storici hanno un link in meno.** La frase è identica, la navigazione no: dove prima
  c'era un link cliccabile ora c'è un path in `code`. È il prezzo scelto per non riscrivere verbali
  datati.
- **Il filtro degli invisibili copre il solo U+FE0F**, perché è l'unico misurato (18 heading su 315
  documenti; U+FE0E, ZWJ e modificatori di tono: **zero**). Un heading con un'emoji composta da ZWJ
  produrrebbe un falso positivo. È dichiarato nel commento accanto alla riga.

### Neutre / Note

- Perimetro dichiarato: **315 file `.md` versionati, 3117 link** (inline, immagini, `<a href>`,
  reference-definition), esclusi quelli dentro fence e inline-code. Durata del solo checker: 328 ms.
- **2 link su 3117 usano un anchor.** La verifica degli anchor c'è ed è vincolata, ma non è lì che
  questo gate guadagna: il valore è nell'esistenza dei path e nel case.

## Rubric check

1. **Professionalità** — nessun numero di questo ADR è stimato, e la decisione su dove collocare il
   gate discende da una misura che ha corretto la premessa dell'audit (17 voci di allow-list → 1).
2. **Convenzioni** — struttura, `tsconfig`, `vitest.config` e `private: true` ricalcati da
   `@coralyn/legal` e `@coralyn/contracts`; lo spec segue la forma di
   [`single-source.spec.ts`](../../../packages/data-layer/src/single-source.spec.ts), compreso il
   test «il presidio guarda dove crede di guardare».
3. **Modularità** — il package non è importato da nessuno e non importa nulla del repo: legge file.
   L'unico arco è verso `git`, ed è dichiarato.
4. **Zero debito** — l'allow-list non può invecchiare in silenzio (una voce inutile fa rosso), e
   l'unico costo non risolto — il processo in più su D-066 — è dichiarato qui sopra **senza** un
   numero inventato al posto della misura mancante.
