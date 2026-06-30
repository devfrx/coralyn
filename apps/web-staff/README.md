# @coralyn/web-staff

App staff di **Coralyn** (gestionale per stabilimenti balneari) — Vue 3 + TypeScript + Vite.

## Sviluppo

Dalla radice del monorepo:

```bash
pnpm install            # builda anche @coralyn/contracts (prepare)
pnpm --filter @coralyn/web-staff dev        # dev server (MSW mocka la Mappa)
pnpm --filter @coralyn/web-staff test       # Vitest
pnpm --filter @coralyn/web-staff typecheck  # vue-tsc -b --noEmit
pnpm --filter @coralyn/web-staff build      # build di produzione (PWA)
```

Dipende da `@coralyn/ui-kit` (design system, token) e `@coralyn/contracts` (DTO condivisi col backend). In dev la Mappa è mockata via MSW; `/api/clienti` passa al backend reale (proxy Vite su :3000) quando disponibile.
