import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  commitCheckpoint,
  missingStepOutputs,
  renderWorkspaceEnv,
  setCanvasSize,
  storyboardAudio,
  syncWorkspaceSkeleton,
  templateVariablesGap,
} from "./workspace";

describe("renderWorkspaceEnv", () => {
  it("keeps only the provider keys that are set", () => {
    expect(renderWorkspaceEnv({ TTS_MODEL: "m", SECRET: "x", MUSIC_MODEL: "l" })).toBe("TTS_MODEL=m\nMUSIC_MODEL=l\n");
  });
});

describe("syncWorkspaceSkeleton", () => {
  it("updates the rules without touching the videos, then commits checkpoints", async () => {
    const skeleton = await mkdtemp(join(tmpdir(), "skel-"));
    const workspace = await mkdtemp(join(tmpdir(), "ws-"));
    await writeFile(join(skeleton, "CLAUDE.md"), "v2");
    await mkdir(join(skeleton, "videos"));
    await writeFile(join(skeleton, "videos", "x"), "from skeleton");
    await mkdir(join(workspace, "videos", "demo"), { recursive: true });
    await writeFile(join(workspace, "CLAUDE.md"), "v1");
    await writeFile(join(workspace, "videos", "demo", "BRIEF.md"), "brief");

    await syncWorkspaceSkeleton(skeleton, workspace);

    expect(await readFile(join(workspace, "CLAUDE.md"), "utf8")).toBe("v2");
    expect(await readFile(join(workspace, "videos", "demo", "BRIEF.md"), "utf8")).toBe("brief");
    await expect(readFile(join(workspace, "videos", "x"))).rejects.toThrow();

    await commitCheckpoint(workspace, "demo", "demo: brief");
    await commitCheckpoint(workspace, "demo", "demo: nothing changed");
    const log = execFileSync("git", ["log", "--format=%s"], { cwd: workspace }).toString().trim();
    expect(log).toBe("demo: brief");
  });
});

describe("missingStepOutputs", () => {
  it("lists the files a step should have written", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ws-"));
    await mkdir(join(workspace, "videos", "demo"), { recursive: true });
    await writeFile(join(workspace, "videos", "demo", "STORYBOARD.md"), "frames");

    expect(await missingStepOutputs(workspace, "demo", "video", "brief")).toEqual(["BRIEF.md"]);
    expect(await missingStepOutputs(workspace, "demo", "video", "storyboard")).toEqual(["SCRIPT.md", "storyboard.html"]);
    expect(await missingStepOutputs(workspace, "demo", "carousel", "storyboard")).toEqual(["storyboard.html"]);
    expect(await missingStepOutputs(workspace, "demo", "video", "media")).toEqual([]);
  });
});

describe("setCanvasSize", () => {
  const blank = `<html lang="en" data-resolution="landscape">
  <head>
    <meta name="viewport" content="width=1920, height=1080" />
    <style>
      html,
      body {
        margin: 0;
        width: 1920px;
        height: 1080px;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-width="1920" data-height="1080"></div>
  </body>
</html>`;

  it("resizes every place the canvas size is written", () => {
    const html = setCanvasSize(blank, 1080, 1350);
    expect(html).toContain('content="width=1080, height=1350"');
    expect(html).toContain("width: 1080px;\n        height: 1350px;");
    expect(html).toContain('data-width="1080" data-height="1350"');
    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain("1920");
  });
});

describe("storyboardAudio", () => {
  it("reads studio_audio from the storyboard frontmatter", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ws-"));
    await mkdir(join(workspace, "videos", "demo"), { recursive: true });
    expect(await storyboardAudio(workspace, "demo")).toBeNull();

    const storyboard = join(workspace, "videos", "demo", "STORYBOARD.md");
    await writeFile(storyboard, "---\nformat: 1080x1920\nstudio_audio: Aucun\n---\n\n# Storyboard\nstudio_audio: voix\n");
    expect(await storyboardAudio(workspace, "demo")).toBe("aucun");
    await writeFile(storyboard, '---\nstudio_audio: "voix+musique"\n---\n');
    expect(await storyboardAudio(workspace, "demo")).toBe("voix+musique");
    await writeFile(storyboard, "---\nformat: 1080x1920\n---\n");
    expect(await storyboardAudio(workspace, "demo")).toBeNull();
  });
});

describe("templateVariablesGap", () => {
  const title = { id: "title", type: "string", label: "Titre", default: "Hello" };

  it("compares the validated contract with the declaration of index.html", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ws-"));
    const dir = join(workspace, "videos", "demo");
    await mkdir(dir, { recursive: true });
    expect(typeof (await templateVariablesGap(workspace, "demo"))).toBe("string");

    await writeFile(join(dir, "VARIABLES.json"), JSON.stringify([title, { ...title, id: "cta" }]));
    await writeFile(join(dir, "index.html"), `<html data-composition-variables='${JSON.stringify([title])}'></html>`);
    expect(await templateVariablesGap(workspace, "demo")).toEqual({ missing: ["cta"], extra: [], changed: [] });
  });
});
