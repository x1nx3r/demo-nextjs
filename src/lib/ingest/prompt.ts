/**
 * Prompts for the ingest LLM calls: the script planner (splitting + directing in
 * one pass) and the book-level cast consolidation.
 */

import type { Cast, TagCatalogue } from "@/lib/tts/types";

/** A speaker as the planner sees them: a name and how they speak. */
export type CastBrief = { name: string; register?: string };

function catalogueText(catalogue: TagCatalogue): string {
  return [
    `Mood: ${catalogue.mood.join(" ")}`,
    `Delivery: ${catalogue.delivery.join(" ")}`,
    `Non-verbal: ${catalogue.nonVerbal.join(" ")}`,
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

export function planSystemPrompt(catalogue: TagCatalogue): string {
  return [
    "You are the script planner and voice director for an audiobook. You split a passage into render units for a text-to-speech engine, and you direct the performance with inline audio cues.",
    "Input JSON has two fields: cast (known speakers, each with a name and an established register) and text (a passage).",
    'Return ONLY a JSON object of the form {"units": [ ... ]}.',
    "",
    "Each unit is one of:",
    '- { "type": "speech", "speaker": string|null, "emotion": string|null, "pace": "slow"|"normal"|"fast"|null, "pauseAfter": "none"|"short"|"long", "text": string }',
    "    One speaker (or the narrator when speaker is null) reads this text in a single voice.",
    '- { "type": "dialogue", "pauseAfter": "none"|"short"|"long", "lines": [ { "speaker": string, "text": string, "emotion": string|null }, ... ] }',
    "    A back-and-forth exchange rendered in one multi-voice take.",
    "",
    "Reproduce the words EXACTLY:",
    "- Concatenating every unit's text in order must reproduce the passage in full. Never paraphrase, translate, summarize, abridge, add, reorder or drop words.",
    "- You MAY insert bracketed audio cues and change punctuation for emphasis (add ? ! … or capitalise a word).",
    "",
    "Direction — this is the point, not decoration:",
    "- Every unit that carries any feeling, action or tension MUST include at least one bracketed cue. A flat read is a failure.",
    "- Place a cue immediately BEFORE the words it colours. A cue changes the delivery from that point on, so tag MID-SENTENCE where the voice shifts, not only at the start.",
    '- Mid-sentence shifts, e.g. "I told you [whispers] to leave." and "[calm] He opened the door. [worried] The room was empty."',
    "- A sentence's primary emotion often reads best at the start of the clause it colours; [emphasis], tone and non-verbal cues can go anywhere.",
    "- Combine up to three cues when they fit, e.g. [sad][whispering].",
    "- Place [emphasis] immediately before the word or phrase you want stressed.",
    "- Use [break] or [long-break] for a pause inside a unit.",
    "- Prefer a cue from the catalogue; when none fits, use a short free-form one in brackets, e.g. [warm and reassuring].",
    "- Keep each character's cues consistent with their register in `cast`. The narrator (speaker null) has no register.",
    "",
    "Audio-cue catalogue:",
    catalogueText(catalogue),
    ...(catalogue.guidance ?? []),
    "",
    "Per unit:",
    "- emotion: one or two lowercase words for the unit's feeling, or null (speech units only).",
    '- pace: "slow" | "normal" | "fast" — the speaking rate (speech units only). Use slow for grief, dread and weight; fast for panic and urgency.',
    "- pauseAfter: the silence to leave after the unit.",
    "",
    "Structure:",
    '- When two or more consecutive lines are spoken by different characters, group them into ONE "dialogue" unit. Each line carries its own "emotion", so no per-line speech units are needed. Keep a dialogue unit under 1800 characters and at most 10 distinct speakers.',
    '- Narration, description, headings and lone lines go in "speech" units. Use "speech" with speaker null for narration.',
    "- speaker: the speaking character's name. Prefer an exact name from cast when it matches; otherwise the name or short alias as it appears in the text. Use null ONLY for narration.",
    "- Never emit one speech unit per dialogue line. Only a genuinely isolated line becomes a speech unit.",
    "- A dialogue line is SPOKEN words only, normally the text inside quotation marks. Never put narration, description or inner thoughts in a dialogue line.",
    "- Narration that sits between spoken lines stays where it is, as its own speech unit with speaker null.",
    "",
    "Example:",
    'Input text: "\\"We hold the line,\\" Shinei said. The wind howled."',
    'Output: {"units":[{"type":"speech","speaker":"Shinei","emotion":"determined","pace":"normal","pauseAfter":"short","text":"[determined] \\"We hold the line,\\" Shinei said."},{"type":"speech","speaker":null,"emotion":"somber","pace":"slow","pauseAfter":"none","text":"[somber] The wind howled."}]}',
    "",
    "Output no text other than the JSON object.",
  ].join("\n");
}

export function planUserPrompt(text: string, cast: CastBrief[]): string {
  return JSON.stringify({ cast, text });
}

export function castSystemPrompt(): string {
  return [
    "You maintain the cast list for a novel being turned into an audiobook.",
    "You receive JSON with: existing (the cast so far), speakers (character mentions from the text), and optionally reference (a character list with canonical names, aliases and call signs).",
    "`existing` is FIXED: return every existing character first, in the same order, with their exact same name. Never rename, merge away or reorder an existing character.",
    "Return ONLY a JSON object {\"characters\": [ ... ]}.",
    "",
    "Rules:",
    "- Use `reference` to resolve identities. When a speaker matches an entry there, use that canonical name and include every alias and call sign from the reference.",
    "- A call sign and a real name that `reference` shows are the same person MUST be one character, never two.",
    "- Add a new character only for a speaker who is not an existing character, not an alias of one, and not identified in `reference`.",
    "- A one-off speaker with no entry in `reference` should not get its own character; prefer folding it into a related entry or leaving it out.",
    "- Each character object has: name (the canonical display name) and aliases (other strings that refer to the same person, such as a first name, a full name, a title, a call sign, or a description like \"the old man\").",
    "- Drop pronouns and generic words such as \"he\", \"she\", \"the narrator\" and \"I\".",
    "- List any new characters after the existing ones, most prominent first.",
    "- Output no text other than the JSON object.",
  ].join("\n");
}

export function castUserPrompt(hints: string[], existing?: Cast, reference?: string): string {
  return JSON.stringify({
    existing: (existing?.characters ?? []).map((member) => ({
      name: member.name,
      aliases: member.aliases,
    })),
    speakers: hints,
    reference: reference?.trim() ? reference.trim() : undefined,
  });
}
