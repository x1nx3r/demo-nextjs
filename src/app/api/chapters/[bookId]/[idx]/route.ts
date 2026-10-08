import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getBook } from "@/lib/store/books";
import { getChapterScript } from "@/lib/store/chunks";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

/** Chapter detail: metadata plus the planned script (render units). */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, idx } = await params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  const book = await getBook(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const chapter = book.chapters.find((entry) => entry.idx === index);
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const script = await getChapterScript(bookId, index);
  return NextResponse.json({ chapter, script });
}
