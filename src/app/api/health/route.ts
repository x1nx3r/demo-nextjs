import { NextResponse } from "next/server";
import { checkStorage, isStorageConfigured } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isStorageConfigured();

  let storage: "ok" | "error" | "not_configured" = "not_configured";
  let detail: string | undefined;

  if (configured) {
    const result = await checkStorage();
    storage = result.ok ? "ok" : "error";
    if (!result.ok && process.env.NODE_ENV !== "production") {
      detail = result.error;
    }
  }

  return NextResponse.json({
    ok: true,
    storage,
    ...(detail ? { detail } : {}),
    time: new Date().toISOString(),
  });
}
