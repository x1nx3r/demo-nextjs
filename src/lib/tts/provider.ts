/**
 * The TTS provider contract. The engine and cast know nothing about tags,
 * settings or wire formats beyond this interface. Adding an engine (Chatterbox,
 * Piper, a cloud vendor) means writing one of these and registering it.
 *
 * Tags are applied by the planner, not the provider. A provider only needs to
 * render a request and, optionally, a multi-voice dialogue scene.
 */

import type {
  DialogueRenderRequest,
  ProviderAudio,
  ProviderSettings,
  TagCatalogue,
  TtsProviderId,
  TtsRequest,
  VoiceListFilters,
  VoiceRef,
} from "./types";

export interface TtsProvider {
  id: TtsProviderId;
  /** Model id used when a request does not name one. */
  defaultModel: string;
  defaultSettings(): ProviderSettings;
  synthesize(request: TtsRequest, signal?: AbortSignal): Promise<ProviderAudio>;
  /** Multi-voice scene. Absent for providers without a dialogue endpoint. */
  synthesizeDialogue?(
    request: DialogueRenderRequest,
    signal?: AbortSignal,
  ): Promise<ProviderAudio>;
  listVoices?(filters?: VoiceListFilters): Promise<VoiceRef[]>;
  /** Synchronous default pool for casting, when the provider has one. */
  voicePool?(): VoiceRef[];
  /** Bracketed tags the planner should use for this provider. */
  tagCatalogue(): TagCatalogue;
}
