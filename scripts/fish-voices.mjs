#!/usr/bin/env node
/**
 * Browse the Fish Audio voice library.
 *
 * Usage (from demo-nextjs/):
 *   node scripts/fish-voices.mjs [filters]
 *
 * Filters:
 *   --lang en            language code (default en)
 *   --gender male|female|neutral
 *   --age young|middle-aged|old
 *   --tag narration      comma-separated; matches any tag substring
 *   --search warm        match title or tags
 *   --limit 40
 *   --all                include celebrity / copyrighted / watermarked voices
 *
 * Reads FISH_API_KEY from the environment or .env.local.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.fish.audio";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function loadKey() {
  if (process.env.FISH_API_KEY) return process.env.FISH_API_KEY;
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const match = text.match(/^FISH_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // no .env.local
  }
  return null;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : true;
}

const has = (name) => process.argv.includes(`--${name}`);
const key = loadKey();
if (!key) {
  console.error("FISH_API_KEY is not set (env or .env.local)");
  process.exit(1);
}

/** Celebrity, copyrighted and watermarked voices to keep out of a cast. */
const RISKY =
  /copyrighted|watermark|taylor swift|michael jackson|kendrick|markiplier|elon|sydney sweeney|megan|raiden|mortal kombat|smash bros|disney|marvel|pixar|harry potter|star wars|spongebob|rick and morty|family guy|simpsons|trump|biden|obama|naruto|goku|pokemon|zelda|mario|sonic|fortnite/i;

async function fetchAll() {
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${API}/model?page_size=${PAGE_SIZE}&page_number=${page}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`fetch failed: ${res.status}`);
      break;
    }
    const json = await res.json();
    const batch = json.items ?? [];
    for (const m of batch) {
      if (m._id && !seen.has(m._id)) {
        seen.add(m._id);
        items.push(m);
      }
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
}

const gender = arg("gender");
const age = arg("age");
const langArg = arg("lang", "en");
const lang = langArg === "any" || langArg === true ? null : langArg;
const tagFilters = arg("tag") ? String(arg("tag")).split(",").map((t) => t.trim().toLowerCase()) : [];
const search = arg("search");
const limit = Number(arg("limit", "40"));
const includeAll = has("all");

const tags = (m) => m.tags || [];
const risky = (m) => RISKY.test(m.title || "") || RISKY.test(tags(m).join(" "));

const all = await fetchAll();
let items = includeAll ? all : all.filter((m) => !risky(m));

if (lang) {
  const want = String(lang).toLowerCase();
  items = items.filter(
    (m) =>
      (m.languages || []).some((l) => {
        const code = l.toLowerCase();
        return code === want || code.startsWith(`${want}-`) || code.startsWith(`${want}_`);
      }) ||
      tags(m).some((t) => t.toLowerCase() === "english"),
  );
}
if (gender) items = items.filter((m) => tags(m).includes(String(gender)));
if (age) items = items.filter((m) => tags(m).includes(String(age)));
if (tagFilters.length > 0) {
  items = items.filter((m) => tags(m).some((x) => tagFilters.some((t) => x.toLowerCase().includes(t))));
}
if (search) {
  const q = String(search).toLowerCase();
  items = items.filter((m) => (m.title || "").toLowerCase().includes(q) || tags(m).some((x) => x.toLowerCase().includes(q)));
}

console.log(`${items.length} match(es) of ${all.length} library voices${includeAll ? " (risky included)" : ""}`);
for (const m of items.slice(0, limit)) {
  console.log(`${m._id} | ${tags(m).slice(0, 11).join(",")} | ${(m.title || "").slice(0, 42)}`);
}
