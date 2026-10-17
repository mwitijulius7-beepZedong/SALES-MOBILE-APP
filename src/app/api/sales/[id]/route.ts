import { deleteSale, getSale, setSaleStatus } from "@/server/queries";
import { readJson, reqEnum, reqInt, withAuth } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const GET = withAuth(async (_user, _req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  return { row: await getSale(id) };
});

export const PATCH = withAuth(async (user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  const status = reqEnum(body, "status", ["completed", "pending", "refunded"], "completed");
  const row = await setSaleStatus(id, status, { id: user.id, name: user.name });
  return { row };
});

export const DELETE = withAuth(async (user, _req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  return await deleteSale(id, { id: user.id, name: user.name });
});
