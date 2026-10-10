/**
 * Ingest pass: chunk a chapter coarsely, plan it into render units with the
 * LLM, persist the script, then keep the append-only cast in sync.
 *
 *   1. Chunk paragraphs to the model's per-request limit (10,000).
 *   2. Plan: the LLM emits speech units and multi-voice dialogue scenes.
 *   3. Persist script.json and mark the chapter "ingested".
 *   4. Merge the chapter's speakers into the cast, then resolve unit speakers
 *      to cast ids.
 */

import { createHash } from "node:crypto";

import { bookWikiKey } from "@/lib/storage/keys";
import { defaultCast, findCastMember, getCast, mergeCast, putCast, resolveVoicePool } from "@/lib/tts/cast";
import { matchVoiceByTraits, type FishVoice } from "@/lib/tts/fish-voices";
import { getProvider } from "@/lib/tts/providers";
import type { Cast, CastMember, SpeakerEntry, VoiceRef } from "@/lib/tts/types";

import { getBook, getBookContext, getBookDirection, getChapterText, patchChapter } from "@/lib/store/books";
import { getChapterScript, putChapterScript } from "@/lib/store/chunks";
import { getJson, putJson } from "@/lib/store/objects";
import { logEvent, loadOrCreateJob, setProgress } from "@/lib/store/jobs";

import { chunkParagraphs } from "./chunk";
import { consolidateCast } from "./cast";
import { runDirector, type DirectorEntry } from "./director";
import { planChapter, type PlanDebug } from "./plan";
import { mediawikiLookup, type WikiLookupArgs } from "./tools/mediawiki";
import type { ChapterScript, RenderUnit } from "./types";

export class IngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

export type IngestResult = {
  bookId: string;
  idx: number;
  unitCount: number;
  status: "ingested";
  castBuilt: boolean;
};

export async function ingestChapter(
  bookId: string,
  idx: number,
  options: { debug?: PlanDebug } = {},
): Promise<IngestResult> {
  const book = await getBook(bookId);
  if (!book) throw new IngestError("Book not found", 404);

  const chapter = book.chapters.find((entry) => entry.idx === idx);
  if (!chapter) throw new IngestError("Chapter not found", 404);

  const text = await getChapterText(bookId, idx);
  if (!text || text.paragraphs.length === 0) {
    throw new IngestError("Chapter text not found", 404);
  }

  const chunks = chunkParagraphs(text.paragraphs);
  if (chunks.length === 0) {
    throw new IngestError("Chapter has no readable text", 422);
  }

  const job = await loadOrCreateJob(bookId, idx, "planning");
  job.total = chunks.length;
  job.done = 0;
  job.chars = 0;
  await logEvent(job, "info", `Planning ${chunks.length} chunk(s) · ${chapter.charCount} chars`);

  const cast = (await getCast(bookId)) ?? defaultCast();
  const units = await planChapter(chunks, cast, {
    sessionId: `${bookId}:${idx}`,
    mode: book.kind === "article" ? "article" : "book",
    debug: async (info) => {
      await options.debug?.(info);
      const error = (info.raw as { error?: string })?.error;
      if (error) await logEvent(job, "warn", `Chunk ${info.chunkIdx + 1} LLM error: ${error}`);
      if (info.action === "planned" && info.depth === 0) {
        await logEvent(job, "info", `Chunk ${info.chunkIdx + 1}/${chunks.length} planned · ${info.units.length} units`);
      } else if (info.action === "planned") {
        await logEvent(job, "info", `Chunk ${info.chunkIdx + 1} recovered at depth ${info.depth} · ${info.units.length} units`);
      } else if (info.action === "split") {
        await logEvent(job, "warn", `Chunk ${info.chunkIdx + 1} coverage miss · splitting ${info.chars} chars`);
      } else {
        await logEvent(job, "error", `Chunk ${info.chunkIdx + 1} fell back to single narration`);
      }
    },
  });
  if (units.length === 0) {
    await logEvent(job, "error", "Planner produced no units");
    await setProgress(job, { phase: "idle", running: false });
    throw new IngestError("Planner produced no units", 422);
  }

  const script: ChapterScript = { idx, units };
  await putChapterScript(bookId, idx, script);
  await patchChapter(bookId, idx, { status: "ingested", unitCount: units.length, unitsDone: 0 });
  await setProgress(job, { phase: "idle", running: false, done: units.length, total: units.length });
  await logEvent(job, "info", `Planned ${units.length} units`);

  let castBuilt = false;
  if (book.kind === "article") {
    // Articles use a single narrator. Persist the cast anyway, so the narrator
    // appears in the workbench and its voice can be previewed and changed.
    await putCast(bookId, cast);
    await linkScriptsToCast(bookId, cast);
    await logEvent(job, "info", `Cast: ${cast.narrator.name} (narrator)`);
    castBuilt = true;
  } else {
    try {
      const built = await runChapterDirector(bookId, idx, cast, async (message) => {
        await logEvent(job, "info", `Director: ${message}`);
      });
      const names = built.characters.map((member) => member.name).join(", ");
      await logEvent(job, "info", `Cast: ${names || "narrator only"}`);
      castBuilt = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logEvent(job, "warn", `Director failed: ${message}`);
      try {
        const built = await buildBookCast(bookId);
        const names = built.characters.map((member) => member.name).join(", ");
        await logEvent(job, "info", `Cast (hints): ${names || "narrator only"}`);
        castBuilt = true;
      } catch {
        // Cast building is best-effort; convert can still fall back to the narrator.
      }
    }
  }

  return { bookId, idx, unitCount: units.length, status: "ingested", castBuilt };
}

function hostOfReference(reference?: string): string | undefined {
  if (!reference) return undefined;
  const match = reference.match(/https?:\/\/[^\s)]+/);
  if (!match) return undefined;
  try {
    return new URL(match[0]).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/** mediawiki_lookup with a per-book cache keyed by site + mode + query. */
function cachedWikiLookup(bookId: string, fallbackSite?: string) {
  return async (args: WikiLookupArgs): Promise<unknown> => {
    const site = (args.site ?? fallbackSite ?? "en.wikipedia.org").toLowerCase();
    const mode = args.mode ?? "search";
    const hash = createHash("sha256")
      .update(`${site}|${mode}|${args.query}`)
      .digest("hex")
      .slice(0, 32);
    const key = bookWikiKey(bookId, hash);

    const cached = await getJson<unknown>(key);
    if (cached) return cached;

    const result = await mediawikiLookup({ ...args, site }, { fallbackSite });
    await putJson(key, result);
    return result;
  };
}

/** Trait-aware voice pick, only for providers whose pool carries tags. */
function pickFishVoice(entry: SpeakerEntry, used: Set<string>): VoiceRef | null {
  if (getProvider().id !== "fish") return null;
  const pool = resolveVoicePool() as FishVoice[];
  // A character must never sound like the narrator.
  const reserved = new Set(used);
  const narratorId = pool[0]?.voiceId;
  if (narratorId) reserved.add(narratorId);
  return matchVoiceByTraits(entry, pool, reserved) ?? null;
}

function toDirectorEntry(member: CastMember): DirectorEntry {
  return {
    name: member.name,
    aliases: member.aliases,
    gender: member.gender,
    ageBand: member.ageBand,
    register: member.register,
    importance: member.importance,
  };
}

/**
 * The whole-chapter casting pass: read the chapter plus the reference and
 * direction, let the Director resolve characters (wiki lookups cached per book),
 * then merge into the append-only cast with trait-aware voices.
 */
export async function runChapterDirector(
  bookId: string,
  idx: number,
  existing: Cast,
  debug?: (message: string) => void | Promise<void>,
): Promise<Cast> {
  const book = await getBook(bookId);
  if (!book) throw new IngestError("Book not found", 404);
  const chapter = book.chapters.find((entry) => entry.idx === idx);

  const text = await getChapterText(bookId, idx);
  const chapterText = (text?.paragraphs ?? [])
    .map((paragraph) => paragraph.text)
    .join("\n\n")
    .slice(0, 80000);
  if (!chapterText) throw new IngestError("Chapter text not found", 404);

  const reference = (await getBookContext(bookId)) ?? undefined;
  const direction = (await getBookDirection(bookId)) ?? undefined;
  const fallbackSite = hostOfReference(reference);

  const entries = await runDirector({
    chapterText,
    chapterTitle: chapter?.title,
    bookTitle: book.title,
    reference,
    direction,
    existing: existing.characters.map(toDirectorEntry),
    fallbackSite,
    sessionId: `${bookId}:director:${idx}`,
    lookup: cachedWikiLookup(bookId, fallbackSite),
    debug: (message) => {
      void debug?.(message);
    },
  });
  if (entries.length === 0) {
    throw new IngestError("Director returned no cast", 502);
  }

  const incoming: SpeakerEntry[] = entries.map((entry) => ({
    name: entry.name,
    aliases: entry.aliases ?? [],
    gender: entry.gender,
    ageBand: entry.ageBand,
    register: entry.register,
    importance: entry.importance,
  }));

  const cast = mergeCast(existing, incoming, resolveVoicePool(), pickFishVoice);
  await putCast(bookId, cast);
  await linkScriptsToCast(bookId, cast);
  return cast;
}

function unitHints(unit: RenderUnit): string[] {
  if (unit.type === "speech") return unit.speakerHint ? [unit.speakerHint] : [];
  return unit.lines.map((line) => line.speakerHint).filter((hint): hint is string => Boolean(hint));
}

/**
 * Collect every speaker hint in the book and merge it into cast.json.
 * Existing characters keep their id and voice; only new names take new voices.
 */
export async function buildBookCast(
  bookId: string,
  options: { pool?: VoiceRef[] } = {},
): Promise<Cast> {
  const book = await getBook(bookId);
  if (!book) throw new IngestError("Book not found", 404);

  const existing = (await getCast(bookId)) ?? undefined;
  const reference = (await getBookContext(bookId)) ?? undefined;

  const hints: string[] = [];
  for (const chapter of book.chapters) {
    const script = await getChapterScript(bookId, chapter.idx);
    if (!script) continue;
    for (const unit of script.units) hints.push(...unitHints(unit));
  }

  const cast = await consolidateCast(hints, {
    sessionId: `${bookId}:cast`,
    pool: options.pool,
    existing,
    reference,
  });
  await putCast(bookId, cast);
  await linkScriptsToCast(bookId, cast);
  return cast;
}

/** Resolve every unit's speaker to a cast member id, in place. */
export async function linkScriptsToCast(bookId: string, cast: Cast): Promise<number> {
  const book = await getBook(bookId);
  if (!book) return 0;

  let linked = 0;
  for (const chapter of book.chapters) {
    const script = await getChapterScript(bookId, chapter.idx);
    if (!script) continue;

    let changed = false;
    for (const unit of script.units) {
      if (unit.type === "speech") {
        const id = unit.speakerHint ? findCastMember(unit.speakerHint, cast)?.id ?? null : null;
        if ((unit.speakerId ?? null) !== id) {
          unit.speakerId = id;
          changed = true;
        }
        if (id) linked++;
      } else {
        for (const line of unit.lines) {
          const id = line.speakerHint ? findCastMember(line.speakerHint, cast)?.id ?? null : null;
          if ((line.speakerId ?? null) !== id) {
            line.speakerId = id;
            changed = true;
          }
          if (id) linked++;
        }
      }
    }

    if (changed) await putChapterScript(bookId, chapter.idx, script);
  }

  return linked;
}

export async function getBookCast(bookId: string): Promise<Cast | null> {
  return getCast(bookId);
}
