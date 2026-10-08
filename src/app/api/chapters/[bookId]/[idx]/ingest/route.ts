import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { IngestError, ingestChapter } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

async function resolve(params: RouteParams["params"]) {
  const { bookId, idx } = await params;
  const index = Number.parseInt(idx, 10);
  return { bookId, index, valid: Number.isInteger(index) && index >= 0 };
}

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, index, valid } = await resolve(params);
  if (!valid) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  try {
    const result = await ingestChapter(bookId, index);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
