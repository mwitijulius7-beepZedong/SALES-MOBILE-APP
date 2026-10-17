import { listExpenses, upsertExpense } from "@/server/queries";
import { withAuth } from "@/server/http";
import { expenseValues } from "@/server/forms";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  return await listExpenses({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
  });
});

export const POST = withAuth(async (user, req: Request) => {
  const row = await upsertExpense(null, {
    ...(await expenseValues(req)),
    createdById: user.id,
    createdByName: user.name,
  });
  return { row };
});
