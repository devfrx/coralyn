# ADR-0028: Modello di provisioning dei tenant (fornitore + inviti, no self-registration aperta)

- **Status:** Accepted
- **Data:** 2026-06-30
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0015](0015-osservabilita-e-console-superuser.md), [0024](0024-strategia-auth.md), [0026](0026-identita-rls-utente.md)

## Context
Con l'auth reale (login JWT, [ADR-0024](0024-strategia-auth.md)) il redesign FE ha introdotto
una `LoginView` e una `RegistrazioneView`. Quest'ultima, nel mockup, era una **self-registration
aperta** (chiunque crea uno stabilimento + account admin), modellata come un'app consumer/social.

Coralyn è però un **gestionale B2B a contratto**, venduto in abbonamento al singolo lido. Una
registrazione aperta è inappropriata su più piani:
- **Commerciale:** l'account dovrebbe nascere *dopo* un contratto/abbonamento, non da chiunque.
- **Legale / GDPR:** il lido è **titolare** del trattamento dei dati dei bagnanti, il fornitore è
  **responsabile** (serve DPA). Chi crea il tenant deve essere un rappresentante **autorizzato e
  verificato** del lido; la registrazione anonima rende ambigui i ruoli.
- **Integrità / abuso:** signup aperto = tenant fasulli, dati spazzatura, carico di supporto.
- **Billing:** nessun flusso deve creare un tenant "pagante" senza un passo di contratto.

## Decision
Il provisioning dei tenant segue il modello **fornitore-provisioned + onboarding su invito**:

1. Lo **Stabilimento** e il primo **Utente admin** sono creati dal **fornitore** — oggi via
   seed/script di provisioning, in prospettiva via la **Console superuser** ([ADR-0015](0015-osservabilita-e-console-superuser.md)).
2. L'admin accede con le credenziali fornite (in prospettiva: **invito** via email per impostare la
   password). Lo **staff** è poi invitato dall'admin (provisioning utenti staff = [D-025](../deferred.md)).
3. La **self-registration aperta è rifiutata** per l'MVP. Il flusso self-service completo (signup +
   verifica + trial + billing) resta **rimandato** al modulo SaaS ([D-002](../deferred.md)).

**Conseguenza FE:** la rotta pubblica `/registrazione` **non crea account**. Diventa una pagina
informativa "**attivazione su invito**" con un contatto per richiedere l'attivazione e il link al
login. Nessun form di creazione account, nessuna chiamata di autenticazione.

Alternative scartate:
- *Self-registration aperta ora* — apre i problemi legali/abuso sopra, senza billing né contratto.
- *Rimuovere del tutto la rotta* — peggiora la UX di chi arriva sul link "registrati"; una pagina
  "su invito" è un punto di contatto professionale ed evolvibile (richiesta demo/lead).

## Consequences
- **Positive:** allineamento a come si vende il prodotto; ruoli GDPR chiari (titolare/responsabile
  prima dell'accesso); nessun tenant fasullo; coerente con Console superuser e inviti staff già previsti.
- **Negative / Trade-off:** l'onboarding di un nuovo lido richiede un passo manuale del fornitore
  finché la Console superuser e gli inviti email non sono implementati (tracciati: [D-002](../deferred.md), [D-025](../deferred.md)).

## Rubric check
1. **Professionalità** — modello di provisioning B2B corretto (sales-led/invite), non un signup consumer.
2. **Convenzioni** — provisioning fornitore + inviti è prassi standard per SaaS verticale a contratto.
3. **Modularità** — la decisione vive tra Console superuser (provisioning) e `identita` (auth); la
   pagina pubblica resta puramente informativa.
4. **Zero debito** — la self-registration non è un buco silenzioso: è una scelta esplicita, con il
   percorso self-service tracciato in [D-002](../deferred.md).
