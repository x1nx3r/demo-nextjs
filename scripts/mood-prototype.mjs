#!/usr/bin/env node
/**
 * Mood-variant prototype.
 *
 * For one ElevenLabs voice, perform a reference passage in several moods with
 * eleven_v4, clone each into Fish, then A/B "base clone + tags" against
 * "mood clone + tags".
 *
 * Run from demo-nextjs/:  node scripts/mood-prototype.mjs
 * Writes /tmp/opencode/mood_*.mp3 and prints the Fish voice ids.
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
const FISH = env.FISH_API_KEY;

const VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George (premade narrator)
const MODEL = "eleven_v4";

const PASSAGE =
  "The morning light crept across the old harbor, and the boats began to stir. " +
  "She had known this town her whole life, every street and every silence. " +
  "There was a time when the sea meant everything to her: freedom, danger, a way out. " +
  "Now it only meant waiting. Still, she smiled, because some habits are kinder than hope.";

const MOODS = [
  { key: "neutral", tag: "", stability: 0.5, style: 0.3 },
  { key: "calm", tag: "[calm] ", stability: 0.6, style: 0.2 },
  { key: "sad", tag: "[sad] ", stability: 0.4, style: 0.5 },
  { key: "intense", tag: "[angry] ", stability: 0.3, style: 0.7 },
];

const LINES = [
  { key: "sad", text: "[sad] The rain had not stopped for three days. She watched the empty road, and for a moment she almost believed he would come back." },
  { key: "intense", text: "[angry] You knew! You knew all along, and you said nothing!" },
  { key: "calm", text: "[calm] Everything is going to be fine. Just breathe, and count to ten." },
];

async function eleven(text, settings) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: settings }),
    },
  );
  if (!res.ok) throw new Error(`eleven ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fishClone(name, audio, transcript) {
  const form = new FormData();
  form.append("type", "tts");
  form.append("title", name);
  form.append("train_mode", "fast");
  form.append("visibility", "private");
  form.append("voices", new Blob([audio], { type: "audio/mpeg" }), "ref.mp3");
  form.append("texts", transcript);
  const res = await fetch("https://api.fish.audio/model", {
    method: "POST",
    headers: { Authorization: `Bearer ${FISH}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`fish clone ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json._id;
}

async function fishTts(text, referenceId) {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FISH}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({ text, reference_id: referenceId, format: "mp3" }),
  });
  if (!res.ok) throw new Error(`fish tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

console.log("1. performing references with", MODEL, "voice", VOICE);
const ids = {};
for (const mood of MOODS) {
  const audio = await eleven(mood.tag + PASSAGE, {
    stability: mood.stability,
    similarity_boost: 0.75,
    style: mood.style,
    use_speaker_boost: true,
  });
  writeFileSync(`/tmp/opencode/mood_ref_${mood.key}.mp3`, audio);
  const id = await fishClone(`proto-${mood.key}`, audio, PASSAGE);
  ids[mood.key] = id;
  console.log(`   ${mood.key.padEnd(8)} ref ${audio.length}b -> fish ${id}`);
}

console.log("2. A/B: base clone vs mood clone (same text, same tags)");
for (const line of LINES) {
  const base = await fishTts(line.text, ids.neutral);
  const variant = await fishTts(line.text, ids[line.key]);
  writeFileSync(`/tmp/opencode/mood_ab_${line.key}_base.mp3`, base);
  writeFileSync(`/tmp/opencode/mood_ab_${line.key}_variant.mp3`, variant);
  console.log(`   ${line.key.padEnd(8)} base ${base.length}b  vs  variant ${variant.length}b`);
}

console.log("fish ids:", JSON.stringify(ids, null, 2));
