# syntax=docker/dockerfile:1

FROM node:22.22.0-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter @luminix/api... --frozen-lockfile

COPY apps/api apps/api

RUN pnpm --filter @luminix/api build \
  && pnpm --filter @luminix/api deploy --prod /app

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV="production"
ENV HOST="0.0.0.0"
ENV PORT="8080"

WORKDIR /app

COPY --from=build --chown=node:node /app ./

USER node

EXPOSE 8080

CMD ["node", "dist/server.js"]
