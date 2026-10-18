import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { HttpError, issueTokens, verifyPassword } from "@/lib/auth";
import { v1Public } from "@/server/v1";

export const dynamic = "force-dynamic";

export const POST = v1Public(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) throw new HttpError("Enter your email and password");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError("Those credentials don't match an account", 401);
  }

  const tokens = await issueTokens(user);
  return {
    ...tokens,
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
