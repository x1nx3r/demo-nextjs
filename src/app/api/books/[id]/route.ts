import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { deleteBook, getBook } from "@/lib/store/books";
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
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ book });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  setTenant(session.uid);

  const { id } = await params;
  await deleteBook(id);
  return NextResponse.json({ ok: true });
}
