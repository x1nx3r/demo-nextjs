import { NextResponse } from "next/server";

import { gateSession } from "@/lib/auth";
import { getProvider } from "@/lib/tts/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const SAMPLE = "[calm] The rain had not stopped for three days.";

/**
 * Synthesize a short sample for a voice, so the cast rail can audition it
 * before assigning. Uses the active TTS provider.
 */
export async function POST(request: Request) {
  const gate = await gateSession();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Access denied" },
      { status: gate.status },
    );
  }

  let body: { voiceId?: unknown; text?: unknown };
  try {
    body = (await request.json()) as { voiceId?: unknown; text?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const voiceId = typeof body.voiceId === "string" ? body.voiceId : null;
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
  }
  const text =
    typeof body.text === "string" && body.text.trim() ? body.text.trim() : SAMPLE;

  const provider = getProvider();
  try {
    const audio = await provider.synthesize({
      provider: provider.id,
      text,
      voice: { voiceId, name: voiceId },
      model: provider.defaultModel,
      settings: provider.defaultSettings(),
    });
    return new NextResponse(audio.data as unknown as BodyInit, {
      headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 502 },
    );
  }
}
