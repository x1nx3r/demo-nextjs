import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/firebase/cookie";

export function proxy(request: NextRequest) {
  // Optimistic check only: the cookie is present. The app layout and API
  // routes verify the Firebase session cookie for real (Node runtime).
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Guard the app pages only; the landing page, login and API routes are open.
  matcher: ["/library/:path*", "/book/:path*"],
};
