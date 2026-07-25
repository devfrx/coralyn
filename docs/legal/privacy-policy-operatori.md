# Privacy policy operatori (Coralyn titolare)

> ⚠️ **Bozza di lavoro, non un parere legale.** Riepilogo dei punti ⚖️ in [README.md](README.md).
>
> **Versione:** 0.3 (bozza) · **Data:** 2026-07-24 · **Slice:** D-061 (5.6b)

## Nota per chi implementa (non fa parte del testo pubblicato)

Questo è il **piano B** dei tre ratificati da
[ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md): verso l'operatore che
usa `web-staff` o `web-platform`, il titolare del trattamento è **Coralyn**, non il lido. Non va
mescolato con l'informativa al bagnante (piano A, già realizzata in `web-customer`), dove il titolare
è il lido.

**Si applicano gli artt. 13 E 14 GDPR.** L'email dell'operatore non è mai conferita
dall'interessato: la inserisce l'amministratore del lido o il superuser di piattaforma. Quando i dati
non sono raccolti presso l'interessato, l'art. 14.2(f) impone di indicarne la **fonte** e l'art.
14.3(a) di rendere l'informativa entro un mese. Di qui la sezione «Da dove arrivano i tuoi dati».

**Il testo copre due popolazioni distinte** (operatori di lido e amministratori di piattaforma) i cui
trattamenti non coincidono: le sezioni lo dicono esplicitamente invece di generalizzare.

**Dove vive questo testo:** package condiviso **`@coralyn/legal`**, consumato da `web-staff` e
`web-platform`, così i due testi non possono divergere
([ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)). **Implementato.** Il corpo
della policy è scritto **senza trattini lunghi**, per essere portabile in-app senza violare le
convenzioni sul testo utente.

⚠️ **Doppio artefatto.** Il testo pubblicato vive in `packages/legal/src/privacy.content.ts` ed è un
porting fedele di questo documento: i due vanno aggiornati **insieme**.

---

# Informativa sul trattamento dei dati personali

**Utenti del gestionale Coralyn**

Ultimo aggiornamento: `[COMPILARE: data di pubblicazione]`

## Chi tratta i tuoi dati

Il titolare del trattamento è `[COMPILARE: ragione sociale]`, con sede in `[COMPILARE: indirizzo]`,
P. IVA `[COMPILARE]`.

Per qualsiasi questione relativa ai tuoi dati puoi scrivere a `[COMPILARE: email privacy]`.

`[COMPILARE: se nominato, contatti del Responsabile della protezione dei dati]` ⚖️-01

> **Attenzione a non confondere due cose diverse.** Questa informativa riguarda **te che usi il
> gestionale come operatore**. I dati dei bagnanti che inserisci lavorando sono invece trattati dallo
> stabilimento presso cui lavori, che ne è il titolare: per quelli, Coralyn agisce solo come
> responsabile del trattamento, su istruzione dello stabilimento.

## Da dove arrivano i tuoi dati

Il tuo indirizzo email non lo raccogliamo da te: ci viene comunicato dallo stabilimento presso cui
lavori, oppure dall'amministratore della piattaforma, nel momento in cui chiede l'apertura del tuo
accesso.

Per questo ti rendiamo questa informativa insieme all'email con cui ti invitiamo ad attivare
l'account, e insieme a quella di reimpostazione della password: sono il primo contatto che abbiamo
con te. La trovi anche in fondo alla schermata di accesso, in qualsiasi momento.

Questo documento riguarda te come utente del gestionale. È diverso dall'informativa che lo
stabilimento consegna ai propri clienti, che riguarda loro e di cui il titolare è lo stabilimento
stesso.

> ✅ **Verificato sul codice (2026-07-26).** L'affermazione qui sopra è vera, non un proposito:
> `credential-setup.email.ts:23` costruisce il rinvio a **`/legale/informativa`** e lo include in
> **entrambe** le versioni del messaggio (testo e HTML) e per **entrambi** gli scopi (invito e
> reset), sulla stessa origin del link di set-password; le rotte `/legale/informativa` e
> `/legale/note` sono pubbliche in `web-staff` e `web-platform`
> ([ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)). **Otto** test la
> vincolano — cinque sull'email, tre sulle rotte — e se il rinvio sparisse l'adempimento
> dell'art. 14.3(a) salterebbe in silenzio.
>
> ⚠️ **Questo blocco è stato corretto il 2026-07-26, ed è utile sapere perché.** Diceva `/privacy`,
> ed era **vero quando fu scritto** il 2026-07-24. È diventato **falso il giorno dopo**: `/privacy`
> collideva con il path dell'informativa del **bagnante** servita da `web-customer`, e la
> correzione registrata in [D-061](../architecture/deferred.md) ha spostato le rotte operatori sotto
> `/legale/`. Il codice ora **vieta** esplicitamente `/privacy` in `web-staff`
> (`router/index.ts:27` e `router/legal-routes.spec.ts`), mentre questo documento ha continuato per
> due giorni a dichiarare «verificato» una rotta che i test rifiutavano. Un blocco «✅ Verificato»
> che invecchia è peggio di nessun blocco: è il paragrafo che un legale legge **proprio** per
> accertare l'art. 14.3(a).

## Quali dati trattiamo e perché

### Il tuo account

Trattiamo la tua **email**, la tua **password in forma protetta**, il tuo **ruolo**, lo **stato del
tuo accesso** e, se lavori per uno stabilimento, il riferimento allo stabilimento.

Ci servono per creare il tuo accesso, verificare la tua identità quando entri e stabilire cosa puoi
fare dentro il gestionale.

Non raccogliamo il tuo nome, il tuo cognome, il tuo numero di telefono né altri dati anagrafici:
l'account è volutamente ridotto al minimo indispensabile.

La base giuridica è l'esecuzione del contratto tra Coralyn e lo stabilimento presso cui lavori, di
cui il tuo accesso è lo strumento. ⚖️-03

### L'attivazione e il recupero della password

Quando il tuo accesso viene creato, o quando chiedi di reimpostare la password, ti inviamo un'email
con un link personale, valido una sola volta e a scadenza. Del link conserviamo solo una versione
cifrata, mai il link in chiaro, insieme alla data di scadenza e al momento in cui lo hai usato.

Non ti inviamo mai una password in chiaro per email.

### I registri tecnici del servizio

Il funzionamento del servizio produce registri tecnici. In caso di errore nell'invio di un'email di
servizio, il registro conserva l'indirizzo email a cui era diretta, per permetterci di capire cosa
non ha funzionato. La base giuridica è il nostro legittimo interesse a diagnosticare e correggere i
malfunzionamenti. ⚖️-04

`[COMPILARE: per quanto tempo conserviamo i registri tecnici]` ⚖️-05

### Le azioni amministrative sulla piattaforma

Registriamo le operazioni amministrative svolte **sulla piattaforma** dal fornitore del servizio:
l'apertura di un nuovo stabilimento, la reimpostazione della password di un amministratore, la
sospensione o riattivazione di uno stabilimento. Di queste operazioni conserviamo chi le ha
compiute, che cosa ha fatto, quando, e l'indirizzo email dell'amministratore interessato.

Ti riguarda **solo se sei un amministratore di stabilimento**, perché in quel caso il tuo indirizzo
compare in questa registrazione. Le operazioni che svolgi tu dentro il gestionale del tuo
stabilimento non sono oggetto di questa registrazione.

La base giuridica è il nostro legittimo interesse a mantenere il servizio sicuro e a rendere conto
del suo funzionamento. ⚖️-04

## Cosa NON facciamo

- Non usiamo cookie, di nessun tipo.
- Non usiamo strumenti di analisi, statistica o tracciamento.
- Non ti profiliamo e non prendiamo decisioni automatizzate che ti riguardano.
- Non vendiamo i tuoi dati e non li comunichiamo a terzi per finalità di marketing.

## Cosa viene salvato sul tuo dispositivo

Per farti restare autenticato dopo il login, il gestionale salva nella memoria locale del tuo browser
un identificativo di sessione. Si cancella quando esci dal tuo account.

Il gestionale è inoltre un'applicazione installabile: il tuo browser conserva localmente una copia
dei file che la compongono (pagine, stili, immagini, caratteri) per farla partire rapidamente e
funzionare anche quando la rete è assente o instabile.

Sono entrambi strumenti necessari al funzionamento del servizio che hai richiesto, quindi non
richiedono il tuo consenso, e non servono a riconoscerti né a seguirti su altri siti. Per questo non
trovi un banner: non c'è nulla da consentire.

## A chi comunichiamo i tuoi dati

I tuoi dati sono conservati presso il nostro fornitore di infrastruttura e trattati dal fornitore che
recapita le nostre email di servizio. Entrambi agiscono come responsabili del trattamento per conto
nostro, con obblighi contrattuali di riservatezza e sicurezza.

Fornitore di infrastruttura e ubicazione dei server: `[COMPILARE]`
Fornitore del servizio email: `[COMPILARE]`

Non diffondiamo i tuoi dati e non li comunichiamo ad altri soggetti, salvo obblighi di legge o
richieste dell'autorità giudiziaria.

## Trasferimenti fuori dall'Unione Europea

`[COMPILARE]` ⚖️-06

> Nota per chi compila: se tutti i fornitori sono nel SEE, la formulazione corretta è una negazione
> esplicita («Non trasferiamo i tuoi dati fuori dallo Spazio Economico Europeo»). Se invece un
> trasferimento esiste, gli artt. 13.1(f) e 14.1(f) impongono di indicare **anche** verso quale
> paese, quale garanzia adeguata è applicata (decisione di adeguatezza, Clausole Contrattuali
> Standard) e **come ottenerne copia**. La sola negazione o il solo nome del paese non bastano.

## Per quanto tempo li conserviamo

Il tuo account resta attivo finché dura il rapporto tra Coralyn e lo stabilimento presso cui lavori,
o finché lo stabilimento non lo disattiva. Alla cessazione del rapporto l'account viene disattivato e
poi cancellato.

I link di attivazione e recupero password scadono dopo **72 ore** e non sono più utilizzabili.

`[COMPILARE: termine di conservazione dei registri di sicurezza]` ⚖️-05

## I tuoi diritti

Puoi chiederci in qualsiasi momento di accedere ai tuoi dati, di correggerli, di cancellarli, di
limitarne il trattamento, di riceverli in formato leggibile da un computer e di opporti al
trattamento fondato sul nostro legittimo interesse. Sono i diritti previsti dagli articoli 15-22 del
Regolamento europeo sulla protezione dei dati.

Per esercitarli scrivi a `[COMPILARE: email privacy]`. Ti rispondiamo entro un mese.

Se ritieni che il trattamento dei tuoi dati violi la normativa, puoi proporre reclamo al Garante per
la protezione dei dati personali (www.garanteprivacy.it) o rivolgerti all'autorità giudiziaria.

## Se i tuoi dati non vengono forniti

Il tuo indirizzo email è necessario per creare il tuo accesso: senza, non è tecnicamente possibile
darti un account sul gestionale. Se preferisci non averlo, puoi chiederlo allo stabilimento presso
cui lavori, che valuterà come organizzare diversamente il tuo lavoro.

## Modifiche a questa informativa

Se cambiamo questa informativa in modo sostanziale, te lo segnaliamo dentro il gestionale prima che
la modifica abbia effetto. La data di ultimo aggiornamento in cima indica sempre la versione in
vigore.

---

## Punti da validare ⚖️

Identificatori stabili, condivisi con [README](README.md) e
[registro §D](registro-trattamenti.md#d--punti-aperti-da-validare-con-un-legale-).

| ID | Punto |
|---|---|
| ⚖️-01 | Nomina del DPO |
| ⚖️-03 | Base giuridica dell'account operatore: contratto o legittimo interesse? La scelta ha effetti concreti: col legittimo interesse serve il bilanciamento documentato e l'operatore acquista il diritto di opposizione. |
| ⚖️-04 | Legittimo interesse sui log di piattaforma: serve il test di bilanciamento |
| ⚖️-05 | Termini di conservazione dei registri di sicurezza |
| ⚖️-06 | Trasferimenti extra-SEE e relative garanzie |

**Nessun banner di consenso — verificato sul codice.** Nessun cookie, nessun analytics, nessuno
script di terze parti; i caratteri tipografici sono inclusi nel pacchetto applicativo e non richiamati
da una rete di distribuzione esterna. Le uniche memorizzazioni sul dispositivo sono il token di
sessione e la cache degli asset dell'applicazione installabile: entrambe ricadono nell'art. 5(3)
ePrivacy, ed entrambe sono strettamente necessarie. **La conclusione regge finché lo stack resta
questo**: basta aggiungere uno strumento di analisi, una mappa, un video incorporato o un carattere
tipografico da rete esterna perché l'obbligo di banner ricompaia.
