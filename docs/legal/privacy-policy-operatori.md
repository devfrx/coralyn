# Privacy policy operatori (Coralyn titolare)

> ⚠️ **Bozza di lavoro, non un parere legale.** Vedi [README.md](README.md) per il riepilogo dei
> punti ⚖️ e la raccomandazione di revisione.
>
> **Versione:** 0.1 (bozza) · **Data:** 2026-07-24 · **Slice:** D-061 (5.6b)

## Nota per chi implementa (non fa parte del testo pubblicato)

Questo è il **piano B** dei tre ratificati da
[ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md): verso l'operatore che
usa `web-staff` o `web-platform`, il titolare del trattamento è **Coralyn**, non il lido. Non va
mescolato con l'informativa al bagnante (piano A, già realizzata in `web-customer`), dove il titolare
è il lido.

**Dove vivrà questo testo è una decisione ancora aperta** (testo duplicato nelle due app, oppure
estratto in un package condiviso). Finché non è presa, il contenuto vive qui in forma
rivedibile. Il corpo della policy è scritto **senza trattini lunghi**, per essere portabile
direttamente in-app senza violare le convenzioni sul testo utente.

Riferimenti di fatto verificati sul codice e riusabili: le misure di sicurezza sono le stesse
elencate nell'[Allegato A del DPA](dpa-coralyn-lido.md) e in
[§C del registro](registro-trattamenti.md).

---

# Informativa sul trattamento dei dati personali

**Utenti del gestionale Coralyn**

Ultimo aggiornamento: `[COMPILARE: data di pubblicazione]`

## Chi tratta i tuoi dati

Il titolare del trattamento è `[COMPILARE: ragione sociale di Coralyn]`, con sede in
`[COMPILARE: indirizzo]`, P. IVA `[COMPILARE]`.

Per qualsiasi questione relativa ai tuoi dati puoi scrivere a `[COMPILARE: email privacy]`.

`[COMPILARE: se nominato, contatti del Responsabile della protezione dei dati]` ⚖️

> **Attenzione a non confondere due cose diverse.** Questa informativa riguarda **te che usi il
> gestionale come operatore**. I dati dei bagnanti che inserisci lavorando sono invece trattati dallo
> stabilimento presso cui lavori, che ne è il titolare: per quelli, Coralyn agisce solo come
> responsabile del trattamento, su istruzione dello stabilimento.

## Quali dati trattiamo e perché

### Il tuo account

Trattiamo la tua **email**, la tua **password in forma protetta**, il tuo **ruolo** (amministratore o
staff), lo **stato del tuo accesso** e il riferimento allo **stabilimento** per cui lavori.

Ci servono per creare il tuo accesso, verificare la tua identità quando entri e stabilire cosa puoi
fare dentro il gestionale.

Non raccogliamo il tuo nome, il tuo cognome, il tuo numero di telefono né altri dati anagrafici:
l'account è volutamente ridotto al minimo indispensabile.

La base giuridica è l'esecuzione del contratto tra Coralyn e lo stabilimento presso cui lavori, di
cui il tuo accesso è lo strumento. ⚖️

### L'attivazione e il recupero della password

Quando il tuo accesso viene creato, o quando chiedi di reimpostare la password, ti inviamo un'email
con un link personale, valido una sola volta e a scadenza. Del link conserviamo solo una versione
cifrata, mai il link in chiaro, insieme alla data di scadenza e al momento in cui lo hai usato.

Non ti inviamo mai una password in chiaro per email.

### La sicurezza del servizio

Registriamo le operazioni amministrative svolte sulla piattaforma, per poter ricostruire chi ha fatto
cosa in caso di problemi o contestazioni. La base giuridica e' il nostro legittimo interesse a
mantenere il servizio sicuro e a rendere conto del suo funzionamento. ⚖️

## Cosa NON facciamo

- Non usiamo cookie di profilazione ne' strumenti di analisi o tracciamento.
- Non ti profiliamo e non prendiamo decisioni automatizzate che ti riguardano.
- Non vendiamo i tuoi dati e non li comunichiamo a terzi per finalita' di marketing.

## Memoria tecnica del tuo dispositivo

Per farti restare autenticato dopo il login, il gestionale salva nella memoria locale del tuo browser
un identificativo di sessione. E' necessario al funzionamento del servizio che stai usando, quindi
non richiede il tuo consenso. Si cancella quando esci dal tuo account.

Non usiamo nessun altro strumento di memorizzazione o tracciamento sul tuo dispositivo. Per questo
non trovi un banner di consenso: non c'e' nulla da consentire.

## A chi comunichiamo i tuoi dati

I tuoi dati sono conservati presso il nostro fornitore di infrastruttura e trattati dal fornitore che
recapita le nostre email di servizio. Entrambi agiscono come responsabili del trattamento per conto
nostro, con obblighi contrattuali di riservatezza e sicurezza.

Fornitore di infrastruttura e ubicazione dei server: `[COMPILARE]`
Fornitore del servizio email: `[COMPILARE]`

Non diffondiamo i tuoi dati e non li comunichiamo ad altri soggetti, salvo obblighi di legge o
richieste dell'autorita' giudiziaria.

## Trasferimenti fuori dall'Unione Europea

`[COMPILARE: dipende dai fornitori sopra. Se sono tutti nel SEE, la formulazione corretta e' una
negazione esplicita: "Non trasferiamo i tuoi dati fuori dallo Spazio Economico Europeo."]` ⚖️

## Per quanto tempo li conserviamo

Il tuo account resta attivo finche' dura il rapporto tra Coralyn e lo stabilimento presso cui lavori,
o finche' lo stabilimento non lo disattiva. Alla cessazione del rapporto l'account viene disattivato e
poi cancellato.

I link di attivazione e recupero password scadono dopo `[COMPILARE: 72 ore per impostazione
predefinita]` e non sono piu' utilizzabili.

`[COMPILARE: termine di conservazione dei registri di sicurezza]` ⚖️

## I tuoi diritti

Puoi chiederci in qualsiasi momento di accedere ai tuoi dati, di correggerli, di cancellarli, di
limitarne il trattamento, di riceverli in formato leggibile da un computer e di opporti al
trattamento fondato sul nostro legittimo interesse. Sono i diritti previsti dagli articoli 15-22 del
Regolamento europeo sulla protezione dei dati.

Per esercitarli scrivi a `[COMPILARE: email privacy]`. Ti rispondiamo entro un mese.

Se ritieni che il trattamento dei tuoi dati violi la normativa, puoi proporre reclamo al Garante per
la protezione dei dati personali (www.garanteprivacy.it) o rivolgerti all'autorita' giudiziaria.

## Se non fornisci i tuoi dati

Il conferimento della tua email e' necessario per creare il tuo accesso: senza, non e' tecnicamente
possibile darti un account sul gestionale.

## Modifiche a questa informativa

Se cambiamo questa informativa in modo sostanziale, te lo segnaliamo dentro il gestionale prima che
la modifica abbia effetto. La data di ultimo aggiornamento in cima indica sempre la versione in
vigore.

---

## Riepilogo dei punti da validare ⚖️

1. **Base giuridica dell'account operatore.** Contratto (art. 6.1.b) o legittimo interesse
   (art. 6.1.f)? L'operatore persona fisica non e' parte del contratto, che e' tra Coralyn e il lido.
   La scelta ha effetti concreti: col legittimo interesse serve il bilanciamento documentato e
   l'operatore acquista il diritto di opposizione.
2. **Legittimo interesse sui log di sicurezza**: va formalizzato un test di bilanciamento.
3. **Nomina del DPO**: vedi §D del [registro](registro-trattamenti.md).
4. **Trasferimenti extra-SEE**: dipendono dai fornitori, non ancora scelti.
5. **Termini di conservazione** dei log e dei token consumati: oggi non definiti.
6. **Nessun banner di consenso.** Verificato sul codice: nessun cookie, nessun analytics, nessuno
   script di terze parti; i font sono inclusi nel pacchetto applicativo e non richiamati da una rete
   di distribuzione esterna. L'unica memorizzazione sul dispositivo e' il token di sessione, coperto
   dall'esenzione per gli strumenti strettamente necessari. **La conclusione regge finche' lo stack
   resta questo**: basta aggiungere uno strumento di analisi e l'obbligo di banner ricompare.
