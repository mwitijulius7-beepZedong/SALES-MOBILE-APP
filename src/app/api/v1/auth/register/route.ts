import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { HttpError, createSession, hashPassword, initialsOf } from "@/lib/auth";
import { v1Public } from "@/server/v1";

export const dynamic = "force-dynamic";

export const POST = v1Public(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    territory?: string;
  };
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 2) throw new HttpError("Tell us your full name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError("That email address looks invalid");
  if (password.length < 8) throw new HttpError("Use at least 8 characters for your password");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new HttpError("An account already uses that email", 409);

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

  const token = await createSession(user.id);
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      territory: user.territory,
      initials: user.initials,
      hue: user.hue,
    },
  };
});
