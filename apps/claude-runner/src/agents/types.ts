import type { StudioEvent, TokenUsage } from "@studio/shared";

export type AgentTurn = {
  prompt: string;
  /** Session to resume; a new one is opened when null. */
  sessionId: string | null;
  model: string;
  cwd: string;
  /** Unix uid of the création's owner: OpenCode runs that client's turns under it. */
  agentUid: number;
  timeoutMs: number;
  onEvent: (event: StudioEvent) => Promise<void> | void;
};

export type AgentTurnResult = {
  ok: boolean;
  sessionId: string | null;
  resultText: string | null;
  costUsd?: number;
  usage?: TokenUsage;
};

/** One generation turn, whatever runs it (Claude Code CLI, OpenCode server). */
export type AgentRunner = {
  run(turn: AgentTurn): Promise<AgentTurnResult>;
};
