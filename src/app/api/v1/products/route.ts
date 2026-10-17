import { createProduct, listProducts } from "@/server/queries";
import { readJson, reqString } from "@/server/http";
import { productValues } from "@/server/forms";
import { metaFor, pageParams, paged, v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore } = await listProducts({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, metaFor(page, limit, hasMore));
});

export const POST = v1(async (user, req: Request) => {
  const body = await readJson(req);
  return createProduct(productValues(body), reqString(body, "sku", { max: 24 }), {
    id: user.id,
    name: user.name,
  });
});
