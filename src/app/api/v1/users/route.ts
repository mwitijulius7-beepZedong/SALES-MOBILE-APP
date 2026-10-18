import { createUser, listUsers } from "@/server/admin";
import { readJson, reqString, requireRole } from "@/server/http";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (user) => {
  requireRole(user, "owner", "manager");
  return listUsers();
});

export const POST = v1(async (user, req: Request) => {
  requireRole(user, "owner", "manager");
  const body = await readJson(req);
  return createUser(
    {
      name: reqString(body, "name", { required: true, max: 90 }),
      email: reqString(body, "email", { required: true, max: 120 }),
      password: reqString(body, "password", { required: true, max: 200 }),
      role: reqString(body, "role", { fallback: "rep", max: 20 }),
      territory: reqString(body, "territory", { fallback: "Central", max: 40 }),
    },
    { id: user.id, name: user.name, role: user.role },
  );
});
