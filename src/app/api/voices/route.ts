import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getProvider } from "@/lib/tts/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * List the voices available to the active provider, for curating a cast pool.
 * Pipe the ids you like into CAST_VOICE_IDS (`id:Name,id:Name`).
 *
 * Example: /api/voices?use_cases=narrative_story&language=en&high_quality=true
 */
export async function GET(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getProvider();
  if (!provider.listVoices) {
    return NextResponse.json(
      { error: `${provider.id} does not expose a voice list` },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const list = (key: string) =>
    params.getAll(key).flatMap((value) => value.split(",")).map((v) => v.trim()).filter(Boolean);

  try {
    const voices = await provider.listVoices({
      search: params.get("search") ?? undefined,
      gender: params.get("gender") ?? undefined,
      category: params.get("category") ?? undefined,
      highQuality: params.get("high_quality") === "true",
      useCases: list("use_cases"),
      language: list("language"),
      pageSize: Number.parseInt(params.get("page_size") ?? "100", 10) || 100,
      maxPages: Number.parseInt(params.get("max_pages") ?? "3", 10) || 3,
    });
    return NextResponse.json({ provider: provider.id, count: voices.length, voices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list voices" },
      { status: 502 },
    );
  }
}
