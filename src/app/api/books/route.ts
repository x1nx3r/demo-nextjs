import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { resolveReferenceContext } from "@/lib/reference";
import { createBookFromArticle, createBookFromSource, listBooks } from "@/lib/store/books";
import { setTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 60;

async function resolveContextField(
  field: FormDataEntryValue | null,
): Promise<string | undefined> {
  if (typeof field !== "string") return undefined;
  const value = field.trim();
  if (!value) return undefined;
  return resolveReferenceContext(value);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  setTenant(session.uid);

  return NextResponse.json({ books: await listBooks() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  setTenant(session.uid);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const context = await resolveContextField(form.get("context"));
  const directionField = form.get("direction");
  const direction =
    typeof directionField === "string" && directionField.trim()
      ? directionField.trim()
      : undefined;

  const urlField = form.get("url");
  const url = typeof urlField === "string" ? urlField.trim() : "";

  try {
    if (url) {
      const book = await createBookFromArticle(url, context, direction);
      return NextResponse.json({ book }, { status: 201 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Add an EPUB, TXT, MD file, or a link" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The file is empty" }, { status: 400 });
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const book = await createBookFromSource(data, file.name, context, direction);
    return NextResponse.json({ book }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import" },
      { status: 422 },
    );
  }
}
