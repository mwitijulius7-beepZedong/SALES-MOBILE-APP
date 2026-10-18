import { cookies } from "next/headers";
import { HttpError, REFRESH_COOKIE, refreshWithToken } from "@/lib/auth";
import { v1Public } from "@/server/v1";

export const dynamic = "force-dynamic";

export const POST = v1Public(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { refreshToken?: string };
  const presented =
    String(body.refreshToken ?? "").trim() || (await cookies()).get(REFRESH_COOKIE)?.value || "";
  if (!presented) throw new HttpError("Missing refresh token", 401);
  const tokens = await refreshWithToken(presented);
  if (!tokens) throw new HttpError("Invalid or expired refresh token", 401);
  return tokens;
});
