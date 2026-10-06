# HyperFrames Studio API (NestJS). Runs the SQL migrations, then serves on 3333.

FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @studio/api...

FROM deps AS builder
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @studio/api... build

FROM node:22-alpine AS runner
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=production
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/packages/config/package.json packages/config/package.json
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/packages/db/package.json packages/db/package.json
COPY --from=deps /repo/packages/storage/package.json packages/storage/package.json
COPY --from=deps /repo/apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @studio/api...
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/packages/db/dist packages/db/dist
COPY --from=builder /repo/packages/db/drizzle packages/db/drizzle
COPY --from=builder /repo/packages/storage/dist packages/storage/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist
# The workspace volume is shared with the workers (uid 1000).
RUN mkdir -p /workspace && chown node:node /workspace
USER node
EXPOSE 3333
CMD ["sh", "-c", "node packages/db/dist/migrate.main.js && exec node apps/api/dist/main.js"]
