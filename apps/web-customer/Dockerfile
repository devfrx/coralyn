# syntax=docker/dockerfile:1
#
# Immagine del frontend clienti (@coralyn/web-customer): build statica Vite servita da nginx.
# Contesto di build = ROOT del repo (workspace pnpm + packages/ui-kit + contracts).
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

# Installa web-customer + le sue workspace dep (ui-kit, contracts), builda contracts
# (CJS, richiesto dal pre-bundle/tipi) e poi la SPA (vue-tsc -b && vite build).
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@coralyn/web-customer..." \
 && pnpm --filter @coralyn/contracts build \
 && pnpm --filter @coralyn/web-customer build

# --- Runtime: nginx statico ---
FROM nginx:alpine AS runtime
COPY apps/web-customer/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-customer/dist /usr/share/nginx/html
EXPOSE 80
