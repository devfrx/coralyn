# Decisioni rimandate (Deferred decisions)

Registro delle decisioni e dei compromessi **consapevolmente rimandati**. Una voce
qui significa: sappiamo che va affrontata, ma non ora. Quando una voce viene
affrontata, diventa un ADR e si rimuove da qui (con riferimento all'ADR).

Vedi [ADR-0002](decisions/0002-decision-rubric.md), filtro 4: il debito tracciato è
ammesso, quello silenzioso no.

| ID | Tema | Perché rimandata | Cosa la sblocca / trigger | Impatto se ignorata |
|---|---|---|---|---|
| D-002 | Infrastruttura multi-tenancy completa (signup, isolamento avanzato, billing) | Il Core viene costruito tenant-aware nel modello dati, ma l'infra SaaS completa è il modulo 3. | Core operativo funzionante. | Se il modello dati non è tenant-aware, riscrittura costosa (mitigato: lo è da subito). |
| D-003 | Internazionalizzazione UI (i18n) | UI in italiano per il mercato iniziale. | Espansione su mercati non italofoni. | Retrofit i18n possibile ma oneroso se non previsto nei pattern UI. |
| D-004 | Pagamenti online / integrazione POS e fiscale (scontrino elettronico) | Appartiene al modulo Cassa, dopo il Core. | Inizio modulo Cassa e pagamenti. | Vincoli fiscali italiani vanno studiati per tempo (corrispettivi telematici). |
| D-005 | Editor planimetria libero della mappa (opzione C: coordinate libere, drag&drop su foto/planimetria) | L'MVP adotta il modello logico a settori/file (opzione B), sufficiente per quasi tutti i lidi. L'editor a coordinate aggiunge complessità non necessaria ora. | Domanda di mercato per planimetria fedele al pixel, dopo l'MVP del Core. | Basso: il modello mappa separa la posizione *logica* dalla *presentazione*, quindi l'editor sarà additivo, non una riscrittura. |
| D-006 | Liste d'attesa avanzate: hold temporanei con scadenza automatica + notifiche al cliente | L'MVP fa coda + promozione manuale; hold e notifiche dipendono dal modulo notifiche/booking online. | Modulo notifiche o Booking online (modulo 4). | Media: senza hold automatici la gestione dei picchi resta manuale. |
| D-007 | Wrapper desktop Electron | La delivery primaria è web + PWA ([ADR-0004](decisions/0004-form-factor-e-delivery.md)); un client desktop nativo non serve ora. | Richiesta esplicita di un client desktop nativo. | Bassa: additivo, riusa la stessa web app. |
| D-008 | Offline-sync completo della PWA | Complesso (sincronizzazione e risoluzione conflitti); l'MVP assume connettività con offline-light (shell + consultazione in cache). | Problemi reali di connettività in spiaggia. | Media: in spiaggia la rete può mancare; mitigato dall'offline-light. |
| D-009 | Entità `Pagamento` completa (acconti multipli, ricevute, storni/rimborsi) | L'MVP registra l'incasso base sulla Prenotazione ([ADR-0011](decisions/0011-incasso-base-nel-core.md)); il modello ricco appartiene alla Cassa. | Inizio modulo Cassa (modulo 2). | Bassa/Media: migrazione contenuta dai campi base all'entità `Pagamento`. |
| D-010 | Isolamento fisico per tenant grandi (ibrido pool + silo: DB dedicato) | L'MVP usa shared schema + RLS ([ADR-0010](decisions/0010-isolamento-multi-tenant.md)), adatto a molti tenant piccoli/medi. | Tenant grande con esigenze di carico, compliance o on-prem. | Bassa: l'app filtra sempre per tenant, la promozione a DB dedicato non tocca il codice. |

## Risolte

- **D-001** — Stack tecnologico → risolta da [ADR-0008](decisions/0008-stack-e-layout.md).

> Nota: le voci sopra sono il punto di partenza emerso dal brainstorming iniziale e
> verranno raffinate man mano.
