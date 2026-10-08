/**
 * Convert-time engine: render one unit to audio, provider-agnostically.
 *
 * A "speech" unit is one voice. A "dialogue" unit is a scene rendered in one
 * Text to Dialogue call. The engine resolves voices, hashes the exact render
 * inputs (including stitching ids), checks the cache, and on a miss calls the
 * provider and stores the bytes plus the request id for the next stitch.
 */

import { createHash } from "node:crypto";

import type { RenderUnit } from "@/lib/ingest/types";
import { audioKey } from "@/lib/storage/keys";
import { objectExists, putObject } from "@/lib/storage/s3";

import { resolveVoice } from "./cast";
import { hasRenderableText } from "@/lib/ingest/text";
import type { TtsProvider } from "./provider";
import { getProvider } from "./providers";
import { TtsError, type Cast, type DialogueInput, type ProviderSettings } from "./types";

export type RenderOptions = {
  provider?: TtsProvider;
  providerId?: string;
  modelId?: string;
  baseSettings?: ProviderSettings;
  previousRequestIds?: string[];
};

export type RenderedUnit = {
  hash: string;
  key: string;
  cached: boolean;
  requestId: string | null;
  characterCost: number | null;
};

type SpeakerRef = { speakerId?: string | null; speakerHint: string | null };

function voiceIdOf(speaker: SpeakerRef, cast: Cast): string {
  return resolveVoice(speaker, cast).voiceId;
}

function unitMaterial(
  unit: RenderUnit,
  cast: Cast,
  model: string,
  settings: ProviderSettings,
  previousRequestIds: string[],
): unknown {
  if (unit.type === "speech") {
    return {
      type: "speech",
      text: unit.text,
      voiceId: voiceIdOf(unit, cast),
      model,
      settings,
      previousRequestIds,
      style: unit.emotion ?? null,
      pace: unit.pace ?? null,
    };
  }
  return {
    type: "dialogue",
    inputs: unit.lines.map((line) => ({
      text: line.text,
      voiceId: voiceIdOf(line, cast),
      style: line.emotion ?? null,
    })),
    model,
    settings,
    previousRequestIds,
  };
}

/** Cache key covers everything that changes the audio, including the stitched context. */
export function unitHash(
  unit: RenderUnit,
  cast: Cast,
  model: string,
  settings: ProviderSettings,
  previousRequestIds: string[] = [],
): string {
  return createHash("sha256")
    .update(JSON.stringify(unitMaterial(unit, cast, model, settings, previousRequestIds)))
    .digest("hex");
}

export async function renderUnit(
  unit: RenderUnit,
  cast: Cast,
  options: RenderOptions = {},
): Promise<RenderedUnit> {
  const provider = options.provider ?? getProvider(options.providerId);
  const model = options.modelId ?? provider.defaultModel;
  const settings = options.baseSettings ?? provider.defaultSettings();
  const previousRequestIds = options.previousRequestIds ?? [];

  const hash = unitHash(unit, cast, model, settings, previousRequestIds);
  const key = audioKey(hash);

  if (await objectExists(key)) {
    return { hash, key, cached: true, requestId: null, characterCost: null };
  }

  let audio;
  if (unit.type === "speech") {
    audio = await provider.synthesize({
      provider: provider.id,
      text: unit.text,
      voice: resolveVoice(unit, cast),
      model,
      settings,
      previousRequestIds,
      style: unit.emotion ?? null,
      pace: unit.pace ?? null,
    });
  } else {
    if (!provider.synthesizeDialogue) {
      throw new TtsError(
        "invalid",
        `${provider.id} has no dialogue endpoint; cannot render a multi-voice scene`,
        { retryable: false },
      );
    }
    const inputs: DialogueInput[] = unit.lines
      .filter((line) => hasRenderableText(line.text))
      .map((line) => ({ text: line.text, voiceId: voiceIdOf(line, cast), style: line.emotion ?? null }));
    if (inputs.length === 0) {
      throw new TtsError("invalid", "Dialogue unit has no renderable lines", { retryable: false });
    }
    audio = await provider.synthesizeDialogue({
      provider: provider.id,
      inputs,
      model,
      settings,
      previousRequestIds,
    });
  }

  await putObject(key, audio.data, audio.contentType);
  return {
    hash,
    key,
    cached: false,
    requestId: audio.requestId ?? null,
    characterCost: audio.characterCost ?? null,
  };
}
