/** BullMQ queue names shared by the API (producer) and the workers (consumers). */
export const QUEUES = {
  /** Generation steps run by the Claude Code session of the server. One job at a time. */
  claude: "studio-claude",
  /** Deterministic HyperFrames renders and snapshots: no Claude involved. */
  render: "studio-render",
} as const;

/** Redis pub/sub channel carrying the live events of one job. */
export function jobEventsChannel(jobId: string): string {
  return `studio:job:${jobId}:events`;
}
