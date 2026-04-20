# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# 1) Copy only the workspace + package manifests first so `pnpm install` can
#    resolve the filtered closure without invalidating the layer on every
#    landing source change.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/cli/package.json             ./packages/cli/package.json
COPY packages/platform-core/package.json   ./packages/platform-core/package.json
COPY packages/platform-http/package.json   ./packages/platform-http/package.json
COPY packages/platform-storage/package.json ./packages/platform-storage/package.json
COPY apps/landing/package.json             ./apps/landing/package.json

# 2) Install only what @rntme-cli/landing needs (the app has no workspace
#    dependencies today, so this is just astro + react + mdx + vitest deps).
RUN pnpm install --frozen-lockfile --filter @rntme-cli/landing...

# 3) Now copy the landing source. This is the layer that invalidates most
#    often; installing first keeps rebuilds fast.
COPY apps/landing ./apps/landing

# 4) Build-time env. Required vars fail the build if absent (src/env.ts).
ARG TALLY_FORM_ID
ARG GITHUB_URL
ARG DOCS_URL
ARG PLATFORM_URL
ARG DEMO_URL=""
ARG PLAUSIBLE_DOMAIN=""
ENV TALLY_FORM_ID=$TALLY_FORM_ID \
    GITHUB_URL=$GITHUB_URL \
    DOCS_URL=$DOCS_URL \
    PLATFORM_URL=$PLATFORM_URL \
    DEMO_URL=$DEMO_URL \
    PLAUSIBLE_DOMAIN=$PLAUSIBLE_DOMAIN

RUN pnpm -F @rntme-cli/landing build

# ---------- runtime ----------
FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/landing/dist /usr/share/nginx/html
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ > /dev/null || exit 1
