import { adminAuth } from "./admin";
import { SESSION_COOKIE } from "./cookie";

export { SESSION_COOKIE };

/** Firebase session cookies can last at most 14 days. */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export type SessionUser = { uid: string; email?: string };

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
}

export async function verifySessionCookie(
  cookie: string | undefined | null,
): Promise<SessionUser | null> {
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
