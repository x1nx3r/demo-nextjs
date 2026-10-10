import { cookies } from "next/headers";
import { cache } from "react";

import {
  SESSION_COOKIE,
  verifySessionCookie,
  type SessionUser,
} from "./firebase/session";
import { hasAccess } from "./firebase/users";

export type { SessionUser };

/** Memoized per request: the layout and page both resolve the session. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE)?.value);
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export type SessionGate =
  | { ok: true; session: SessionUser }
  | { ok: false; status: 401 | 403 };

/**
 * Authenticate and check the Firestore `access` flag. Use this to guard
 * operations that spend the shared provider keys (LLM planning, TTS).
 */
export async function gateSession(): Promise<SessionGate> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  if (!(await hasAccess(session.uid))) return { ok: false, status: 403 };
  return { ok: true, session };
}
