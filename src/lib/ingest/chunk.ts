/**
 * Coarse chunker. The chunk is the *planning* unit, not the render unit: it is
 * sized to the model's per-request limit (10,000 for Eleven v4) so the planner
 * LLM has the most context possible. Paragraph breaks are preserved so the
 * planner can see structure.
 */

import type { ParsedParagraph } from "@/lib/epub/parse";

import { normalizeSource } from "./text";

export const MAX_CHUNK_CHARS = 10000;

export type TextChunk = {
  idx: number;
  text: string;
};

const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/;

/** Split one paragraph into pieces no longer than `limit`. */
function packToLimit(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const pieces: string[] = [];
  let current = "";

  for (const sentence of text.split(SENTENCE_BOUNDARY)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > limit) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      let rest = trimmed;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(" ", limit);
        if (cut <= 0) cut = limit;
        pieces.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) current = rest;
      continue;
    }

    if (current && current.length + trimmed.length + 1 > limit) {
      pieces.push(current);
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

export function chunkParagraphs(
  paragraphs: ParsedParagraph[],
  maxChars = MAX_CHUNK_CHARS,
): TextChunk[] {
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const text = buffer.trim();
    if (text) chunks.push(text);
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    // Unwrap angle-bracket system messages so the provider does not strip them.
    const text = normalizeSource(paragraph.text);
    if (!text) continue;

    for (const piece of packToLimit(text, maxChars)) {
      if (buffer && buffer.length + piece.length + 2 > maxChars) flush();
      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
    }
  }

  flush();
  return chunks.map((text, idx) => ({ idx, text }));
}
