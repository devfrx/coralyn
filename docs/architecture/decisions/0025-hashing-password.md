# ADR-0025: Hashing delle password con argon2id

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0024](0024-strategia-auth.md)

## Context
Le password degli `Utente` vanno memorizzate con un algoritmo di hashing resistente.

## Decision
**argon2id** (pacchetto `argon2`), parametri di default della libreria. `PasswordHasher` espone
`hash`/`verify`; il `passwordHash` non è mai serializzato nei DTO.

## Consequences
- **Positive:** argon2id è la raccomandazione OWASP corrente (memory-hard, resistente a GPU/ASIC).
- **Negative / Trade-off:** dipendenza con binario nativo (prebuilds per Node 24; build tools solo
  in fallback). Costo CPU/memoria per hash (accettabile, e desiderato).

## Alternatives considered
- **bcrypt:** valido e diffuso, ma limite 72 byte e meno resistente di argon2id.
- **bcryptjs (puro JS):** nessun nativo ma più lento e meno raccomandato.

## Rubric check
1. **Professionalità** — algoritmo raccomandato OWASP.
2. **Convenzioni** — `argon2` è lo standard de facto su Node per nuovi progetti.
3. **Modularità** — incapsulato in `PasswordHasher`, sostituibile.
4. **Zero debito** — nessuna scelta legacy da rifare.
