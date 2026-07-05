# syntax=docker/dockerfile:1
#
# Immagine del frontend staff (@coralyn/web-staff): build statica Vite servita da nginx.
# Contesto di build = ROOT del repo (workspace pnpm + packages/ui-kit + contracts).
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

# Installa web-staff + le sue workspace dep (ui-kit, contracts), builda contracts
# (CJS, richiesto dal pre-bundle/tipi) e poi la SPA (vue-tsc -b && vite build).
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@coralyn/web-platform..." \
 && pnpm --filter @coralyn/contracts build \
 && pnpm --filter @coralyn/web-platform build

# --- Runtime: nginx statico ---
FROM nginx:alpine AS runtime
COPY apps/web-platform/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-platform/dist /usr/share/nginx/html
EXPOSE 80
