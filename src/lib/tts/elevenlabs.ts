/**
 * ElevenLabs provider. Thin, dependency-free REST client for:
 *
 *   - POST /v1/text-to-speech/{voice_id}   one voice, expressive audio tags
 *   - POST /v1/text-to-dialogue            many voices, natural turn-taking
 *
 * Both return a `request-id` header used for previous_request_ids stitching and
 * a `character-cost` header used for metering. Retries cover transient 429/5xx.
 */

import type { TtsProvider } from "./provider";
import {
  TtsError,
  type DialogueRenderRequest,
  type DialogueRequest,
  type ElevenModelId,
  type ProviderAudio,
  type ProviderSettings,
  type SynthesisRequest,
  type TagCatalogue,
  type TtsRequest,
  type VoiceListFilters,
  type VoiceRef,
} from "./types";

const API_BASE = "https://api.elevenlabs.io";
const OUTPUT_FORMAT = "mp3_44100_128";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 600;

export const MODELS = {
  expressive: "eleven_v4",
  expressiveTurbo: "eleven_v4_turbo",
  expressiveV3: "eleven_v3",
  multilingual: "eleven_multilingual_v2",
  flash: "eleven_flash_v2_5",
} as const satisfies Record<string, ElevenModelId>;

export const DEFAULT_MODEL: ElevenModelId = MODELS.expressive;
export const DEFAULT_DIALOGUE_MODEL: ElevenModelId = MODELS.expressive;

export function getApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(getApiKey());
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
  const lower = body.toLowerCase();
  const status = response.status;

  let code: TtsError["code"];
  if (status === 429) code = "rate_limit";
  else if (status === 401 || status === 403) code = lower.includes("quota") ? "quota" : "auth";
  else if (status === 400 || status === 422) code = "invalid";
  else if (status >= 500) code = "server";
  else code = "invalid";

  return new TtsError(code, `ElevenLabs ${status}: ${body.slice(0, 300) || response.statusText}`, {
    status,
    retryable: code === "rate_limit" || code === "server",
  });
}

async function requestAudio(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<ProviderAudio> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TtsError("auth", "ELEVENLABS_API_KEY is not set", { retryable: false });
  }

  let lastError: TtsError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(backoffMs(attempt - 1));

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (cause) {
      lastError = new TtsError("network", "ElevenLabs request failed", { cause });
      continue;
    }

    if (!response.ok) {
      const error = await toTtsError(response);
      if (!error.retryable) throw error;
      lastError = error;
      continue;
    }

    const costHeader = response.headers.get("character-cost");
    const cost = costHeader != null ? Number.parseInt(costHeader, 10) : null;
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "audio/mpeg",
      requestId: response.headers.get("request-id"),
      characterCost: cost != null && Number.isFinite(cost) ? cost : null,
    };
  }

  throw lastError ?? new TtsError("server", "ElevenLabs request failed after retries");
}

/** Raw single-voice call. */
export async function synthesizeSpeech(
  request: SynthesisRequest,
  signal?: AbortSignal,
): Promise<ProviderAudio> {
  const body: Record<string, unknown> = {
    text: request.text,
    model_id: request.modelId ?? DEFAULT_MODEL,
  };
  if (request.voiceSettings) {
    body.voice_settings = {
      stability: request.voiceSettings.stability,
      similarity_boost: request.voiceSettings.similarityBoost,
    };
  }
  if (request.previousText) body.previous_text = request.previousText.slice(-500);
  if (request.nextText) body.next_text = request.nextText.slice(0, 500);
  if (request.previousRequestIds?.length) {
    body.previous_request_ids = request.previousRequestIds.slice(-3);
  }
  if (request.seed != null) body.seed = request.seed;

  return requestAudio(
    `/v1/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=${OUTPUT_FORMAT}`,
    body,
    signal,
  );
}

/** Raw multi-voice dialogue call. */
export async function synthesizeDialogue(
  request: DialogueRequest,
  signal?: AbortSignal,
): Promise<ProviderAudio> {
  const body: Record<string, unknown> = {
    inputs: request.inputs.map((input) => ({ text: input.text, voice_id: input.voiceId })),
    model_id: request.modelId ?? DEFAULT_DIALOGUE_MODEL,
  };
  if (request.stability != null) body.settings = { stability: request.stability };
  if (request.previousRequestIds?.length) {
    body.previous_request_ids = request.previousRequestIds.slice(-3);
  }

  return requestAudio(`/v1/text-to-dialogue?output_format=${OUTPUT_FORMAT}`, body, signal);
}

export type { VoiceListFilters };

type VoiceListResponse = {
  voices?: {
    voice_id?: string;
    name?: string;
    description?: string | null;
    category?: string;
  }[];
  has_more?: boolean;
  next_page_token?: string | null;
};

export async function listVoices(
  filters: VoiceListFilters = {},
  signal?: AbortSignal,
): Promise<VoiceRef[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TtsError("auth", "ELEVENLABS_API_KEY is not set", { retryable: false });
  }

  const pageSize = Math.min(filters.pageSize ?? 100, 100);
  const maxPages = filters.maxPages ?? 5;
  const collected: VoiceRef[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({ page_size: String(pageSize) });
    if (filters.search) query.set("search", filters.search);
    if (filters.gender) query.set("gender", filters.gender);
    if (filters.category) query.set("category", filters.category);
    if (filters.highQuality) query.set("high_quality", "true");
    for (const useCase of filters.useCases ?? []) query.append("use_cases", useCase);
    for (const language of filters.language ?? []) query.append("language", language);
    if (pageToken) query.set("next_page_token", pageToken);

    const response = await fetch(`${API_BASE}/v2/voices?${query.toString()}`, {
      headers: { "xi-api-key": apiKey },
      signal,
    });
    if (!response.ok) throw await toTtsError(response);

    const payload = (await response.json()) as VoiceListResponse;
    for (const voice of payload.voices ?? []) {
      if (voice.voice_id) {
        collected.push({
          voiceId: voice.voice_id,
          name: voice.name ?? voice.voice_id,
          description: voice.description ?? voice.category ?? undefined,
        });
      }
    }

    if (!payload.has_more || !payload.next_page_token) break;
    pageToken = payload.next_page_token;
  }

  return collected;
}

/** Curated voice/delivery tags. Sound effects are omitted on purpose. */
export const ELEVEN_TAG_CATALOGUE: TagCatalogue = {
  mood: [
    "[happy]", "[sad]", "[excited]", "[angry]", "[annoyed]", "[appalled]",
    "[thoughtful]", "[surprised]", "[curious]", "[sarcastic]", "[mischievously]",
    "[wry]", "[nervous]", "[weary]", "[resigned]",
  ],
  delivery: [
    "[whispers]", "[shouts]", "[quietly]", "[trembling]", "[measured pace]",
    "[building tension]", "[low, gravelly voice]", "[warm, intimate]",
    "[steady, commanding]", "[softening]",
  ],
  nonVerbal: [
    "[sighs]", "[exhales]", "[laughs]", "[chuckles]", "[giggles]", "[crying]",
    "[snorts]", "[clears throat]", "[short pause]", "[long pause]",
  ],
  guidance: [
    "- Tags describe the VOICE only. Do NOT add sound effects, music or ambient sounds such as [gunshot], [applause] or [thunder].",
    "- Place each tag immediately before the words it affects, or just after the line it colours.",
    "- Use 0 to 3 tags per line, only where the text truly calls for it.",
  ],
};

const ELEVEN_DEFAULT_SETTINGS = (): ProviderSettings => ({
  stability: 0.5,
  similarityBoost: 0.75,
});

/** ElevenLabs provider. The engine talks to this, never to the REST calls. */
export const elevenLabsProvider: TtsProvider = {
  id: "elevenlabs",
  defaultModel: DEFAULT_MODEL,
  defaultSettings: ELEVEN_DEFAULT_SETTINGS,

  async synthesize(request: TtsRequest, signal?: AbortSignal): Promise<ProviderAudio> {
    const settings = request.settings as { stability?: number; similarityBoost?: number };
    return synthesizeSpeech(
      {
        text: request.text,
        voiceId: request.voice.voiceId,
        modelId: request.model as ElevenModelId,
        voiceSettings: {
          stability: settings.stability ?? 0.5,
          similarityBoost: settings.similarityBoost ?? 0.75,
        },
        previousRequestIds: request.previousRequestIds,
      },
      signal,
    );
  },

  async synthesizeDialogue(request: DialogueRenderRequest, signal?: AbortSignal): Promise<ProviderAudio> {
    const settings = request.settings as { stability?: number };
    return synthesizeDialogue(
      {
        inputs: request.inputs,
        modelId: request.model as ElevenModelId,
        stability: settings.stability,
        previousRequestIds: request.previousRequestIds,
      },
      signal,
    );
  },

  listVoices,

  tagCatalogue() {
    return ELEVEN_TAG_CATALOGUE;
  },
};
