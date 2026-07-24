import type { LegalSection } from './types';

/**
 * Informativa privacy per gli OPERATORI (utenti di web-staff e web-platform).
 *
 * Piano B di ADR-0055: qui il titolare del trattamento è **Coralyn**, non il lido. Non confondere
 * con l'informativa al bagnante (piano A, in web-customer), dove il titolare è il lido.
 *
 * Testo FISSO versionato in git: a differenza del piano A non c'è nulla di parametrizzato per
 * tenant, perché il titolare è sempre lo stesso. I `[COMPILARE]` sono contenuto VOLUTO (dati
 * societari e fornitori non ancora esistenti), non debito di piano.
 *
 * Fonte canonica e riveduta: `docs/legal/privacy-policy-operatori.md`. Ogni divergenza tra i due è
 * un difetto: il testo qui va aggiornato insieme a quello, mai per conto proprio.
 *
 * Bozza tecnica, non parere legale.
 */
export const PRIVACY_OPERATORI_VERSION = '0.3';
export const PRIVACY_OPERATORI_UPDATED = '2026-07-24';

export const PRIVACY_OPERATORI_SECTIONS: LegalSection[] = [
  {
    id: 'titolare',
    heading: 'Chi tratta i tuoi dati',
    paragraphs: [
      'Il titolare del trattamento è [COMPILARE: ragione sociale], con sede in [COMPILARE: indirizzo], P. IVA [COMPILARE].',
      'Per qualsiasi questione relativa ai tuoi dati puoi scrivere a [COMPILARE: email privacy].',
      '[COMPILARE: se nominato, contatti del Responsabile della protezione dei dati]',
      'Attenzione a non confondere due cose diverse. Questa informativa riguarda te che usi il gestionale come operatore. I dati dei bagnanti che inserisci lavorando sono invece trattati dallo stabilimento presso cui lavori, che ne è il titolare: per quelli, Coralyn agisce solo come responsabile del trattamento, su istruzione dello stabilimento.',
    ],
    legalReview: true,
  },
  {
    id: 'fonte',
    heading: 'Da dove arrivano i tuoi dati',
    paragraphs: [
      'Il tuo indirizzo email non lo raccogliamo da te: ci viene comunicato dallo stabilimento presso cui lavori, oppure dall’amministratore della piattaforma, nel momento in cui chiede l’apertura del tuo accesso.',
      'Per questo ti rendiamo questa informativa insieme all’email con cui ti invitiamo ad attivare l’account, e insieme a quella di reimpostazione della password: sono il primo contatto che abbiamo con te. La trovi anche in fondo alla schermata di accesso, in qualsiasi momento.',
    ],
  },
  {
    id: 'account',
    heading: 'Il tuo account',
    paragraphs: [
      'Trattiamo la tua email, la tua password in forma protetta, il tuo ruolo, lo stato del tuo accesso e, se lavori per uno stabilimento, il riferimento allo stabilimento.',
      'Ci servono per creare il tuo accesso, verificare la tua identità quando entri e stabilire cosa puoi fare dentro il gestionale.',
      'Non raccogliamo il tuo nome, il tuo cognome, il tuo numero di telefono né altri dati anagrafici: l’account è volutamente ridotto al minimo indispensabile.',
      'La base giuridica è l’esecuzione del contratto tra Coralyn e lo stabilimento presso cui lavori, di cui il tuo accesso è lo strumento.',
    ],
    legalReview: true,
  },
  {
    id: 'credenziali',
    heading: 'L’attivazione e il recupero della password',
    paragraphs: [
      'Quando il tuo accesso viene creato, o quando chiedi di reimpostare la password, ti inviamo un’email con un link personale, valido una sola volta e a scadenza. Del link conserviamo solo una versione cifrata, mai il link in chiaro, insieme alla data di scadenza e al momento in cui lo hai usato.',
      'Non ti inviamo mai una password in chiaro per email.',
    ],
  },
  {
    id: 'log-tecnici',
    heading: 'I registri tecnici del servizio',
    paragraphs: [
      'Il funzionamento del servizio produce registri tecnici. In caso di errore nell’invio di un’email di servizio, il registro conserva l’indirizzo email a cui era diretta, per permetterci di capire cosa non ha funzionato. La base giuridica è il nostro legittimo interesse a diagnosticare e correggere i malfunzionamenti.',
      '[COMPILARE: per quanto tempo conserviamo i registri tecnici]',
    ],
    legalReview: true,
  },
  {
    id: 'audit-piattaforma',
    heading: 'Le azioni amministrative sulla piattaforma',
    paragraphs: [
      'Registriamo le operazioni amministrative svolte sulla piattaforma dal fornitore del servizio: l’apertura di un nuovo stabilimento, la reimpostazione della password di un amministratore, la sospensione o riattivazione di uno stabilimento. Di queste operazioni conserviamo chi le ha compiute, che cosa ha fatto, quando, e l’indirizzo email dell’amministratore interessato.',
      'Ti riguarda solo se sei un amministratore di stabilimento, perché in quel caso il tuo indirizzo compare in questa registrazione. Le operazioni che svolgi tu dentro il gestionale del tuo stabilimento non sono oggetto di questa registrazione.',
      'La base giuridica è il nostro legittimo interesse a mantenere il servizio sicuro e a rendere conto del suo funzionamento.',
    ],
    legalReview: true,
  },
  {
    id: 'non-facciamo',
    heading: 'Cosa non facciamo',
    paragraphs: [
      'Non usiamo cookie, di nessun tipo. Non usiamo strumenti di analisi, statistica o tracciamento.',
      'Non ti profiliamo e non prendiamo decisioni automatizzate che ti riguardano.',
      'Non vendiamo i tuoi dati e non li comunichiamo a terzi per finalità di marketing.',
    ],
  },
  {
    id: 'dispositivo',
    heading: 'Cosa viene salvato sul tuo dispositivo',
    paragraphs: [
      'Per farti restare autenticato dopo il login, il gestionale salva nella memoria locale del tuo browser un identificativo di sessione. Si cancella quando esci dal tuo account.',
      'Il gestionale è inoltre un’applicazione installabile: il tuo browser conserva localmente una copia dei file che la compongono (pagine, stili, immagini, caratteri) per farla partire rapidamente e funzionare anche quando la rete è assente o instabile.',
      'Sono entrambi strumenti necessari al funzionamento del servizio che hai richiesto, quindi non richiedono il tuo consenso, e non servono a riconoscerti né a seguirti su altri siti. Per questo non trovi un banner: non c’è nulla da consentire.',
    ],
  },
  {
    id: 'destinatari',
    heading: 'A chi comunichiamo i tuoi dati',
    paragraphs: [
      'I tuoi dati sono conservati presso il nostro fornitore di infrastruttura e trattati dal fornitore che recapita le nostre email di servizio. Entrambi agiscono come responsabili del trattamento per conto nostro, con obblighi contrattuali di riservatezza e sicurezza.',
      'Fornitore di infrastruttura e ubicazione dei server: [COMPILARE]. Fornitore del servizio email: [COMPILARE].',
      'Non diffondiamo i tuoi dati e non li comunichiamo ad altri soggetti, salvo obblighi di legge o richieste dell’autorità giudiziaria.',
    ],
    legalReview: true,
  },
  {
    id: 'trasferimenti',
    heading: 'Trasferimenti fuori dall’Unione Europea',
    paragraphs: ['[COMPILARE]'],
    legalReview: true,
  },
  {
    id: 'conservazione',
    heading: 'Per quanto tempo li conserviamo',
    paragraphs: [
      'Il tuo account resta attivo finché dura il rapporto tra Coralyn e lo stabilimento presso cui lavori, o finché lo stabilimento non lo disattiva. Alla cessazione del rapporto l’account viene disattivato e poi cancellato.',
      'I link di attivazione e recupero password scadono dopo 72 ore e non sono più utilizzabili.',
      '[COMPILARE: termine di conservazione dei registri di sicurezza]',
    ],
    legalReview: true,
  },
  {
    id: 'diritti',
    heading: 'I tuoi diritti',
    paragraphs: [
      'Puoi chiederci in qualsiasi momento di accedere ai tuoi dati, di correggerli, di cancellarli, di limitarne il trattamento, di riceverli in formato leggibile da un computer e di opporti al trattamento fondato sul nostro legittimo interesse. Sono i diritti previsti dagli articoli 15-22 del Regolamento europeo sulla protezione dei dati.',
      'Per esercitarli scrivi a [COMPILARE: email privacy]. Ti rispondiamo entro un mese.',
      'Se ritieni che il trattamento dei tuoi dati violi la normativa, puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it) o rivolgerti all’autorità giudiziaria.',
    ],
  },
  {
    id: 'conferimento',
    heading: 'Se i tuoi dati non vengono forniti',
    paragraphs: [
      'Il tuo indirizzo email è necessario per creare il tuo accesso: senza, non è tecnicamente possibile darti un account sul gestionale. Se preferisci non averlo, puoi chiederlo allo stabilimento presso cui lavori, che valuterà come organizzare diversamente il tuo lavoro.',
    ],
  },
  {
    id: 'modifiche',
    heading: 'Modifiche a questa informativa',
    paragraphs: [
      'Se cambiamo questa informativa in modo sostanziale, te lo segnaliamo dentro il gestionale prima che la modifica abbia effetto. La data di ultimo aggiornamento in cima indica sempre la versione in vigore.',
    ],
  },
];
