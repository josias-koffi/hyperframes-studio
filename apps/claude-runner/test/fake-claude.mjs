#!/usr/bin/env node
// Stand-in for the `claude` binary: prints a canned stream-json session.
// FAKE_CLAUDE_MODE=fail exits non-zero after an error result; =linger never exits after its result.
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
const lines = [
  { type: "system", subtype: "init", session_id: "sess-1", model: "fake" },
  { type: "assistant", message: { content: [{ type: "text", text: `args:${process.argv.slice(2).join(" ")}` }] } },
  { type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "BRIEF.md" } }] } },
  mode !== "fail"
    ? { type: "result", subtype: "success", is_error: false, session_id: "sess-1", result: "Brief écrit", num_turns: 2 }
    : { type: "result", subtype: "error_during_execution", is_error: true, session_id: "sess-1" },
];
for (const line of lines) process.stdout.write(`${JSON.stringify(line)}\n`);
if (mode === "fail") {
  process.stderr.write("boom\n");
  process.exit(1);
}
if (mode === "linger") setInterval(() => {}, 1000);
