/**
 * The script planner. One LLM call per coarse chunk turns a passage into render
 * units: single-voice speech, or multi-voice dialogue scenes. It also does the
 * expressive tagging in the same pass (the model rewrites the text with inline
 * tags), so there is no separate tagging stage.
 *
 * Every plan is checked for word coverage: concatenating every unit's text must
 * reproduce the source passage. If it does not, the chunk falls back to one
 * plain narration unit, so the model can never lose or alter words.
 */

import { findCastMember } from "@/lib/tts/cast";
import { getProvider } from "@/lib/tts/providers";
import type { Cast, TagCatalogue } from "@/lib/tts/types";

import type { TextChunk } from "./chunk";
import { chatJson, getIngestModel, isIngestConfigured } from "./llm";
import { planSystemPrompt, planUserPrompt, type CastBrief } from "./prompt";
import type { DialogueLine, DialogueUnit, Pace, PauseAfter, RenderUnit, SpeechUnit } from "./types";
import { hasRenderableText } from "./text";

const MAX_DIALOGUE_CHARS = 1800;
const MAX_DIALOGUE_SPEAKERS = 10;
const TAG_PATTERN = /\[[^\]\n]{1,40}\]/g;

function normalizeWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(TAG_PATTERN, " ");
}

function asPause(value: unknown, fallback: PauseAfter): PauseAfter {
  return value === "none" || value === "short" || value === "long" ? value : fallback;
}

function asPace(value: unknown): Pace | null {
  return value === "slow" || value === "normal" || value === "fast" ? value : null;
}

function asEmotion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-z][a-z '-]{0,30}$/.test(trimmed) ? trimmed : null;
}

function asSpeaker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 60) return null;
  return ["he", "she", "they", "it", "i", "narrator", "the narrator"].includes(trimmed.toLowerCase())
    ? null
    : trimmed;
}

function speakerIdFor(hint: string | null, cast: Cast): string | null {
  return hint ? findCastMember(hint, cast)?.id ?? null : null;
}

function speechUnit(
  text: string,
  speakerHint: string | null,
  cast: Cast,
  emotion: string | null,
  pace: Pace | null,
  pauseAfter: PauseAfter,
): SpeechUnit {
  return {
    id: 0,
    type: "speech",
    text,
    speakerHint,
    speakerId: speakerIdFor(speakerHint, cast),
    emotion,
    pace,
    pauseAfter,
    audio: null,
    requestId: null,
  };
}

function coerceUnit(raw: unknown, cast: Cast): RenderUnit[] {
  if (!raw || typeof raw !== "object") return [];
  const unit = raw as Record<string, unknown>;
  const pauseAfter = asPause(unit.pauseAfter, "none");

  if (unit.type === "dialogue" && Array.isArray(unit.lines)) {
    const lines: DialogueLine[] = [];
    for (const entry of unit.lines) {
      if (!entry || typeof entry !== "object") continue;
      const line = entry as Record<string, unknown>;
      const text = typeof line.text === "string" ? line.text.trim() : "";
      if (!text || !hasRenderableText(text)) continue;
      const speakerHint = asSpeaker(line.speaker);
      lines.push({ text, speakerHint, speakerId: speakerIdFor(speakerHint, cast), emotion: asEmotion(line.emotion) });
    }
    if (lines.length >= 2) {
      return [{ id: 0, type: "dialogue", lines, pauseAfter, audio: null, requestId: null }];
    }
    if (lines.length === 1) {
      return [speechUnit(lines[0].text, lines[0].speakerHint, cast, lines[0].emotion ?? null, null, pauseAfter)];
    }
    return [];
  }

  const text = typeof unit.text === "string" ? unit.text.trim() : "";
  if (!text || !hasRenderableText(text)) return [];
  return [speechUnit(text, asSpeaker(unit.speaker), cast, asEmotion(unit.emotion), asPace(unit.pace), pauseAfter)];
}

/** Enforce the Text to Dialogue caps by splitting scenes at line boundaries. */
function expandUnits(units: RenderUnit[]): RenderUnit[] {
  const out: RenderUnit[] = [];

  for (const unit of units) {
    if (unit.type === "speech") {
      out.push(unit);
      continue;
    }

    let current: DialogueLine[] = [];
    let chars = 0;
    const seen = new Set<string>();

    const flush = (pauseAfter: PauseAfter) => {
      if (current.length >= 2) {
        out.push({ id: 0, type: "dialogue", lines: current, pauseAfter, audio: null, requestId: null });
      } else if (current.length === 1) {
        out.push({
          id: 0,
          type: "speech",
          text: current[0].text,
          speakerHint: current[0].speakerHint,
          speakerId: current[0].speakerId ?? null,
          emotion: null,
          pace: null,
          pauseAfter,
          audio: null,
          requestId: null,
        });
      }
      current = [];
      chars = 0;
      seen.clear();
    };

    for (const line of unit.lines) {
      const adds = line.text.length + 1;
      const newSpeaker = line.speakerHint ? !seen.has(line.speakerHint) : false;
      if (current.length > 0 && (chars + adds > MAX_DIALOGUE_CHARS || (newSpeaker && seen.size >= MAX_DIALOGUE_SPEAKERS))) {
        flush("none");
      }
      current.push(line);
      chars += adds;
      if (line.speakerHint) seen.add(line.speakerHint);
    }
    flush(unit.pauseAfter);
  }

  return out;
}

/**
 * Deterministic grouping: merge a run of consecutive character speech units
 * (two or more distinct speakers) into one dialogue unit, so a scene renders in
 * a single multi-voice take. Narration breaks a run. The planner is not asked to
 * do this reliably; it is done here instead.
 */
function groupDialogue(units: RenderUnit[]): RenderUnit[] {
  const out: RenderUnit[] = [];
  let run: SpeechUnit[] = [];

  const flush = () => {
    const distinct = new Set(run.map((unit) => unit.speakerHint));
    if (run.length >= 2 && distinct.size >= 2) {
      out.push({
        id: 0,
        type: "dialogue",
        lines: run.map((unit) => ({
          text: unit.text,
          speakerHint: unit.speakerHint,
          speakerId: unit.speakerId ?? null,
          emotion: unit.emotion,
        })),
        pauseAfter: run[run.length - 1].pauseAfter,
        audio: null,
        requestId: null,
      });
    } else {
      out.push(...run);
    }
    run = [];
  };

  for (const unit of units) {
    if (unit.type === "speech" && unit.speakerHint) {
      run.push(unit);
    } else {
      flush();
      out.push(unit);
    }
  }
  flush();

  return out;
}

function unitsText(units: RenderUnit[]): string {
  return units
    .map((unit) => (unit.type === "speech" ? unit.text : unit.lines.map((line) => line.text).join(" ")))
    .join(" ");
}

function coverageOk(source: string, units: RenderUnit[]): boolean {
  return normalizeWords(stripTags(unitsText(units))) === normalizeWords(source);
}

export type PlanDebug = (info: {
  chunkIdx: number;
  depth: number;
  chars: number;
  raw: unknown;
  units: RenderUnit[];
  covered: boolean;
  action: "planned" | "split" | "fallback";
}) => void | Promise<void>;

/** Split a passage near the middle at a paragraph or sentence boundary. */
function splitText(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);

  const paragraph = text.lastIndexOf("\n\n", mid);
  if (paragraph > text.length * 0.25) {
    return [text.slice(0, paragraph).trim(), text.slice(paragraph).trim()];
  }

  for (let i = mid; i > text.length * 0.35; i--) {
    if (/[.!?…]/.test(text[i]) && /\s/.test(text[i + 1] ?? " ")) {
      return [text.slice(0, i + 1).trim(), text.slice(i + 1).trim()];
    }
  }

  const space = text.lastIndexOf(" ", mid);
  const cut = space > 0 ? space : mid;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

const MIN_SPLIT_CHARS = 1500;
const MAX_SPLIT_DEPTH = 4;

async function planText(
  text: string,
  cast: Cast,
  context: { sessionId: string; catalogue: TagCatalogue; castBrief: CastBrief[]; chunkIdx: number; signal?: AbortSignal; debug?: PlanDebug },
  depth: number,
): Promise<RenderUnit[]> {
  let raw: unknown = null;
  let planned: RenderUnit[] = [];
  try {
    raw = await chatJson<unknown>(
      [
        { role: "system", content: planSystemPrompt(context.catalogue) },
        { role: "user", content: planUserPrompt(text, context.castBrief) },
      ],
      {
        sessionId: `${context.sessionId}:${context.chunkIdx}:${depth}`,
        signal: context.signal,
        model: getIngestModel(),
        maxTokens: 16000,
        temperature: 0,
        reasoningEffort: process.env.PLANNER_REASONING ?? "none",
      },
    );
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { units?: unknown }).units)
        ? ((raw as { units: unknown[] }).units ?? [])
        : [];
    planned = list.flatMap((entry) => coerceUnit(entry, cast));
  } catch (error) {
    raw = { error: error instanceof Error ? error.message : String(error) };
    planned = [];
  }

  const covered = coverageOk(text, planned);
  const canSplit = depth < MAX_SPLIT_DEPTH && text.length > MIN_SPLIT_CHARS;
  const action: "planned" | "split" | "fallback" = covered ? "planned" : canSplit ? "split" : "fallback";
  await context.debug?.({ chunkIdx: context.chunkIdx, depth, chars: text.length, raw, units: planned, covered, action });
  if (covered) return planned;

  // The model dropped or altered words. Rather than lose every voice in the
  // passage, split it and re-plan the halves, which reproduce far more reliably.
  if (canSplit) {
    const [left, right] = splitText(text);
    const leftUnits = await planText(left, cast, context, depth + 1);
    const rightUnits = await planText(right, cast, context, depth + 1);
    return [...leftUnits, ...rightUnits];
  }

  return [speechUnit(text, null, cast, null, null, "short")];
}

export async function planChapter(
  chunks: TextChunk[],
  cast: Cast,
  options: { sessionId?: string; signal?: AbortSignal; providerId?: string; debug?: PlanDebug } = {},
): Promise<RenderUnit[]> {
  if (!isIngestConfigured()) {
    throw new Error("OPENCODE_API_KEY is not set; cannot plan chunks");
  }

  const catalogue = getProvider(options.providerId).tagCatalogue();
  const castBrief: CastBrief[] = cast.characters.map((member) => ({
    name: member.name,
    register: member.register,
  }));
  const units: RenderUnit[] = [];

  for (const chunk of chunks) {
    const planned = await planText(
      chunk.text,
      cast,
      { sessionId: options.sessionId ?? "plan", catalogue, castBrief, chunkIdx: chunk.idx, signal: options.signal, debug: options.debug },
      0,
    );
    for (const unit of expandUnits(groupDialogue(planned))) {
      unit.id = units.length;
      units.push(unit);
    }
  }

  return units;
}

export type { DialogueUnit };
