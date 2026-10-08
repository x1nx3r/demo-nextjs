/**
 * Voice reassignment invalidation.
 *
 * The cast is append-only, but a user may explicitly reassign a voice when an
 * auto-picked one sounds wrong. When that happens, every already-rendered unit
 * that speaks with the old voice must be invalidated, or the change would not
 * be heard. This clears `audio` on the affected units and rolls each chapter's
 * status back so the next render picks them up.
 */

import { getBook, patchChapter } from "@/lib/store/books";
import { getChapterScript, putChapterScript } from "@/lib/store/chunks";

export type VoiceTarget = "narrator" | string;

function matches(speakerId: string | null | undefined, target: VoiceTarget): boolean {
  return target === "narrator" ? speakerId == null : speakerId === target;
}

/** Clear rendered audio for units that use `target`'s voice. Returns the count. */
export async function invalidateVoiceUnits(bookId: string, target: VoiceTarget): Promise<number> {
  const book = await getBook(bookId);
  if (!book) return 0;

  let cleared = 0;

  for (const chapter of book.chapters) {
    const script = await getChapterScript(bookId, chapter.idx);
    if (!script || script.units.length === 0) continue;

    let changed = false;
    for (const unit of script.units) {
      if (!unit.audio) continue;
      const hit =
        unit.type === "speech"
          ? matches(unit.speakerId, target)
          : unit.lines.some((line) => matches(line.speakerId, target));
      if (hit) {
        unit.audio = null;
        unit.requestId = null;
        changed = true;
        cleared++;
      }
    }

    if (changed) {
      await putChapterScript(bookId, chapter.idx, script);
      const remaining = script.units.filter((unit) => unit.audio).length;
      await patchChapter(bookId, chapter.idx, {
        status: remaining === 0 ? "ingested" : "partial",
        unitsDone: remaining,
      });
    }
  }

  return cleared;
}
