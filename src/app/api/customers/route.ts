import { listCustomers, upsertCustomer } from "@/server/queries";
import { readJson, withAuth } from "@/server/http";
import { customerValues } from "@/server/forms";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { rows } = await listCustomers({ q: url.searchParams.get("q") ?? undefined });
  return { rows };
});

export const POST = withAuth(async (_user, req: Request) => {
  const body = await readJson(req);
  const row = await upsertCustomer(null, { ...customerValues(body), balanceCents: 0 });
  return { row };
});
