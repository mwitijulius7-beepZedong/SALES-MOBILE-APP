import { deleteExpense, upsertExpense } from "@/server/queries";
import { reqInt, requireRole } from "@/server/http";
import { expenseValues } from "@/server/forms";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PUT = v1(async (_user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  return upsertExpense(id, await expenseValues(req));
});

export const PATCH = PUT;

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  return deleteExpense(await idOf(ctx));
});
