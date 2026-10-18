import { listProducts, createProduct } from "@/server/queries";
import { readJson, reqString, withAuth } from "@/server/http";
import { productValues } from "@/server/forms";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { rows } = await listProducts({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });
  return { rows };
});

export const POST = withAuth(async (user, req: Request) => {
  const body = await readJson(req);
  const row = await createProduct(productValues(body), reqString(body, "sku", { max: 24 }), {
    id: user.id,
    name: user.name,
  });
  return { row };
});
