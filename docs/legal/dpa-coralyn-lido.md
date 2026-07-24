# Accordo sul trattamento dei dati personali (DPA — art. 28 GDPR)

### tra il Lido (Titolare) e Coralyn (Responsabile)

> ⚠️ **Bozza di lavoro, non un parere legale né un contratto pronto alla firma.** I punti marcati ⚖️
> richiedono la validazione di un professionista. Le clausole di responsabilità, foro e legge
> applicabile sono volutamente lasciate al contratto principale. Vedi [README.md](README.md).
>
> **Versione:** 0.1 (bozza) · **Data:** 2026-07-24 · **Slice:** D-062 (5.6c)

---

## Premesse

Questo accordo attua l'art. 28.3 GDPR, che impone un atto giuridico scritto tra titolare e
responsabile. Costituisce **allegato e parte integrante** del contratto di fornitura del gestionale
Coralyn; in caso di contrasto sul trattamento dei dati personali, prevale questo accordo.

La qualificazione delle parti riflette la realtà del trattamento, non una scelta di comodo: è il
Lido che raccoglie i dati dei propri bagnanti al banco e decide finalità e mezzi; Coralyn fornisce lo
strumento software e tratta quei dati **solo per erogare il servizio**. La stessa distinzione è
ratificata in [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md).

## Le parti

**TITOLARE DEL TRATTAMENTO — il Lido**

- Ragione sociale: `[COMPILARE: da EstablishmentLegalProfile.legalName]`
- Sede legale: `[COMPILARE]` · P. IVA / C.F.: `[COMPILARE]`
- Rappresentante legale: `[COMPILARE]` · Contatto privacy: `[COMPILARE]`

**RESPONSABILE DEL TRATTAMENTO — Coralyn**

- Ragione sociale: `[COMPILARE]`
- Sede legale: `[COMPILARE]` · P. IVA / C.F.: `[COMPILARE]`
- Rappresentante legale: `[COMPILARE]` · Contatto privacy: `[COMPILARE]`
- DPO: `[COMPILARE: nominato sì/no + contatti]` ⚖️

> I dati del Titolare sono gli stessi che il Lido compila nel gestionale (sezione «Profilo legale»)
> e che alimentano l'informativa mostrata ai bagnanti: **una sola fonte, nessuna divergenza** tra il
> contratto e ciò che l'interessato legge.

---

## Art. 1 — Oggetto, natura e finalità

Coralyn tratta i dati personali per conto del Lido al solo fine di **erogare il gestionale**:
ospitare i dati, renderli consultabili e modificabili al personale autorizzato del Lido, garantirne
sicurezza e disponibilità, e fornire assistenza tecnica su richiesta.

Coralyn **non** utilizza i dati per finalità proprie: non li rivende, non li cede a terzi per
marketing, non li usa per profilazione né per addestrare sistemi automatizzati.

## Art. 2 — Durata

Il trattamento dura quanto il contratto principale. Alla cessazione si applica l'art. 10.

## Art. 3 — Tipi di dati e categorie di interessati

**Categorie di interessati:** i bagnanti clienti del Lido (potenzialmente anche minori ⚖️) e,
limitatamente all'uso del gestionale, il personale del Lido.

**Categorie di dati** — corrispondono a ciò che il gestionale può contenere, verificato sul modello
dati:

| Categoria | Dettaglio |
|---|---|
| Anagrafici e di contatto | nome, cognome; telefono ed email **se forniti** |
| Note operative | testo libero inserito dal Lido sulla scheda del bagnante ⚖️ |
| Rapporto commerciale | prenotazioni, abbonamenti, noleggi, periodi, ombrellone assegnato |
| Economici | importi dovuti, incassati, rimborsati |
| Credenziali del canale cliente | **hash** del token di attivazione e del PIN; sessioni |

**Non sono trattati** documenti d'identità né categorie particolari ex art. 9 GDPR.

> ⚖️ **Le note operative sono il punto di attenzione.** È un campo libero: il Lido potrebbe
> inserirvi, di sua iniziativa, informazioni eccedenti o particolari (es. sulla salute). Il Lido è
> istruito a **non** farlo (art. 4). Tecnicamente il campo non è vincolabile senza snaturarne l'uso.

## Art. 4 — Istruzioni documentate (art. 28.3.a)

Coralyn tratta i dati **solo su istruzione documentata** del Titolare. Costituiscono istruzione
documentata: questo accordo, il contratto principale, la documentazione del prodotto, e le richieste
di assistenza inoltrate dai canali concordati.

Coralyn informa immediatamente il Titolare se ritiene che un'istruzione violi il GDPR o altre norme
sulla protezione dei dati.

**Istruzioni permanenti al Titolare — il Lido si impegna a:**

1. Fornire ai propri bagnanti l'**informativa ex art. 13** al momento della raccolta. Il gestionale
   la genera già, parametrizzata sui dati del Lido: il Lido deve **compilare il proprio profilo
   legale**, altrimenti l'informativa resta incompleta e mostra segnaposto visibili.
2. **Non inserire** nelle note operative dati particolari (art. 9) o comunque eccedenti la finalità
   gestionale.
3. Gestire con diligenza gli account del proprio personale: non condividere credenziali, disabilitare
   tempestivamente chi non fa più parte dello staff.
4. Consegnare le credenziali di accesso del canale cliente **solo** al bagnante intestatario.

## Art. 5 — Riservatezza (art. 28.3.b)

Coralyn garantisce che le persone autorizzate al trattamento si siano impegnate alla riservatezza o
abbiano un adeguato obbligo legale di riservatezza, e che l'accesso sia limitato a chi ne ha
effettiva necessità per l'erogazione o l'assistenza.

**Accesso ai dati del Lido da parte di Coralyn:** la console di piattaforma è progettata per
esporre **esclusivamente dati aggregati privi di informazioni personali**; nessuna sua funzione
mostra i dati dei bagnanti ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)).
Un accesso puntuale per assistenza richiederebbe un meccanismo dedicato con motivazione obbligatoria
e tracciamento, **oggi non implementato** ([D-042](../architecture/deferred.md)). Ne consegue che
oggi Coralyn **non dispone di alcuna funzione applicativa** per leggere i dati di un singolo
bagnante. Un accesso in via eccezionale (es. intervento diretto sul database per un guasto) avviene
solo su richiesta del Titolare e va documentato.

## Art. 6 — Misure di sicurezza (art. 28.3.c e art. 32)

Coralyn adotta le misure descritte nell'**Allegato A**, che forma parte integrante di questo accordo.

## Art. 7 — Sub-responsabili (art. 28.2 e 28.4)

Il Titolare conferisce a Coralyn **autorizzazione generale** a ricorrere a sub-responsabili, alle
condizioni seguenti:

1. Coralyn impone contrattualmente a ciascun sub-responsabile obblighi di protezione dei dati **non
   meno onerosi** di quelli qui assunti.
2. Coralyn resta **pienamente responsabile** verso il Titolare dell'operato dei sub-responsabili.
3. Coralyn comunica al Titolare, con **preavviso di almeno 30 giorni**, ogni intento di aggiungere o
   sostituire un sub-responsabile. Il Titolare può opporsi per motivi ragionevoli e documentati; in
   difetto di accordo, può recedere dal contratto senza penali. ⚖️

**Elenco dei sub-responsabili in essere:**

| Sub-responsabile | Servizio | Ubicazione trattamento |
|---|---|---|
| `[COMPILARE: fornitore hosting]` | Infrastruttura e database | `[COMPILARE]` |
| `[COMPILARE: fornitore email]` | Invio email transazionali (credenziali) | `[COMPILARE]` |

> ⚠️ **Da completare prima della firma.** L'infrastruttura di produzione non è ancora stata scelta:
> l'elenco non è omesso per dimenticanza, è una decisione aperta.

## Art. 8 — Assistenza al Titolare (art. 28.3.e e 28.3.f)

Coralyn assiste il Titolare, con misure tecniche e organizzative adeguate:

- **Diritti degli interessati** (artt. 15–22): il gestionale permette al Titolare di esercitarli in
  autonomia — consultazione, rettifica, e cancellazione o anonimizzazione irreversibile dei dati del
  bagnante ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)). Coralyn
  interviene solo se lo strumento non basta.
- **Sicurezza, notifica dei breach, DPIA e consultazione preventiva** (artt. 32–36): Coralyn fornisce
  le informazioni in proprio possesso, tenuto conto della natura del trattamento.

## Art. 9 — Violazioni dei dati personali (art. 33.2)

Coralyn notifica al Titolare ogni violazione di dati personali **senza ingiustificato ritardo** dal
momento in cui ne viene a conoscenza, e comunque in tempo utile perché il Titolare possa rispettare
il proprio termine di 72 ore verso l'autorità di controllo.

**Termine operativo proposto: entro 24 ore** dalla conoscenza. ⚖️

La notifica descrive la natura della violazione, le categorie e il numero approssimativo di
interessati e di record coinvolti, le probabili conseguenze e le misure adottate o proposte. Se le
informazioni non sono disponibili subito, sono fornite in fasi successive senza ulteriore ritardo.

## Art. 10 — Sorte dei dati alla cessazione (art. 28.3.g)

A scelta del Titolare, espressa entro **30 giorni** dalla cessazione, Coralyn:

- **restituisce** i dati in formato strutturato e di uso comune; oppure
- li **cancella**, insieme alle copie esistenti.

Decorso quel termine senza indicazioni, Coralyn procede alla cancellazione. Restano salvi gli
obblighi di conservazione imposti dalla legge, per il tempo da essa previsto e limitatamente a
quanto necessario.

`[COMPILARE: termine di cancellazione definitiva dai backup]` ⚖️ — i backup hanno un ciclo di
rotazione proprio: il termine va allineato a quello reale.

## Art. 11 — Trasferimenti fuori dallo Spazio Economico Europeo (art. 28.3.a, artt. 44 ss.)

Coralyn non trasferisce dati fuori dal SEE se non nel rispetto del Capo V del GDPR: verso paesi
coperti da decisione di adeguatezza, oppure con garanzie adeguate (tipicamente le Clausole
Contrattuali Standard della Commissione) e, quando necessario, con una valutazione d'impatto del
trasferimento.

`[COMPILARE: dipende interamente dall'hosting, non ancora scelto]` ⚖️

## Art. 12 — Audit e ispezioni (art. 28.3.h)

Coralyn mette a disposizione del Titolare le informazioni necessarie a dimostrare il rispetto
dell'art. 28 e consente e contribuisce ad audit, comprese le ispezioni, svolti dal Titolare o da un
soggetto da esso incaricato.

Modalità: preavviso scritto di almeno **30 giorni**, non più di **una volta l'anno** salvo violazione
accertata o richiesta dell'autorità, durante l'orario lavorativo, senza pregiudizio per l'operatività
e nel rispetto della riservatezza degli altri clienti. Coralyn può assolvere all'obbligo fornendo
documentazione o certificazioni di terza parte, se soddisfano ragionevolmente la richiesta. ⚖️

---

# Allegato A — Misure tecniche e organizzative (art. 32)

Misure **verificate sull'implementazione**, non dichiarazioni di intenti.

| Ambito | Misura |
|---|---|
| **Separazione tra clienti** | Row-Level Security PostgreSQL con policy di isolamento per tenant in modalità `ENABLE` + `FORCE`; il ruolo applicativo è non-superuser e non può aggirare le policy. L'isolamento è imposto dal database: un difetto del codice applicativo, da solo, non espone i dati di un altro lido ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)). |
| **Password** | Hashing argon2id; mai memorizzate, trasmesse o registrate in chiaro. Le credenziali si consegnano via link monouso a scadenza, mai per email in chiaro ([ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)). |
| **Controllo degli accessi** | Autenticazione obbligatoria su ogni endpoint; autorizzazione per ruolo; le azioni amministrative sono riservate al ruolo amministratore. |
| **Canale cliente** | Accesso provisionato dall'operatore, mai autoregistrazione; token opaco + PIN entrambi conservati solo come hash; sessioni con refresh rotante legato al dispositivo e rilevamento del riuso (un token riusato revoca l'intera catena); limite di tentativi sul PIN e rate limiting sugli endpoint ([ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)). |
| **Minimizzazione** | Nessun documento d'identità; nessuna categoria particolare; contatti facoltativi ([ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md)). |
| **Cancellazione** | Cancellazione reale in assenza di storico; altrimenti anonimizzazione irreversibile che preserva la sola storia contabile in forma anonima ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)). |
| **Parete verso la piattaforma** | La console di piattaforma espone solo aggregati privi di dati personali ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)). |
| **Separazione degli ambienti** | Sviluppo, test e produzione su database distinti; nessun dato reale fuori dalla produzione. |
| **Cifratura in transito** | `[COMPILARE: TLS, configurazione di produzione]` |
| **Backup e ripristino** | `[COMPILARE: frequenza, ritenzione, cifratura, test di ripristino]` ⚖️ |
| **Continuità operativa** | `[COMPILARE: obiettivi di ripristino]` |

---

**Firme**

| Il Titolare (Lido) | Il Responsabile (Coralyn) |
|---|---|
| `[COMPILARE]` | `[COMPILARE]` |
| Data: `[COMPILARE]` | Data: `[COMPILARE]` |

---

**Questo documento è una bozza tecnica**, redatta da ingegneri sulla base dell'implementazione reale.
Va rivista da un professionista legale e completata nei `[COMPILARE]` prima di essere sottoposta a un
cliente.
