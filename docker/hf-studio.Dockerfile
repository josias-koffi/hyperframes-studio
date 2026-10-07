# HyperFrames Studio editor gateway: runs `hyperframes preview` for one project at a time and proxies it
# (HTTP + WebSocket) on 3000. Same runtime as the render worker: pinned CLI + Chrome + FFmpeg.

ARG HYPERFRAMES_VERSION=0.8.134

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/hf-studio/package.json apps/hf-studio/package.json
RUN pnpm install --frozen-lockfile --filter @studio/hf-studio...

FROM deps AS builder
COPY packages packages
COPY apps/hf-studio apps/hf-studio
RUN pnpm --filter @studio/hf-studio... build

FROM node:22-bookworm-slim AS runner
ARG HYPERFRAMES_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git ca-certificates unzip fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "hyperframes@${HYPERFRAMES_VERSION}" \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production WORKSPACE_DIR=/workspace HYPERFRAMES_BIN=hyperframes HF_STUDIO_PORT=3000
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/packages/config/package.json packages/config/package.json
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/apps/hf-studio/package.json apps/hf-studio/package.json
RUN pnpm install --frozen-lockfile --prod --filter @studio/hf-studio...
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/hf-studio/dist apps/hf-studio/dist
RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN hyperframes browser ensure
EXPOSE 3000
CMD ["node", "apps/hf-studio/dist/main.js"]
