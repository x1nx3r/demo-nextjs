export const LIBRARY_PREFIX = "books/";

export const bookPrefix = (bookId: string) => `books/${bookId}/`;
export const bookMetaKey = (bookId: string) => `books/${bookId}/meta.json`;
export const bookSourceKey = (bookId: string, ext = "epub") =>
  `books/${bookId}/source.${ext}`;
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
export const chapterScriptKey = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/script.json`;
export const chapterAudioKey = (bookId: string, idx: number) =>
  `books/${bookId}/chapters/${idx}/audio.mp3`;

/** Voice bible for a book: narrator plus recurring characters. */
export const bookCastKey = (bookId: string) => `books/${bookId}/cast.json`;

/** Optional character/alias reference the user pastes at import. */
export const bookContextKey = (bookId: string) => `books/${bookId}/context.md`;

/** Optional free-form direction for the Director (e.g. "this is the 86 novel"). */
export const bookDirectionKey = (bookId: string) => `books/${bookId}/direction.txt`;

/** Cached mediawiki_lookup result, keyed by a hash of site + mode + query. */
export const bookWikiKey = (bookId: string, hash: string) => `books/${bookId}/wiki/${hash}.json`;

export const jobKey = (bookId: string, idx: number) =>
  `jobs/${bookId}/${idx}.json`;

export const audioKey = (contentHash: string) => `cache/audio/${contentHash}.mp3`;

export const settingsKey = () => "settings.json";
