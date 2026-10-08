import { randomUUID } from "node:crypto";

import { parseEpub, type ParsedParagraph } from "@/lib/epub/parse";
import {
  bookContextKey,
  bookCoverKey,
  bookDirectionKey,
  bookMetaKey,
  bookSourceKey,
  chapterTextKey,
  LIBRARY_PREFIX,
} from "@/lib/storage/keys";

import { listKeys } from "@/lib/storage/s3";

import { deletePrefix, getJson, getText, putBytes, putJson, putText } from "./objects";

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
  /** Number of render units, set once the chapter is planned. */
  unitCount?: number;
  /** Units rendered so far, updated as convert progresses. */
  unitsDone?: number;
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

/** Optional character/alias reference the user pasted at import. */
export async function getBookContext(bookId: string): Promise<string | null> {
  return getText(bookContextKey(bookId));
}

export async function setBookContext(bookId: string, context: string): Promise<void> {
  await putText(bookContextKey(bookId), context);
}

/** Optional free-form direction for the Director. */
export async function getBookDirection(bookId: string): Promise<string | null> {
  return getText(bookDirectionKey(bookId));
}

export async function setBookDirection(bookId: string, direction: string): Promise<void> {
  await putText(bookDirectionKey(bookId), direction);
}

/** Update one chapter's status/summary fields and persist the book meta. */
export async function patchChapter(
  bookId: string,
  idx: number,
  patch: Partial<Pick<ChapterMeta, "status" | "unitCount" | "unitsDone">>,
): Promise<BookMeta | null> {
  const book = await getBook(bookId);
  if (!book) return null;

  const chapter = book.chapters.find((entry) => entry.idx === idx);
  if (!chapter) return null;

  Object.assign(chapter, patch);
  await putJson(bookMetaKey(bookId), book);
  return book;
}

export async function getChapterText(
  bookId: string,
  idx: number,
): Promise<ChapterText | null> {
  return getJson<ChapterText>(chapterTextKey(bookId, idx));
}

export async function createBookFromEpub(
  data: Uint8Array,
  context?: string,
  direction?: string,
): Promise<BookMeta> {
  const parsed = await parseEpub(data);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await putBytes(bookSourceKey(id), data, "application/epub+zip");
  if (parsed.cover) {
    await putBytes(bookCoverKey(id), parsed.cover.data, parsed.cover.contentType);
  }
  const reference = context?.trim();
  if (reference) {
    await putText(bookContextKey(id), reference);
  }
  const storyDirection = direction?.trim();
  if (storyDirection) {
    await putText(bookDirectionKey(id), storyDirection);
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
