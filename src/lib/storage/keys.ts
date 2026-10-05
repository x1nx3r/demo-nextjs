export const LIBRARY_PREFIX = "books/";

export const bookPrefix = (bookId: string) => `books/${bookId}/`;
export const bookMetaKey = (bookId: string) => `books/${bookId}/meta.json`;
export const bookSourceKey = (bookId: string) => `books/${bookId}/source.epub`;
export const bookCoverKey = (bookId: string) => `books/${bookId}/cover.jpg`;
export const bookProgressKey = (bookId: string) => `books/${bookId}/progress.json`;

export const chapterPrefix = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/`;
export const chapterMetaKey = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/meta.json`;
export const chapterTextKey = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/text.json`;
export const chapterChunksKey = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/chunks.json`;

export const jobKey = (bookId: string, idx: number) =>
  `jobs/${bookId}/${idx}.json`;

export const audioKey = (contentHash: string) => `cache/audio/${contentHash}.mp3`;

export const settingsKey = () => "settings.json";
