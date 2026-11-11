#!/usr/bin/env node
// Stand-in for `claude -p --input-format stream-json` in a structured call: answers with what it received (its
// arguments, its system prompt, the content of the user message) as `structured_output`.
// FAKE_CLAUDE_MODE=fail gives an error result; =silent exits without any result; =text answers as plain text.
import { readFileSync } from "node:fs";

const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const message = JSON.parse(input.trim().split("\n")[0]);
  const systemFile = args[args.indexOf("--system-prompt-file") + 1];
  const echo = {
    args,
    system: readFileSync(systemFile, "utf8"),
    content: message.message.content.map((block) => (block.type === "text" ? block.text : `[image ${block.source.media_type ?? block.source.url}]`)),
  };
  process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init", session_id: "chat-1" })}\n`);
  if (mode === "silent") process.exit(1);
  const result =
    mode === "fail"
      ? { type: "result", subtype: "error_max_structured_output_retries", is_error: true, result: "schema non respecté" }
      : mode === "text"
        ? { type: "result", subtype: "success", is_error: false, result: JSON.stringify(echo) }
        : { type: "result", subtype: "success", is_error: false, result: "", structured_output: echo, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } };
  process.stdout.write(`${JSON.stringify(result)}\n`);
});
