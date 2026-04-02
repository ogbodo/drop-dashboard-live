import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "drop_admin_session";
export const ADMIN_CSRF_COOKIE = "drop_admin_csrf";
export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

type CookieSecurityOptions = {
  secure?: boolean;
};

type CookieSessionPayload = {
  csrfToken: string;
  expiresAt?: number | string | null;
  sessionToken: string;
};

export const isSecureRequest = (request: NextRequest) => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  return request.nextUrl.protocol === "https:" || forwardedProto === "https";
};

const toExpiryDate = (value?: number | string | null) => {
  if (!value) {
    return new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
  }

  return date;
};

export const getSessionTokenFromRequest = (request: NextRequest) =>
  request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? "";

export const applyAdminSessionCookies = (
  response: NextResponse,
  session: CookieSessionPayload,
  options: CookieSecurityOptions = {},
) => {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const expires = toExpiryDate(session.expiresAt);

  response.cookies.set({
    expires,
    httpOnly: true,
    name: ADMIN_SESSION_COOKIE,
    path: "/",
    sameSite: "strict",
    secure,
    value: session.sessionToken,
  });

  response.cookies.set({
    expires,
    httpOnly: false,
    name: ADMIN_CSRF_COOKIE,
    path: "/",
    sameSite: "strict",
    secure,
    value: session.csrfToken,
  });
};

export const clearAdminSessionCookies = (
  response: NextResponse,
  options: CookieSecurityOptions = {},
) => {
  const secure = options.secure ?? process.env.NODE_ENV === "production";

  response.cookies.set({
    expires: new Date(0),
    httpOnly: true,
    name: ADMIN_SESSION_COOKIE,
    path: "/",
    sameSite: "strict",
    secure,
    value: "",
  });
  response.cookies.set({
    expires: new Date(0),
    httpOnly: false,
    name: ADMIN_CSRF_COOKIE,
    path: "/",
    sameSite: "strict",
    secure,
    value: "",
  });
};

export const assertCsrf = (request: NextRequest) => {
  const csrfCookie = request.cookies.get(ADMIN_CSRF_COOKIE)?.value ?? "";
  const csrfHeader = request.headers.get("x-csrf-token") ?? "";

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new Error("Invalid CSRF token.");
  }
};
