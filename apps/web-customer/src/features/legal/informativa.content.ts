// Informativa privacy Art. 13 GDPR mostrata al bagnante (5.6a). Testo FISSO versionato in git; l'unica
// parte dinamica è il blocco titolare (dai dati del lido). Bozza tecnica, non parere legale: i punti
// [DA VALIDARE CON LEGALE] vanno rivisti da un DPO/legale prima della pubblicazione.
export const INFORMATIVA_VERSION = '1.0';
export const INFORMATIVA_UPDATED = '2026-07-24';

export interface InformativaSection {
  id: string;
  heading: string;
  paragraphs: string[];
  legalReview?: boolean; // ⚖️ da validare con legale
}

export const INFORMATIVA_SECTIONS: InformativaSection[] = [
  {
    id: 'finalita',
    heading: 'Perché trattiamo i tuoi dati',
    paragraphs: [
      'Lo stabilimento tratta i tuoi dati (nome, cognome, eventuali telefono, email e note) per gestire le prenotazioni, gli abbonamenti e i noleggi, e per erogare il servizio richiesto. La base giuridica è l’esecuzione del contratto o delle misure precontrattuali che richiedi (art. 6.1.b GDPR).',
      'Alcune note operative possono essere trattate per il legittimo interesse dello stabilimento a gestire il rapporto con te (art. 6.1.f GDPR).',
      'I dati contenuti nelle registrazioni contabili sono conservati per adempiere a un obbligo di legge (art. 6.1.c GDPR; art. 2220 del Codice Civile).',
    ],
    legalReview: true,
  },
  {
    id: 'canale-cliente',
    heading: 'Il tuo accesso personale',
    paragraphs: [
      'Se lo stabilimento ti fornisce un accesso personale (link e PIN), trattiamo i dati tecnici necessari a farti entrare in modo sicuro e a mostrarti i tuoi abbonamenti, incluse le eventuali segnalazioni di assenza che decidi di comunicare.',
    ],
  },
  {
    id: 'categorie',
    heading: 'Quali dati',
    paragraphs: [
      'Dati anagrafici e di contatto: nome, cognome e, se forniti, telefono ed email. Eventuali note inserite dallo stabilimento. Dati relativi a prenotazioni, abbonamenti e noleggi. Credenziali tecniche del tuo accesso personale (identificativi e PIN in forma protetta).',
    ],
  },
  {
    id: 'destinatari',
    heading: 'Chi tratta i dati per conto dello stabilimento',
    paragraphs: [
      'Il gestionale è fornito da Coralyn, che agisce come responsabile del trattamento per conto dello stabilimento (art. 28 GDPR). I dati sono ospitati presso il fornitore di hosting indicato di seguito. Non vendiamo i tuoi dati e non li comunichiamo a terzi per finalità di marketing.',
      'Fornitore di hosting e ubicazione dei server: [COMPILARE].',
    ],
    legalReview: true,
  },
  {
    id: 'sicurezza',
    heading: 'Come proteggiamo i dati',
    paragraphs: [
      'Adottiamo misure tecniche adeguate (art. 32 GDPR): separazione rigorosa dei dati tra stabilimenti diversi a livello di database, password protette con algoritmi di hashing robusti, accessi regolati da token temporanei, isolamento per stabilimento e cancellazione o anonimizzazione irreversibile dei dati su richiesta.',
    ],
  },
  {
    id: 'conservazione',
    heading: 'Per quanto tempo',
    paragraphs: [
      'Conserviamo i dati per il tempo necessario a gestire il rapporto e, per i dati contabili, per 10 anni come richiesto dalla legge (art. 2220 Codice Civile). Su richiesta di cancellazione, i dati anagrafici vengono rimossi o resi anonimi in modo irreversibile, mantenendo lo storico contabile in forma anonima.',
    ],
  },
  {
    id: 'diritti',
    heading: 'I tuoi diritti',
    paragraphs: [
      'Puoi chiedere in qualsiasi momento l’accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e l’opposizione (artt. 15-22 GDPR). Per esercitarli, contatta lo stabilimento titolare ai recapiti indicati sopra.',
      'Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).',
    ],
  },
  {
    id: 'trasferimenti',
    heading: 'Trasferimenti fuori dall’Unione Europea',
    paragraphs: [
      'Eventuali trasferimenti di dati fuori dallo Spazio Economico Europeo, e le relative garanzie, dipendono dal fornitore di hosting: [COMPILARE].',
    ],
    legalReview: true,
  },
  {
    id: 'cookie',
    heading: 'Cookie e strumenti tecnici',
    paragraphs: [
      'Questa applicazione non utilizza cookie di profilazione né strumenti di analisi o tracciamento. Per farti restare autenticato utilizziamo esclusivamente una memoria tecnica del tuo dispositivo, necessaria al funzionamento del servizio: per questa non è richiesto il tuo consenso.',
    ],
  },
  {
    id: 'conferimento',
    heading: 'Se non fornisci i dati',
    paragraphs: [
      'Il conferimento dei dati di contatto è necessario per gestire prenotazioni e abbonamenti: senza di essi lo stabilimento non può erogarti il servizio.',
    ],
  },
  {
    id: 'automatizzati',
    heading: 'Decisioni automatizzate',
    paragraphs: [
      'Non effettuiamo processi decisionali automatizzati né profilazione ai sensi dell’art. 22 GDPR.',
    ],
  },
];
