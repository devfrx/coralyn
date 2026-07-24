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

# Origin dell'app clienti, per il deep-link all'anteprima dell'informativa del bagnante.
# DEVE arrivare in fase di BUILD: Vite inlinea `import.meta.env.VITE_*` nel bundle, quindi
# impostarla come env del container a runtime non avrebbe alcun effetto (il JS e' gia' compilato).
# Se non passata, il link semplicemente non compare e resta il promemoria testuale (ADR-0056).
ARG VITE_WEB_CUSTOMER_URL=""
ENV VITE_WEB_CUSTOMER_URL=$VITE_WEB_CUSTOMER_URL

# Installa web-staff + le sue workspace dep (ui-kit, contracts), builda contracts
# (CJS, richiesto dal pre-bundle/tipi) e poi la SPA (vue-tsc -b && vite build).
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@coralyn/web-staff..." \
 && pnpm --filter @coralyn/contracts build \
 && pnpm --filter @coralyn/web-staff build

# --- Runtime: nginx statico ---
FROM nginx:alpine AS runtime
COPY apps/web-staff/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-staff/dist /usr/share/nginx/html
EXPOSE 80
