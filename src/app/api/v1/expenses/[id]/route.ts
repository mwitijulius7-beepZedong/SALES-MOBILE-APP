import { decideExpense, deleteExpense, upsertExpense } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, requireRole } from "@/server/http";
import { expenseFields } from "@/server/forms";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PUT = v1(async (user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  if (body.status !== undefined) {
    requireRole(user, "owner", "manager");
    const status = reqEnum(body, "status", ["pending", "approved", "rejected"], "approved");
    const note = reqString(body, "note", { max: 240 });
    return decideExpense(id, status, note, { id: user.id, name: user.name });
  }
  return upsertExpense(id, expenseFields(body));
});

export const PATCH = PUT;

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  return deleteExpense(id, { id: user.id, name: user.name });
});
