import { createCategory, listCategories } from "@/server/admin";
import { readJson, reqInt, reqString, requireRole } from "@/server/http";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  return listCategories(url.searchParams.get("kind") ?? undefined);
});

export const POST = v1(async (user, req: Request) => {
  requireRole(user, "owner", "manager");
  const body = await readJson(req);
  return createCategory(
    {
      kind: reqString(body, "kind", { fallback: "expense", max: 20 }),
      name: reqString(body, "name", { required: true, max: 40 }),
      sortOrder: reqInt(body, "sortOrder", { min: 0, max: 10_000, fallback: 0 }),
    },
    { id: user.id, name: user.name },
  );
});
