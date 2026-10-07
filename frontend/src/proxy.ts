import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "smartcare_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const protectedPage = pathname.startsWith("/chat") || pathname.startsWith("/dashboard");
  const protectedApi =
    pathname.startsWith("/api/analyze") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/timeline") ||
    pathname.startsWith("/api/risk") ||
    pathname.startsWith("/api/reminders") ||
    pathname.startsWith("/api/dashboard");

  if ((protectedPage || protectedApi) && !hasSession) {
    if (protectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/dashboard/:path*",
    "/api/analyze",
    "/api/chat/:path*",
    "/api/profile",
    "/api/timeline",
    "/api/risk/:path*",
    "/api/reminders/:path*",
    "/api/dashboard",
    "/login",
    "/register",
  ],
};
