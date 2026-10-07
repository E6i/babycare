import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionToken, hashPassword, sessionCookieConfig } from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "يوجد حساب بهذا البريد بالفعل." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
      },
      select: { id: true, name: true, email: true },
    });

    const token = await createSessionToken({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    const response = NextResponse.json({ user }, { status: 201 });
    const cookie = sessionCookieConfig(token, request);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    console.error("Register route error:", error);
    const message =
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : "Registration failed."
        : "Registration failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
