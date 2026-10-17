import { deleteSale, getSale, setSaleStatus } from "@/server/queries";
import { readJson, reqEnum, reqInt, requireRole } from "@/server/http";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const GET = v1(async (_user, _req: Request, ctx: Ctx) => getSale(await idOf(ctx)));

export const PATCH = v1(async (user, req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  const body = await readJson(req);
  const status = reqEnum(body, "status", ["completed", "pending", "refunded"], "completed");
  return setSaleStatus(id, status, { id: user.id, name: user.name });
});

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  return deleteSale(await idOf(ctx), { id: user.id, name: user.name });
});
