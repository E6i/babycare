import { NextResponse } from "next/server";
import { clearSessionCookieConfig } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  const cookie = clearSessionCookieConfig(request);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
