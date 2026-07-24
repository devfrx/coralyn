# Accordo sul trattamento dei dati personali (DPA — art. 28 GDPR)

### tra il Lido (Titolare) e Coralyn (Responsabile)

> ⚠️ **Bozza di lavoro, non un parere legale né un contratto pronto alla firma.** I punti marcati ⚖️
> richiedono la validazione di un professionista. Le clausole di responsabilità, legge applicabile e
> foro sono lasciate al contratto principale. Riepilogo in [README.md](README.md).
>
> **Versione:** 0.2 (bozza, post-review) · **Data:** 2026-07-24 · **Slice:** D-062 (5.6c)

---

## Premesse

Questo accordo attua l'art. 28.3 GDPR, che impone un atto giuridico scritto tra titolare e
responsabile. Costituisce **allegato e parte integrante** del contratto di fornitura del gestionale
Coralyn; in caso di contrasto **sul trattamento dei dati personali**, prevale questo accordo. ⚖️-14

La qualificazione delle parti riflette la realtà del trattamento, non una scelta di comodo: è il
Lido che raccoglie i dati dei propri bagnanti al banco e decide finalità e mezzi; Coralyn fornisce lo
strumento software e tratta quei dati **solo per erogare il servizio**
([ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)).

## Le parti

**TITOLARE DEL TRATTAMENTO — il Lido**

- Ragione sociale: `[COMPILARE: da EstablishmentLegalProfile.legalName]`
- Sede legale: `[COMPILARE]` · P. IVA / C.F.: `[COMPILARE]`
- Rappresentante legale: `[COMPILARE]` · Contatto privacy: `[COMPILARE]`

**RESPONSABILE DEL TRATTAMENTO — Coralyn**

Vedi la [tabella canonica dei dati societari](README.md#dati-societari-di-coralyn-fonte-unica): si
compila **una volta sola** lì, così contratto, policy e imprint non possono divergere.

> I dati del Titolare sono gli stessi che il Lido compila nel gestionale (sezione «Profilo legale») e
> che alimentano l'informativa mostrata ai bagnanti: **una sola fonte**, nessuna divergenza tra il
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

**Categorie di interessati:** i bagnanti clienti del Lido, potenzialmente anche minori ⚖️-08.

> **Fuori dal perimetro di questo accordo.** Gli account degli **operatori del Lido** sono trattati
> da Coralyn in qualità di **titolare autonomo**, con informativa dedicata: non sono dati trattati
> per conto del Lido e quindi non rientrano qui. Confondere i due piani vanificherebbe la
> qualificazione stessa delle parti.

**Categorie di dati** — corrispondono a ciò che il gestionale può contenere, verificato sul modello
dati:

| Categoria | Dettaglio |
|---|---|
| Anagrafici e di contatto | nome, cognome; telefono ed email **se forniti** |
| Note operative | testo libero inserito dal Lido sulla scheda del bagnante ⚖️-15 |
| Rapporto commerciale | prenotazioni, abbonamenti, noleggi, periodi, ombrellone assegnato |
| Economici | importi dovuti, incassati, rimborsati |
| Credenziali del canale cliente | **hash** del token di attivazione e del PIN; sessioni |

Il gestionale **non prevede campi** per documenti d'identità né per categorie particolari di dati
(art. 9 GDPR), e il Titolare si impegna a non introdurne nei campi liberi (art. 4).

> ⚖️-15 **I campi liberi sono il punto di attenzione.** `Customer.notes` e `Booking.extras` (campo
> JSON) sono contenitori aperti: il Lido potrebbe inserirvi di sua iniziativa informazioni eccedenti
> o particolari. Tecnicamente non sono vincolabili senza snaturarne l'uso; il presidio è
> l'istruzione dell'art. 4, non un controllo automatico.

## Art. 4 — Istruzioni documentate (art. 28.3.a)

Coralyn tratta i dati **solo su istruzione documentata** del Titolare. Costituiscono istruzione
documentata: questo accordo, il contratto principale, la documentazione del prodotto e le richieste
di assistenza inoltrate dai canali concordati.

Coralyn informa immediatamente il Titolare se ritiene che un'istruzione violi il GDPR o altre norme
sulla protezione dei dati.

Quanto sopra non si applica **se il trattamento è richiesto dal diritto dell'Unione o dello Stato
membro cui Coralyn è soggetta**: in tal caso Coralyn informa il Titolare di tale obbligo giuridico
**prima** del trattamento, a meno che il diritto lo vieti per rilevanti motivi di interesse pubblico.

**Istruzioni permanenti al Titolare — il Lido si impegna a:**

1. Fornire ai propri bagnanti l'**informativa ex art. 13** al momento della raccolta. Il gestionale
   la genera già, parametrizzata sui dati del Lido: il Lido deve **compilare il proprio profilo
   legale**, altrimenti l'informativa resta incompleta e mostra segnaposto visibili.
2. **Non inserire** nei campi liberi dati particolari (art. 9) o comunque eccedenti la finalità
   gestionale.
3. Gestire con diligenza gli account del proprio personale: non condividere credenziali, disabilitare
   tempestivamente chi non fa più parte dello staff.
4. Consegnare le credenziali di accesso del canale cliente **solo** al bagnante intestatario.

## Art. 5 — Riservatezza (art. 28.3.b)

Coralyn garantisce che le persone autorizzate al trattamento si siano impegnate alla riservatezza o
abbiano un adeguato obbligo legale di riservatezza, e che l'accesso sia limitato a chi ne ha
effettiva necessità per l'erogazione o l'assistenza.

**Accesso ai dati del Lido da parte di Coralyn.** La console di piattaforma espone **metriche
aggregate sui bagnanti, prive di informazioni personali**: nessun suo endpoint e nessuna sua vista
mostra l'anagrafica dei clienti del Lido
([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)). L'unico dato
personale visibile in console è l'**indirizzo email dell'amministratore del Lido**, necessario al
provisioning e al reset delle credenziali.

Un accesso puntuale ai dati di un bagnante per assistenza richiederebbe un meccanismo dedicato con
motivazione obbligatoria e tracciamento, **oggi non implementato**
([D-042](../architecture/deferred.md)): ne consegue che Coralyn **non dispone di alcuna funzione
applicativa** per leggere i dati di un singolo bagnante. Un accesso in via eccezionale (es.
intervento diretto sul database per un guasto) avviene solo su richiesta del Titolare e va
documentato. ⚖️-12

## Art. 6 — Misure di sicurezza (art. 28.3.c e art. 32)

Coralyn adotta le misure descritte nell'**Allegato A**, parte integrante di questo accordo.

## Art. 7 — Sub-responsabili (art. 28.2 e 28.4)

Il Titolare conferisce a Coralyn **autorizzazione generale** a ricorrere a sub-responsabili, alle
condizioni seguenti:

1. Coralyn impone contrattualmente a ciascun sub-responsabile obblighi di protezione dei dati **non
   meno onerosi** di quelli qui assunti.
2. Coralyn resta **pienamente responsabile** verso il Titolare dell'operato dei sub-responsabili.
3. Coralyn comunica al Titolare, con **preavviso di almeno 30 giorni**, ogni intento di aggiungere o
   sostituire un sub-responsabile. Il Titolare può opporsi per motivi ragionevoli e documentati; in
   difetto di accordo, può recedere dal contratto senza penali. ⚖️-14

**Elenco dei sub-responsabili in essere:**

| Sub-responsabile | Servizio | Ubicazione trattamento |
|---|---|---|
| `[COMPILARE: fornitore hosting]` | Infrastruttura e database | `[COMPILARE]` |

> ⚠️ **Da completare prima della firma.** L'infrastruttura di produzione non è ancora stata scelta:
> l'elenco non è omesso per dimenticanza, è una decisione aperta.
>
> **Nota:** il fornitore di posta elettronica **non compare** in questo elenco. Verificato sul
> codice: l'unico consumatore del servizio email è l'invio delle credenziali agli **operatori**, che
> è un trattamento di Coralyn come titolare autonomo. Il provider SMTP **non tratta mai dati di
> bagnanti**, quindi non è sub-responsabile del Lido.

## Art. 8 — Assistenza al Titolare (art. 28.3.e e 28.3.f)

Coralyn assiste il Titolare, con misure tecniche e organizzative adeguate:

- **Diritti degli interessati** (artt. 15–22): il gestionale permette al Titolare di esercitarli in
  autonomia — consultazione, rettifica, e cancellazione o anonimizzazione irreversibile dei dati del
  bagnante ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)), nei
  limiti indicati nell'Allegato A. Coralyn interviene quando lo strumento non basta.
- **Sicurezza, notifica dei breach, DPIA e consultazione preventiva** (artt. 32–36): Coralyn fornisce
  le informazioni in proprio possesso, tenuto conto della natura del trattamento.

## Art. 9 — Violazioni dei dati personali (art. 33.2)

Coralyn notifica al Titolare ogni violazione di dati personali **senza ingiustificato ritardo** dal
momento in cui ne viene a conoscenza, e comunque in tempo utile perché il Titolare possa rispettare
il proprio termine di 72 ore verso l'autorità di controllo.

**Termine operativo proposto: entro 24 ore** dalla conoscenza. ⚖️-14

La notifica descrive la natura della violazione, le categorie e il numero approssimativo di
interessati e di record coinvolti, le probabili conseguenze e le misure adottate o proposte. Se le
informazioni non sono disponibili subito, sono fornite in fasi successive senza ulteriore ritardo.

## Art. 10 — Sorte dei dati alla cessazione (art. 28.3.g)

A scelta del Titolare, espressa entro **30 giorni** dalla cessazione, Coralyn:

- **restituisce** i dati in formato strutturato e di uso comune; oppure
- li **cancella**, insieme alle copie esistenti.

Decorso quel termine senza indicazioni, Coralyn **sollecita per iscritto** il Titolare e procede alla
cancellazione solo dopo ulteriori 30 giorni di silenzio. ⚖️-14 — la cancellazione automatica per
silenzio è irreversibile e può interferire con gli obblighi di conservazione dello stesso Titolare.

Restano salvi gli obblighi di conservazione imposti dalla legge, per il tempo da essa previsto: in
particolare la documentazione contabile va conservata **10 anni** (art. 2220 Cod. Civ.).

I backup seguono un proprio ciclo di rotazione: la cancellazione dai backup si completa entro
**14 giorni** dalla cancellazione dai sistemi attivi, coerentemente con la ritenzione dell'Allegato A.

## Art. 11 — Trasferimenti fuori dallo Spazio Economico Europeo

Coralyn non trasferisce dati fuori dal SEE se non nel rispetto del Capo V del GDPR: verso paesi
coperti da decisione di adeguatezza, oppure con garanzie adeguate (tipicamente le Clausole
Contrattuali Standard della Commissione) e, quando necessario, con una valutazione d'impatto del
trasferimento.

`[COMPILARE: dipende interamente dall'hosting, non ancora scelto]` ⚖️-06

## Art. 12 — Audit e ispezioni (art. 28.3.h)

Coralyn mette a disposizione del Titolare le informazioni necessarie a dimostrare il rispetto
dell'art. 28 e consente e contribuisce ad audit, comprese le ispezioni, svolti dal Titolare o da un
soggetto da esso incaricato.

Modalità: preavviso scritto di almeno **30 giorni**, non più di **una volta l'anno** salvo violazione
accertata o richiesta dell'autorità, durante l'orario lavorativo, senza pregiudizio per l'operatività
e nel rispetto della riservatezza degli altri clienti. Coralyn può assolvere all'obbligo fornendo
documentazione o certificazioni di terza parte, se soddisfano ragionevolmente la richiesta. ⚖️-14

---

# Allegato A — Misure tecniche e organizzative (art. 32)

**[V]** = verificata sul codice · **[P]** = impegno di processo, non deducibile dal repository.

| Ambito | Misura |
|---|---|
| **Separazione tra clienti** **[V]** | Row-Level Security PostgreSQL con policy di isolamento per tenant in `ENABLE` + `FORCE` su **tutte e 22 le tabelle di dominio tenant-scoped**; il ruolo applicativo è non-superuser e non può aggirare le policy in lettura o scrittura ordinaria ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)). **Restano fuori RLS 6 tabelle** di identità, pre-tenant e credenziali del canale cliente, il cui isolamento è garantito dal filtro applicativo. Per le 22 tabelle di dominio, un difetto del solo codice applicativo non basta a esporre i dati di un altro Lido; per le altre 6, sì. ⚖️-09 |
| **Password** **[V]** | Hashing argon2id; mai memorizzate, trasmesse o registrate in chiaro. Credenziali consegnate via link monouso a scadenza, mai per email in chiaro ([ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)). |
| **Controllo degli accessi** **[V]** | Autenticazione obbligatoria su ogni endpoint applicativo, con guardia globale. Sono pubbliche per necessità funzionale le sole rotte di autenticazione, il controllo di stato del servizio e l'endpoint che espone i dati del titolare per l'informativa art. 13 (dati destinati per definizione alla pubblicazione verso l'interessato). Le azioni amministrative sono riservate al ruolo amministratore. |
| **Durata delle sessioni** **[V]** | JWT di accesso con scadenza configurabile: 8 ore per lo staff, 30 minuti per il canale cliente. Non esiste revoca del JWT staff prima della scadenza. |
| **Canale cliente** **[V]** | Accesso provisionato dall'operatore, mai autoregistrazione; token opaco e PIN conservati solo come hash; sessioni con refresh rotante legato al dispositivo e rilevamento del riuso (un token riusato revoca l'intera catena); limite di tentativi sul PIN e limite di frequenza sugli endpoint di autenticazione ([ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)). Gli endpoint di dominio del canale cliente sono protetti dal token di sessione, non dal limite di frequenza. |
| **Minimizzazione** **[V]** | Nessun campo per documenti d'identità; nessuna categoria particolare; contatti facoltativi ([ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md)). |
| **Cancellazione** **[V]** | Cancellazione reale quando il cliente non ha prenotazioni; in presenza di prenotazioni passate, anonimizzazione irreversibile in place che preserva la sola storia contabile in forma anonima; in presenza di prenotazioni attive o future, o di prelazione aperta, operazione bloccata fino alla chiusura del rapporto ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)). **Limiti noti**: il conteggio non considera i noleggi, e l'anonimizzazione non revoca le sessioni del canale cliente. ⚖️-11 |
| **Parete verso la piattaforma** **[V]** | La console espone metriche aggregate e nessun dato dei bagnanti; tratta il solo indirizzo email dell'amministratore del Lido ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)). |
| **Cifratura in transito** **[V]** | HTTPS terminato dal reverse proxy Caddy con certificati Let's Encrypt a rinnovo automatico; tratta interna in HTTP sulla rete privata dei container. |
| **Backup** **[V] + ⚖️-10** | `pg_dump` notturno compresso, ritenzione **14 giorni**. I backup **non sono cifrati** e la **copia offsite non è attiva**; il test di ripristino non è documentato. Sono limiti dichiarati, non omessi. |
| **Separazione degli ambienti** **[P]** | Database di sviluppo, test e produzione distinti; seed spento in produzione. L'assenza di dati reali fuori dalla produzione è un impegno organizzativo, da supportare con procedura scritta. |
| **Riservatezza del personale** **[P]** | `[COMPILARE: forma dell'impegno di riservatezza]` |
| **Continuità operativa** **[P]** | `[COMPILARE: obiettivi di ripristino]` |

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
