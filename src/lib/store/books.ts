import { randomUUID } from "node:crypto";

import { parseEpub, type ParsedParagraph } from "@/lib/epub/parse";
import {
  bookCoverKey,
  bookMetaKey,
  bookSourceKey,
  chapterTextKey,
  LIBRARY_PREFIX,
} from "@/lib/storage/keys";

import { listKeys } from "@/lib/storage/s3";

import { deletePrefix, getJson, putBytes, putJson } from "./objects";

export type ChapterStatus =
  | "imported"
  | "ingested"
  | "converting"
  | "partial"
  | "ready"
  | "failed";

export type ChapterMeta = {
  idx: number;
  title: string;
  charCount: number;
  status: ChapterStatus;
};

export type BookMeta = {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  coverContentType: string | null;
  chapterCount: number;
  charCount: number;
  chapters: ChapterMeta[];
  createdAt: string;
};

export type ChapterText = {
  idx: number;
  paragraphs: ParsedParagraph[];
};

export async function listBooks(): Promise<BookMeta[]> {
  const keys = await listKeys(LIBRARY_PREFIX);
  const metaKeys = keys.filter((key) => /^books\/[^/]+\/meta\.json$/.test(key));
  const books = await Promise.all(
    metaKeys.map((key) => getJson<BookMeta>(key)),
  );
  return books
    .filter((book): book is BookMeta => book !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBook(id: string): Promise<BookMeta | null> {
  return getJson<BookMeta>(bookMetaKey(id));
}

export async function getChapterText(
  bookId: string,
  idx: number,
): Promise<ChapterText | null> {
  return getJson<ChapterText>(chapterTextKey(bookId, idx));
}

export async function createBookFromEpub(data: Uint8Array): Promise<BookMeta> {
  const parsed = await parseEpub(data);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await putBytes(bookSourceKey(id), data, "application/epub+zip");
  if (parsed.cover) {
    await putBytes(bookCoverKey(id), parsed.cover.data, parsed.cover.contentType);
  }

  const chapters: ChapterMeta[] = [];
  let totalChars = 0;

  for (let idx = 0; idx < parsed.chapters.length; idx++) {
    const chapter = parsed.chapters[idx];
    const charCount = chapter.paragraphs.reduce(
      (sum, paragraph) => sum + paragraph.text.length,
      0,
    );
    totalChars += charCount;
    chapters.push({ idx, title: chapter.title, charCount, status: "imported" });
    await putJson(chapterTextKey(id, idx), {
      idx,
      paragraphs: chapter.paragraphs,
    } satisfies ChapterText);
  }

  const book: BookMeta = {
    id,
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    coverContentType: parsed.cover?.contentType ?? null,
    chapterCount: chapters.length,
    charCount: totalChars,
    chapters,
    createdAt,
  };

  await putJson(bookMetaKey(id), book);
  return book;
}

export async function deleteBook(id: string): Promise<void> {
  await deletePrefix(`books/${id}/`);
}
