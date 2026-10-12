import { describe, expect, it } from "vitest";
import { agentEnv } from "./agent-env";

describe("agentEnv", () => {
  it("passes no secret of the studio, only the agent's own values", () => {
    const env = agentEnv(
      { home: "/home/me", tmp: "/tmp/studio-agent" },
      { OPENROUTER_API_KEY: "sk-studio-x" },
      { PATH: "/usr/bin", AUTH_SESSION_SECRET: "s", OPENROUTER_API_KEY: "sk-or-real", CLAUDE_CODE_OAUTH_TOKEN: "c", TTS_PEAK_DB: "-1" },
    );
    expect(env).toEqual({ PATH: "/usr/bin", TTS_PEAK_DB: "-1", HOME: "/home/me", TMPDIR: "/tmp/studio-agent", OPENROUTER_API_KEY: "sk-studio-x" });
  });

  it("hands the Chrome GPU mode to the HyperFrames commands", () => {
    expect(agentEnv({ home: "/h", tmp: "/t" }, {}, { PRODUCER_BROWSER_GPU_MODE: "software" })).toMatchObject({ PRODUCER_BROWSER_GPU_MODE: "software" });
  });
});
