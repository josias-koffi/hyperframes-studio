// The apps compile without declarations: what the core process uses of their builds.

declare module "@studio/api/dist/main" {
  export function bootstrap(): Promise<{ close(): Promise<void> }>;
}

declare module "@studio/claude-runner/dist/main" {
  export function startClaudeRunner(): Promise<{ close(): Promise<void> }>;
}

declare module "@studio/render-worker/dist/main" {
  export function startRenderWorker(): Promise<{ close(): Promise<void> }>;
}
