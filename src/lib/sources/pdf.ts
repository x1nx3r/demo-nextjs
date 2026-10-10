/**
 * PDF source parser.
 *
 * Extracts text with `unpdf` (a pdfjs wrapper) and turns it into paragraphs for
 * the article mode. A PDF has no chapters and no reliable metadata, so it
 * becomes one chapter titled from the document info or the first line.
 */

import { extractText, getDocumentProxy } from "unpdf";

import type { ParsedBook, ParsedParagraph } from "@/lib/epub/parse";

const MAX_CHARS = 500_000;

const HEADING_WORD =
  /^(chapter|part|book|volume|prologue|epilogue|interlude|afterword|foreword|preface|appendix|introduction|conclusion|abstract)\b[^.!?]{0,60}$/i;

function isHeading(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 70) return false;
  if (HEADING_WORD.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && text === text.toUpperCase() && text.split(/\s+/).length <= 8;
}

function toParagraphs(raw: string): ParsedParagraph[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: ParsedParagraph[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    let buffer = "";
    const push = () => {
      const value = buffer.replace(/\s+/g, " ").trim();
      if (value) paragraphs.push({ text: value, heading: isHeading(value) });
      buffer = "";
    };

    for (const line of lines) {
      if (!buffer && isHeading(line)) {
        paragraphs.push({ text: line, heading: true });
        continue;
      }
      // Join a hyphenated line break.
      if (buffer.endsWith("-") && /^[a-z]/.test(line)) buffer = buffer.slice(0, -1) + line;
      else buffer = buffer ? `${buffer} ${line}` : line;
      // A long block with no blank lines still needs breaks.
      if (buffer.length > 1200 && /[.!?"'\u201d)]$/.test(line)) push();
    }
    push();
  }

  return paragraphs;
}

export async function parsePdf(data: Uint8Array, filename: string): Promise<ParsedBook> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = (Array.isArray(text) ? text.join("\n\n") : text).slice(0, MAX_CHARS);

  let title: string | null = null;
  let author: string | null = null;
  try {
    const meta = await pdf.getMetadata();
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
    title = info.Title?.trim() || null;
    author = info.Author?.trim() || null;
  } catch {
    // No document info.
  }

  const paragraphs = toParagraphs(raw);
  if (paragraphs.length === 0) {
    throw new Error("No readable text found in that PDF");
  }

  const fallbackTitle = filename.replace(/\.[^.]+$/, "").trim() || "Untitled";
  const firstLine = paragraphs[0]?.text ?? null;
  const finalTitle = title || (firstLine && firstLine.length <= 90 ? firstLine : fallbackTitle);

  return {
    title: finalTitle,
    author,
    language: null,
    cover: null,
    chapters: [{ title: finalTitle, paragraphs }],
  };
}
