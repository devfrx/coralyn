# Decisioni rimandate (Deferred decisions)

Registro delle decisioni e dei compromessi **consapevolmente rimandati**. Una voce
qui significa: sappiamo che va affrontata, ma non ora. Quando una voce viene
affrontata, diventa un ADR e si rimuove da qui (con riferimento all'ADR).

Vedi [ADR-0002](decisions/0002-decision-rubric.md), filtro 4: il debito tracciato è
ammesso, quello silenzioso no.

| ID | Tema | Perché rimandata | Cosa la sblocca / trigger | Impatto se ignorata |
|---|---|---|---|---|
| D-001 | Stack tecnologico (linguaggi, framework, DB) | Va deciso dopo aver definito lo scope del MVP Core, non prima. | Approvazione dello spec del Core operativo. | Scelte premature rischiano riscrittura. |
| D-002 | Infrastruttura multi-tenancy completa (signup, isolamento avanzato, billing) | Il Core viene costruito tenant-aware nel modello dati, ma l'infra SaaS completa è il modulo 3. | Core operativo funzionante. | Se il modello dati non è tenant-aware, riscrittura costosa (mitigato: lo è da subito). |
| D-003 | Internazionalizzazione UI (i18n) | UI in italiano per il mercato iniziale. | Espansione su mercati non italofoni. | Retrofit i18n possibile ma oneroso se non previsto nei pattern UI. |
| D-004 | Pagamenti online / integrazione POS e fiscale (scontrino elettronico) | Appartiene al modulo Cassa, dopo il Core. | Inizio modulo Cassa e pagamenti. | Vincoli fiscali italiani vanno studiati per tempo (corrispettivi telematici). |
| D-005 | Editor planimetria libero della mappa (opzione C: coordinate libere, drag&drop su foto/planimetria) | L'MVP adotta il modello logico a settori/file (opzione B), sufficiente per quasi tutti i lidi. L'editor a coordinate aggiunge complessità non necessaria ora. | Domanda di mercato per planimetria fedele al pixel, dopo l'MVP del Core. | Basso: il modello mappa separa la posizione *logica* dalla *presentazione*, quindi l'editor sarà additivo, non una riscrittura. |

> Nota: le voci sopra sono il punto di partenza emerso dal brainstorming iniziale e
> verranno raffinate man mano.
