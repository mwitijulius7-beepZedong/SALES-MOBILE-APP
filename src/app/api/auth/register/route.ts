import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { users } from "@/db/schema";
import { createSession, hashPassword, initialsOf } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      password?: string;
      territory?: string;
    };
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (name.length < 2) return NextResponse.json({ error: "Tell us your full name" }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "That email address looks invalid" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Use at least 8 characters for your password" }, { status: 400 });
    }
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) {
      return NextResponse.json({ error: "An account already uses that email" }, { status: 409 });
    }

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        role: "rep",
        territory: String(body.territory ?? "Central").slice(0, 40),
        initials: initialsOf(name) || "VF",
        hue: Math.floor(Math.random() * 360),
        passwordHash: hashPassword(password),
      })
      .returning();

    await createSession(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        territory: user.territory,
        initials: user.initials,
        hue: user.hue,
      },
    });
  } catch (error) {
    console.error("[vendflow] register", error);
    return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
  }
}
