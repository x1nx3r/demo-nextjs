/**
 * Plain-text and Markdown source parser.
 *
 * The pipeline only needs `ParsedBook` (title, author, cover, chapters of
 * paragraphs). A text file has no metadata and no table of contents, so this
 * parser guesses chapter breaks from headings and unwraps paragraphs.
 *
 * Markdown uses `#`/`##` headings. Plain text uses a line that names a chapter
 * (Chapter, Part, Prologue, ...), a Roman numeral, or a short ALL-CAPS line.
 */

import type { ParsedBook, ParsedChapter, ParsedParagraph } from "@/lib/epub/parse";

const HEADING_WORD =
  /^(chapter|part|book|volume|prologue|epilogue|interlude|afterword|foreword|preface|appendix|introduction|conclusion)\b[^.!?]{0,60}$/i;
const ROMAN = /^[IVXLCDM]{1,7}\.?$/;
const MD_HEADING = /^#{1,2}\s+(.*)$/;

function isAllCapsHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  if (line !== line.toUpperCase()) return false;
  return line.split(/\s+/).length <= 8;
}

/** A single-line block that looks like a chapter heading. */
function plainHeading(line: string): string | null {
  const text = line.trim();
  if (!text || text.length > 70) return null;
  if (HEADING_WORD.test(text) || ROMAN.test(text) || isAllCapsHeading(text)) return text;
  return null;
}

function unwrap(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseText(data: Uint8Array, filename: string): ParsedBook {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(data);
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(filename);
  const fallbackTitle = filename.replace(/\.[^.]+$/, "").trim() || "Untitled";

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  // Guess a title and an author from the top of the file.
  const firstBlock = blocks[0] ?? "";
  const firstLine = firstBlock.includes("\n") ? null : firstBlock.trim();
  const firstIsHeading = Boolean(
    (isMarkdown && firstLine && MD_HEADING.test(firstLine)) ||
      (firstLine && plainHeading(firstLine)),
  );
  let documentTitle: string | null = null;
  if (isMarkdown && firstLine) {
    const match = firstLine.match(MD_HEADING);
    if (match) documentTitle = match[1].trim();
  } else if (!firstIsHeading) {
    const text = unwrap(firstBlock);
    if (text && text.length <= 80) documentTitle = text;
  }

  let author: string | null = null;
  for (const block of blocks.slice(0, 4)) {
    const match = unwrap(block).match(/^by\s+(.{2,60})$/i);
    if (match) {
      author = match[1].trim();
      break;
    }
  }

  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter | null = null;

  const startChapter = (title: string, headingParagraph: ParsedParagraph | null) => {
    current = { title, paragraphs: headingParagraph ? [headingParagraph] : [] };
    chapters.push(current);
  };

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const single = lines.length === 1 ? lines[0] : null;

    const mdMatch = isMarkdown && single ? single.match(MD_HEADING) : null;
    const headingText = mdMatch ? mdMatch[1].trim() : single ? plainHeading(single) : null;

    if (headingText) {
      startChapter(headingText, { text: headingText, heading: true });
      continue;
    }

    const text = unwrap(block);
    if (!text) continue;
    if (!current) startChapter(documentTitle ?? fallbackTitle, null);
    current!.paragraphs.push({ text, heading: false });
  }

  // Drop empty chapters.
  const kept = chapters.filter((chapter) => chapter.paragraphs.length > 0);
  if (kept.length === 0) {
    throw new Error("No readable text found in file");
  }

  const title =
    documentTitle ??
    kept.find((chapter) => chapter.paragraphs[0]?.heading)?.title ??
    fallbackTitle;

  return {
    title,
    author,
    language: null,
    cover: null,
    chapters: kept,
  };
}
