/**
 * Provider registry. `getProvider` resolves the active engine from an explicit
 * id or `TTS_PROVIDER` (default fish). Add a new engine by importing it here and
 * adding it to the map.
 */

import { chatterboxProvider } from "./chatterbox";
import { elevenLabsProvider } from "./elevenlabs";
import { fishProvider } from "./fish";
import type { TtsProvider } from "./provider";
import type { TtsProviderId } from "./types";

const PROVIDERS: Record<TtsProviderId, TtsProvider> = {
  elevenlabs: elevenLabsProvider,
  chatterbox: chatterboxProvider,
  fish: fishProvider,
};

export function getProvider(id?: string | null): TtsProvider {
  const key = (id ?? process.env.TTS_PROVIDER ?? "fish").toLowerCase() as TtsProviderId;
  return PROVIDERS[key] ?? fishProvider;
}

export function listProviders(): TtsProvider[] {
  return Object.values(PROVIDERS);
}
