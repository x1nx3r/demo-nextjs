/**
 * Fish Audio provider (direct API).
 *
 *   POST https://api.fish.audio/v1/tts   one voice, or a multi-voice dialogue
 *   GET  https://api.fish.audio/model    the voice library / your own models
 *
 * Model selection is a request header. The free developer model is
 * `s2.1-pro-free`; it is the same model as paid `s2.1-pro` at $0, under a Fair
 * Use Policy, with no SLA and no data-retention guarantee.
 *
 * Expression uses `[bracket]` cues inline in the text (S2 syntax), including
 * free-form natural language. Multi-speaker dialogue uses `<|speaker:N|>`
 * markers in the text and a `reference_id` array, one voice id per speaker.
 *
 * Fish has no cross-request stitch id, so `requestId` is always null. Long text
 * stays consistent inside one request via `condition_on_previous_chunks`.
 */

import type { TtsProvider } from "./provider";
import { resolveFishVoicePool } from "./fish-voices";
import {
  TtsError,
  type DialogueRenderRequest,
  type ProviderAudio,
  type ProviderSettings,
  type TagCatalogue,
  type TtsRequest,
  type VoiceListFilters,
  type VoiceRef,
} from "./types";

const API_BASE = "https://api.fish.audio";
const DEFAULT_MODEL = "s2.1-pro-free";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 600;

/** Fish voice ids (library or clone) are 32 hex characters. */
const FISH_VOICE_ID = /^[a-f0-9]{32}$/i;

export function getApiKey(): string | null {
  return process.env.FISH_API_KEY ?? null;
}

export function isFishConfigured(): boolean {
  return Boolean(getApiKey());
}

export function getDefaultModel(): string {
  return process.env.FISH_MODEL ?? DEFAULT_MODEL;
}

/** True when a cast voice is a real Fish id, not a leftover ElevenLabs id. */
export function isFishVoiceId(value: string | null | undefined): value is string {
  return typeof value === "string" && FISH_VOICE_ID.test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * BASE_BACKOFF_MS, 8000);
}

async function toTtsError(response: Response): Promise<TtsError> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // best-effort diagnostics
  }
  const status = response.status;
  const lower = body.toLowerCase();

  let code: TtsError["code"];
  if (status === 429) code = "rate_limit";
  else if (status === 402) code = "quota";
  else if (status === 401 || status === 403) code = lower.includes("quota") ? "quota" : "auth";
  else if (status === 400 || status === 422) code = "invalid";
  else if (status >= 500) code = "server";
  else code = "invalid";

  return new TtsError(code, `Fish ${status}: ${body.slice(0, 300) || response.statusText}`, {
    status,
    retryable: code === "rate_limit" || code === "server",
  });
}

type TtsPayload = {
  text: string;
  referenceId?: string | string[];
  settings: ProviderSettings;
  model: string;
  style?: string | null;
  pace?: "slow" | "normal" | "fast" | null;
};

/** Relative pace hint -> prosody speed. */
const PACE_SPEED: Record<"slow" | "normal" | "fast", number> = {
  slow: 0.92,
  normal: 1,
  fast: 1.1,
};

async function requestTts(payload: TtsPayload, signal?: AbortSignal): Promise<ProviderAudio> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TtsError("auth", "FISH_API_KEY is not set", { retryable: false });
  }

  const settings = payload.settings as { temperature?: number; topP?: number; speed?: number };
  const speed = payload.pace ? PACE_SPEED[payload.pace] : (settings.speed ?? 1);
  // If the planner left a unit untagged, fall back to the emotion it reported.
  const text =
    payload.style && !payload.text.includes("[")
      ? `[${payload.style}] ${payload.text}`
      : payload.text;

  const body: Record<string, unknown> = {
    text,
    format: "mp3",
    mp3_bitrate: 128,
    temperature: settings.temperature ?? 0.7,
    top_p: settings.topP ?? 0.7,
    prosody: { speed, volume: 0, normalize_loudness: true },
    chunk_length: 300,
    normalize: true,
    latency: process.env.FISH_LATENCY ?? "normal",
    condition_on_previous_chunks: true,
  };
  if (payload.referenceId != null) body.reference_id = payload.referenceId;

  let lastError: TtsError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(backoffMs(attempt - 1));

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/v1/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: payload.model,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      lastError = new TtsError("network", "Fish request failed", { cause });
      continue;
    }

    if (!response.ok) {
      const error = await toTtsError(response);
      if (!error.retryable) throw error;
      lastError = error;
      continue;
    }

    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "audio/mpeg",
      requestId: null,
      characterCost: null,
    };
  }

  throw lastError ?? new TtsError("server", "Fish request failed after retries");
}

async function synthesize(request: TtsRequest, signal?: AbortSignal): Promise<ProviderAudio> {
  const raw = request.voice.ref ?? request.voice.voiceId;
  // Until the cast is bound to Fish ids, tolerate a stale ElevenLabs id and fall
  // back to Fish's default voice rather than fail the render.
  const referenceId = isFishVoiceId(raw) ? raw : undefined;
  return requestTts(
    {
      text: request.text,
      referenceId,
      settings: request.settings,
      model: request.model,
      style: request.style ?? null,
      pace: request.pace ?? null,
    },
    signal,
  );
}

async function synthesizeDialogue(
  request: DialogueRenderRequest,
  signal?: AbortSignal,
): Promise<ProviderAudio> {
  const ids = request.inputs.map((input) => input.voiceId);
  const distinct = [...new Set(ids)];
  if (distinct.length === 0 || !distinct.every(isFishVoiceId)) {
    throw new TtsError("invalid", "Fish dialogue needs a Fish voice id for every speaker", {
      retryable: false,
    });
  }

  const index = new Map(distinct.map((id, i) => [id, i]));
  const text = request.inputs
    .map((input) => {
      const line =
        input.style && !input.text.includes("[") ? `[${input.style}] ${input.text}` : input.text;
      return `<|speaker:${index.get(input.voiceId)}|>${line}`;
    })
    .join("");

  return requestTts(
    { text, referenceId: distinct, settings: request.settings, model: request.model },
    signal,
  );
}

type FishModel = {
  _id?: string;
  title?: string;
  description?: string | null;
  tags?: string[] | null;
};

/** List library voices (or your own with `self`). */
export async function listVoices(
  filters: VoiceListFilters = {},
  signal?: AbortSignal,
): Promise<VoiceRef[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TtsError("auth", "FISH_API_KEY is not set", { retryable: false });
  }

  const pageSize = Math.min(filters.pageSize ?? 40, 100);
  const maxPages = filters.maxPages ?? 2;
  const collected: VoiceRef[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const query = new URLSearchParams({
      page_size: String(pageSize),
      page_number: String(page),
    });
    if (filters.search) query.set("title", filters.search);
    if (filters.language?.[0]) query.set("language", filters.language[0]);

    const response = await fetch(`${API_BASE}/model?${query.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!response.ok) throw await toTtsError(response);

    const payload = (await response.json()) as { items?: FishModel[] };
    const items = payload.items ?? [];
    for (const item of items) {
      if (!item._id) continue;
      collected.push({
        voiceId: item._id,
        name: item.title ?? item._id,
        description: item.description ?? (item.tags?.join(", ") || undefined),
        provider: "fish",
      });
    }
    if (items.length < pageSize) break;
  }

  return collected;
}

/**
 * Fish S2 expression cues. S2 uses square brackets and accepts free-form natural
 * language, so this list is a starting set, not a ceiling.
 */
export const FISH_TAG_CATALOGUE: TagCatalogue = {
  mood: [
    "[happy]", "[sad]", "[angry]", "[calm]", "[nervous]", "[confident]",
    "[surprised]", "[satisfied]", "[delighted]", "[scared]", "[worried]",
    "[frustrated]", "[empathetic]", "[proud]", "[grateful]", "[curious]",
    "[sarcastic]", "[disdainful]", "[anxious]", "[uncertain]", "[confused]",
    "[disappointed]", "[regretful]", "[hopeful]", "[nostalgic]", "[lonely]",
    "[bored]", "[sympathetic]", "[compassionate]", "[determined]", "[resigned]",
    "[somber]", "[gloomy]", "[weary]", "[relieved]", "[amused]",
  ],
  delivery: [
    "[whispering]", "[shouting]", "[screaming]", "[soft tone]", "[emphasis]",
    "[in a hurry tone]", "[measured pace]", "[warm and happy]",
    "[slightly sad]", "[very excited]", "[low and menacing]",
    "[gentle and reassuring]",
  ],
  nonVerbal: [
    "[laughing]", "[chuckling]", "[sobbing]", "[crying loudly]", "[sighing]",
    "[groaning]", "[panting]", "[gasping]", "[yawning]", "[clear throat]",
    "[break]", "[long-break]",
  ],
  guidance: [
    "- S2 accepts free-form natural language in square brackets; use a short one when the fixed list does not fit.",
    "- Put a sentence emotion cue at the start of the sentence. Use at most three cues per sentence, combined when needed (e.g. [sad][whispering]).",
    "- Place [emphasis] immediately before the word or phrase you want to stress.",
    "- Use [break] and [long-break] for pauses inside a unit instead of empty text.",
    "- Tags describe the VOICE only. Do NOT add sound effects, music or ambience such as [gunshot], [thunder] or [applause].",
  ],
};

function defaultSettings(): ProviderSettings {
  return { temperature: 0.7, topP: 0.7, speed: 1 };
}

/** Fish Audio provider. The engine talks to this, never to the REST calls. */
export const fishProvider: TtsProvider = {
  id: "fish",
  defaultModel: getDefaultModel(),
  defaultSettings,
  synthesize,
  synthesizeDialogue,
  listVoices,
  voicePool: resolveFishVoicePool,
  tagCatalogue() {
    return FISH_TAG_CATALOGUE;
  },
};
