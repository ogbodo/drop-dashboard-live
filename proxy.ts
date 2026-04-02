import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATH_PREFIXES = ["/_next", "/favicon.ico"];
const OPEN_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"]);
const isDevelopment = process.env.NODE_ENV !== "production";

const applySecurityHeaders = (request: NextRequest, response: NextResponse) => {
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co",
      "object-src 'none'",
    ].join("; "),
  );
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
};

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.match(/\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$/)
  ) {
    return applySecurityHeaders(request, NextResponse.next());
  }

  const hasSessionCookie = Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  const isOpenPath = OPEN_PATHS.has(pathname);
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!hasSessionCookie && (pathname === "/" || isAdminApi)) {
    if (isAdminApi) {
      return applySecurityHeaders(
        request,
        NextResponse.json(
          {
            error: "Unauthorized",
          },
          { status: 401 },
        ),
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(request, NextResponse.redirect(loginUrl));
  }

  if (hasSessionCookie && isOpenPath && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return applySecurityHeaders(request, NextResponse.redirect(homeUrl));
  }

  return applySecurityHeaders(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
