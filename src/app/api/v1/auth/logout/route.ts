import { destroySession } from "@/lib/auth";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const POST = v1(async () => {
  await destroySession();
  return { ok: true };
});
