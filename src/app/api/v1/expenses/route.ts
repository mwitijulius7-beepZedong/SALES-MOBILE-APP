import { listExpenses, upsertExpense } from "@/server/queries";
import { expenseValues } from "@/server/forms";
import { pageParams, paged, v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore, summary, byCategory } = await listExpenses({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, { page, limit, hasMore, summary, byCategory });
});

export const POST = v1(async (user, req: Request) => {
  return upsertExpense(null, {
    ...(await expenseValues(req)),
    createdById: user.id,
    createdByName: user.name,
  });
});
