# ADR-0067: La provenienza di un ombrellone ritirato è un riferimento, non il nome scritto nello snapshot

- **Status:** Accepted
- **Data:** 2026-07-31
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0053](0053-ritiro-ombrellone-soft-delete.md) (il ritiro soft-delete, che
  ha introdotto `retiredFrom`), [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §6 (la
  disclosure sul prezzo, che di quel campo si serviva), [ADR-0032](0032-pricing-engine-precedenza.md)
  (la precedenza delle tariffe, che è ciò che la disclosure dichiara)
- **Chiude:** [D-072](../deferred.md#d-072)
- **Chiude anche** [D-077](../deferred.md#d-077), **preesistente e aperta dalla review di questa
  slice**: il gemello di [D-074](../deferred.md#d-074) nello strato Tailwind, dove una cella
  selezionata e focalizzata da tastiera era resa **identica** a una non selezionata. Chiusa qui su
  richiesta esplicita, perché lasciare aperto il gemello di ciò che la slice corregge è esattamente
  l'errore che la review d'insieme esiste per impedire.
- **Registra, senza causarle:** **quattro** voci **preesistenti**, tutte verificate tali su `main` a
  `0fd3b0f` e tutte trovate dalla review avversariale di questa slice —
  [D-080](../deferred.md#d-080) (il **secondo ingrediente** di questa stessa disclosure invecchia
  come invecchiava il primo: nessuna mutazione del listino scade la struttura, quindi
  `hasDedicatedRates` può essere già falsa quando il gate la legge),
  [D-078](../deferred.md#d-078) (i controlli del ripristino non si riconciliano con l'albero) e
  [D-079](../deferred.md#d-079) (la cessione lascia fresca la Scheda del subentrante); più
  [D-076](../deferred.md#d-076) — `retire` e `restore` scrivono con un
  `where` nudo da una lettura mai ricontrollata, mentre `move` ha la guardia estesa. **Preesistente**
  (su `main` a `0fd3b0f` la scrittura di `retire` era già così), trovata dalla review avversariale di
  questa slice. Ciò che cambia qui è il **peso** dell'errore: alla stessa scrittura si aggiunge un
  riferimento, e un riferimento sbagliato viene creduto — un nome sbagliato, prima, il più delle
  volte non risolveva e taceva.
- **Non supera ADR-0053**: `retiredFrom` resta, e resta scritto allo stesso modo. Cambia il suo
  **ruolo**, che quell'ADR non aveva mai fissato: era nato come storico da mostrare, ed era finito a
  fare da chiave.

## Context

Il ripristino di un ritirato può cambiargli la base di prezzo, perché lo riaggancia a una fila
qualsiasi e quindi a un settore qualsiasi. [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md)
§6 ha deciso che quel caso si **dichiara** e non si blocca: se il settore di partenza o quello di
arrivo hanno tariffe dedicate, l'operatore lo legge prima di confermare.

Per sapere da dove veniva, il pannello leggeva `retiredFrom`: lo **snapshot testuale** «Settore ·
Fila» che [ADR-0053](0053-ritiro-ombrellone-soft-delete.md) scrive al ritiro. È testo. Il pannello
ne prendeva il primo segmento e lo confrontava col **nome** dei settori vivi.

Basta un rename del settore perché quel nome non combaci più con niente. L'origine non si risolve,
il confronto ricade sul solo settore d'arrivo, e **un ripristino che fa perdere una tariffa dedicata
parte in silenzio**. Non è il verso pericoloso — si avvisa di meno, e la disclosure non blocca
comunque nulla — ma è un avviso che tace **proprio quando il dato è invecchiato**, cioè quando
servirebbe di più.

Il difetto era noto e **fermato da un presidio**: un test in `BeachPanel.restore.spec.ts` ne
descriveva il comportamento come «difetto noto, non risolto qui». Era stato tenuto fuori da
[D-038](../deferred.md#d-038) perché risolverlo richiede una colonna nuova, quindi una migration, e
una decisione su cosa farne dei ritirati già in archivio — che quel dato non ce l'hanno.

## Decision

### 1. La provenienza diventa un riferimento vivo

`Umbrella.retiredFromSectorId` (`uuid`, nullable) con relazione opzionale a `Sector` e
**`ON DELETE SET NULL`**. Scritta al ritiro dal `sectorId` della fila di partenza, azzerata al
ripristino insieme a `retiredAt` e `retiredFrom`.

`SetNull` e non `Restrict`: un settore cancellato **non è un'origine confrontabile**, e impedire la
cancellazione di un settore perché un ritirato d'archivio lo nomina sarebbe un vincolo nuovo, imposto
da un dato accessorio, su un'operazione che oggi è lecita. Meglio nessuna origine che una sbagliata.

### 2. `retiredFrom` resta, e cambia mestiere

Non si tocca e non si dismette: continua a essere scritto e mostrato. Ma da qui in avanti è
un'**etichetta storica** — «com'era chiamato quel posto allora» — e non una chiave. Nessun percorso
di confronto la attraversa.

I due campi dicono due cose diverse ed è giusto che coesistano: l'etichetta è **immutabile per
definizione** (registra il passato), il riferimento è **vivo** (segue il presente). Un rename deve
lasciare la prima ferma e la seconda valida, ed è esattamente ciò che una e2e asserisce.

### 3. L'archivio si ripara una volta sola, nella migration

La migration confronta il **prefisso esatto** — `<nome settore> · ` — e scrive **solo quando il
settore candidato è uno solo**. Fatto una volta, server-side, quel valore è il **migliore che quelle
righe potranno mai avere**.

⚠️ **La prima stesura usava la regola del frontend** — `split_part(retiredFrom, ' · ', 1)`, cioè il
primo segmento — e **era sbagliata**. Trovata dalla review avversariale del 2026-07-31 e **riprodotta
su `coralyn_dev`**: `retiredFrom` nasce da «*nome settore* · *label fila*» e **nessuno dei due pezzi
vieta il separatore** (il nome è testo libero: `create-sector.dto.ts` ha solo
`@IsString @IsNotEmpty @MaxLength(60)`, e l'unicità è sul nome **intero**, quindi «Blu» e «Blu · Alto»
convivono legittimamente). Un ritirato da «Blu · Alto» porta lo snapshot «Blu · Alto · F1», il primo
segmento è «Blu», e il backfill lo agganciava a **«Blu»** — un settore da cui non era mai passato,
scritto senza esitazione. **Peggio del `NULL`, perché il `NULL` almeno tace.**

⚠️ **Un secondo modo di sbagliare resta, ed è accettato invece che risolto** — trovato dalla review
d'insieme, che ha notato la contraddizione: la §4 toglie il fallback dal frontend anche perché
potrebbe «agganciare un settore omonimo creato dopo», e il backfill è esposto alla stessa cosa. Se un
settore è stato **rinominato** e poi ne è stato creato uno **nuovo col vecchio nome**, entrambi prima
della migration, il candidato è **uno solo** — il nuovo — e `HAVING count(*) = 1` non protegge nulla:
viene scritto un riferimento sbagliato **con sicurezza**, e nel verso pericoloso, perché ripristinare
in quel settore troverebbe `origin.id === target.id` e **tacerebbe** un avviso dovuto.

Non è distinguibile dai dati: `Sector` non ha un `createdAt`, quindi nulla dice quale settore
portasse quel nome al momento del ritiro. Accettato per due ragioni, entrambe da rileggere il giorno
in cui la prima diventasse falsa: **non esiste alcun database di produzione**, quindi al primo deploy
la tabella è vuota e il backfill è un no-op; e l'alternativa — non riparare affatto — perde **ogni**
riga recuperabile per evitarne una sbagliata. La differenza col frontend è che lì il rischio si
correva a ogni render e per sempre, qui una volta sola e su un archivio che oggi è vuoto.

Lo snapshot nel caso dell'ambiguità è invece **genuinamente ambiguo**: «Blu · Alto · F1» può venire dal settore
«Blu · Alto» e dalla fila «F1», oppure dal settore «Blu» e dalla fila «Alto · F1», e **nessuna regola
può deciderlo** — non è che ne serva una migliore, è che l'informazione non c'è. Per questo la regola
non è «il prefisso più lungo vince» ma «se i candidati sono due, non scrivere». Verificato sul
database, col blocco vero della migration eseguito dall'utente vero delle migration: lo snapshot
ambiguo resta a `NULL`, quello non ambiguo si risolve — nessuna regressione sul caso normale.

### 4. Nessun fallback per nome nel frontend

Non è pigrizia, è una conseguenza della §3: dopo il backfill, **una riga rimasta a `null` è per
costruzione una che il nome non risolve** — o perché nessun settore combacia, o perché ne combaciano
due e la risposta non esiste. Un fallback lì non recupererebbe nulla, e avrebbe **due** modi di
sbagliare: agganciare un settore **omonimo creato dopo**, o risolvere lo snapshot **ambiguo** al
candidato sbagliato — cioè proprio il difetto che la §3 ha appena tolto dal backfill. Reintrodurlo
nel frontend, dove girerebbe a ogni render invece che una volta sola, sarebbe la stessa scelta in
peggio. È codice morto nel caso migliore e dannoso nel peggiore.

Questo toglie anche il **doppio percorso di risoluzione** che l'alternativa avrebbe lasciato in
piedi per sempre: c'è una regola sola, e vale per tutti.

### 5. Origine irrisolvibile ⇒ fuori dal confronto, ma il nome si mostra lo stesso

Se il riferimento è `null` (archivio non recuperato, o settore cancellato), l'origine **non entra**
nel confronto sulle tariffe: il gate resta quello del solo settore d'arrivo — e se manca **anche** lo
snapshot, non c'è nulla da nominare e il dialogo non si apre affatto. Il silenzio su quel ramo
è quindi **dichiarato**, non accidentale — la differenza rispetto a prima non è l'esito, è che ora
c'è una ragione e un presidio che la nomina.

L'etichetta, invece, si mostra: se il dialogo si apre per il ramo della destinazione, dice comunque
da dove veniva, usando lo snapshot **intero** — «Blu · Alto · F1», non «Blu».

⚠️ **Intero, e non il primo segmento, per la stessa ragione della §3.** La prima stesura tagliava al
separatore, cioè applicava nella resa la regola che il backfill aveva appena rifiutato, e sbagliava
allo stesso modo: «Blu · Alto · F1» ridotto a «Blu» nomina un settore che **esiste davvero** e da cui
quell'ombrellone non è mai passato — un'affermazione falsa, non un'etichetta vaga. Trovata dalla
review avversariale, che ne ha anche mostrato il percorso **vivo**: ritira da «Blu · Alto», poi
cancella quella fila e quel settore ormai vuoti (nessuno dei due conta un ritirato, che ha
`rowId = null`), e `ON DELETE SET NULL` lascia il riferimento a `null` con lo snapshot intatto.
Nessuna migrazione coinvolta: tre gesti ordinari da interfaccia.

### 6. Il confronto «è lo stesso settore?» passa dagli id

Prima era `from !== target.name`. Ora è `origin?.id !== target.id`.

⚠️ **Attenzione a non promettere troppo, e la prima stesura di questa § lo faceva.** Dato che
`@@unique([establishmentId, name])` rende i nomi unici e che `from` è il nome **attuale**
dell'origine quando questa risolve, le due forme danno **sempre lo stesso esito**: nessuno scenario
le separa, e nessun test può distinguerle. Gli id restano comunque la forma giusta, ma per una
ragione diversa da quella scritta prima: **non dipendono da un invariante che vive nel database e
non nel client**. Il giorno in cui `data.sectors` arrivasse filtrato, unito o proiettato, il
confronto per nome comincerebbe a sbagliare in silenzio; quello per id no.

### 7. Si memorizza il settore, non la fila

La disclosure è di livello settore: `hasDedicatedRates` conta `Sector.rates` e solo quelle. La
dimensione «fila» del listino è capacità viva nel motore che **nessuna UI scrive**, ed è terreno di
[D-070](../deferred.md#d-070). Aggiungere qui un `retiredFromRowId` sarebbe una seconda colonna
senza un percorso che la legga — cioè lo stesso difetto che D-070 già traccia.

Chi esporrà la fila nel listino dovrà tornare su questa §: allora la colonna avrà un lettore.

### 8. Il backfill rispetta RLS, non la disattiva

`Umbrella` e `Sector` hanno `FORCE ROW LEVEL SECURITY`, e l'utente delle migration (`coralyn_app`) ne
è l'owner ma **non è esente**. **Misurato**: senza contesto tenant quell'utente vede **0** ombrelloni
e **0** settori; con il contesto, 204 nel database di sviluppo. Un `UPDATE` scritto senza tenant
avrebbe quindi aggiornato **zero righe dichiarando successo** — un no-op silenzioso, la classe di
guasto più cara da accorgersi.

Il backfill cicla sui tenant (`Establishment` è fuori da RLS per costruzione, dalla migration
iniziale) e imposta `app.current_tenant` prima di ogni `UPDATE`, cioè fa quello che farebbe
l'applicazione. L'alternativa — `NO FORCE ROW LEVEL SECURITY` a cavallo dell'`UPDATE` — funziona ed è
più corta, ma lascia nel repo il precedente di una migration che **spegne una policy di isolamento**:
un pattern che si copia, e che la prossima volta potrebbe non essere racchiuso in una transazione.

## Consequences

### Positive

- La disclosure sul ripristino smette di dipendere da un nome che invecchia: il caso che la zittiva
  ora la fa comparire, ed è coperto da un test unit e da una e2e che attraversa il rename.
- `retiredFrom` ha finalmente **un solo mestiere**, dichiarato nel doc-comment e nel commento dello
  schema. Il campo era ambiguo, non sbagliato: l'ambiguità era il difetto.
- Il dialogo nomina l'origine col nome **attuale**: mandare l'operatore a cercare «Centro» quando
  quel settore oggi si chiama «Ponente» era un secondo modo di mentire, più silenzioso del primo.
- L'archivio del database di sviluppo e di test è coerente da subito, senza intervento manuale.

### Negative

- Una colonna e un indice in più su `Umbrella`, e una relazione in più su `Sector` che **nessuna
  query attraversa**: esiste solo perché Prisma pretende il lato inverso.
- Il residuo resta scoperto: chi era già stato rinominato al momento della migration non ha modo di
  essere recuperato, e per quelle righe l'avviso tace. È un presidio esplicito, non una svista.
- Un angolo stretto peggiora, e va dichiarato: se una riga d'archivio è rimasta **senza riferimento**
  e la si ripristina nel settore da cui in realtà proveniva, il dialogo si apre lo stesso — prima
  taceva. L'avviso non è falso (l'origine resta non identificata, e la base di prezzo *può* davvero
  cambiare), ed è il verso sicuro: si avvisa di più, non di meno. Non è stato chiuso con un caso
  speciale sul nome, perché sarebbe la §4 reintrodotta dalla porta di servizio e sbaglierebbe proprio
  quando due settori omonimi sono entità diverse.
  ⚠️ **La prima stesura di questa riga descriveva un dialogo che diceva «era stato ritirato da
  «Centro» e sta tornando in «Centro»»**: era vera finché l'etichetta veniva tagliata al primo
  separatore. Dalla correzione della §5 il dialogo mostra lo snapshot intero — «Centro · F1» — e
  quella lettura sgradevole non si produce più. Resta l'avviso di troppo, che è il punto.
- Ogni fixture di test che costruisce un `RetiredUmbrellaDTO` deve ora dichiarare anche il
  riferimento, altrimenti esercita il ramo d'archivio credendo di esercitare quello normale.
  ⚠️ **È già successo durante questa slice** — vedi la nota qui sotto.

### Neutre

- `retiredFrom` resta nel DTO e a schermo: nessun consumatore va toccato per questo.
- Il ripristino azzera entrambi i campi, come già faceva per `retiredFrom`.

## Nota di metodo: il presidio che non è arrossato

L'handoff della sessione precedente prescriveva: «il comportamento è fermato da un presidio in
`BeachPanel.restore.spec.ts`; se lo cambi, quel test **deve** arrossare».

Non è arrossato — e il comportamento era cambiato davvero.

La ragione: quel test costruiva il DTO **senza** il campo nuovo, quindi dal momento in cui la
colonna è esistita ha smesso di descrivere «settore rinominato» e ha cominciato a descrivere
«ritirato d'archivio senza riferimento», che è un caso in cui il silenzio è voluto. Un presidio
diventa **sotto-specificato** nell'istante in cui un campo entra nel DTO che asserisce, e continua a
passare descrivendo un altro scenario.

La prova che il comportamento fosse cambiato è arrivata da un secondo test, sullo **stesso**
scenario ma col riferimento presente: rosso prima, verde dopo. La regola resta buona; va letta
sapendo che una fixture invecchia insieme al tipo che istanzia.

## Alternatives considered

- **Nessun backfill, con fallback per nome sulle righe a `null`.** Conserva il comportamento odierno
  sullo storico, ma lascia **due percorsi di risoluzione** conviventi per sempre, e il secondo — per
  quanto detto in §4 — dopo la migration non recupera più nulla: resta solo la sua capacità di
  agganciare un omonimo. Più codice per un esito peggiore.
- **Nessun backfill e nessun fallback.** Il codice più corto. Scartata perché butta via
  informazione **oggi ancora recuperabile**: il nome combacia ancora per tutte le righe che nessuno
  ha rinominato, e quella corrispondenza non tornerà più.
- **Memorizzare anche `retiredFromRowId`.** Scartata per la §7: sarebbe capacità senza percorso.
- **`NO FORCE ROW LEVEL SECURITY` attorno al backfill.** Scartata per la §8: funziona, ma il
  precedente costa più di quanto la brevità valga.
- **Rendere `retiredFrom` un riferimento anche per la fila e derivarne il testo.** Scartata: il testo
  deve poter sopravvivere alla **cancellazione** della fila e del settore. Un'etichetta storica
  derivata da entità vive smette di essere storica.
