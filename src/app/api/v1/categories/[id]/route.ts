import { deleteCategory, updateCategory } from "@/server/admin";
import { readJson, reqBool, reqInt, reqString, requireRole } from "@/server/http";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PATCH = v1(async (user, req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  const body = await readJson(req);
  return updateCategory(
    id,
    {
      name: body.name === undefined ? undefined : reqString(body, "name", { max: 40 }),
      sortOrder: body.sortOrder === undefined ? undefined : reqInt(body, "sortOrder", { min: 0, max: 10_000 }),
      active: body.active === undefined ? undefined : reqBool(body, "active", true),
    },
    { id: user.id, name: user.name },
  );
});

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  return deleteCategory(await idOf(ctx), { id: user.id, name: user.name });
});
