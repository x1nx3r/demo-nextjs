#!/usr/bin/env node
/**
 * A/B: Boson Higgs TTS 3 (hosted) vs ElevenLabs v4.
 * Same passage, each engine in its own tag dialect. Run from demo-nextjs/.
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
const BOSON = env.BOSON_API_KEY;
const ELEVEN = env.ELEVENLABS_API_KEY;

const HIGGS_VOICE = "nora"; // calm narrative preset
const EL_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George

const PLAIN = "The snow would not stop. He had not slept in two days, and the road ahead was empty.";

const PAIRS = [
  { key: "plain", higgs: PLAIN, el: PLAIN },
  { key: "sad", higgs: `<|emotion:sadness|>${PLAIN}`, el: `[sad] ${PLAIN}` },
  { key: "whisper", higgs: `<|style:whispering|>${PLAIN}`, el: `[whispering] ${PLAIN}` },
  { key: "angry", higgs: `<|emotion:anger|>${PLAIN}`, el: `[angry] ${PLAIN}` },
];

async function higgs(input) {
  const res = await fetch("https://api.boson.ai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOSON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "higgs-tts-3", input, voice: HIGGS_VOICE, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`higgs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function eleven(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_v4",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`eleven ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

for (const pair of PAIRS) {
  const h = await higgs(pair.higgs);
  const e = await eleven(pair.el);
  writeFileSync(`/tmp/opencode/ab2_${pair.key}_higgs.mp3`, h);
  writeFileSync(`/tmp/opencode/ab2_${pair.key}_el.mp3`, e);
  console.log(`${pair.key.padEnd(8)} higgs ${h.length}b   vs   eleven ${e.length}b`);
}
console.log("done -> /tmp/opencode/ab2_*_{higgs,el}.mp3");
