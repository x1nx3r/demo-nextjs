/**
 * Script types for the ingest -> convert -> play pipeline.
 *
 * The chunker is now coarse (10,000-char planning units). An LLM "planner"
 * reads each unit and emits render units: single-voice speech, or multi-voice
 * dialogue scenes rendered through Text to Dialogue. So a render unit — not a
 * mechanical chunk — is what the player plays and the cache stores.
 */

export type PauseAfter = "none" | "short" | "long";

/** Relative speaking rate for a unit. */
export type Pace = "slow" | "normal" | "fast";

/** Silence inserted between render units at playback, in seconds. */
export const PAUSE_SECONDS: Record<PauseAfter, number> = {
  none: 0,
  short: 0.35,
  long: 0.9,
};

export type DialogueLine = {
  text: string;
  speakerHint: string | null;
  /** Resolved cast member id, or null for narrator/unresolved. */
  speakerId?: string | null;
  /** Per-line delivery cue; the provider turns it into an inline tag. */
  emotion?: string | null;
};

/** One voice, up to the model's single-voice limit. */
export type SpeechUnit = {
  id: number;
  type: "speech";
  text: string;
  speakerHint: string | null;
  speakerId?: string | null;
  emotion: string | null;
  /** Relative speaking rate; the provider maps it to a tempo control. */
  pace?: Pace | null;
  pauseAfter: PauseAfter;
  /** Content hash of the rendered audio, or null until synthesized. */
  audio: string | null;
  /** Provider request id, used to stitch the next unit for continuity. */
  requestId?: string | null;
};

/** A conversation: many voices, one Text to Dialogue call. */
export type DialogueUnit = {
  id: number;
  type: "dialogue";
  lines: DialogueLine[];
  pauseAfter: PauseAfter;
  audio: string | null;
  requestId?: string | null;
};

export type RenderUnit = SpeechUnit | DialogueUnit;

export type ChapterScript = {
  idx: number;
  units: RenderUnit[];
};
