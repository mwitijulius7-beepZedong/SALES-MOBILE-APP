import { deleteUser, updateUser } from "@/server/admin";
import { readJson, reqBool, reqInt, reqString, requireRole } from "@/server/http";
import { HttpError } from "@/lib/auth";
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
  return updateUser(
    id,
    {
      name: body.name === undefined ? undefined : reqString(body, "name", { max: 90 }),
      role: body.role === undefined ? undefined : reqString(body, "role", { max: 20 }),
      territory: body.territory === undefined ? undefined : reqString(body, "territory", { max: 40 }),
      active: body.active === undefined ? undefined : reqBool(body, "active", true),
      password: body.password === undefined ? undefined : reqString(body, "password", { max: 200 }),
    },
    { id: user.id, name: user.name, role: user.role },
  );
});

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  if (user.role !== "owner") throw new HttpError("Only an owner can delete accounts", 403);
  return deleteUser(await idOf(ctx), { id: user.id, name: user.name, role: user.role });
});
