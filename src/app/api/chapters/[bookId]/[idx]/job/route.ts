import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getJob } from "@/lib/store/jobs";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ bookId: string; idx: string }> };

/** Poll target for the chapter workbench: phase, progress and the live log. */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, idx } = await params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid chapter index" }, { status: 400 });
  }

  const job = await getJob(bookId, index);
  return NextResponse.json({ job });
}
