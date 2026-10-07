import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "smartcare_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is missing in environment variables.");
  }
  return new TextEncoder().encode(secret);
}

function isLocalHost(host: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(host);
}

function shouldUseSecureCookie(request?: Request | NextRequest) {
  if (process.env.NODE_ENV !== "production") return false;
  if (!request) return true;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  const host = request.headers.get("host") ?? "";
  if (isLocalHost(host)) return false;

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(authSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, authSecret());
  return payload as SessionPayload;
}

export function sessionCookieConfig(token: string, request?: Request | NextRequest) {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookie(request),
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export function clearSessionCookieConfig(request?: Request | NextRequest) {
  return {
    name: COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      secure: shouldUseSecureCookie(request),
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    },
  };
}

export async function getCurrentUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const session = await verifySessionToken(token);
    return prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  } catch {
    return null;
  }
}

export async function getCurrentUserFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const session = await verifySessionToken(token);
    return prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  } catch {
    return null;
  }
}
