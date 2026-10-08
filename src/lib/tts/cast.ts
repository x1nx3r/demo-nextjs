/**
 * The cast ("voice bible") for a book: one narrator plus recurring characters,
 * each bound to a voice. Casts live next to the book in RustFS.
 *
 * Append-only. Once a character is in the cast it keeps its id and its voice
 * for the whole book. New passes can add characters and add aliases, but never
 * reassign or reorder. That keeps a character's voice stable from first line to
 * last, and survives a "character reveal" (a code name later linked to a real
 * name) because the reveal just becomes an alias.
 *
 * Voice pool size is a decision, not a model limit. Set `CAST_VOICE_IDS`
 * (`id:Name,id:Name,...`) to use your own voices, or fetch the library with
 * `listVoices()` and pass it in.
 */

import { bookCastKey } from "@/lib/storage/keys";

import { getJson, putJson } from "@/lib/store/objects";

import { getProvider } from "./providers";
import type { Cast, CastMember, SpeakerEntry, VoiceRef } from "./types";

/** Built-in fallback pool: all 21 ElevenLabs default voices on the account. */
export const DEFAULT_VOICE_POOL: VoiceRef[] = [
  { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, captivating storyteller (narrator)" },
  { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Playful, bright, warm" },
  { voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "Velvety actress" },
  { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Deep, confident, energetic" },
  { voiceId: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Steady broadcaster" },
  { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Dominant, firm" },
  { voiceId: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Clear, engaging educator" },
  { voiceId: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, resonant and comforting" },
  { voiceId: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", description: "Professional, bright, warm" },
  { voiceId: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", description: "Laid-back, casual, resonant" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Mature, reassuring, confident" },
  { voiceId: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "Enthusiast, quirky attitude" },
  { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Husky trickster" },
  { voiceId: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Relaxed, neutral, informative" },
  { voiceId: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", description: "Fierce warrior" },
  { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Energetic" },
  { voiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Knowledgeable, professional" },
  { voiceId: "bIHbv24MWmeRgasZH58o", name: "Will", description: "Relaxed optimist" },
  { voiceId: "cjVigY5qzO86Huf0OWal", name: "Eric", description: "Smooth, trustworthy" },
  { voiceId: "iP95p4xoKVk53GoZ742B", name: "Chris", description: "Charming, down-to-earth" },
  { voiceId: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Wise, mature, balanced" },
];

export const DEFAULT_NARRATOR: VoiceRef = DEFAULT_VOICE_POOL[0];

/** The active provider's pool, `CAST_VOICE_IDS`, or the ElevenLabs fallback. */
export function resolveVoicePool(): VoiceRef[] {
  const raw = process.env.CAST_VOICE_IDS?.trim();
  if (raw) {
    const parsed = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry): VoiceRef | null => {
        const [voiceId, name] = entry.split(":").map((part) => part.trim());
        return voiceId ? { voiceId, name: name || voiceId } : null;
      })
      .filter((voice): voice is VoiceRef => voice !== null);
    if (parsed.length > 0) return parsed;
  }

  const providerPool = getProvider().voicePool?.();
  if (providerPool && providerPool.length > 0) return providerPool;

  return DEFAULT_VOICE_POOL;
}

/** Character voices exclude the narrator, so a character never sounds like it. */
export function characterVoices(pool: VoiceRef[] = resolveVoicePool()): VoiceRef[] {
  if (pool.length <= 1) return pool;
  return pool.slice(1);
}

export function defaultCast(pool: VoiceRef[] = resolveVoicePool()): Cast {
  return { narrator: pool[0] ?? DEFAULT_NARRATOR, characters: [] };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function getCast(bookId: string): Promise<Cast | null> {
  return getJson<Cast>(bookCastKey(bookId));
}

export async function putCast(bookId: string, cast: Cast): Promise<void> {
  await putJson(bookCastKey(bookId), cast);
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match a hint against members: exact id/name/alias, then a loose containment. */
function matchMember(hint: string, members: CastMember[]): CastMember | null {
  const needle = normalizeName(hint);
  if (!needle) return null;

  for (const member of members) {
    if (member.id === hint.trim() || normalizeName(member.name) === needle) return member;
    if (member.aliases.some((alias) => normalizeName(alias) === needle)) return member;
  }

  for (const member of members) {
    const name = normalizeName(member.name);
    if (name && name.length >= 3 && (needle.includes(name) || name.includes(needle))) {
      return member;
    }
  }

  return null;
}

export function findCastMember(hint: string, cast: Cast): CastMember | null {
  return matchMember(hint, cast.characters);
}

export function findCastMemberById(id: string, cast: Cast): CastMember | null {
  return cast.characters.find((member) => member.id === id) ?? null;
}

/**
 * Map a raw speaker hint to a cast member, or the narrator if nothing matches.
 */
export function resolveSpeaker(hint: string | null | undefined, cast: Cast): VoiceRef {
  if (!hint) return cast.narrator;
  return matchMember(hint, cast.characters) ?? cast.narrator;
}

/** Voice for a chunk: a resolved cast id wins, then the raw hint. */
export function resolveVoice(
  chunk: { speakerId?: string | null; speakerHint: string | null },
  cast: Cast,
): VoiceRef {
  if (chunk.speakerId) {
    const member = findCastMemberById(chunk.speakerId, cast);
    if (member) return member;
  }
  return resolveSpeaker(chunk.speakerHint, cast);
}

/** Next unused character voice; wraps only once the pool is exhausted. */
export function allocateVoice(cast: Cast, pool: VoiceRef[] = resolveVoicePool()): VoiceRef {
  const voices = characterVoices(pool);
  if (voices.length === 0) return pool[0] ?? DEFAULT_NARRATOR;
  const used = new Set(cast.characters.map((member) => member.voiceId));
  return voices.find((voice) => !used.has(voice.voiceId)) ?? voices[cast.characters.length % voices.length];
}

function uniqueId(name: string, members: CastMember[]): string {
  const base = slugify(name) || "character";
  const taken = new Set(members.map((member) => member.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Choose a voice for a newly added character. Return null to fall back to the
 * sequential allocator. The ingest layer passes a trait-aware picker.
 */
export type VoicePicker = (entry: SpeakerEntry, used: Set<string>) => VoiceRef | null;

/**
 * Append-only merge. Existing characters keep their id and voice. Aliases are
 * added; only a genuinely new name consumes a new voice.
 */
export function mergeCast(
  existing: Cast,
  incoming: SpeakerEntry[],
  pool: VoiceRef[] = resolveVoicePool(),
  pick?: VoicePicker,
): Cast {
  const characters = existing.characters.map((member) => ({
    ...member,
    aliases: [...member.aliases],
  }));

  for (const entry of incoming) {
    const name = entry.name.trim();
    if (!name) continue;

    const matched =
      matchMember(name, characters) ??
      entry.aliases.map((alias) => matchMember(alias, characters)).find((m): m is CastMember => Boolean(m)) ??
      null;

    if (matched) {
      const extras = [name, ...entry.aliases].filter(
        (alias) => normalizeName(alias) && normalizeName(alias) !== normalizeName(matched.name),
      );
      matched.aliases = [...new Set([...matched.aliases, ...extras])];
      // Fill traits a later pass learned; never overwrite an existing value.
      matched.gender ??= entry.gender;
      matched.ageBand ??= entry.ageBand;
      matched.register ??= entry.register;
      matched.importance ??= entry.importance;
      continue;
    }

    const used = new Set(characters.map((member) => member.voiceId));
    const voice = pick?.(entry, used) ?? allocateVoice({ ...existing, characters }, pool);
    characters.push({
      id: uniqueId(name, characters),
      name,
      aliases: [...entry.aliases],
      voiceId: voice.voiceId,
      description: voice.description ?? voice.name,
      gender: entry.gender,
      ageBand: entry.ageBand,
      register: entry.register,
      importance: entry.importance,
    });
  }

  return { narrator: existing.narrator, characters };
}
