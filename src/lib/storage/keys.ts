import { tenantPrefix } from "@/lib/tenant";

/** Root prefix for a user's library. */
export const libraryPrefix = () => `${tenantPrefix()}books/`;

export const bookPrefix = (bookId: string) => `${tenantPrefix()}books/${bookId}/`;
export const bookMetaKey = (bookId: string) => `${tenantPrefix()}books/${bookId}/meta.json`;
export const bookSourceKey = (bookId: string, ext = "epub") =>
  `${tenantPrefix()}books/${bookId}/source.${ext}`;
export const bookCoverKey = (bookId: string) => `${tenantPrefix()}books/${bookId}/cover.jpg`;
export const bookProgressKey = (bookId: string) =>
  `${tenantPrefix()}books/${bookId}/progress.json`;

export const chapterPrefix = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/`;
export const chapterMetaKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/meta.json`;
export const chapterTextKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/text.json`;
export const chapterChunksKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/chunks.json`;
export const chapterScriptKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/script.json`;
export const chapterAudioKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}books/${bookId}/chapters/${idx}/audio.mp3`;

/** Voice bible for a book: narrator plus recurring characters. */
export const bookCastKey = (bookId: string) => `${tenantPrefix()}books/${bookId}/cast.json`;

/** Optional character/alias reference the user pastes at import. */
export const bookContextKey = (bookId: string) => `${tenantPrefix()}books/${bookId}/context.md`;

/** Optional free-form direction for the Director (e.g. "this is the 86 novel"). */
export const bookDirectionKey = (bookId: string) =>
  `${tenantPrefix()}books/${bookId}/direction.txt`;

/** Cached mediawiki_lookup result, keyed by a hash of site + mode + query. */
export const bookWikiKey = (bookId: string, hash: string) =>
  `${tenantPrefix()}books/${bookId}/wiki/${hash}.json`;

export const jobKey = (bookId: string, idx: number) =>
  `${tenantPrefix()}jobs/${bookId}/${idx}.json`;

/** Rendered audio, content-addressed and scoped per user. */
export const audioKey = (contentHash: string) =>
  `${tenantPrefix()}cache/audio/${contentHash}.mp3`;

export const settingsKey = () => "settings.json";
