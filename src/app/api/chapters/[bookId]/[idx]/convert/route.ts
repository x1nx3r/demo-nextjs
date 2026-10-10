import { NextResponse } from "next/server";

import { gateSession } from "@/lib/auth";
import { ConvertError, convertChapter } from "@/lib/tts/convert";
import { setTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

/**
 * Convert (or resume converting) a chapter. Synchronous: returns when the
 * chapter is ready or the run stopped. Large chapters may exceed maxDuration;
 * the run is checkpointed, so a follow-up call resumes.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const gate = await gateSession();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Access denied" },
      { status: gate.status },
    );
  }
  setTenant(gate.session.uid);

  const { bookId, idx } = await params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  try {
    const result = await convertChapter(bookId, index);
    return NextResponse.json(result, { status: result.status === "ready" ? 200 : 202 });
  } catch (error) {
    if (error instanceof ConvertError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Convert failed" },
      { status: 500 },
    );
  }
}
