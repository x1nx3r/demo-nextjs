import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { resolveReferenceContext } from "@/lib/reference";
import { createBookFromEpub, listBooks } from "@/lib/store/books";

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
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ books: await listBooks() });
}

export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing EPUB file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The file is empty" }, { status: 400 });
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const contextField = form.get("context");
    const context = await resolveContextField(contextField);
    const directionField = form.get("direction");
    const direction =
      typeof directionField === "string" && directionField.trim()
        ? directionField.trim()
        : undefined;
    const book = await createBookFromEpub(data, context, direction);
    return NextResponse.json({ book }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import EPUB",
      },
      { status: 422 },
    );
  }
}
