/**
 * Convert pass: render every unit of a chapter to cached audio, stitching each
 * request to the previous one for prosody continuity.
 *
 * Resumable: a unit whose audio is already set is skipped. On a provider error
 * the run checkpoints, marks the chapter "partial", and stops; rendered units
 * stay valid and a retry resumes and re-establishes the stitching context from
 * the last rendered unit's request id. Progress and a live log are written to
 * the chapter job for the UI.
 */

import { getCast, defaultCast } from "@/lib/tts/cast";
import { renderUnit, type RenderedUnit } from "@/lib/tts/engine";
import { getProvider } from "@/lib/tts/providers";
import { isQuotaError } from "@/lib/tts/types";
import type { RenderUnit } from "@/lib/ingest/types";
import { hasRenderableText, normalizeSource } from "@/lib/ingest/text";

import { getBook, patchChapter } from "@/lib/store/books";
import { getChapterScript, putChapterScript } from "@/lib/store/chunks";
import { logEvent, loadOrCreateJob, setProgress } from "@/lib/store/jobs";

const CHECKPOINT_EVERY = 5;

/**
 * Fish units are independent (no stitch id), so a few can render at once. The
 * default is deliberately low to stay inside the free tier's rate limit; raise
 * it with FISH_CONCURRENCY when the account allows more.
 */
const DEFAULT_FISH_CONCURRENCY = 3;
const MAX_CONCURRENCY = 8;

function resolveConcurrency(override?: number): number {
  const env = Number(process.env.FISH_CONCURRENCY ?? process.env.TTS_CONCURRENCY ?? "");
  const requested = override ?? (Number.isFinite(env) && env > 0 ? env : 0);
  const value = requested > 0 ? requested : DEFAULT_FISH_CONCURRENCY;
  return Math.max(1, Math.min(Math.floor(value), MAX_CONCURRENCY));
}

export class ConvertError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ConvertError";
    this.status = status;
  }
}

export type ConvertDebugEvent =
  | { kind: "skip"; id: number; type: "speech" | "dialogue" }
  | { kind: "unit"; id: number; type: "speech" | "dialogue"; chars: number; cached: boolean; requestId: string | null; cost: number | null }
  | { kind: "error"; id: number; type: "speech" | "dialogue"; message: string };

export type ConvertOptions = {
  providerId?: string;
  /** Max units to render at once. Only used for providers without stitching. */
  concurrency?: number;
  debug?: (event: ConvertDebugEvent) => void;
};

export type ConvertResult = {
  bookId: string;
  idx: number;
  status: "ready" | "partial" | "failed";
  done: number;
  total: number;
  characters: number;
  error?: string;
};

/**
 * Active conversions, keyed by book and chapter. A stop request flips the flag;
 * the running loop then ends after the units already in flight and checkpoints.
 * In-memory is enough because the app runs as a single instance.
 */
type ConversionControl = { stop: boolean };
const activeConversions = new Map<string, ConversionControl>();
const conversionKey = (bookId: string, idx: number) => `${bookId}:${idx}`;

/** Ask a running conversion to stop. Returns false when none is active. */
export function requestStop(bookId: string, idx: number): boolean {
  const control = activeConversions.get(conversionKey(bookId, idx));
  if (!control) return false;
  control.stop = true;
  return true;
}

export async function convertChapter(
  bookId: string,
  idx: number,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const book = await getBook(bookId);
  if (!book) throw new ConvertError("Book not found", 404);

  const script = await getChapterScript(bookId, idx);
  if (!script || script.units.length === 0) {
    throw new ConvertError("Chapter not planned", 409);
  }

  // Repair older scripts and drop anything that would render empty: unwrap
  // `<...>` speaker tags, then remove units/lines with nothing left to say.
  let repaired = false;
  for (const unit of script.units) {
    if (unit.type === "speech") {
      const fixed = normalizeSource(unit.text);
      if (fixed !== unit.text) {
        unit.text = fixed;
        repaired = true;
      }
    } else {
      for (const line of unit.lines) {
        const fixed = normalizeSource(line.text);
        if (fixed !== line.text) {
          line.text = fixed;
          repaired = true;
        }
      }
      const lines = unit.lines.filter((line) => hasRenderableText(line.text));
      if (lines.length !== unit.lines.length) {
        unit.lines = lines;
        repaired = true;
      }
    }
  }
  const kept = script.units
    .filter((unit) => (unit.type === "speech" ? hasRenderableText(unit.text) : unit.lines.length > 0))
    .map((unit, id) => ({ ...unit, id }));
  if (kept.length !== script.units.length) repaired = true;
  script.units = kept;
  if (repaired) await putChapterScript(bookId, idx, script);
  if (script.units.length === 0) {
    throw new ConvertError("Chapter has no renderable units", 422);
  }

  const cast = (await getCast(bookId)) ?? defaultCast();
  const units = script.units;
  const total = units.length;
  let done = units.filter((unit) => unit.audio).length;
  let characters = 0;

  // Fish has no cross-request stitch id, so its units are independent and can
  // render in parallel. Every other provider stitches, so it stays sequential.
  const parallel = getProvider(options.providerId).id === "fish";
  const concurrency = parallel ? resolveConcurrency(options.concurrency) : 1;

  const job = await loadOrCreateJob(bookId, idx, "rendering");
  job.total = total;
  job.done = done;
  job.chars = 0;
  await logEvent(
    job,
    "info",
    done > 0
      ? `Resuming · ${done}/${total} already rendered`
      : `Rendering ${total} units${concurrency > 1 ? ` · ${concurrency} at a time` : ""}`,
  );
  await patchChapter(bookId, idx, { status: "converting", unitCount: total, unitsDone: done });

  const control: ConversionControl = { stop: false };
  const controlKey = conversionKey(bookId, idx);
  activeConversions.set(controlKey, control);

  function unitLength(unit: RenderUnit): number {
    return unit.type === "speech"
      ? unit.text.length
      : unit.lines.reduce((sum, line) => sum + line.text.length, 0);
  }

  async function record(unit: RenderUnit, result: RenderedUnit): Promise<void> {
    const chars = unitLength(unit);
    unit.audio = result.hash;
    unit.requestId = result.requestId;
    characters += chars;
    done++;

    const voices = unit.type === "dialogue" ? new Set(unit.lines.map((line) => line.speakerHint)).size : 1;
    const label = unit.type === "dialogue" ? `Dialogue · ${voices} voices` : "Speech";
    await logEvent(
      job,
      "info",
      `${label} ${done}/${total} · ${chars} chars${result.cached ? " · cached" : ""}${result.requestId ? ` · stitch ${result.requestId.slice(0, 8)}` : ""}`,
    );
    await setProgress(job, { done, total, chars: characters });
    options.debug?.({
      kind: "unit",
      id: unit.id,
      type: unit.type,
      chars,
      cached: result.cached,
      requestId: result.requestId,
      cost: result.characterCost,
    });
  }

  const markPartial = async (error: unknown, unit?: RenderUnit): Promise<ConvertResult> => {
    const message = error instanceof Error ? error.message : "Render failed";
    if (unit) options.debug?.({ kind: "error", id: unit.id, type: unit.type, message });
    await logEvent(job, "error", `Stopped: ${message}`);
    await setProgress(job, { phase: "idle", running: false, done, total, chars: characters });
    await putChapterScript(bookId, idx, script);
    await patchChapter(bookId, idx, { status: "partial", unitsDone: done });
    return { bookId, idx, status: "partial", done, total, characters, error: message };
  };

  const stopResult = async (): Promise<ConvertResult> => {
    await logEvent(job, "info", "Stopped by user");
    await setProgress(job, { phase: "idle", running: false, done, total, chars: characters });
    await putChapterScript(bookId, idx, script);
    await patchChapter(bookId, idx, { status: done > 0 ? "partial" : "ingested", unitsDone: done });
    return { bookId, idx, status: "partial", done, total, characters };
  };

  try {
    if (concurrency <= 1) {
      // Sequential path (stitching providers). Reconstruct the stitch context
      // from the last rendered unit before the gap.
      let previousRequestIds: string[] = [];
      const firstPending = units.findIndex((unit) => !unit.audio);
      if (firstPending > 0) {
        const previous = units[firstPending - 1].requestId;
        if (previous) previousRequestIds = [previous];
      }

      for (let i = 0; i < total; i++) {
        if (control.stop) break;
        const unit = units[i];
        if (unit.audio) {
          options.debug?.({ kind: "skip", id: unit.id, type: unit.type });
          continue;
        }

        try {
          const result = await renderUnit(unit, cast, {
            providerId: options.providerId,
            previousRequestIds,
          });
          await record(unit, result);
          if (result.requestId) previousRequestIds = [result.requestId];
        } catch (error) {
          return await markPartial(error, unit);
        }

        if (done % CHECKPOINT_EVERY === 0) {
          await putChapterScript(bookId, idx, script);
        }
      }

      if (control.stop) return await stopResult();
    } else {
      // Bounded pool (Fish). Renders run at once; store writes are serialized so
      // the job log, progress and checkpoints cannot race.
      let cursor = 0;
      let stopped = false;
      const state: { failure: { error: unknown; unit: RenderUnit } | null } = { failure: null };

      let tail: Promise<unknown> = Promise.resolve();
      const serialize = (fn: () => Promise<void>): Promise<void> => {
        const run = tail.then(fn, fn);
        tail = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      };

      const worker = async (): Promise<void> => {
        while (!stopped && !control.stop) {
          const i = cursor++;
          if (i >= total) return;

          const unit = units[i];
          if (unit.audio) {
            options.debug?.({ kind: "skip", id: unit.id, type: unit.type });
            continue;
          }

          let result: RenderedUnit;
          try {
            result = await renderUnit(unit, cast, { providerId: options.providerId });
          } catch (error) {
            if (!stopped) {
              stopped = true;
              state.failure = { error, unit };
            }
            return;
          }

          await serialize(async () => {
            if (unit.audio) return;
            await record(unit, result);
            if (done % CHECKPOINT_EVERY === 0) {
              await putChapterScript(bookId, idx, script);
            }
          });
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
      await tail;

      if (control.stop) return await stopResult();
      if (state.failure) {
        return await markPartial(state.failure.error, state.failure.unit);
      }
    }

    await putChapterScript(bookId, idx, script);
    await patchChapter(bookId, idx, { status: "ready", unitsDone: done });
    await setProgress(job, { phase: "idle", running: false, done, total, chars: characters });
    await logEvent(job, "info", `Ready · ${total} units · ${characters} chars`);

    return { bookId, idx, status: "ready", done, total, characters };
  } finally {
    activeConversions.delete(controlKey);
  }
}

export { isQuotaError };
