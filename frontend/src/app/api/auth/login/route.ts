import { NextResponse } from "next/server";
import { z } from "zod";
import { comparePassword, createSessionToken, sessionCookieConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." }, { status: 401 });
    }
    const passwordMatches = await comparePassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." }, { status: 401 });
    }

    const token = await createSessionToken({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
    });
    const cookie = sessionCookieConfig(token, request);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    console.error("Login route error:", error);
    const message =
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : "Login failed."
        : "Login failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
