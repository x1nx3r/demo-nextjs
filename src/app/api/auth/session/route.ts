import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase/admin";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSessionCookie,
} from "@/lib/firebase/session";
import { ensureUser } from "@/lib/firebase/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let idToken: unknown;
  try {
    idToken = ((await request.json()) as { idToken?: unknown } | null)?.idToken;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    const cookie = await createSessionCookie(idToken);
    await ensureUser(decoded.uid, decoded.email);

    const response = NextResponse.json({ uid: decoded.uid });
    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Sign-in failed" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
