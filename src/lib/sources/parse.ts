/**
 * Source dispatcher. Picks a parser from the file name and returns the same
 * `ParsedBook` shape for every format, so the rest of the pipeline does not
 * change when a new format is added.
 */

import { parseEpub, type ParsedBook } from "@/lib/epub/parse";

import { parseText } from "./text";

export type { ParsedBook, ParsedChapter, ParsedParagraph } from "@/lib/epub/parse";

export type SourceKind = "epub" | "text";

export function sourceKind(filename: string): SourceKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return ext === "txt" || ext === "md" || ext === "markdown" ? "text" : "epub";
}

export function sourceExtension(filename: string): string {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

export function sourceContentType(filename: string): string {
  return sourceKind(filename) === "text" ? "text/plain; charset=utf-8" : "application/epub+zip";
}

export async function parseSource(data: Uint8Array, filename: string): Promise<ParsedBook> {
  return sourceKind(filename) === "text" ? parseText(data, filename) : parseEpub(data);
}
