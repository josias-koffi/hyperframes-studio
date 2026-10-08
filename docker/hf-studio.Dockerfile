# HyperFrames Studio editor gateway: serves the Studio of every opened project on 3000, in process, with the
# server of the HyperFrames CLI pinned in apps/hf-studio/package.json (keep it on the render worker's
# HYPERFRAMES_VERSION). Chrome + FFmpeg for the Studio's thumbnails.

FROM node:22-bookworm-slim AS deps
# The filtered install is the image's whole node_modules: no full install before `pnpm run`/`exec`.
ENV pnpm_config_verify_deps_before_run=false
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
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git ca-certificates unzip fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production WORKSPACE_DIR=/workspace HF_STUDIO_PORT=3000 DO_NOT_TRACK=1 pnpm_config_verify_deps_before_run=false
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/packages/config/package.json packages/config/package.json
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/apps/hf-studio/package.json apps/hf-studio/package.json
RUN pnpm install --frozen-lockfile --prod --filter @studio/hf-studio...
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/hf-studio/dist apps/hf-studio/dist
RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN pnpm --filter @studio/hf-studio exec hyperframes browser ensure
EXPOSE 3000
CMD ["node", "apps/hf-studio/dist/main.js"]
