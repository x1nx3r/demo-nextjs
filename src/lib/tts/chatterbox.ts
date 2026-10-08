/**
 * Chatterbox provider (self-hosted).
 *
 * Implements the same contract as ElevenLabs. Set `TTS_PROVIDER=chatterbox` and
 * `CHATTERBOX_URL` to your server (a FastAPI/Modal wrapper around
 * `ChatterboxTurboTTS`).
 *
 * Differences the planner hides by using this provider's tag catalogue: its
 * tags are vocal reactions ([laugh], [sigh]) not delivery directions, and its
 * emotional control is the `exaggeration` scalar. Nano is the CPU model, Turbo
 * the GPU one.
 *
 * Server contract (`POST {CHATTERBOX_URL}/tts`):
 *   request  { text, reference, model, exaggeration, cfg_weight }
 *   response audio/wav bytes
 */

import type { TtsProvider } from "./provider";
import { TtsError, type ProviderAudio, type ProviderSettings, type TagCatalogue, type TtsRequest } from "./types";

export const CHATTERBOX_TAG_CATALOGUE: TagCatalogue = {
  mood: ["[happy]", "[sad]", "[surprised]", "[sarcastic]", "[narration]"],
  delivery: [],
  nonVerbal: [
    "[laugh]", "[chuckle]", "[sigh]", "[gasp]", "[cough]",
    "[clear throat]", "[sniff]", "[groan]", "[shush]",
  ],
  guidance: [
    "- Chatterbox tags are vocal reactions, not delivery directions. Use only the tags listed.",
    "- Emotional intensity is a separate setting, so do not try to encode emotion in a tag.",
    "- Use at most one or two tags per line; overuse sounds theatrical.",
  ],
};

function defaultSettings(): ProviderSettings {
  return { exaggeration: 0.5, cfgWeight: 0.5 };
}

async function synthesize(request: TtsRequest, signal?: AbortSignal): Promise<ProviderAudio> {
  const base = process.env.CHATTERBOX_URL?.replace(/\/$/, "");
  if (!base) {
    throw new TtsError("auth", "CHATTERBOX_URL is not set", { retryable: false });
  }

  const settings = request.settings as { exaggeration?: number; cfgWeight?: number };
  const response = await fetch(`${base}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      reference: request.voice.ref ?? request.voice.voiceId,
      model: request.model,
      exaggeration: settings.exaggeration ?? 0.5,
      cfg_weight: settings.cfgWeight ?? 0.5,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new TtsError(response.status >= 500 ? "server" : "invalid", `Chatterbox ${response.status}: ${detail}`, {
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/wav",
    requestId: response.headers.get("request-id"),
    characterCost: null,
  };
}

export const chatterboxProvider: TtsProvider = {
  id: "chatterbox",
  defaultModel: process.env.CHATTERBOX_MODEL ?? "chatterbox-nano",
  defaultSettings,
  synthesize,
  // No dialogue endpoint: scenes render line by line via single-voice calls.
  tagCatalogue() {
    return CHATTERBOX_TAG_CATALOGUE;
  },
};
