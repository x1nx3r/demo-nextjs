#!/usr/bin/env node
/** Daniel clone variants: isolate why the clone came out wrong. */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
const DANIEL = "onwK4e9ZLuTAKqWW03F9";

const SHORT = "Hello. This is a simple test of the voice. The weather is calm today, and the road ahead is clear.";
const TEST_HIGGS = "<|emotion:contentment|>The snow would not stop. He had not slept in two days, and the road ahead was empty.";

async function eleven(text, voiceId, format = "mp3_44100_128", style = 0.0) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_v4",
        voice_settings: { stability: 0.75, similarity_boost: 0.8, style, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`eleven ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function createVoiceMultipart(title, audio, transcript, filename) {
  const form = new FormData();
  form.set("ref_audio", new Blob([audio]), filename);
  form.set("ref_text", transcript);
  form.set("title", title);
  const res = await fetch("https://api.boson.ai/v1/audio/voices", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOSON}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`voice ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.voice_id;
}

async function speech(input, voice) {
  const res = await fetch("https://api.boson.ai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOSON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "higgs-tts-3", input, voice, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Short, clean reference (low style, high stability).
const shortMp3 = await eleven(SHORT, DANIEL, "mp3_44100_128", 0.0);
writeFileSync("/tmp/opencode/dan_short.mp3", shortMp3);
// Same short reference, decoded to WAV locally (ElevenLabs PCM is Pro-only).
execFileSync("ffmpeg", ["-y", "-i", "/tmp/opencode/dan_short.mp3", "/tmp/opencode/dan_short.wav"]);
const shortWav = readFileSync("/tmp/opencode/dan_short.wav");

const longMp3 = readFileSync("/tmp/opencode/higgsclone_ref_Daniel.mp3");

const REF_LONG =
  "The morning light crept across the old harbor, and the boats began to stir. She had known this town her whole life, every street and every silence. There was a time when the sea meant everything to her: freedom, danger, a way out.";

const variants = [
  { key: "long_mp3_multipart", audio: longMp3, name: "dan_long.mp3", text: REF_LONG },
  { key: "short_mp3_multipart", audio: shortMp3, name: "dan_short.mp3", text: SHORT },
  { key: "short_wav_multipart", audio: shortWav, name: "dan_short.wav", text: SHORT },
];

for (const v of variants) {
  const id = await createVoiceMultipart(`dan-${v.key}`, v.audio, v.text, v.name);
  const out = await speech(TEST_HIGGS, id);
  writeFileSync(`/tmp/opencode/danfix_${v.key}.mp3`, out);
  console.log(`${v.key.padEnd(22)} -> ${id}  (${out.length}b)`);
}
console.log("reference:", "/tmp/opencode/dan_short.mp3", "and original /tmp/opencode/higgsclone_ref_Daniel.mp3");
