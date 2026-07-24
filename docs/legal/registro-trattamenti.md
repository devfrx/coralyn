# Registro delle attività di trattamento (art. 30 GDPR)

> **Documento interno di accountability.** Non si pubblica: si esibisce all'autorità di controllo su
> richiesta (art. 30.4 GDPR).
>
> ⚠️ **Bozza di lavoro, non un parere legale.** I punti marcati ⚖️ richiedono la validazione di un
> professionista prima di considerare il registro adottato. Vedi il riepilogo in
> [README.md](README.md).
>
> **Versione:** 0.1 (bozza) · **Data:** 2026-07-24 · **Slice:** D-062 (5.6c)

## Perché esiste, visto che siamo sotto i 250 dipendenti

L'esenzione dell'art. 30.5 non si applica: decade quando il trattamento **non è occasionale**, e
quello di Coralyn è continuativo e strutturale. Il registro va quindi tenuto in entrambe le vesti.

## Le due vesti di Coralyn — non confonderle

Coralyn è **titolare** e **responsabile** allo stesso tempo, su piani diversi. È la stessa
distinzione ratificata da [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md).

| Veste | Verso chi | Su quali dati | Sezione |
|---|---|---|---|
| **Titolare** (art. 30.1) | i propri utenti-operatori e i lidi clienti | account operatori, rapporto contrattuale | §A |
| **Responsabile** (art. 30.2) | i lidi clienti, che sono titolari | i dati dei bagnanti nel gestionale | §B |

## Titolare del trattamento

- **Ragione sociale:** `[COMPILARE: ragione sociale di Coralyn]`
- **Sede legale:** `[COMPILARE: indirizzo]`
- **P. IVA / C.F.:** `[COMPILARE]`
- **Contatto privacy:** `[COMPILARE: email]` · **PEC:** `[COMPILARE]`
- **Rappresentante legale:** `[COMPILARE]`
- **DPO:** `[COMPILARE: nominato sì/no + contatti]` ⚖️ — vedi §D

---

# §A — Trattamenti in veste di TITOLARE (art. 30.1)

## A1. Gestione degli account degli operatori (utenti di `web-staff`)

| Voce | Contenuto |
|---|---|
| **Finalità** | Creare e gestire le utenze con cui il personale del lido accede al gestionale; autenticazione; controllo degli accessi per ruolo. |
| **Base giuridica** | Esecuzione del contratto con il lido cliente (art. 6.1.b) — l'account è lo strumento con cui il servizio viene erogato. ⚖️ Da validare: si può sostenere anche il legittimo interesse (art. 6.1.f) dato che l'operatore-persona non è parte del contratto, che è col lido. |
| **Categorie di interessati** | Personale del lido cliente: amministratori e staff. |
| **Categorie di dati** | Email; hash della password (argon2id, mai la password); ruolo (`admin`/`staff`); stato di abilitazione (`disabledAt`); riferimento al lido. **Nessun nome, cognome, telefono o dato anagrafico.** |
| **Destinatari** | Fornitore di hosting `[COMPILARE]` come sub-responsabile; fornitore SMTP `[COMPILARE]` per le sole email di credenziali. |
| **Trasferimenti extra-SEE** | `[COMPILARE: dipende da hosting e provider email]` ⚖️ |
| **Conservazione** | Per la durata del rapporto contrattuale col lido; cancellazione o disattivazione alla cessazione. `[COMPILARE: termine preciso post-cessazione]` |
| **Misure di sicurezza** | Vedi §C. |

> **Nota di minimizzazione (verificata sul modello dati):** l'entità `User` contiene esclusivamente
> `email`, `passwordHash`, `role`, `establishmentId`, `disabledAt`. È già una minimizzazione forte:
> Coralyn **non sa** come si chiama un operatore.

## A2. Gestione delle credenziali (invito e reset password)

| Voce | Contenuto |
|---|---|
| **Finalità** | Consegnare in sicurezza il primo accesso e permettere il recupero password, senza mai trasmettere password in chiaro ([ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)). |
| **Base giuridica** | Esecuzione del contratto (art. 6.1.b); per la tracciatura di chi ha emesso il token, legittimo interesse alla sicurezza (art. 6.1.f). ⚖️ |
| **Categorie di interessati** | Operatori del lido; amministratori di piattaforma. |
| **Categorie di dati** | Email destinataria; **hash** del token (mai il token in chiaro); scopo (`invite`/`reset`); scadenza; momento di consumo; id di chi ha emesso il token. |
| **Destinatari** | Fornitore SMTP `[COMPILARE]`. |
| **Conservazione** | Il token scade dopo `CREDENTIAL_TOKEN_TTL_HOURS` (default **72 ore**); il record resta come traccia di sicurezza. `[COMPILARE: termine di purge dei record consumati/scaduti]` |
| **Misure di sicurezza** | Token opaco solo-hash, monouso, a scadenza. Vedi §C. |

## A3. Log di audit delle azioni di piattaforma

| Voce | Contenuto |
|---|---|
| **Finalità** | Tracciare le azioni amministrative del superuser di piattaforma (creazione lido, reset password amministratore) per accountability e sicurezza. |
| **Base giuridica** | Obbligo di accountability (art. 5.2 + art. 32 GDPR) e legittimo interesse alla sicurezza (art. 6.1.f). ⚖️ |
| **Categorie di interessati** | Amministratori di piattaforma (personale Coralyn). |
| **Categorie di dati** | Id dell'attore; tipo di azione; lido destinatario; metadati dell'azione; timestamp. **PII-free per costruzione** ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)). |
| **Conservazione** | `[COMPILARE: periodo di retention del log]` ⚖️ — un audit trail conservato indefinitamente è difficile da giustificare. |
| **Misure di sicurezza** | Vedi §C. |

## A4. Gestione del rapporto contrattuale coi lidi clienti

| Voce | Contenuto |
|---|---|
| **Finalità** | Amministrare il contratto: anagrafica cliente, fatturazione, adempimenti contabili e fiscali. |
| **Base giuridica** | Contratto (art. 6.1.b) e obbligo legale per la parte contabile (art. 6.1.c + art. 2220 Cod. Civ.). |
| **Categorie di interessati** | Referenti e rappresentanti legali dei lidi clienti. |
| **Categorie di dati** | Dati societari e di contatto del lido; dati di fatturazione. |
| **Conservazione** | **10 anni** per la documentazione contabile (art. 2220 Cod. Civ.). |
| **Note** | ⚖️ **Non ancora implementato**: oggi non esiste billing nel prodotto ([D-002](../architecture/deferred.md)). I dati del profilo legale del lido (`EstablishmentLegalProfile`) sono raccolti per l'informativa al bagnante, non per la fatturazione. Voce da completare quando il billing esisterà. |

---

# §B — Trattamenti in veste di RESPONSABILE (art. 30.2)

Per questi dati **il titolare è il lido**, non Coralyn: è il lido che decide finalità e mezzi
raccogliendo i dati dei propri bagnanti al banco. Coralyn li tratta **solo** su istruzione
documentata, formalizzata nel [DPA](dpa-coralyn-lido.md).

## B1. Dati dei bagnanti gestiti nel gestionale

| Voce | Contenuto |
|---|---|
| **Titolari per conto dei quali si tratta** | Ciascun lido cliente. `[COMPILARE: elenco, o rinvio al registro contratti]` |
| **Categorie di trattamento** | Conservazione, consultazione, modifica, cancellazione e anonimizzazione dei dati inseriti dal lido nel gestionale: anagrafica bagnanti, prenotazioni, abbonamenti, noleggi, incassi. |
| **Categorie di interessati** | Bagnanti clienti del lido — **inclusi potenzialmente minori** ⚖️ (vedi §D). |
| **Categorie di dati** | Nome e cognome; telefono ed email se forniti; note operative inserite dal lido; dati di prenotazione/abbonamento/noleggio; importi incassati. **Nessun documento d'identità, nessuna categoria particolare (art. 9)** — minimizzazione da [ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md). |
| **Sub-responsabili** | Hosting `[COMPILARE]`. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️ |
| **Cancellazione** | Su istruzione del titolare: cancellazione reale se il cliente non ha storico, altrimenti **anonimizzazione irreversibile** in place ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)). |
| **Misure di sicurezza** | Vedi §C — in particolare l'isolamento multi-tenant a livello di database. |

## B2. Credenziali di accesso del canale cliente

| Voce | Contenuto |
|---|---|
| **Finalità** | Permettere al bagnante di accedere al proprio spazio per comunicare le assenze ([ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)). |
| **Categorie di dati** | **Hash** del token di attivazione e **hash** del PIN (mai in chiaro); sessioni con refresh token legato al dispositivo; timestamp di attivazione e revoca. |
| **Note** | L'accesso è **provisionato dall'operatore**: non esiste registrazione autonoma del bagnante. Rotazione dei refresh token con **theft-detection** (il riuso revoca l'intera catena). |
| **Conservazione** | Enrollment valido `CUSTOMER_ENROLLMENT_TTL_HOURS` (default **90 giorni**); sessioni fino a revoca o scadenza (`CUSTOMER_REFRESH_TTL_DAYS`, default **120 giorni**). |

---

# §C — Misure di sicurezza (art. 32 GDPR)

Descrizione generale, **verificata sul codice** e non dichiarativa.

| Misura | Come è realizzata |
|---|---|
| **Isolamento multi-tenant** | Row-Level Security PostgreSQL con policy `tenant_isolation` in modalità `ENABLE` + `FORCE` su tutte le tabelle di dominio; il ruolo applicativo è **non-superuser e `NOBYPASSRLS`**. L'isolamento è imposto dal database, non solo dal codice ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)). |
| **Password** | Hashing **argon2id**. Le password non sono mai memorizzate, trasmesse né loggate in chiaro. |
| **Autenticazione** | JWT a scadenza breve; guardie globali di autenticazione e di ruolo su ogni rotta; accesso cliente separato con token opaco + PIN, entrambi solo-hash. |
| **Sessioni del canale cliente** | Refresh token rotanti legati al dispositivo, con rilevamento del riuso: un token riusato revoca l'intera catena di sessione. |
| **Rate limiting** | Limite di frequenza sugli endpoint del canale cliente; blocco a soglia sui tentativi di PIN errato. |
| **Minimizzazione** | Nessun documento d'identità; nessun dato particolare (art. 9); l'account operatore non contiene dati anagrafici. |
| **Cancellazione** | Cancellazione reale o anonimizzazione irreversibile, con blocco a tutela del contratto in corso ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)). |
| **Separazione degli ambienti** | Database di sviluppo, test e produzione distinti; nessun dato reale negli ambienti non di produzione. |
| **Cifratura in transito** | `[COMPILARE: TLS terminato dal reverse proxy — confermare la configurazione di produzione]` |
| **Backup** | `[COMPILARE: frequenza, ritenzione, cifratura, test di ripristino]` ⚖️ — l'art. 32.1.c richiede la capacità di ripristinare tempestivamente la disponibilità dei dati. |
| **Registrazione degli accessi** | `[COMPILARE]` — oggi l'audit copre le sole azioni di piattaforma; l'audit delle azioni admin dentro il lido è tracciato come debito noto ([D-047](../architecture/deferred.md)). |

---

# §D — Punti aperti da validare con un legale ⚖️

1. **Necessità del DPO.** L'art. 37.1 GDPR lo impone quando l'attività principale consiste in
   monitoraggio regolare e sistematico su larga scala, o nel trattamento su larga scala di categorie
   particolari. Un gestionale per lidi **non sembra rientrarci**: nessuna categoria particolare,
   nessuna profilazione, scala contenuta. La valutazione va però formalizzata per iscritto — anche
   una nomina volontaria è ammessa. **Serve una decisione documentata, non un silenzio.**
2. **Necessità di una DPIA** (art. 35). Prima facie non ricorrono i criteri, ma la valutazione va
   messa agli atti.
3. **Base giuridica per l'account operatore** (A1): contratto o legittimo interesse? L'operatore
   persona fisica non è parte del contratto, che è col lido.
4. **Trattamento di dati di minori.** I bagnanti possono essere minorenni. In Italia l'art.
   2-quinquies del Codice privacy fissa a **14 anni** l'età per il consenso ai servizi della società
   dell'informazione. Qui la base non è il consenso ma il contratto, quindi la soglia non morde
   direttamente — ma il punto va valutato, soprattutto per il canale cliente.
5. **Retention dei log di audit** (A3) e dei token consumati (A2): servono termini definiti.
6. **Trasferimenti extra-SEE**: dipendono interamente dall'hosting, non ancora scelto.
7. **Qualificazione titolare/responsabile**: ratificata come design in
   [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md), da formalizzare nel
   [DPA](dpa-coralyn-lido.md).

---

**Questo registro è una bozza tecnica.** Va rivisto da un professionista legale, completato nei
`[COMPILARE]` e formalmente adottato prima di poter essere esibito come adempimento dell'art. 30.
