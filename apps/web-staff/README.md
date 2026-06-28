# @driftly/web-staff

App staff di **Driftly** (gestionale per stabilimenti balneari) — Vue 3 + TypeScript + Vite.

## Sviluppo

Dalla radice del monorepo:

```bash
pnpm install            # builda anche @driftly/contracts (prepare)
pnpm --filter @driftly/web-staff dev        # dev server (MSW mocka la Mappa)
pnpm --filter @driftly/web-staff test       # Vitest
pnpm --filter @driftly/web-staff typecheck  # vue-tsc -b --noEmit
pnpm --filter @driftly/web-staff build      # build di produzione (PWA)
```

Dipende da `@driftly/ui-kit` (design system, token) e `@driftly/contracts` (DTO condivisi col backend). In dev la Mappa è mockata via MSW; `/api/clienti` passa al backend reale (proxy Vite su :3000) quando disponibile.
