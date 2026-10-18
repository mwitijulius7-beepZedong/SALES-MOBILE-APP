import { destroySession } from "@/lib/auth";
import { v1Public } from "@/server/v1";

export const dynamic = "force-dynamic";

export const POST = v1Public(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { refreshToken?: string };
  const token = String(body.refreshToken ?? "").trim() || undefined;
  await destroySession(token);
  return { ok: true };
});
