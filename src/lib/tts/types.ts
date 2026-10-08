/**
 * TTS domain types: voices, cast, settings and provider I/O.
 *
 * Settings are deliberately close to Eleven v4, which exposes only Stability
 * and Similarity. Older models add Style/Speed; add fields back per model when
 * a provider needs them.
 */

/** A voice the provider can render. */
export type VoiceRef = {
  voiceId: string;
  name: string;
  description?: string;
  /** Which provider this voice belongs to. */
  provider?: TtsProviderId;
  /** Provider-specific handle, e.g. a Chatterbox reference-audio object key. */
  ref?: string;
  /** Public URL of the voice's own sample, for auditioning without synthesis. */
  sample?: string;
};

/** A recurring character bound to a voice and a set of aliases. */
export type CastMember = VoiceRef & {
  id: string;
  aliases: string[];
  /** Casting traits from the Director, kept for re-design and the UI. */
  gender?: string;
  ageBand?: string;
  register?: string;
  importance?: string;
};

/** One character proposed by the cast consolidation pass. */
export type SpeakerEntry = {
  name: string;
  aliases: string[];
  gender?: string;
  ageBand?: string;
  register?: string;
  importance?: string;
};

export type Cast = {
  narrator: VoiceRef;
  characters: CastMember[];
};

/** Eleven v4 voice settings. Only Stability and Similarity apply. */
export type VoiceSettings = {
  stability: number;
  similarityBoost: number;
};

export type ElevenModelId =
  | "eleven_v4"
  | "eleven_v4_turbo"
  | "eleven_v3"
  | "eleven_multilingual_v2"
  | "eleven_flash_v2_5";

/** Speech engines the pipeline can render with. */
export type TtsProviderId = "elevenlabs" | "chatterbox" | "fish";

/** Opaque, provider-specific render settings. Hashed as JSON for the cache. */
export type ProviderSettings = Record<string, unknown>;

export type DialogueInput = {
  text: string;
  voiceId: string;
  /** Per-line delivery cue; the provider turns it into an inline tag. */
  style?: string | null;
};

/** A single-voice render request. */
export type TtsRequest = {
  provider: TtsProviderId;
  text: string;
  voice: VoiceRef;
  model: string;
  settings: ProviderSettings;
  /** Up to 3 prior request ids, for prosodic continuity (stitching). */
  previousRequestIds?: string[];
  /** Free-form delivery style/emotion for this unit; the provider maps it. */
  style?: string | null;
  /** Relative pace hint; the provider maps it to its own tempo control. */
  pace?: "slow" | "normal" | "fast" | null;
};

/** A multi-voice scene render request (Text to Dialogue). */
export type DialogueRenderRequest = {
  provider: TtsProviderId;
  inputs: DialogueInput[];
  model: string;
  settings: ProviderSettings;
  previousRequestIds?: string[];
};

/** Raw provider result, including headers we use for stitching and metering. */
export type ProviderAudio = {
  data: Uint8Array;
  contentType: string;
  /** ElevenLabs request-id, used for previous_request_ids stitching. */
  requestId?: string | null;
  /**
   * Provider-reported cost from the `character-cost` header. Unit is
   * provider-defined (it is not the character count), so treat it as
   * informational; we bill our own character counts.
   */
  characterCost?: number | null;
};

/** Raw single-voice call to the ElevenLabs client. */
export type SynthesisRequest = {
  text: string;
  voiceId: string;
  modelId?: ElevenModelId;
  voiceSettings?: VoiceSettings;
  previousText?: string;
  nextText?: string;
  previousRequestIds?: string[];
  seed?: number;
};

/** Raw Text to Dialogue call to the ElevenLabs client. */
export type DialogueRequest = {
  inputs: DialogueInput[];
  modelId?: ElevenModelId;
  stability?: number;
  previousRequestIds?: string[];
};

/** Bracketed tags a provider understands, grouped for the planner prompt. */
export type TagCatalogue = {
  mood: string[];
  delivery: string[];
  nonVerbal: string[];
  guidance?: string[];
};

export type VoiceListFilters = {
  search?: string;
  useCases?: string[];
  language?: string[];
  gender?: string;
  category?: string;
  highQuality?: boolean;
  pageSize?: number;
  maxPages?: number;
};

export type TtsErrorCode =
  | "auth"
  | "quota"
  | "rate_limit"
  | "invalid"
  | "server"
  | "network";

export class TtsError extends Error {
  readonly code: TtsErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: TtsErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "TtsError";
    this.code = code;
    this.status = options.status;
    this.retryable =
      options.retryable ??
      (code === "rate_limit" || code === "server" || code === "network");
  }
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof TtsError && error.code === "quota";
}
