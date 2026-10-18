import { getSettings } from "@/server/admin";
import { initialExpenseStatus, listExpenses, upsertExpense } from "@/server/queries";
import { expenseFields } from "@/server/forms";
import { readJson, reqEnum, HttpError } from "@/server/http";
import { pageParams, paged, v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore, summary, byCategory } = await listExpenses({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, { page, limit, hasMore, summary, byCategory });
});

export const POST = v1(async (user, req: Request) => {
  const body = await readJson(req);
  const approver = user.role === "owner" || user.role === "manager";
  const explicit =
    body.status === undefined
      ? undefined
      : reqEnum(body, "status", ["pending", "approved", "rejected"], "approved");
  if (explicit && !approver) throw new HttpError("Only a manager can set an expense status", 403);
  const appSettings = await getSettings();
  const status = initialExpenseStatus(user.role, appSettings.expenseApprovals === true, explicit);
  return upsertExpense(null, {
    ...expenseFields(body),
    status,
    createdById: user.id,
    createdByName: user.name,
  });
});
