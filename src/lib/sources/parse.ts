/**
 * Source dispatcher. Picks a parser from the file name and returns the same
 * `ParsedBook` shape for every format, so the rest of the pipeline does not
 * change when a new format is added.
 */

import { parseEpub, type ParsedBook } from "@/lib/epub/parse";

import { parsePdf } from "./pdf";
import { parseText } from "./text";

export type { ParsedBook, ParsedChapter, ParsedParagraph } from "@/lib/epub/parse";

export type SourceKind = "epub" | "text" | "pdf";

export function sourceKind(filename: string): SourceKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt" || ext === "md" || ext === "markdown") return "text";
  if (ext === "pdf") return "pdf";
  return "epub";
}

export function sourceExtension(filename: string): string {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

export function sourceContentType(filename: string): string {
  const kind = sourceKind(filename);
  if (kind === "text") return "text/plain; charset=utf-8";
  if (kind === "pdf") return "application/pdf";
  return "application/epub+zip";
}

/** A PDF is a single narrated piece; a book file is a multi-chapter work. */
export function defaultBookKind(filename: string): "book" | "article" {
  return sourceKind(filename) === "pdf" ? "article" : "book";
}

export async function parseSource(data: Uint8Array, filename: string): Promise<ParsedBook> {
  const kind = sourceKind(filename);
  if (kind === "text") return parseText(data, filename);
  // pdfjs detaches the input ArrayBuffer, so give it a copy.
  if (kind === "pdf") return parsePdf(data.slice(), filename);
  return parseEpub(data);
}
