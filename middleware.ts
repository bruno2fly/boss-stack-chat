import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simple cookie-based password gate.
 * Protects the chat page and the chat API route.
 * Leaves /login and /api/login open.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always let these through
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const expected = process.env.BOSS_PASSWORD;
  const cookie = req.cookies.get("boss_auth")?.value;
  const isAuthed = !!expected && cookie === expected;

  if (isAuthed) return NextResponse.next();

  // Not authed — block API routes with 401, bounce pages to /login
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except static assets; the function above
  // short-circuits public routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
