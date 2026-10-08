#!/usr/bin/env node
/**
 * Re-curate the Fish voice pool.
 *
 * Policy: English voices, ranked by quality_passed (bonus) + likes + 3x bookmarks,
 * with coverage across gender and age. Real-person impersonations, watermarked
 * voices and non-English voices are excluded; game/anime/character voices are kept.
 *
 * Writes src/lib/tts/fish-pool.ts. Run from demo-nextjs/:
 *   node scripts/build-voice-pool.mjs
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
const key = env.FISH_API_KEY;

// Real-person impersonations / watermarked / copyrighted markers.
const RISKY =
  /copyrighted|watermark|taylor swift|michael jackson|kendrick|markiplier|elon|sydney sweeney|megan skiendel|gigi hadid|bella hadid|kendall jenner|kim kardashian|selena gomez|ariana grande|billie eilish|trump|biden|obama|joe rogan|kanye|drake|rihanna|beyonce|eminem|snoop|morgan freeman|attenborough/i;

// Non-English voices that slip past the `languages` field.
const NON_EN =
  /russian|русск|мита|голос|spanish|español|latino|japanese|日本語|chinese|中文|korean|arabic|portuguese|french|german|italian|hindi|indian accent|miside/i;

// Always keep machine + child coverage, regardless of popularity.
const FIXED = [
  ["86c3dd42c08f4082a2ad9ba59441c743", "machine", "old", ["machine", "robotic", "monotone", "mechanical", "deep", "sci-fi"]],
  ["13533a60000342348698dda798564e72", "machine", "old", ["machine", "robotic", "metallic", "digital", "measured", "sci-fi"]],
  ["6717a74323274cb296ea9a0da654c977", "machine", "young", ["machine", "vocaloid", "synthetic", "dramatic", "mysterious", "storytelling"]],
  ["51987d6290b54b299b3feba6a92c664d", "neutral", "child", ["child", "playful", "energetic", "high", "animated"]],
  ["f56b971895ed4a9d8aaf90e4c4d96a61", "neutral", "child", ["child", "bright", "cheerful", "playful", "energetic"]],
];

const AGE = ["child", "young", "middle-aged", "old"];

async function fetchLibrary() {
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.fish.audio/model?page_size=100&page_number=${page}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) break;
    const json = await res.json();
    const batch = json.items ?? [];
    for (const m of batch) if (m._id && !seen.has(m._id)) { seen.add(m._id); items.push(m); }
    if (batch.length < 100) break;
  }
  return items;
}

const items = await fetchLibrary();
const T = (m) => (m.tags || []).map((t) => t.toLowerCase());
const isEn = (m) => (m.languages || []).some((l) => /^en/i.test(l));
const qPassed = (m) => ((m.quality && m.quality.audios) || []).some((a) => a.quality_passed);
const genderOf = (m) => {
  const t = T(m);
  return t.includes("male") ? "male" : t.includes("female") ? "female" : t.includes("neutral") ? "neutral" : null;
};
const ageOf = (m) => AGE.find((a) => T(m).includes(a)) || null;
const clean = (m) =>
  isEn(m) &&
  !/[^\x00-\x7F]/.test(m.title || "") &&
  !RISKY.test(m.title || "") &&
  !RISKY.test(T(m).join(" ")) &&
  !NON_EN.test([m.title, m.description, T(m).join(" ")].join(" "));

const scored = items
  .filter(clean)
  .map((m) => ({ m, score: (qPassed(m) ? 200000 : 0) + (m.like_count || 0) + 3 * (m.mark_count || 0) }))
  .sort((a, b) => b.score - a.score);

const byId = new Map(items.map((m) => [m._id, m]));
const picked = [];
const used = new Set();
const usedNames = new Set();
for (const [id] of FIXED) used.add(id); // reserved; added at the end

function take(pred, n) {
  for (const { m } of scored) {
    if (n <= 0) return;
    if (used.has(m._id)) continue;
    const name = (m.title || "").trim().toLowerCase();
    if (name && usedNames.has(name)) continue;
    if (!pred(m)) continue;
    used.add(m._id);
    if (name) usedNames.add(name);
    picked.push(m);
    n--;
  }
}

// Narrator first: Adrian (steady, dramatic storyteller).
const NARRATOR = byId.get("bf322df2096a46f18c579d0baa36f41d");
if (NARRATOR) { picked.push(NARRATOR); used.add(NARRATOR._id); usedNames.add((NARRATOR.title || "").toLowerCase()); }

take((m) => genderOf(m) === "male" && ageOf(m) === "middle-aged", 8);
take((m) => genderOf(m) === "male" && ageOf(m) === "old", 6);
take((m) => genderOf(m) === "male" && ageOf(m) === "young", 6);
take((m) => genderOf(m) === "female" && ageOf(m) === "middle-aged", 8);
take((m) => genderOf(m) === "female" && ageOf(m) === "young", 8);
take((m) => genderOf(m) === "female" && ageOf(m) === "old", 3);
take((m) => genderOf(m) === "neutral", 4);

const rows = picked.map((m) => {
  const tones = T(m).filter((t) => !["male", "female", "neutral", ...AGE].includes(t)).slice(0, 8);
  return {
    voiceId: m._id,
    name: (m.title || m._id).trim().slice(0, 32),
    description: (m.description || tones.join(", ")).slice(0, 70),
    gender: genderOf(m),
    ageBand: ageOf(m),
    tones,
    sample: (m.samples?.[0]?.audio) || null,
  };
});

const fixedRows = FIXED.map(([id, gender, ageBand, tones]) => {
  const m = byId.get(id);
  return {
    voiceId: id,
    name: (m ? m.title || id : id).trim().slice(0, 32),
    description: (m && m.description ? m.description : tones.join(", ")).slice(0, 70),
    gender,
    ageBand,
    tones,
    sample: (m?.samples?.[0]?.audio) || null,
  };
});

const all = [...rows, ...fixedRows];

const body = all
  .map(
    (v) =>
      `  { voiceId: ${JSON.stringify(v.voiceId)}, name: ${JSON.stringify(v.name)}, description: ${JSON.stringify(v.description)}, gender: ${JSON.stringify(v.gender)}, ageBand: ${JSON.stringify(v.ageBand)}, tones: [${v.tones.map((t) => JSON.stringify(t)).join(", ")}], sample: ${JSON.stringify(v.sample)} },`,
  )
  .join("\n");

const file = `// GENERATED by scripts/build-voice-pool.mjs — do not edit by hand.
// Policy: English, quality_passed (bonus) + likes + 3x bookmarks, coverage across
// gender/age, plus machine and child voices. Re-run the generator to refresh.

import type { FishVoice } from "./fish-voices";

export const FISH_FALLBACK_POOL: FishVoice[] = [
${body}
];
`;

writeFileSync("src/lib/tts/fish-pool.ts", file);
const dist = {};
for (const v of all) { const k = `${v.gender}/${v.ageBand}`; dist[k] = (dist[k] || 0) + 1; }
console.log(`wrote src/lib/tts/fish-pool.ts — ${all.length} voices`);
console.log("distribution:", JSON.stringify(dist));
