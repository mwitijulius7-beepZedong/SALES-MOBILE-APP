import { deleteCustomer, upsertCustomer } from "@/server/queries";
import { readJson, reqInt, requireRole, withAuth } from "@/server/http";
import { customerValues } from "@/server/forms";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PUT = withAuth(async (_user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  const row = await upsertCustomer(id, customerValues(body));
  return { row };
});

export const PATCH = PUT;

export const DELETE = withAuth(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  return await deleteCustomer(id);
});
