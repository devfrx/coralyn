# Registro delle attività di trattamento (art. 30 GDPR)

> **Documento interno di accountability.** Non si pubblica: si esibisce all'autorità di controllo su
> richiesta (art. 30.4 GDPR).
>
> ⚠️ **Bozza di lavoro, non un parere legale.** I punti marcati ⚖️ richiedono la validazione di un
> professionista prima di considerare il registro adottato. Riepilogo in [README.md](README.md).
>
> **Versione:** 0.2 (bozza, post-review) · **Data:** 2026-07-24 · **Slice:** D-062 (5.6c)
>
> I dati identificativi del titolare sono nella [tabella canonica del README](README.md#dati-societari-di-coralyn-fonte-unica):
> si compilano **una volta sola** lì.

## Perché esiste, visto che siamo sotto i 250 dipendenti

L'esenzione dell'art. 30.5 non si applica: decade quando il trattamento **non è occasionale**, e
quello di Coralyn è continuativo e strutturale. ⚖️-07 — è la lettura prevalente, ma resta una
qualificazione giuridica da confermare.

## Le due vesti di Coralyn, da non confondere

| Veste | Verso chi | Su quali dati | Sezione |
|---|---|---|---|
| **Titolare** (art. 30.1) | i propri utenti-operatori e i lidi clienti | account operatori, rapporto contrattuale, supporto | §A |
| **Responsabile** (art. 30.2) | i lidi clienti, che sono titolari | i dati dei bagnanti nel gestionale | §B |

---

# §A — Trattamenti in veste di TITOLARE (art. 30.1)

## A1. Gestione degli account degli operatori (`web-staff` e `web-platform`)

| Voce | Contenuto |
|---|---|
| **Finalità** | Creare e gestire le utenze di accesso al gestionale e alla console di piattaforma; autenticazione; controllo degli accessi per ruolo. |
| **Base giuridica** | Esecuzione del contratto con il lido cliente (art. 6.1.b). ⚖️-03 — l'operatore persona fisica **non è parte** del contratto, che è col lido: è sostenibile anche il legittimo interesse (art. 6.1.f), con effetti diversi (bilanciamento da documentare e diritto di opposizione). |
| **Categorie di interessati** | Personale dei lidi clienti (amministratori e staff) e amministratori di piattaforma. |
| **Categorie di dati** | Email; hash della password (argon2id, mai la password); ruolo; stato di abilitazione; riferimento al lido (assente per il superuser di piattaforma). **Nessun nome, cognome, telefono o dato anagrafico.** |
| **Destinatari** | Fornitore di hosting `[COMPILARE]`, sub-responsabile; fornitore SMTP `[COMPILARE]` per le sole email di credenziali. |
| **Trasferimenti extra-SEE** | `[COMPILARE: dipende da hosting e provider email]` ⚖️-06 |
| **Conservazione** | Per la durata del rapporto contrattuale col lido; disattivazione e poi cancellazione alla cessazione. `[COMPILARE: termine preciso post-cessazione]` |
| **Misure di sicurezza** | Vedi §C. |

> **Nota di minimizzazione (verificata sul modello dati, `schema.prisma:146-157`):** l'entità `User`
> contiene esclusivamente `email`, `passwordHash`, `role`, `establishmentId`, `disabledAt`. Coralyn
> **non sa** come si chiama un operatore.

## A2. Gestione delle credenziali (invito e reset password)

| Voce | Contenuto |
|---|---|
| **Finalità** | Consegnare in sicurezza il primo accesso e permettere il recupero password, senza mai trasmettere password in chiaro ([ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)). |
| **Base giuridica** | Esecuzione del contratto (art. 6.1.b); per la tracciatura di chi ha emesso il token, legittimo interesse alla sicurezza (art. 6.1.f). ⚖️-04 |
| **Categorie di interessati** | Operatori dei lidi; amministratori di piattaforma. |
| **Categorie di dati** | Email destinataria; **hash** del token (mai il token in chiaro); scopo (`invite`/`reset`); scadenza; momento di consumo; id di chi ha emesso il token. |
| **Destinatari** | Fornitore SMTP `[COMPILARE]`; fornitore di hosting `[COMPILARE]`. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Conservazione** | Il token scade dopo `CREDENTIAL_TOKEN_TTL_HOURS`, **72 ore** per impostazione predefinita (verificato: `credential-setup.service.ts:24`); il record resta come traccia di sicurezza. `[COMPILARE: termine di purge dei record consumati/scaduti]` ⚖️-05 |

## A3. Log di audit delle azioni di piattaforma

| Voce | Contenuto |
|---|---|
| **Finalità** | Tracciare le azioni amministrative del superuser di piattaforma (creazione lido, reset password amministratore, sospensione/riattivazione) per accountability e sicurezza. |
| **Base giuridica** | **Legittimo interesse** (art. 6.1.f) alla sicurezza e alla tracciabilità delle azioni amministrative, con test di bilanciamento da documentare. Gli artt. 5.2 e 32 sono la *fonte dell'obbligo di accountability* che alimenta l'interesse, **non una base di liceità autonoma**: le basi sono tassativamente quelle dell'art. 6.1. ⚖️-04 |
| **Categorie di interessati** | Amministratori di piattaforma (personale Coralyn) **e amministratori dei lidi clienti**. |
| **Categorie di dati** | Id dell'attore; tipo di azione; lido destinatario; timestamp; **metadati contenenti l'indirizzo email dell'amministratore destinatario** (verificato: `platform-provisioning.service.ts:35` e `:70`). **Mai dati dei bagnanti**, per costruzione. |
| **Destinatari** | Fornitore di hosting `[COMPILARE]`, sub-responsabile. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Conservazione** | `[COMPILARE: periodo di retention del log]` ⚖️-05 — un audit trail conservato indefinitamente è difficile da giustificare. |

## A4. Gestione del rapporto contrattuale coi lidi clienti

| Voce | Contenuto |
|---|---|
| **Finalità** | Amministrare il contratto: anagrafica cliente, fatturazione, adempimenti contabili e fiscali. |
| **Base giuridica** | Contratto (art. 6.1.b) e obbligo legale per la parte contabile (art. 6.1.c + art. 2220 Cod. Civ.). |
| **Categorie di interessati** | Referenti e rappresentanti legali dei lidi clienti. |
| **Categorie di dati** | Dati societari e di contatto del lido; dati di fatturazione. |
| **Destinatari** | Consulente contabile/fiscale `[COMPILARE]`; Agenzia delle Entrate per gli adempimenti fiscali; fornitore di hosting `[COMPILARE]`. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Conservazione** | **10 anni** per la documentazione contabile (art. 2220 Cod. Civ.). |
| **Misure di sicurezza** | Vedi §C. |
| **Note** | **Non ancora implementato**: oggi non esiste billing nel prodotto ([D-002](../architecture/deferred.md)). I dati di `EstablishmentLegalProfile` sono raccolti per l'informativa al bagnante, non per la fatturazione. Voce da completare quando il billing esisterà. |

## A5. Assistenza tecnica ai lidi clienti

| Voce | Contenuto |
|---|---|
| **Finalità** | Ricevere e lavorare le richieste di supporto tecnico provenienti dal personale del lido. |
| **Base giuridica** | Esecuzione del contratto (art. 6.1.b). |
| **Categorie di interessati** | Personale dei lidi clienti che apre una richiesta. |
| **Categorie di dati** | Dati di contatto del richiedente e contenuto della richiesta. ⚠️ Una richiesta di supporto può **incidentalmente** contenere dati di bagnanti riportati dall'utente: in tal caso il trattamento ricade in §B, non qui. |
| **Destinatari** | `[COMPILARE: canale/strumento di ticketing, se diverso dall'email]` |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Conservazione** | `[COMPILARE]` ⚖️-05 |

---

# §B — Trattamenti in veste di RESPONSABILE (art. 30.2)

Per questi dati **il titolare è il lido**, non Coralyn. Coralyn li tratta **solo** su istruzione
documentata, formalizzata nel [DPA](dpa-coralyn-lido.md).

## B1. Dati dei bagnanti gestiti nel gestionale

| Voce | Contenuto |
|---|---|
| **Titolari per conto dei quali si tratta** | Ciascun lido cliente. `[COMPILARE: elenco, o rinvio al registro contratti]` |
| **Categorie di trattamento** | Conservazione, consultazione, modifica, cancellazione e anonimizzazione dei dati inseriti dal lido: anagrafica bagnanti, prenotazioni, abbonamenti, noleggi, incassi. |
| **Categorie di interessati** | Bagnanti clienti del lido, **inclusi potenzialmente minori** ⚖️-08. |
| **Categorie di dati** | Nome e cognome; telefono ed email se forniti; note operative a testo libero; dati di prenotazione/abbonamento/noleggio; importi. Il gestionale **non prevede campi** per documenti d'identità né per categorie particolari (art. 9) — [ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md). ⚠️ Restano due **contenitori aperti** che il lido potrebbe riempire oltre la finalità: `Customer.notes` e `Booking.extras` (campo JSON libero). |
| **Sub-responsabili** | Hosting `[COMPILARE]`. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Cancellazione** | Vedi §C, riga «Cancellazione». |
| **Misure di sicurezza** | Vedi §C. |

## B2. Credenziali di accesso del canale cliente

| Voce | Contenuto |
|---|---|
| **Titolari per conto dei quali si tratta** | Ciascun lido cliente. `[COMPILARE: come B1]` |
| **Categorie di trattamento** | Emissione, verifica, rotazione e revoca delle credenziali di accesso del bagnante. |
| **Categorie di interessati** | Bagnanti ai quali il lido ha attivato l'accesso. |
| **Categorie di dati** | **Hash** del token di attivazione e **hash** del PIN (mai in chiaro); sessioni con refresh token legato al dispositivo; timestamp di attivazione, rotazione e revoca. |
| **Sub-responsabili** | Hosting `[COMPILARE]`. |
| **Trasferimenti extra-SEE** | `[COMPILARE]` ⚖️-06 |
| **Conservazione** | Enrollment valido `CUSTOMER_ENROLLMENT_TTL_HOURS`, **90 giorni** predefiniti; sessioni fino a revoca o scadenza (`CUSTOMER_REFRESH_TTL_DAYS`, **120 giorni** predefiniti). ⚠️ **L'anonimizzazione del bagnante non revoca le sessioni attive**: vedi §C. |
| **Note** | L'accesso è **provisionato dall'operatore**, non esiste autoregistrazione ([ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)). |

## B3. Intervento tecnico eccezionale sui dati

| Voce | Contenuto |
|---|---|
| **Titolari** | Il lido che richiede l'intervento. |
| **Categorie di trattamento** | Accesso diretto ai dati per diagnosi o ripristino, **solo su richiesta del titolare** e da documentare (art. 5 del [DPA](dpa-coralyn-lido.md)). Non esiste alcuna funzione applicativa di lettura puntuale dei dati di un bagnante ([D-042](../architecture/deferred.md)). |
| **Categorie di dati** | Potenzialmente tutte quelle di B1. |
| **Conservazione** | Nessuna copia conservata oltre l'intervento. `[COMPILARE: procedura di registrazione degli accessi eccezionali]` ⚖️-12 |

---

# §C — Misure di sicurezza (art. 32 GDPR)

Descrizione generale. Le misure marcate **[V]** sono **verificate sul codice**; quelle marcate
**[P]** sono **impegni di processo**, non deducibili dal repository.

| Misura | Come è realizzata |
|---|---|
| **Isolamento multi-tenant** **[V]** | Row-Level Security PostgreSQL con policy `tenant_isolation` in `ENABLE` + `FORCE` su **tutte e 22 le tabelle di dominio tenant-scoped**. Il ruolo applicativo è **non-superuser e `NOBYPASSRLS`**: non può aggirare le policy in lettura o scrittura ordinaria ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)). **Restano deliberatamente fuori RLS 6 tabelle**: identità e pre-tenant (`User`, `Establishment`, `CredentialSetupToken`, `PlatformAuditLog`) e credenziali del canale cliente (`CustomerEnrollmentToken`, `CustomerSession`); per queste l'isolamento è **applicativo**, non di database. ⚠️ Il ruolo applicativo è anche **proprietario dello schema**, quindi in linea teorica potrebbe alterare le policy con SQL grezzo: è il compromesso necessario a far girare le migration. ⚖️-09 |
| **Password** **[V]** | Hashing **argon2id**; mai memorizzate, trasmesse o registrate in chiaro. Consegna via link monouso a scadenza. |
| **Autenticazione** **[V]** | Guardia globale su ogni endpoint applicativo, con `@Public()` come sola eccezione esplicita: rotte di autenticazione, controllo di stato del servizio e l'endpoint che espone i dati del titolare per l'informativa art. 13 (dati destinati per definizione alla pubblicazione). Autorizzazione per ruolo sulle azioni amministrative. |
| **Durata delle sessioni** **[V]** | JWT di accesso con scadenza configurabile: **8 ore** per lo staff, **30 minuti** per il canale cliente. ⚠️ Non esiste revoca del JWT staff: disabilitare un operatore non invalida il token già emesso fino a scadenza ([D-026](../architecture/deferred.md)). |
| **Canale cliente** **[V]** | Token di attivazione e PIN entrambi solo-hash; refresh rotante legato al dispositivo con **rilevamento del riuso** (un token riusato revoca l'intera catena). |
| **Limite di frequenza** **[V]** | Attivo per IP sugli endpoint di **autenticazione** del canale cliente (10 richieste/60s predefinite) e blocco a soglia sui tentativi di PIN errato (5 predefiniti). ⚠️ Gli endpoint **di dominio** del canale cliente e il **login staff** non sono soggetti a limite di frequenza ([D-027](../architecture/deferred.md)). |
| **Minimizzazione** **[V]** | Nessun campo per documenti d'identità né per categorie particolari; contatti facoltativi; account operatore privo di dati anagrafici. |
| **Cancellazione** **[V]** | Cancellazione reale quando il cliente **non ha prenotazioni**; in presenza di prenotazioni passate, **anonimizzazione irreversibile in place** (nome e cognome sostituiti da segnaposto, telefono, email e note azzerati). In presenza di prenotazioni attive o future, o di una prelazione di rinnovo aperta, l'operazione è **bloccata** finché il rapporto non si chiude (oblio differito, non negato) — [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md). ⚠️ **Due limiti noti:** (a) il conteggio considera **solo le prenotazioni**, non i noleggi, quindi un cliente con soli noleggi viene cancellato davvero e i noleggi restano orfani; (b) l'anonimizzazione **non revoca** enrollment e sessioni del canale cliente. ⚖️-11 |
| **Parete verso la piattaforma** **[V]** | La console espone **metriche aggregate** dei lidi e **nessun dato dei bagnanti** ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)). L'unico dato personale che tratta è l'**email dell'amministratore** del lido, necessaria a provisioning e reset. |
| **Cifratura in transito** **[V]** | HTTPS terminato dal reverse proxy Caddy con certificati Let's Encrypt a rinnovo automatico; tratta interna in HTTP sulla rete Docker privata (`deploy/Caddyfile`). |
| **Backup** **[V] + ⚖️-10** | `pg_dump` notturno compresso con **ritenzione 14 giorni** (`deploy/backup-db.sh`). ⚠️ I backup **non sono cifrati** e la **copia offsite è disattivata** (riga commentata): sono temi di art. 32.1(b)-(c) da portare al legale, non da nascondere. Il **test di ripristino** non è documentato. |
| **Separazione degli ambienti** **[P]** | I database di sviluppo, test e produzione sono distinti e il seed è spento in produzione (verificabile). Che nessun dump di produzione venga copiato altrove è un **impegno organizzativo**, non un fatto deducibile dal codice: richiede una procedura scritta. |
| **Riservatezza del personale** **[P]** | Impegni di riservatezza delle persone autorizzate (art. 28.3.b). `[COMPILARE: forma dell'impegno]` |
| **Registrazione degli accessi** **[P]** | L'audit strutturato copre le sole azioni di piattaforma; l'audit delle azioni admin dentro il lido è debito noto ([D-047](../architecture/deferred.md)). ⚠️ I **log applicativi** registrano già l'indirizzo email del destinatario in caso di fallimento SMTP: sono un trattamento da censire e con una retention da definire. ⚖️-05 |
| **Continuità operativa** **[P]** | `[COMPILARE: obiettivi di ripristino]` |

---

# §D — Punti aperti da validare con un legale ⚖️

Identificatori stabili, condivisi con [README](README.md) e [policy operatori](privacy-policy-operatori.md).

| ID | Punto |
|---|---|
| ⚖️-01 | **Necessità del DPO** (art. 37.1). Un gestionale per lidi non sembra rientrarvi: nessuna categoria particolare, nessuna profilazione, scala contenuta. La valutazione va **formalizzata per iscritto anche se negativa**; è ammessa la nomina volontaria. |
| ⚖️-02 | **Necessità di una DPIA** (art. 35). Prima facie non ricorrono i criteri, ma la valutazione va messa agli atti. |
| ⚖️-03 | **Base giuridica dell'account operatore**: contratto o legittimo interesse? (A1) |
| ⚖️-04 | **Legittimo interesse** su log di audit e tracciatura credenziali: serve il test di bilanciamento documentato. (A2, A3) |
| ⚖️-05 | **Termini di conservazione** oggi indefiniti: log di audit, token consumati, log applicativi, richieste di supporto. |
| ⚖️-06 | **Trasferimenti extra-SEE**: dipendono interamente dall'hosting, non ancora scelto. |
| ⚖️-07 | **Non applicabilità dell'esenzione art. 30.5**: lettura prevalente, da confermare. |
| ⚖️-08 | **Dati di minori** tra i bagnanti. In Italia l'art. 2-quinquies del Codice privacy fissa a **14 anni** l'età per il consenso ai servizi della società dell'informazione. Qui la base non è il consenso ma il contratto, quindi la soglia non morde direttamente: da valutare comunque, soprattutto per il canale cliente. |
| ⚖️-09 | **Il ruolo applicativo è proprietario dello schema**: può alterare le policy RLS via SQL grezzo. Rischio residuo da valutare. |
| ⚖️-10 | **Backup non cifrati e senza copia offsite attiva**; test di ripristino non documentato. |
| ⚖️-11 | **Due limiti della cancellazione**: i noleggi non sono conteggiati; le sessioni del canale cliente non vengono revocate. Sono **difetti di prodotto**, non scelte: vanno corretti nel codice, non giustificati qui. |
| ⚖️-12 | **Accessi tecnici eccezionali** (B3): serve una procedura di registrazione. |
| ⚖️-13 | **Qualificazione titolare/responsabile**: ratificata come design in [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md), formalizzata nel [DPA](dpa-coralyn-lido.md). |

---

**Questo registro è una bozza tecnica.** Va rivisto da un professionista, completato nei `[COMPILARE]`
e formalmente adottato prima di poter essere esibito come adempimento dell'art. 30.
