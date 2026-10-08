import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getCast, putCast, resolveVoicePool } from "@/lib/tts/cast";
import { invalidateVoiceUnits } from "@/lib/tts/reassign";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** The append-only cast for a book, plus the pool available for reassignment. */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const cast = await getCast(id);
  return NextResponse.json({ cast, pool: resolveVoicePool() });
}

/**
 * Reassign a voice. The cast is append-only, so this is the one explicit
 * override: it also invalidates already-rendered units that used the old voice.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { target?: unknown; voiceId?: unknown };
  try {
    body = (await request.json()) as { target?: unknown; voiceId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = typeof body.target === "string" ? body.target : null;
  const voiceId = typeof body.voiceId === "string" ? body.voiceId : null;
  if (!target || !voiceId) {
    return NextResponse.json({ error: "target and voiceId are required" }, { status: 400 });
  }

  const cast = await getCast(id);
  if (!cast) return NextResponse.json({ error: "Cast not found" }, { status: 404 });

  const voice = resolveVoicePool().find((entry) => entry.voiceId === voiceId);
  if (!voice) return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
  const description = voice.description ?? voice.name;

  if (target === "narrator") {
    cast.narrator = { ...cast.narrator, voiceId: voice.voiceId, name: voice.name, description };
  } else {
    const member = cast.characters.find((entry) => entry.id === target);
    if (!member) return NextResponse.json({ error: "Character not found" }, { status: 404 });
    member.voiceId = voice.voiceId;
    member.description = description;
  }

  await putCast(id, cast);
  const cleared = await invalidateVoiceUnits(id, target);

  return NextResponse.json({ cast, cleared });
}
