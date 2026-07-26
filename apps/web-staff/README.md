# @coralyn/web-staff

App staff di **Coralyn** (gestionale per stabilimenti balneari) — Vue 3 + TypeScript + Vite.

## Sviluppo

Dalla radice del monorepo:

```bash
pnpm install                                # builda anche @coralyn/contracts (prepare)
pnpm --filter @coralyn/web-staff dev        # dev server (parla col backend reale, vedi sotto)
pnpm --filter @coralyn/web-staff test       # Vitest
pnpm --filter @coralyn/web-staff typecheck  # vue-tsc -b --noEmit
pnpm --filter @coralyn/web-staff build      # build di produzione (PWA)
```

Dipende da `@coralyn/ui-kit` (design system, token), `@coralyn/contracts` (DTO condivisi col
backend) e `@coralyn/data-layer` (`apiFetch`, `queryResource`, `ApiError`, gestione del `401` —
[ADR-0058](../../docs/architecture/decisions/0058-package-data-layer-condiviso.md)).

## In dev NON ci sono mock nel browser

Tutte le `/api/*` vanno al **backend reale**, inoltrate dal proxy Vite a `http://localhost:3000`
senza rewrite: il backend monta già tutto sotto `/api` ([ADR-0022](../../docs/architecture/decisions/0022-base-path-api.md)),
quindi `/api/customers` arriva intatto. Serve quindi un'API in ascolto sulla 3000, altrimenti le
schermate mostrano il proprio stato d'errore.

**MSW vive solo nei test**: è agganciato da `vitest.config.ts` → `src/test/setup.ts`, con
`onUnhandledRequest: 'error'` — una chiamata non mockata fa fallire il test invece di uscire in rete.
I mock stanno in `src/mocks/server.ts`.

`main.ts` de-registra all'avvio, **solo in dev**, un eventuale service worker MSW rimasto da versioni
precedenti: resta "sticky" e intercetta le navigazioni SPA facendole fallire. La PWA di produzione
non è toccata.
