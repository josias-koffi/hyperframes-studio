"use client";

import { liveDiff } from "@studio/shared/browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Creation } from "@/lib/api";
import { readFile, writeFile, type EngineFile } from "./engine";
import { applyLiveDiff } from "./live-dom";

/** One undoable edit: a file before and after it. */
type Change = { path: string; before: string; after: string; label: string };

export type RunOptions = {
  /** What the change is, for the undo tooltip. */
  label: string;
  /** The preview already shows the change (a style applied while dragging): it is not replayed there. */
  live?: boolean;
};

/** Turns a file's source into the edited one; `null` (or the same source) when there is nothing to change. */
export type Edit = (source: string) => string | null;

type Playback = { time: number; playing: boolean };
export type SaveState = "saved" | "saving" | "error";

type EditorValue = {
  creation: Creation;
  files: Record<string, EngineFile>;
  /** Loads a source file (once; `force` to read it again). */
  load: (path: string, force?: boolean) => Promise<EngineFile>;
  /**
   * Edits `path` at once: the editor's copy changes, the preview shows it, the change is recorded for undo, and
   * the file is written in the background (one write in flight per file, the latest copy wins).
   */
  run: (path: string, edit: Edit, options: RunOptions) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  undoLabel: string | null;
  redoLabel: string | null;
  save: SaveState;
  /** Resolves once every edit is written. */
  flush: () => Promise<void>;
  /** At least one edit was written this session (worth a checkpoint). */
  wrote: () => boolean;
  /** Claude is changing the création: every edit waits. */
  lock: { jobId: string } | null;
  setLock: (lock: { jobId: string } | null) => void;
  /** After Claude rewrote the files: everything is read again, and undo starts over. */
  reloadAll: () => Promise<void>;
  previewKey: number;
  /** Reloads the preview's page, once the edits are written (it is built from the files). */
  reloadPreview: () => Promise<void>;
  previewReady: boolean;
  setPreviewReady: (ready: boolean) => void;
  playback: Playback;
  setPlayback: (playback: Playback) => void;
  /** Sends a control message to the preview runtime (`play`, `pause`, `seek`…). */
  control: (action: string, extra?: Record<string, unknown>) => void;
  /** The preview's page and the time it is held at (a slide, an image), if any. */
  registerPreview: (frame: HTMLIFrameElement | null, holdAt?: number) => void;
  previewDocument: () => Document | null;
};

const EditorContext = createContext<EditorValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor outside of EditorProvider");
  return value;
}

export function EditorProvider({ creation, initialLock, children }: { creation: Creation; initialLock: { jobId: string } | null; children: React.ReactNode }) {
  const [files, setFiles] = useState<Record<string, EngineFile>>({});
  const filesRef = useRef(files);
  const [history, setHistory] = useState<{ undo: Change[]; redo: Change[] }>({ undo: [], redo: [] });
  const historyRef = useRef(history);
  const [lock, setLockState] = useState(initialLock);
  const lockRef = useRef(lock);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [playback, setPlaybackState] = useState<Playback>({ time: 0, playing: false });
  const playbackRef = useRef(playback);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const hold = useRef<number | undefined>(undefined);
  const saving = useRef(new Map<string, Promise<void>>());
  const loading = useRef(new Map<string, Promise<EngineFile>>());
  const wroteRef = useRef(false);
  const [save, setSave] = useState<SaveState>("saved");

  const store = useCallback((path: string, file: EngineFile) => {
    filesRef.current = { ...filesRef.current, [path]: file };
    setFiles(filesRef.current);
    return file;
  }, []);

  const setHistoryBoth = useCallback((next: { undo: Change[]; redo: Change[] }) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const setPlayback = useCallback((next: Playback) => {
    playbackRef.current = next;
    setPlaybackState(next);
  }, []);

  const load = useCallback(
    (path: string, force = false) => {
      const known = filesRef.current[path];
      if (known && !force) return Promise.resolve(known);
      const pending = loading.current.get(path);
      if (pending && !force) return pending;
      const task = readFile(creation.id, path)
        .then((file) => store(path, file))
        .finally(() => loading.current.delete(path));
      loading.current.set(path, task);
      return task;
    },
    [creation.id, store],
  );

  const control = useCallback((action: string, extra: Record<string, unknown> = {}) => {
    frame.current?.contentWindow?.postMessage({ source: "hf-parent", type: "control", action, ...extra }, "*");
  }, []);

  /** Writes `path` until the engine has the editor's copy; later edits ride along with the next write. */
  const persist = useCallback(
    (path: string) => {
      if (saving.current.has(path)) return saving.current.get(path)!;
      let failed = false;
      const task = (async () => {
        let conflicts = 0;
        for (;;) {
          const file = filesRef.current[path];
          if (!file || file.content === file.saved) return;
          const content = file.content;
          const result = await writeFile(creation.id, path, content, file.version);
          if ("conflict" in result) {
            // The engine stamped ids on the file when building a preview, or it was written elsewhere: Claude's
            // edits lock the editor, so the editor's copy wins.
            if (++conflicts > 2) throw new Error("Le fichier change sans arrêt sur le serveur.");
            store(path, { ...filesRef.current[path], version: result.conflict.version, saved: result.conflict.content ?? "" });
            continue;
          }
          wroteRef.current = true;
          store(path, { ...filesRef.current[path], version: result.version, saved: content });
        }
      })()
        .catch((error: Error) => {
          failed = true;
          toast.error(`Enregistrement impossible : ${error.message}`, { id: "editor-save" });
        })
        .finally(() => {
          saving.current.delete(path);
          if (failed) setSave("error");
          else if (saving.current.size === 0) setSave("saved");
        });
      saving.current.set(path, task);
      setSave("saving");
      return task;
    },
    [creation.id, store],
  );

  const flush = useCallback(async () => {
    for (const path of Object.keys(filesRef.current)) void persist(path);
    while (saving.current.size > 0) await Promise.all(saving.current.values());
  }, [persist]);

  const reloadPreview = useCallback(async () => {
    await flush();
    setPreviewKey((key) => key + 1);
  }, [flush]);

  /** Shows a change of the source in the preview, by replaying it there or, failing that, by reloading it. */
  const show = useCallback(
    (before: string, after: string) => {
      const diff = liveDiff(before, after);
      if (diff && applyLiveDiff(frame.current, diff)) {
        control("seek", { timeSeconds: hold.current ?? playbackRef.current.time });
        return;
      }
      void reloadPreview();
    },
    [control, reloadPreview],
  );

  /** Puts `after` in the editor's copy of `path`, shows it, and writes it. */
  const commit = useCallback(
    (path: string, before: string, after: string, live: boolean) => {
      store(path, { ...filesRef.current[path], content: after });
      if (!live) show(before, after);
      void persist(path);
    },
    [persist, show, store],
  );

  const run = useCallback(
    async (path: string, edit: Edit, options: RunOptions) => {
      if (lockRef.current) {
        toast.info("Claude modifie la création : attends la fin de sa modification.");
        return false;
      }
      await load(path);
      const before = filesRef.current[path].content;
      let after: string | null;
      try {
        after = edit(before);
      } catch (error) {
        toast.error((error as Error).message);
        return false;
      }
      if (after === null || after === before) return false;
      commit(path, before, after, Boolean(options.live));
      setHistoryBoth({ undo: [...historyRef.current.undo, { path, before, after, label: options.label }].slice(-100), redo: [] });
      return true;
    },
    [commit, load, setHistoryBoth],
  );

  const restore = useCallback(
    (from: "undo" | "redo") => {
      const stack = historyRef.current[from];
      const change = stack.at(-1);
      if (!change || lockRef.current) return;
      const current = filesRef.current[change.path]?.content;
      if (current === undefined) return;
      commit(change.path, current, from === "undo" ? change.before : change.after, false);
      const rest = stack.slice(0, -1);
      setHistoryBoth(from === "undo" ? { undo: rest, redo: [...historyRef.current.redo, change] } : { undo: [...historyRef.current.undo, change], redo: rest });
    },
    [commit, setHistoryBoth],
  );

  const reloadAll = useCallback(async () => {
    await Promise.all(Object.keys(filesRef.current).map((path) => load(path, true).catch(() => null)));
    setHistoryBoth({ undo: [], redo: [] });
    setPreviewKey((key) => key + 1);
  }, [load, setHistoryBoth]);

  const setLock = useCallback((next: { jobId: string } | null) => {
    lockRef.current = next;
    setLockState(next);
  }, []);

  // Leaving with edits not yet written: the browser asks first.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (saving.current.size > 0 || Object.values(filesRef.current).some((file) => file.content !== file.saved)) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const value = useMemo<EditorValue>(
    () => ({
      creation,
      files,
      load,
      run,
      undo: () => restore("undo"),
      redo: () => restore("redo"),
      undoLabel: history.undo.at(-1)?.label ?? null,
      redoLabel: history.redo.at(-1)?.label ?? null,
      save,
      flush,
      wrote: () => wroteRef.current,
      lock,
      setLock,
      reloadAll,
      previewKey,
      reloadPreview,
      previewReady,
      setPreviewReady,
      playback,
      setPlayback,
      control,
      registerPreview: (element, holdAt) => {
        frame.current = element;
        hold.current = holdAt;
      },
      previewDocument: () => {
        try {
          return frame.current?.contentDocument ?? null;
        } catch {
          return null;
        }
      },
    }),
    [creation, files, load, run, restore, history, save, flush, lock, setLock, reloadAll, previewKey, reloadPreview, previewReady, setPlayback, playback, control],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
