# Claude runner: Claude Code CLI + HyperFrames toolchain + the workspace skeleton.
# Authenticates with CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`, subscription), never an API key.

ARG HYPERFRAMES_VERSION=0.8.134
ARG CLAUDE_CODE_VERSION=2.1.291

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/claude-runner/package.json apps/claude-runner/package.json
RUN pnpm install --frozen-lockfile --filter @studio/claude-runner...

FROM deps AS builder
COPY packages packages
COPY apps/claude-runner apps/claude-runner
RUN pnpm --filter @studio/claude-runner... build

FROM node:22-bookworm-slim AS runner
ARG HYPERFRAMES_VERSION
ARG CLAUDE_CODE_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git curl jq python3 ca-certificates unzip fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "hyperframes@${HYPERFRAMES_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production \
    WORKSPACE_DIR=/workspace \
    WORKSPACE_SKELETON_DIR=/opt/workspace-skeleton \
    PROMPTS_DIR=/repo/prompts \
    CLAUDE_BIN=claude \
    DISABLE_AUTOUPDATER=1
COPY --from=deps /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/packages/config/package.json packages/config/package.json
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/packages/db/package.json packages/db/package.json
COPY --from=deps /repo/packages/storage/package.json packages/storage/package.json
COPY --from=deps /repo/apps/claude-runner/package.json apps/claude-runner/package.json
RUN pnpm install --frozen-lockfile --prod --filter @studio/claude-runner...
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/packages/db/dist packages/db/dist
COPY --from=builder /repo/packages/storage/dist packages/storage/dist
COPY --from=builder /repo/apps/claude-runner/dist apps/claude-runner/dist
COPY prompts prompts
COPY workspace /opt/workspace-skeleton
# Same uid (node, 1000) as the api and render-worker images: the three share the workspace volume.
RUN mkdir -p /workspace /home/node/.claude/projects && chown -R node:node /workspace /home/node
USER node
# Skills land in ~/.claude/skills (baked); only ~/.claude/projects (sessions, for --resume) is a volume.
RUN hyperframes browser ensure \
    && hyperframes skills update hyperframes hyperframes-core hyperframes-animation hyperframes-creative \
       hyperframes-cli hyperframes-keyframes hyperframes-audio hyperframes-registry media-use \
       product-launch-video faceless-explainer motion-graphics music-to-video general-video \
       embedded-captions talking-head-recut
CMD ["node", "apps/claude-runner/dist/main.js"]
