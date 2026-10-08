import type { ChapterScript } from "@/lib/ingest/types";
import { chapterScriptKey } from "@/lib/storage/keys";

import { getJson, putJson } from "./objects";

export async function getChapterScript(
  bookId: string,
  idx: number,
): Promise<ChapterScript | null> {
  return getJson<ChapterScript>(chapterScriptKey(bookId, idx));
}

export async function putChapterScript(
  bookId: string,
  idx: number,
  script: ChapterScript,
): Promise<void> {
  await putJson(chapterScriptKey(bookId, idx), script);
}
