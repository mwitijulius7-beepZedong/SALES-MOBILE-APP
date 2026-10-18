import { getSettings, updateSettings } from "@/server/admin";
import { readJson } from "@/server/http";
import { HttpError } from "@/lib/auth";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async () => getSettings());

export const PUT = v1(async (user, req: Request) => {
  if (user.role !== "owner") throw new HttpError("Only an owner can change settings", 403);
  const body = await readJson(req);
  return updateSettings(body, { id: user.id, name: user.name });
});
