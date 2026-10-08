/**
 * The Fish voice pool for casting.
 *
 * A cast voice is a Fish `reference_id`. The pool itself is generated — see
 * `scripts/build-voice-pool.mjs` — and lives in `./fish-pool`. This module holds
 * the types and the deterministic trait -> voice matcher.
 *
 * Override the whole pool with `FISH_VOICE_IDS="id:Name,id:Name,..."`. The first
 * id is the narrator.
 */

import { FISH_FALLBACK_POOL } from "./fish-pool";
import type { VoiceRef } from "./types";

export { FISH_FALLBACK_POOL };

export type FishGender = "male" | "female" | "neutral" | "machine";
export type FishAgeBand = "child" | "young" | "middle-aged" | "old";

export type FishVoice = VoiceRef & {
  gender?: FishGender;
  ageBand?: FishAgeBand;
  tones?: string[];
};

function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parse `FISH_VOICE_IDS="id:Name,id:Name"`. */
export function parseFishVoiceIds(raw: string): FishVoice[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): FishVoice | null => {
      const [voiceId, name] = entry.split(":").map((part) => part.trim());
      return voiceId ? { voiceId, name: name || voiceId } : null;
    })
    .filter((voice): voice is FishVoice => voice !== null);
}

/** `FISH_VOICE_IDS` override, else the generated fallback pool. */
export function resolveFishVoicePool(): FishVoice[] {
  const raw = process.env.FISH_VOICE_IDS?.trim();
  if (raw) {
    const parsed = parseFishVoiceIds(raw);
    if (parsed.length > 0) return parsed;
  }
  return FISH_FALLBACK_POOL;
}

export type VoiceTraits = {
  gender?: string;
  ageBand?: string;
  register?: string;
};

/**
 * Deterministic trait -> voice match. Exact gender and age beats a tone overlap;
 * ties break by pool order. Unused voices are preferred, but the pool is reused
 * once exhausted so a character is never left voiceless.
 */
export function matchVoiceByTraits(
  traits: VoiceTraits,
  pool: FishVoice[] = FISH_FALLBACK_POOL,
  used: Set<string> = new Set(),
): FishVoice | null {
  const wantGender = normalize(traits.gender);
  const wantAge = normalize(traits.ageBand);
  const wanted = new Set(normalize(traits.register).split(" ").filter((word) => word.length >= 4));

  const unused = pool.filter((voice) => !used.has(voice.voiceId));
  const candidates = unused.length > 0 ? unused : pool;

  let best: FishVoice | null = null;
  let bestScore = -1;
  for (const voice of candidates) {
    let score = 0;
    if (wantGender && voice.gender && normalize(voice.gender) === wantGender) score += 4;
    if (wantAge && voice.ageBand && normalize(voice.ageBand) === wantAge) score += 2;
    for (const tone of voice.tones ?? []) {
      const word = normalize(tone);
      if (word.length >= 4 && wanted.has(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}
