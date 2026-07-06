# Spec — Modifica cliente (edit modale, superficie unica)

> Design **CONFERMATO** con l'utente (2026-07-06, filone "rendile vere" §3.1). Slice **FE-only**, nessun cambio backend
> (`PATCH /customers/:id` e `useUpdateCustomer` esistono già e accettano `firstName/lastName/phone/email/notes` con
> validazione + tenant guard). Variante scelta: "professionale, senza debiti".

---

## 1. Contesto e problema

Nella Scheda cliente ([CustomerDetailView.vue](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue)) coesistono **due affordance di modifica sovrapposte**, e un gap:
- **Bottone «Modifica»** in header ([:81](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue)) — **morto** (nessun `@click`).
- **Card "Anagrafica e contatti"** ([:96-109](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue)) — form **sempre editabile inline** di telefono/email/note (`save()` → `useUpdateCustomer` PATCH). Funziona.
- **Nome e Cognome** ([:102-103](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue)) — mostrati **read-only**: non modificabili da nessuna parte.

Il backend supporta già l'edit completo: `UpdateCustomerInput = Partial<CreateCustomerInput>` (nome+cognome+contatti);
`UpdateCustomerDto` valida ogni campo; `CustomersService.update` scrive in tenant-tx con `NotFound` se assente.

## 2. Decisione (CONFERMATA)

**Superficie di edit unica = una modale**, speculare alla modale "Nuovo cliente" già esistente
([CustomersView.vue:54-68](../../../apps/web-staff/src/features/customers/CustomersView.vue)):

1. Il bottone **«Modifica»** apre una **modale** con **tutti** i campi (`firstName`, `lastName`, `phone`, `email`, `notes`)
   **precompilati** col cliente corrente → submit chiama `useUpdateCustomer(id)` (PATCH) → alla riuscita chiude.
2. La card **"Anagrafica e contatti" diventa sola-lettura**: mostra Nome, Cognome, Telefono, Email, Note come testo; via
   il `<form>`, gli `<Input>/<Textarea>`, il bottone **Salva** e la logica inline (`save()`, ref `phone/email/notes`, `watch`).
3. **Nessuna ridondanza**: una sola superficie di edit; il **nome diventa finalmente modificabile**; il bottone morto acquista scopo.

**Validazione** (parità con la creazione): `firstName` e `lastName` obbligatori (submit no-op se vuoti). Contatti opzionali;
stringa vuota → `undefined` nel payload (non forzare `''`), coerente con `submit()` di CustomersView.
**Nessun toast** (parità con la creazione): la card si aggiorna reattivamente via invalidazione. **Read-only se anonimizzato:**
la card e il bottone «Modifica» sono già dentro `v-if="!customer.anonymizedAt"` — la modale eredita lo stesso gate (non
raggiungibile su cliente anonimizzato).

## 3. Componenti e file

- **Nuovo** `apps/web-staff/src/features/customers/EditCustomerModal.vue`
  - Props: `customer: CustomerDTO`. Model: `v-model:open` (`boolean`).
  - Stato locale `firstName/lastName/phone/email/notes`, **precompilato dal `customer`** e **risincronizzato** quando la
    modale si apre (watch su `open`/`customer`) così riflette sempre i valori correnti anche dopo un salvataggio.
  - `useUpdateCustomer(customer.id)`; `submit()` mirror di CustomersView (guard nome, `|| undefined` sui contatti);
    `onSuccess` → `open = false`.
  - Layout/markup **rispecchia** la modale "Nuovo cliente" (Field/Input/Textarea, Annulla/Salva).
- **Modifica** `apps/web-staff/src/features/customers/CustomerDetailView.vue`
  - `«Modifica»` → `@click="editOpen = true"` (`const editOpen = ref(false)`).
  - Card "Anagrafica e contatti" → **read-only** (righe di sola visualizzazione per i 5 campi; niente form/Salva).
  - Rimuovere lo stato inline ora inutile: `phone/email/notes` ref, `save()`, `update` (`useUpdateCustomer`), il `watch` che
    ripopola gli input. `customer`, `isLoading`, `isError`, blocco GDPR **invariati**.
  - Renderizzare `<EditCustomerModal :customer="customer" v-model:open="editOpen" />`.

## 4. Test

- **Nuovo** `EditCustomerModal.spec.ts`:
  - apertura → i campi sono **precompilati** dal cliente;
  - modifica di nome+contatti + submit → **PATCH** chiamato col payload atteso (nome incluso), modale **chiusa** on success;
  - guard: `firstName`/`lastName` vuoti → **nessun** PATCH (submit no-op).
- **Aggiornare** `CustomerDetailView.spec.ts` (allineare al nuovo modello):
  - test "mostra header e anagrafica" ([:56](../../../apps/web-staff/src/features/customers/CustomerDetailView.spec.ts)): non ci sono più `input[name=...]` nella card → asserire i **valori read-only** (telefono/email come testo).
  - test "modifica il telefono e lo rilegge" ([:106](../../../apps/web-staff/src/features/customers/CustomerDetailView.spec.ts)): sostituire con il **flusso modale** (apri «Modifica» → cambia telefono → submit → la card read-only mostra il nuovo valore) **oppure** spostare la copertura dell'edit interamente in `EditCustomerModal.spec.ts` e qui limitarsi ad asserire che «Modifica» **apre** la modale. Scegliere una sola fonte di verità per l'edit.
- **Regressione:** non regredire web-staff (**baseline 243** su `main` dopo la slice navigazione data), typecheck EXIT 0.

## 5. Fuori scope
- Nessun backend (PATCH e DTO esistono e validano). Nessuna modifica a `CustomersView` (la sua modale di creazione resta com'è).
- Nessun toast/analytics; nessuna gestione di errori server oltre a quella già fornita da `mutationResource`.

## 6. Baseline
web-staff **243** (post navigazione data) · typecheck pulito. Additivo atteso: `EditCustomerModal.spec` (N) ·
`CustomerDetailView.spec` invariato nel conteggio (2 test riscritti, non aggiunti) + eventuale +1 per "apre la modale".
