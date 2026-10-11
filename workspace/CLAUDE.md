# HyperFrames Videos (multi-vidéos)

**One repo, one folder per video.** Each video is a self-contained HyperFrames project in
`videos/<nom>/` (its own `index.html`, `compositions/`, `assets/`, `meta.json`,
`hyperframes.json`). There is no per-video git repo, `package.json`, `CLAUDE.md` or `.env`:
the CLI version, scripts, agent rules and provider config live once at the repo root.
Every CLI command takes the video folder as its `DIR` argument — always pass it.

- New video: `npm run new -- <nom> [--resolution=portrait|square|...]` (wraps `hyperframes init`
  in `videos/` and removes the generated duplicates). Never run `hyperframes init` at the root.
- Ask which video to work on when the request doesn't make it clear.

## Media providers — defaults

Voiceover and music go through **OpenRouter**, configured in the root `.env`
(template: `.env.example`). Read model IDs from there instead of hard-coding them:

- Voiceover (TTS): `TTS_MODEL` (Mistral Voxtral Mini TTS) with `TTS_VOICE` (`fr_marie_neutral`),
  `POST $OPENROUTER_BASE_URL/audio/speech`. The raw output is quiet (~-12.5 dB peak): normalize
  to `TTS_PEAK_DB` before placing it, and keep the raw take in `assets/audio/voxtral/`.
- Music bed: `MUSIC_MODEL` (Google Lyria 3 Clip). Keep raw provider responses in the
  git-ignored `.media/` of the video folder.

`node scripts/audio.mjs videos/<nom> --music "<prompt>"` does all of it (TTS per SCRIPT.md frame, peak
normalization, Lyria bed trimmed to the voice, word timings in `audio_meta.json`): use it rather than writing
another audio script.

These override the `/media-use` default order (HeyGen → ElevenLabs → Kokoro, HeyGen → Lyria via
Gemini key → MusicGen). Use another provider only when the user asks.

## Skills — USE THESE FIRST

**Always invoke the relevant skill before writing or modifying compositions.** Skills encode framework-specific patterns (e.g., `window.__timelines` registration, `data-*` attribute semantics, shader-compatible CSS rules) that are NOT in generic web docs. Skipping them produces broken compositions.

**Doing anything with HyperFrames?** Start at `/hyperframes` — it tells you what HyperFrames can do and which skill or workflow handles your intent (make a video, TTS / BGM, prep footage, author / animate, render, install blocks), confirms your brief up front (the intent layer), and routes every "make me a…" request (a video, a deck, a composition port) to the right workflow. Read it first, especially when there's no project context to orient you. The workflows it routes to:

- `/product-launch-video` — any **website** URL or brief / script → a product launch / SaaS / promo video, or a site tour / showcase featuring the site's own captured visuals.
- `/faceless-explainer` — arbitrary text (topic / article / notes), **no URL, no website capture** → 60-90s faceless explainer.
- `/embedded-captions` — an existing talking-head video (MP4) → the same footage with captions / subtitles added (rail + embed, or pure-cinematic embed); the footage itself is untouched.
- `/talking-head-recut` — an existing talking-head / interview / podcast video (MP4) → the same footage **packaged with designed graphic overlays** (kinetic titles, lower-thirds, data callouts, pull-quotes, side panels, pip) synced to the transcript; the clip plays unchanged underneath. (Plain captions/subtitles → `/embedded-captions`.)
- `/pr-to-video` — a GitHub PR (URL / `owner/repo#N` / "this PR") → 30-90s code-change explainer (changelog / feature reveal / fix / refactor).
- `/motion-graphics` — a short (typically under 10s) design-led **motion graphic**, motion-is-the-message, no narration: kinetic type, a stat / number count-up, a chart, a logo sting, a lower-third / overlay, or an animated tweet / headline / captured-page highlight; rendered to MP4 or a transparent overlay. Longer / narrated / custom → `/general-video`.
- `/music-to-video` — a **music track** (audio file, video to pull audio from, or one generated from a mood brief) → beat-synced video (lyric / slideshow / kinetic promo). Music drives pacing; user-supplied images / videos are cut onto the same beat grid.
- `/slideshow` — a **presentation / pitch deck / interactive deck** — discrete slides, fragment reveals, branching, hotspot navigation, presenter mode. Output is a navigable deck, not a rendered video.
- `/general-video` — fallback for any other video (title card, longer brand / sizzle reel, multi-scene montage, static loop, custom composition) and the home of **companion mode** — co-create with the full HyperFrames toolbox; the original hyperframes authoring flow, any length.

**Porting an existing composition?** `/remotion-to-hyperframes` translates a Remotion (React) composition into HyperFrames HTML — a source migration, separate from the creation workflows above.

The domain skills (`/hyperframes-core`, `/hyperframes-animation`, `/hyperframes-keyframes`, `/hyperframes-creative`, `/hyperframes-cli`, `/media-use`, `/hyperframes-audio`, `/hyperframes-registry`, `/figma`) and the full capability map live inside `/hyperframes` — it is the single source of truth for which skill handles which intent.

**Changing how real footage or images look or reveal?** Load `/media-use` and read its `references/media-treatments.md` before editing, even when the request only says dark, flat, boring, retro, private, or “make the reveal cooler.” It governs how footage is treated, never whether media may be used. Use canonical media treatments and seek-safe motion; do not improvise equivalent CSS/SVG filters or overlays.

> **Tailwind v4 projects** (`hyperframes init --tailwind`): see `/hyperframes-core` → `references/tailwind.md`.

> **Using a HyperFrames plugin?** Load skills from that installed bundle and follow
> its `hyperframes/references/plugin-installation.md` execution rules. Update via
> the plugin manager, not the standalone commands below.
>
> **Standalone skill missing or stale?** Run `npx hyperframes skills update <name>` to install/refresh
> the specific skill you need (the `/hyperframes` router does this automatically before
> entering a workflow), or bare `npx hyperframes skills update` to refresh the core set plus
> everything already installed — neither pulls the full set. Restart the agent session so
> newly installed skills load.

## Commands

```bash
npm run new -- <nom>                     # create videos/<nom>/
npm run preview -- videos/<nom>          # agent-safe persistent Studio preview (--background)
npx hyperframes preview videos/<nom> --status  # verify the persistent preview is listening
npx hyperframes preview videos/<nom> --stop    # stop it when review is finished
npm run preview:stop                     # stop every running preview
npm run dev -- videos/<nom>              # human-operated foreground preview (blocks until stopped)
npm run check -- videos/<nom>            # lint + runtime + layout + motion + contrast (one command)
npm run render -- videos/<nom>           # render to MP4 (in videos/<nom>/renders/)
npm run publish -- videos/<nom>          # publish and get a shareable link
npx hyperframes lint videos/<nom> --verbose  # include info-level findings
npx hyperframes docs <topic> # reference docs in terminal
```

> **Agents must use `npm run preview -- videos/<nom>` (`hyperframes preview --background`) for Studio handoff.** Do not rely
> on a shell/tool `run_in_background` wrapper around `npm run dev`: that foreground process
> remains owned by the invoking session and can disappear while the browser stays open,
> leaving refreshes at `ERR_CONNECTION_TIMED_OUT`. Verify with `preview --status`, keep it
> alive through review, and stop it explicitly with `preview --stop` afterward.

> **Pinned CLI version.** These scripts pin an exact `hyperframes@X.Y.Z` so this project re-renders identically over time. Weeks later that pin lags fixes shipped since. To move up: `npx hyperframes@latest upgrade --project . --check` (shows the delta), then `npx hyperframes@latest upgrade --project .` to rewrite the pins. Always unpinned — the pinned script re-runs the old version against itself.

## Documentation

**For quick reference**, use the local CLI docs command (no network required):

```bash
npx hyperframes docs <topic>
```

Topics: `data-attributes`, `gsap`, `compositions`, `rendering`, `examples`, `troubleshooting`

**For full documentation**, discover pages via the machine-readable index — do NOT guess URLs:

```
https://hyperframes.heygen.com/llms.txt
```

## Project Structure

- `.env` / `.env.example` — provider keys and model IDs (shared by every video; `.env` is git-ignored)
- `package.json` — pinned HyperFrames CLI + scripts (shared)
- `scripts/new-video.sh` — scaffolds a video folder (`npm run new`)
- `scripts/audio.mjs` — voiceover + music bed + `audio_meta.json` with the providers above
- `videos/<nom>/` — one création per folder: a video, or a still (an image, or a carousel whose slide `i` is a
  1 s clip captured at `i + 0.5`; stills need an opaque background, snapshots keep transparency):
  - `index.html` — main composition (root timeline)
  - `compositions/` — sub-compositions referenced via `data-composition-src`
  - `assets/` — audio, music, sfx, images
  - `meta.json` — project metadata (id, name)
  - `hyperframes.json` — HyperFrames project config
  - `transcript.json` — whisper word-level transcript (if generated)
  - `renders/` — rendered MP4s (git-ignored)

## Videos made with blocks

A video whose `STORYBOARD.md` frontmatter says `engine: blocks` is assembled by the studio from
`STORYBOARD.json` and the blocks of `blocks/<id>/` (`block.json` manifest + `block.html` template): its
`index.html` and `compositions/scenes/*.html` are regenerated at every build. To change such a video for good,
change `STORYBOARD.json` (props, order, durations); an edit of the HTML lasts until the next build.

## Linting — ALWAYS RUN AFTER CHANGES

After creating or editing any `.html` composition, **always** run the full check before considering the task complete:

```bash
npm run check -- videos/<nom>
```

Fix all errors before presenting the result. Warnings should be reviewed before rendering.

## Key Rules

1. Every timed element needs `data-start` and a duration. `data-start` is what marks it as timed; `data-track-index` is an optional Studio display lane the render never reads
2. Give timed visual elements `class="clip"`. The framework keys visibility off `data-start`, not the class, but the shared `.clip` CSS is what gives a scene its full-frame box, and `lint` warns without it
3. Register one paused root timeline per composition on `window.__timelines`:
   ```js
   window.__timelines = window.__timelines || {};
   window.__timelines["composition-id"] = gsap.timeline({ paused: true });
   ```
   Scene timelines manually added to this root must not be paused. A paused
   child does not advance when the root is seeked. The runtime activates
   registered composition siblings, not arbitrary nested scene timelines.
4. A video with sound keeps it on the `<video>` (`data-has-audio="true"`, no `muted`). Use a separate `<audio>` for music, voiceover, replacement audio, J/L cuts, or audio detached in Studio. Silent footage and b-roll: `muted`.
5. Sub-compositions use `data-composition-src="compositions/file.html"` to reference other HTML files
6. Only deterministic logic — no `Date.now()`, no `Math.random()`, no network fetches
7. Keep every création editable by hand in Framesmith's editor (layers, timeline, properties panel):
   - every visible element the user may want to change (a title, a text block, a logo, an image, a shape) is its own element, named in French with `data-layer="…"` (« Titre », « Logo », « Fond »…);
   - texts are plain text in their element (no text drawn on a canvas, no text converted to SVG paths unless the design needs it), images are `<img>` elements;
   - on an image or a carousel slide, the main elements are placed with `position: absolute` inside the slide;
   - GSAP calls on a clip of the root timeline stay one call per line with a numeric position (`tl.to("#el-02", {…}, 3.2);`), so they follow the clip when the user moves it.
