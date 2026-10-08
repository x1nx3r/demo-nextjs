#!/usr/bin/env node
/**
 * ElevenLabs v4 -> Higgs TTS 3 cloning prototype.
 *
 * 1. Render a reference passage with ElevenLabs v4 for a few voices.
 * 2. Create a persistent Higgs custom voice from each clip (POST /v1/audio/voices).
 * 3. A/B the Higgs clone against ElevenLabs on a tagged passage.
 *
 * Run from demo-nextjs/: node scripts/higgs-clone-prototype.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const ELEVEN = env.ELEVENLABS_API_KEY;
const BOSON = env.BOSON_API_KEY;

// ElevenLabs premade voices (id -> label).
const VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
];

const REF =
  "The morning light crept across the old harbor, and the boats began to stir. " +
  "She had known this town her whole life, every street and every silence. " +
  "There was a time when the sea meant everything to her: freedom, danger, a way out.";

const TEST_HIGGS = "<|emotion:sadness|>The snow would not stop. He had not slept in two days, and the road ahead was empty.";
const TEST_EL = "[sad] The snow would not stop. He had not slept in two days, and the road ahead was empty.";

async function eleven(text, voiceId) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_v4",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`eleven ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function higgsCreateVoice(title, audio, transcript) {
  const res = await fetch("https://api.boson.ai/v1/audio/voices", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOSON}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ref_audio: `data:audio/mpeg;base64,${audio.toString("base64")}`,
      ref_text: transcript,
      title,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`higgs voice ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.voice_id;
}

async function higgsSpeech(input, voice) {
  const res = await fetch("https://api.boson.ai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOSON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "higgs-tts-3", input, voice, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`higgs speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

const ids = {};
for (const voice of VOICES) {
  const ref = await eleven(REF, voice.id);
  writeFileSync(`/tmp/opencode/higgsclone_ref_${voice.name}.mp3`, ref);
  const voiceId = await higgsCreateVoice(`EL-${voice.name}`, ref, REF);
  ids[voice.name] = voiceId;

  const higgsOut = await higgsSpeech(TEST_HIGGS, voiceId);
  const elOut = await eleven(TEST_EL, voice.id);
  writeFileSync(`/tmp/opencode/higgsclone_${voice.name}_higgs.mp3`, higgsOut);
  writeFileSync(`/tmp/opencode/higgsclone_${voice.name}_el.mp3`, elOut);
  console.log(`${voice.name.padEnd(8)} higgs voice ${voiceId}  |  higgs ${higgsOut.length}b vs el ${elOut.length}b`);
}
console.log("ids:", JSON.stringify(ids, null, 2));
