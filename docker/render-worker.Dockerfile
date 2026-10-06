# HyperFrames render worker: Chrome headless shell + FFmpeg + the pinned CLI.
# Renders and snapshots are deterministic: no Claude in this image.

ARG HYPERFRAMES_VERSION=0.8.134

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/render-worker/package.json apps/render-worker/package.json
RUN pnpm install --frozen-lockfile --filter @studio/render-worker...

FROM deps AS builder
COPY packages packages
COPY apps/render-worker apps/render-worker
RUN pnpm --filter @studio/render-worker... build

FROM node:22-bookworm-slim AS runner
ARG HYPERFRAMES_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git ca-certificates fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "hyperframes@${HYPERFRAMES_VERSION}" \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production WORKSPACE_DIR=/workspace HYPERFRAMES_BIN=hyperframes
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/packages/config/package.json packages/config/package.json
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/packages/db/package.json packages/db/package.json
COPY --from=deps /repo/packages/storage/package.json packages/storage/package.json
COPY --from=deps /repo/apps/render-worker/package.json apps/render-worker/package.json
RUN pnpm install --frozen-lockfile --prod --filter @studio/render-worker...
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/packages/db/dist packages/db/dist
COPY --from=builder /repo/packages/storage/dist packages/storage/dist
COPY --from=builder /repo/apps/render-worker/dist apps/render-worker/dist
RUN mkdir -p /workspace && chown node:node /workspace
USER node
# Chrome is downloaded into the user's cache at build time, not on the first render.
RUN hyperframes browser ensure
CMD ["node", "apps/render-worker/dist/main.js"]
