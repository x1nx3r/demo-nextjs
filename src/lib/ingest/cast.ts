/**
 * Book-level cast consolidation. Raw speaker hints come from the planner; this
 * pass merges aliases into canonical characters, using an optional pasted
 * reference (names, aliases, call signs) to resolve identities, and binds each
 * to a voice.
 *
 * Append-only: `mergeCast` preserves every existing character's id and voice.
 * New passes can only add characters and aliases.
 */

import { defaultCast, mergeCast, resolveVoicePool } from "@/lib/tts/cast";
import type { Cast, SpeakerEntry, VoiceRef } from "@/lib/tts/types";

import { chatJson, isIngestConfigured } from "./llm";
import { castSystemPrompt, castUserPrompt } from "./prompt";

const MAX_NEW_CHARACTERS = Number.parseInt(process.env.MAX_CAST_CHARACTERS ?? "24", 10) || 24;
/** A brand-new character needs this many mentions, or to appear in `reference`. */
const MIN_MENTIONS = 3;

export type ConsolidateOptions = {
  sessionId?: string;
  /** Voice pool to bind new characters to. Defaults to CAST_VOICE_IDS or fallback. */
  pool?: VoiceRef[];
  /** The cast built so far. Existing entries are preserved. */
  existing?: Cast;
  /** Pasted character reference (names, aliases, call signs). */
  reference?: string;
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function heuristicSpeakers(hints: string[]): SpeakerEntry[] {
  const unique = [...new Set(hints.map((hint) => hint.trim()).filter(Boolean))];
  return unique.map((name) => ({ name, aliases: [] }));
}

async function consolidateSpeakers(
  hints: string[],
  existing: Cast,
  sessionId?: string,
  reference?: string,
): Promise<SpeakerEntry[]> {
  const speakers = hints.map((hint) => hint.trim()).filter(Boolean);
  if (speakers.length === 0) return [];
  if (!isIngestConfigured()) return heuristicSpeakers(speakers);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chatJson<{ characters?: { name?: unknown; aliases?: unknown }[] }>(
        [
          { role: "system", content: castSystemPrompt() },
          { role: "user", content: castUserPrompt(speakers, existing, reference) },
        ],
        { sessionId, maxTokens: 2500, reasoningEffort: "none" },
      );

      return (result.characters ?? [])
        .filter((entry) => typeof entry?.name === "string" && entry.name.trim() !== "")
        .map((entry) => ({
          name: String(entry.name),
          aliases: Array.isArray(entry.aliases)
            ? entry.aliases.filter((alias): alias is string => typeof alias === "string")
            : [],
        }));
    } catch (error) {
      lastError = error;
    }
  }

  // Do not invent characters on failure: the cast is append-only, so a bad merge
  // is permanent. Keep the existing cast.
  void lastError;
  return [];
}

export async function consolidateCast(
  hints: string[],
  options: ConsolidateOptions = {},
): Promise<Cast> {
  const pool = options.pool && options.pool.length > 0 ? options.pool : resolveVoicePool();
  const existing = options.existing ?? defaultCast(pool);
  const reference = options.reference;

  const speakers = hints.map((hint) => hint.trim()).filter(Boolean);
  const proposed = await consolidateSpeakers(speakers, existing, options.sessionId, reference);

  // Mention counts and reference text decide who earns a dedicated voice.
  const freq = new Map<string, number>();
  for (const hint of speakers) {
    const key = norm(hint);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const refText = reference ? norm(reference) : "";
  const existingNames = new Set(existing.characters.map((member) => norm(member.name)));

  const kept = proposed.filter((entry) => {
    const names = [entry.name, ...entry.aliases].map(norm).filter(Boolean);
    if (names.some((name) => existingNames.has(name))) return true;
    if (refText && names.some((name) => name.length >= 3 && refText.includes(name))) return true;
    return names.reduce((best, name) => Math.max(best, freq.get(name) ?? 0), 0) >= MIN_MENTIONS;
  });

  return mergeCast(existing, kept.slice(0, MAX_NEW_CHARACTERS), pool);
}
