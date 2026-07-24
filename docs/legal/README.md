# Documentazione legale e di compliance

> ⚠️ **Tutti i documenti in questa cartella sono BOZZE DI LAVORO redatte da ingegneri, non pareri
> legali.** Sono strutturalmente conformi agli obblighi noti e fondati sull'implementazione reale
> (verificata sul codice, non dichiarata), ma **nessuno è pronto alla pubblicazione o alla firma**
> senza la revisione di un professionista.
>
> **Redatti:** 2026-07-24 · **Versione corrente:** 0.2 (dopo due review indipendenti, normativa e
> tecnica avversariale)

## Indice

| Documento | Obbligo | Destinazione | Slice |
|---|---|---|---|
| [privacy-policy-operatori.md](privacy-policy-operatori.md) | artt. 13 **e 14** GDPR | `web-staff` / `web-platform`, `/legale/informativa` | D-061 (5.6b) |
| [imprint.md](imprint.md) | art. 7 D.Lgs. 70/2003 | `web-staff` / `web-platform`, `/legale/note` | D-061 (5.6b) |
| [dpa-coralyn-lido.md](dpa-coralyn-lido.md) | art. 28 GDPR | allegato contrattuale | D-062 (5.6c) |
| [registro-trattamenti.md](registro-trattamenti.md) | art. 30 GDPR | interno, esibito su richiesta | D-062 (5.6c) |

L'**informativa al bagnante** (art. 13, piano A) non sta qui: è già realizzata come codice versionato
in `apps/web-customer/src/features/legal/informativa.content.ts`, parametrizzata per lido
([ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)).

> ⚠️ **Non confondere le due superfici privacy.** Sono documenti diversi per interessati diversi, e
> scambiarli è già successo in uso ([ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md) §3-bis).
>
> | | Informativa **bagnante** | Policy **operatori** |
> |---|---|---|
> | App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
> | Titolare | **il lido** (varia per tenant) | **Coralyn** (uno solo) |
> | Versione in testa | **1.x** | **0.x** |
> | Da dove ci si arriva | promemoria nel flusso **Clienti**, link esterno | piè di pagina del **login** |
>
> Il path `/privacy` è **riservato** al bagnante e non deve mai comparire in `web-staff` o
> `web-platform`: due test per app lo vietano.

## I tre piani, per non confonderli mai

| Piano | Titolare | Responsabile | Documento | Stato |
|---|---|---|---|---|
| **A. Lido → bagnante** | il **lido** (per-tenant) | Coralyn | Informativa art. 13 | **fatto** (5.6a, in `web-customer`) |
| **B. Coralyn → operatore** | **Coralyn** | — | Privacy policy operatori + imprint | **bozza qui** (D-061) |
| **C. Coralyn ↔ lido** | il lido | Coralyn | DPA + registro | **bozza qui** (D-062) |

Confondere i piani è l'errore più comune nelle policy dei SaaS B2B multi-tenant. Due conseguenze
pratiche che i documenti applicano:

- Gli **account degli operatori** stanno nel piano B (Coralyn titolare), quindi **non** compaiono tra
  gli interessati del DPA.
- Il **fornitore email** non è sub-responsabile del Lido: recapita solo credenziali agli operatori e
  non tratta mai dati di bagnanti.

## Dati societari di Coralyn (fonte unica)

Si compilano **qui, una volta sola**. Gli altri documenti rinviano a questa tabella: è il modo per
impedire che imprint, policy e DPA divergano, che è un rilievo classico in sede di verifica.

| Campo | Valore |
|---|---|
| Ragione sociale | `[COMPILARE]` |
| Forma societaria | `[COMPILARE]` |
| Sede legale | `[COMPILARE]` |
| P. IVA / Codice Fiscale | `[COMPILARE]` |
| Registro Imprese e n. REA | `[COMPILARE]` |
| Capitale sociale (se dovuto) | `[COMPILARE]` |
| Rappresentante legale | `[COMPILARE]` |
| Email di contatto privacy | `[COMPILARE]` |
| PEC | `[COMPILARE]` |
| DPO (nominato sì/no, contatti) | `[COMPILARE]` ⚖️-01 |

## Quadro normativo verificato

Verificato il **2026-07-24**. Solo ciò che ha impatto reale sui documenti.

| Ambito | Fonte | Data | Impatto |
|---|---|---|---|
| Protezione dati, base | Reg. UE 2016/679 (GDPR), artt. 6, 13, 14, 28, 30, 32, 37 | 2016 | struttura di tutti i documenti |
| Consenso dei minori in Italia | D.Lgs. 196/2003 art. 2-quinquies (come mod. da D.Lgs. 101/2018) | 2018 | soglia italiana a **14 anni** |
| Cookie e tracker | [Garante privacy, provv. n. 231 del 10/06/2021](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876) | 2021, **in vigore** | regole del banner; **non attivate**, vedi sotto |
| Ambito tecnico dell'art. 5(3) ePrivacy | [EDPB, Orientamenti 2/2023](https://www.edpb.europa.eu/system/files/2025-02/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_it.pdf) | 2023 | l'art. 5(3) è **neutro rispetto alla tecnologia**: copre `localStorage` e Cache Storage, non solo i cookie |
| Tracking pixel nelle email | [Garante privacy, provv. n. 284 del 17/04/2026](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/10241943), GU n. 98 del 29/04/2026 | **2026** | adeguamento entro ~29/10/2026. Vedi sotto |
| Informazioni obbligatorie del sito | [D.Lgs. 70/2003 artt. 7 e 21](https://www.parlamento.it/parlam/leggi/deleghe/03070dl.htm) | 2003 | contenuto dell'[imprint](imprint.md); sanzione 103-10.000 € |
| Obbligo di DPO | GDPR art. 37.1 | 2016 | **non** scatta prima facie a questa scala ⚖️-01 |
| Conservazione contabile | art. 2220 Cod. Civ. | — | 10 anni sui dati contabili |

### Due conclusioni tecniche che pesano più di tutte

**1. Niente banner di consenso — verificato, non supposto.** Ricognizione sul codice: **zero**
occorrenze di `document.cookie` o `Set-Cookie` in tutto il repo. Nel codice **applicativo spedito**
(`web-staff`, `web-platform`, `web-customer`) non ci sono strumenti di analisi, script di terze parti
né risorse da rete di distribuzione esterna; i caratteri tipografici sono un pacchetto npm locale,
quindi **nessuna chiamata verso gli Stati Uniti** al caricamento della pagina.

Le memorizzazioni sul dispositivo sono **due categorie**, non una:

- i **token di sessione** in `localStorage`: uno in `web-staff` e `web-platform`, **due** in
  `web-customer` (accesso e rinnovo, quest'ultimo valido fino a 120 giorni);
- la **cache degli asset applicativi** del service worker (tutte e tre le app sono PWA installabili
  con precaching Workbox).

Entrambe ricadono nell'art. 5(3) ePrivacy — che l'EDPB conferma neutro rispetto alla tecnologia,
quindi non basta dire «non sono cookie» — ma entrambe sono **strettamente necessarie** al servizio
richiesto dall'utente, e quindi **esenti da consenso**. Serve una sezione informativa, non un banner.

⚠️ **La conclusione regge finché lo stack resta questo.** Basta aggiungere uno strumento di analisi,
una mappa, un video incorporato, un carattere da rete esterna, o una strategia di caching runtime del
service worker verso un dominio terzo, perché l'obbligo di banner ricompaia.

**2. Il provvedimento 284/2026 sui tracking pixel non morde oggi, ma è a un passo.** Coralyn invia
email transazionali (attivazione e reimpostazione credenziali). Verificato sul template
(`apps/api/src/mail/credential-setup.email.ts`): il corpo HTML contiene **solo un collegamento,
nessun elemento immagine**, quindi nessun pixel di tracciamento. Le nuove linee guida **non si
applicano allo stato attuale**.

⚠️ Il rischio è concreto e vicino: `deploy/.env.prod.example` propone un fornitore email commerciale,
e questi fornitori attivano spesso il **tracciamento delle aperture per impostazione predefinita**,
iniettando un pixel senza alcuna modifica al codice. Se accade, scattano informativa e consenso ex
provv. 284/2026. **Va verificato nella configurazione del fornitore al deploy**, e disattivato se non
serve.

## Punti aperti da validare con un legale ⚖️

Identificatori **stabili**, condivisi da tutti i documenti: le risposte del legale rimappano senza
ambiguità.

| ID | Punto | Dove |
|---|---|---|
| ⚖️-01 | **Nomina del DPO**: valutazione da formalizzare per iscritto, anche se negativa | [registro §D](registro-trattamenti.md) |
| ⚖️-02 | **Necessità di una DPIA** (art. 35) | [registro §D](registro-trattamenti.md) |
| ⚖️-03 | **Base giuridica dell'account operatore**: contratto o legittimo interesse? | [policy operatori](privacy-policy-operatori.md) |
| ⚖️-04 | **Legittimo interesse** su log e tracciatura credenziali: serve il bilanciamento | [registro A2, A3](registro-trattamenti.md) |
| ⚖️-05 | **Termini di conservazione** oggi indefiniti (log, token, log applicativi, supporto) | [registro](registro-trattamenti.md) |
| ⚖️-06 | **Trasferimenti extra-SEE** e garanzie: dipendono dall'hosting, non scelto | tutti |
| ⚖️-07 | **Non applicabilità dell'esenzione art. 30.5** | [registro](registro-trattamenti.md) |
| ⚖️-08 | **Dati di minori** tra i bagnanti (soglia italiana 14 anni) | [registro §D](registro-trattamenti.md) |
| ⚖️-09 | **Il ruolo applicativo è proprietario dello schema**: può alterare le policy RLS via SQL grezzo | [registro §C](registro-trattamenti.md) |
| ⚖️-10 | **Backup non cifrati, copia offsite non attiva**, test di ripristino non documentato | [DPA All. A](dpa-coralyn-lido.md) |
| ⚖️-11 | **Due difetti della cancellazione** (noleggi non contati; sessioni non revocate) | vedi sotto |
| ⚖️-12 | **Accessi tecnici eccezionali**: serve una procedura di registrazione | [registro B3](registro-trattamenti.md) |
| ⚖️-13 | **Qualificazione titolare/responsabile** | [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) |
| ⚖️-14 | **Termini contrattuali del DPA**: preavviso sub-responsabili, finestra breach, audit, gerarchia contrattuale, cancellazione per silenzio | [DPA](dpa-coralyn-lido.md) |
| ⚖️-15 | **Campi liberi** (`Customer.notes`, `Booking.extras`): rischio di dati eccedenti | [DPA art. 3](dpa-coralyn-lido.md) |
| ⚖️-16 | **Perimetro dell'imprint**: app dietro autenticazione, e imprint **del lido** su `web-customer` | [imprint](imprint.md) |
| ⚖️-17 | **Prezzi e tariffe** (art. 7.1.h), capitale sociale, e portata del richiamo sanzionatorio dell'art. 21 | [imprint](imprint.md) |
| ~~⚖️-18~~ | ~~**Consegna dell'informativa agli operatori** (art. 14.3.a)~~ **CHIUSO** 2026-07-24: rotte pubbliche `/privacy` in entrambe le app ([ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)) **e** rinvio nell'email di invito e di reset, in testo e HTML, vincolato da test | [policy operatori](privacy-policy-operatori.md) |

## Difetti di prodotto emersi dalla revisione (non si risolvono scrivendo)

La review tecnica avversariale ha trovato due comportamenti che **contraddicono** ciò che i documenti
promettono. Vanno corretti nel codice, non giustificati qui. ⚖️-11

1. **La cancellazione GDPR non guarda i noleggi aperti.** Le guardie a tutela del rapporto in corso
   contano solo le prenotazioni (`customers.service.ts:73-86`): un cliente con un **noleggio aperto**
   (non reso né annullato) è rimovibile **mentre il rapporto è attivo**, cosa che per le prenotazioni
   è invece bloccata con un 409. Il distacco del noleggio (`Rental.customerId` → `NULL`) **non** è il
   difetto: realizza la cancellazione preservando la storia contabile in forma anonima, ed è
   plausibilmente desiderabile ([D-059](../architecture/deferred.md)). Il difetto è l'**assenza del
   blocco**.
2. **L'anonimizzazione non revoca l'accesso del canale cliente.** Enrollment e sessioni restano
   validi fino a scadenza (fino a 120 giorni): un bagnante anonimizzato conserva una sessione
   funzionante. Indebolisce l'esercizio del diritto alla cancellazione.

## Cosa manca prima di poter usare questi documenti

1. **Dati societari di Coralyn**: la tabella canonica qui sopra. Non esistono ancora: sono
   `[COMPILARE]` ovunque, mai inventati.
2. **Scelta dell'infrastruttura**: hosting e fornitore email determinano sub-responsabili, ubicazione
   dei dati e trasferimenti extra-SEE. Blocca gli stessi `[COMPILARE]` anche nell'informativa al
   bagnante di 5.6a.
3. **Revisione legale** dei 17 punti ⚖️.
4. **Correzione dei due difetti di prodotto** qui sopra.
5. ~~**Pubblicazione** di policy e imprint nelle app interne~~ — **FATTO** (2026-07-24,
   [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)): package condiviso
   `@coralyn/legal`, rotte pubbliche `/privacy` e `/note-legali` in `web-staff` e `web-platform`,
   link nel piè di pagina del login, **e rinvio all'informativa nelle email di invito e reset**
   (art. 14.3.a assolto, ⚖️-18 chiuso).

> **Attenzione al doppio artefatto.** Il testo pubblicato vive in
> `packages/legal/src/*.content.ts` ed è un **porting fedele** di questi documenti. I due vanno
> aggiornati **insieme**: una divergenza tra ciò che legge il legale e ciò che legge l'utente è
> esattamente il difetto che il package esiste per prevenire.

**Nessuno di questi documenti è pronto alla pubblicazione. Sono pronti alla revisione legale.**
