import { listCustomers, upsertCustomer } from "@/server/queries";
import { readJson } from "@/server/http";
import { customerValues } from "@/server/forms";
import { metaFor, pageParams, paged, v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore } = await listCustomers({
    q: url.searchParams.get("q") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, metaFor(page, limit, hasMore));
});

export const POST = v1(async (_user, req: Request) => {
  const body = await readJson(req);
  return upsertCustomer(null, { ...customerValues(body), balanceCents: 0 });
});
