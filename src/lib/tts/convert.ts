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
import { renderUnit } from "@/lib/tts/engine";
import { isQuotaError } from "@/lib/tts/types";
import { hasRenderableText, normalizeSource } from "@/lib/ingest/text";

import { getBook, patchChapter } from "@/lib/store/books";
import { getChapterScript, putChapterScript } from "@/lib/store/chunks";
import { logEvent, loadOrCreateJob, setProgress } from "@/lib/store/jobs";

const CHECKPOINT_EVERY = 5;

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

  const job = await loadOrCreateJob(bookId, idx, "rendering");
  job.total = total;
  job.done = done;
  job.chars = 0;
  await logEvent(
    job,
    "info",
    done > 0 ? `Resuming · ${done}/${total} already rendered` : `Rendering ${total} units`,
  );
  await patchChapter(bookId, idx, { status: "converting", unitCount: total, unitsDone: done });

  // Reconstruct the stitch context from the last rendered unit before the gap.
  let previousRequestIds: string[] = [];
  const firstPending = units.findIndex((unit) => !unit.audio);
  if (firstPending > 0) {
    const previous = units[firstPending - 1].requestId;
    if (previous) previousRequestIds = [previous];
  }

  for (let i = 0; i < total; i++) {
    const unit = units[i];
    if (unit.audio) {
      options.debug?.({ kind: "skip", id: unit.id, type: unit.type });
      continue;
    }

    const chars = unit.type === "speech" ? unit.text.length : unit.lines.reduce((sum, line) => sum + line.text.length, 0);

    try {
      const result = await renderUnit(unit, cast, {
        providerId: options.providerId,
        previousRequestIds,
      });
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

      if (result.requestId) previousRequestIds = [result.requestId];
      options.debug?.({
        kind: "unit",
        id: unit.id,
        type: unit.type,
        chars,
        cached: result.cached,
        requestId: result.requestId,
        cost: result.characterCost,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render failed";
      options.debug?.({ kind: "error", id: unit.id, type: unit.type, message });
      await logEvent(job, "error", `Stopped: ${message}`);
      await setProgress(job, { phase: "idle", running: false, done, total, chars: characters });
      await putChapterScript(bookId, idx, script);
      await patchChapter(bookId, idx, { status: "partial", unitsDone: done });
      return { bookId, idx, status: "partial", done, total, characters, error: message };
    }

    if (done % CHECKPOINT_EVERY === 0) {
      await putChapterScript(bookId, idx, script);
    }
  }

  await putChapterScript(bookId, idx, script);
  await patchChapter(bookId, idx, { status: "ready", unitsDone: done });
  await setProgress(job, { phase: "idle", running: false, done, total, chars: characters });
  await logEvent(job, "info", `Ready · ${total} units · ${characters} chars`);

  return { bookId, idx, status: "ready", done, total, characters };
}

export { isQuotaError };
