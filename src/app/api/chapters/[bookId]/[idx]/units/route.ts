import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import type { NowPlayingData, PlayableUnit } from "@/lib/player/types";
import { getBook } from "@/lib/store/books";
import { getChapterScript } from "@/lib/store/chunks";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

/** Playable units for one chapter, plus the ready-chapter prev/next indices. */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, idx } = await params;
  const chapterIdx = Number.parseInt(idx, 10);
  if (!Number.isInteger(chapterIdx) || chapterIdx < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  const book = await getBook(bookId);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const chapter = book.chapters.find((entry) => entry.idx === chapterIdx);
  if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  const script = await getChapterScript(bookId, chapterIdx);
  const units: PlayableUnit[] = (script?.units ?? [])
    .filter((unit) => unit.audio)
    .map((unit) =>
      unit.type === "speech"
        ? {
            id: unit.id,
            type: "speech" as const,
            text: unit.text,
            lines: [{ text: unit.text, speakerHint: unit.speakerHint }],
            pauseAfter: unit.pauseAfter,
            hash: unit.audio as string,
          }
        : {
            id: unit.id,
            type: "dialogue" as const,
            text: unit.lines.map((line) => line.text).join(" "),
            lines: unit.lines.map((line) => ({ text: line.text, speakerHint: line.speakerHint })),
            pauseAfter: unit.pauseAfter,
            hash: unit.audio as string,
          },
    );

  const readyIdx = book.chapters
    .filter((entry) => entry.status === "ready")
    .map((entry) => entry.idx)
    .sort((a, b) => a - b);
  const position = readyIdx.indexOf(chapterIdx);
  const prevIdx = position > 0 ? readyIdx[position - 1] : null;
  const nextIdx = position >= 0 && position < readyIdx.length - 1 ? readyIdx[position + 1] : null;

  const data: NowPlayingData = {
    bookId,
    idx: chapterIdx,
    bookTitle: book.title,
    author: book.author ?? "Unknown author",
    coverUrl: book.coverContentType ? `/api/books/${bookId}/cover` : null,
    chapterTitle: chapter.title,
    units,
    prevIdx,
    nextIdx,
  };

  return NextResponse.json(data);
}
