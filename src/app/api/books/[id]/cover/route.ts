import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { bookCoverKey } from "@/lib/storage/keys";
import { getBook } from "@/lib/store/books";
import { getBytes } from "@/lib/store/objects";
import { setTenant } from "@/lib/tenant";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  setTenant(session.uid);

  const { id } = await params;
  const book = await getBook(id);
  if (!book?.coverContentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const cover = await getBytes(bookCoverKey(id));
    return new Response(new Blob([cover as BlobPart], { type: book.coverContentType }), {
      headers: {
        "Content-Type": book.coverContentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
