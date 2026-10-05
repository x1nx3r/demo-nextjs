import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySession } from "./auth-token";

export async function getSession(): Promise<boolean> {
  const store = await cookies();
  return verifySession(store.get(AUTH_COOKIE)?.value);
}

export async function requireSession(): Promise<void> {
  if (!(await getSession())) {
    throw new Error("Unauthorized");
  }
}
