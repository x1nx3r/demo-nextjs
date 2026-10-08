/**
 * Text hygiene for the TTS providers.
 *
 * ElevenLabs treats angle-bracket runs as *speaker tags* and removes them before
 * synthesis. A line like `<System Start>` therefore becomes empty and the
 * request is rejected. We unwrap those to their inner words ("System Start")
 * before planning, and check that a unit still has something to say.
 */

const AUDIO_TAG = /\[[^\]\n]{1,40}\]/g;
const SPEAKER_TAG = /<([^<>\n]*)>/g;
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Replace `<System Start>` with `System Start`; collapse the spaces. */
export function normalizeSource(text: string): string {
  return text
    .replace(SPEAKER_TAG, " $1 ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Strip audio tags, speaker tags and emoji; what remains must be non-empty. */
export function stripTags(text: string): string {
  return text.replace(AUDIO_TAG, " ").replace(SPEAKER_TAG, " ");
}

export function hasRenderableText(text: string): boolean {
  return stripTags(text).replace(EMOJI, " ").replace(/\s+/g, "").length > 0;
}
