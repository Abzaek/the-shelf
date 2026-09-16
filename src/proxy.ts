import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "shelf_session";
const PUBLIC = ["/login", "/register"];
const VERIFY = "/verify";

/**
 * Optimistic redirects based on cookie presence only. Real authorization
 * happens in every API route (session lookup) — this just avoids flashing
 * the shelf to signed-out visitors.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC.includes(pathname);
  if (pathname === "/offline" || pathname.startsWith("/serwist/")) return NextResponse.next();

  // Verification links may be opened in a browser without a session; send them to sign in and back.
  if (!hasSession && pathname === VERIFY) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals and any static file (paths containing a dot: icons, worker, manifest).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
