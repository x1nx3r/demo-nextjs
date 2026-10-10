import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { setTenant } from "@/lib/tenant";
import { requestStop } from "@/lib/tts/convert";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

/** Stop a running render. The run ends after the units already in flight. */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  setTenant(session.uid);

  const { bookId, idx } = await params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  return NextResponse.json({ stopped: requestStop(bookId, index) });
}
