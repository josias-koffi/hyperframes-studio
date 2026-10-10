# Generation runner: OpenCode (OpenRouter, platform key) and Claude Code CLI + HyperFrames toolchain + the
# workspace skeleton. Claude Code authenticates with CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`, subscription),
# never an API key; OpenCode reads OPENROUTER_API_KEY through workspace/opencode.json.

ARG HYPERFRAMES_VERSION=0.8.134
ARG CLAUDE_CODE_VERSION=2.1.291
ARG OPENCODE_VERSION=1.18.35

FROM node:22-bookworm-slim AS deps
# The filtered install is the image's whole node_modules: no full install before `pnpm run`/`exec`.
ENV pnpm_config_verify_deps_before_run=false
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
ARG OPENCODE_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git curl jq python3 ca-certificates unzip fonts-liberation fonts-noto-color-emoji sudo acl util-linux \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "hyperframes@${HYPERFRAMES_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
       "opencode-ai@${OPENCODE_VERSION}" \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production \
    WORKSPACE_DIR=/workspace \
    WORKSPACE_SKELETON_DIR=/opt/workspace-skeleton \
    PROMPTS_DIR=/repo/prompts \
    CLAUDE_BIN=claude \
    OPENCODE_BIN=opencode \
    OPENCODE_DISABLE_AUTOUPDATE=true \
    DISABLE_AUTOUPDATER=1 \
    AGENT_SANDBOX=uid \
    AGENT_HOMES_DIR=/agents \
    AGENT_BROWSER_DIR=/home/node/.cache/hyperframes/chrome \
    CLAUDE_SKILLS_DIR=/home/node/.claude/skills
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
# Clients' agents run under uids 100000+ (sandbox.ts): agent-exec is the runner's only root command.
COPY docker/agent-exec.sh /usr/local/bin/agent-exec
RUN chmod 0755 /usr/local/bin/agent-exec \
    && echo 'node ALL=(root) NOPASSWD: /usr/local/bin/agent-exec' > /etc/sudoers.d/agent-exec \
    && chmod 0440 /etc/sudoers.d/agent-exec \
    && mkdir -p /workspace /agents /home/node/.claude/projects && chown -R node:node /workspace /agents /home/node
USER node
# Skills land in ~/.claude/skills and the browser in ~/.cache/hyperframes (baked, readable by the agent uids, linked
# into each agent home); only the sessions are volumes: ~/.claude/projects (Claude Code --resume) and /agents (the
# agent homes, with their OpenCode sessions).
RUN hyperframes browser ensure \
    && hyperframes skills update hyperframes hyperframes-core hyperframes-animation hyperframes-creative \
       hyperframes-cli hyperframes-keyframes hyperframes-audio hyperframes-registry media-use \
       product-launch-video faceless-explainer motion-graphics music-to-video general-video \
       embedded-captions talking-head-recut \
    && chmod 0711 /home/node /home/node/.claude /home/node/.cache /home/node/.cache/hyperframes \
    && chmod -R a+rX /home/node/.claude/skills /home/node/.cache/hyperframes/chrome \
    && chmod 0700 /home/node/.claude/projects
CMD ["node", "apps/claude-runner/dist/main.js"]
